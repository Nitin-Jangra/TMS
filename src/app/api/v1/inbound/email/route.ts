// Inbound Email-to-Ticket Webhook
// Converts incoming emails to nitin98175@gmail.com into complaint tickets,
// automatically triggers a greeting/confirmation email to the customer with
// their Ticket Number, and alerts central support at nitin98175@gmail.com.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createComplaint } from "@/lib/tickets";
import { clientIp } from "@/lib/rate-limit";

function extractEmailAndName(raw: string): { email: string; name: string } {
  if (!raw) return { email: "", name: "" };
  
  // Format: "John Doe <john@example.com>" or "<john@example.com>"
  const match = raw.match(/^(?:["']?([^"']+)["']?\s*)?<([^>]+)>/);
  if (match) {
    const name = (match[1] || "").trim();
    const email = (match[2] || "").trim().toLowerCase();
    return { email, name: name || email.split("@")[0] };
  }

  // Plain email: "john@example.com"
  const plainEmailMatch = raw.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (plainEmailMatch) {
    const email = plainEmailMatch[1].trim().toLowerCase();
    return { email, name: email.split("@")[0] };
  }

  return { email: raw.trim().toLowerCase(), name: raw.trim() };
}

function extractPhoneNumber(text: string): string {
  // Matches 10-digit Indian mobile numbers with optional +91 or 0 prefix
  const match = text.match(/(?:(?:\+?91)|0)?([6-9]\d{9})\b/);
  return match ? match[1] : (process.env.DEFAULT_SUPPORT_PHONE?.trim() || "9817500000"); // fallback support placeholder
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let from = "";
    let to = "";
    let subject = "";
    let bodyText = "";
    let customerName = "";
    let customerPhone = "";

    if (contentType.includes("application/json")) {
      const json = await request.json().catch(() => ({}));
      from = json.from || json.sender || json.from_email || json.email || "";
      to = json.to || json.recipient || "";
      subject = json.subject || "";
      bodyText = json.text || json.body || json.message || json.content || json.html || "";
      customerName = json.name || json.customerName || "";
      customerPhone = json.phone || json.customerPhone || "";
    } else {
      // Multipart form or urlencoded (e.g. SendGrid Inbound Parse or Cloudflare Email Worker)
      const formData = await request.formData().catch(() => null);
      if (formData) {
        from = String(formData.get("from") || formData.get("sender") || "");
        to = String(formData.get("to") || "");
        subject = String(formData.get("subject") || "");
        bodyText = String(formData.get("text") || formData.get("body") || formData.get("html") || "");
        customerName = String(formData.get("name") || "");
        customerPhone = String(formData.get("phone") || "");
      }
    }

    const { email: parsedEmail, name: parsedName } = extractEmailAndName(from);
    const finalEmail = parsedEmail;
    const finalName = customerName.trim() || parsedName || "MSquare Client";

    if (!finalEmail || !finalEmail.includes("@")) {
      return NextResponse.json(
        {
          success: false,
          error: "VALIDATION_ERROR",
          message: "Sender email address could not be extracted from the request.",
        },
        { status: 422 }
      );
    }

    const cleanDescription = [
      subject ? `Subject: ${subject}` : "",
      bodyText ? bodyText.trim() : "No message body provided.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const finalPhone = customerPhone.trim() || extractPhoneNumber(bodyText);

    // Fetch active branches and categories to find best match
    const branches = await db.branch.findMany({ where: { isActive: true } });
    if (!branches.length) {
      return NextResponse.json(
        { success: false, error: "NO_ACTIVE_BRANCHES", message: "No active branches available in system." },
        { status: 500 }
      );
    }

    const categories = await db.complaintCategory.findMany({ where: { isActive: true } });
    if (!categories.length) {
      return NextResponse.json(
        { success: false, error: "NO_ACTIVE_CATEGORIES", message: "No active categories available in system." },
        { status: 500 }
      );
    }

    // Smart Branch Detection
    const searchTarget = `${subject} ${bodyText}`.toLowerCase();
    let selectedBranch = branches[0];
    for (const b of branches) {
      if (
        searchTarget.includes(b.name.toLowerCase()) ||
        searchTarget.includes(b.code.toLowerCase()) ||
        searchTarget.includes(b.city.toLowerCase())
      ) {
        selectedBranch = b;
        break;
      }
    }

    // Smart Category Detection
    let selectedCategory = categories[0];
    const categoryKeywords: Record<string, string[]> = {
      equipment: ["equipment", "machine", "treadmill", "dumbell", "cable", "bench", "broken", "repair"],
      trainer: ["trainer", "coach", "pt", "personal training", "instructor"],
      billing: ["billing", "fee", "payment", "charge", "refund", "deducted", "receipt", "invoice"],
      cleanliness: ["clean", "hygiene", "washroom", "dirty", "smell", "ac", "air condition", "shower"],
      membership: ["membership", "card", "entry", "access", "biometric", "app", "login"],
    };

    for (const [key, words] of Object.entries(categoryKeywords)) {
      if (words.some((w) => searchTarget.includes(w))) {
        const found = categories.find(
          (c) =>
            c.name.toLowerCase().includes(key) ||
            c.name.toLowerCase().includes(words[0])
        );
        if (found) {
          selectedCategory = found;
          break;
        }
      }
    }

    // Create the ticket (this automatically triggers the greeting email to customer and alert to admin)
    const ip = clientIp(request);
    const result = await createComplaint(
      {
        customerName: finalName,
        customerPhone: finalPhone,
        customerEmail: finalEmail,
        branchId: selectedBranch.id,
        categoryId: selectedCategory.id,
        description: cleanDescription,
        source: "EMAIL",
      },
      {
        ip,
        actorName: "Inbound Email Webhook",
      }
    );

    return NextResponse.json(
      {
        success: true,
        ticketNumber: result.ticket.ticketNumber,
        ticketId: result.ticket.id,
        status: result.ticket.status,
        customerEmail: finalEmail,
        customerName: finalName,
        branch: selectedBranch.name,
        category: selectedCategory.name,
        message: `Complaint ticket ${result.ticket.ticketNumber} created successfully. Confirmation email sent to ${finalEmail}.`,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fcms:inbound-email] Error processing inbound email:", msg);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: msg },
      { status: 500 }
    );
  }
}
