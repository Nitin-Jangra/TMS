// Public complaint submission. Validates all mandatory fields, prevents
// duplicate submissions via Idempotency-Key, saves the ticket first and only
// then triggers notifications + round-robin assignment.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { isValidEmail, isValidPhone } from "@/lib/types";
import { createComplaint } from "@/lib/tickets";
import { randomBytes } from "crypto";

export async function POST(request: Request) {
  return handleErrors(async () => {
    const ip = clientIp(request);
    const limit = rateLimit(`complaint:${ip}`, 8, 600);
    if (!limit.allowed) {
      return fail("RATE_LIMITED", `Too many submissions from this device. Try again in ${limit.retryAfterSeconds} seconds.`, 429);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return fail("VALIDATION_ERROR", "Invalid request body.", 422);

    const {
      customerName, customerPhone, customerEmail, branchId, categoryId, description, privacyConsent,
    } = body as Record<string, unknown>;

    const errors: Record<string, string> = {};
    if (!customerName || String(customerName).trim().length < 2 || String(customerName).length > 100) errors.customerName = "Please enter your full name.";
    if (!customerPhone || !isValidPhone(String(customerPhone))) errors.customerPhone = "Please enter a valid mobile number.";
    if (!customerEmail || !isValidEmail(String(customerEmail))) errors.customerEmail = "Please enter a valid email address.";
    if (!branchId) errors.branchId = "Please select a branch.";
    if (!categoryId) errors.categoryId = "Please select a complaint category.";
    if (!description || String(description).trim().length < 10 || String(description).length > 4000) errors.description = "Please describe your complaint (minimum 10 characters).";
    if (privacyConsent !== true) errors.privacyConsent = "Privacy consent is required to register a complaint.";
    if (Object.keys(errors).length) return fail("VALIDATION_ERROR", "Please correct the highlighted fields.", 422, errors);

    // Verify the branch/category really exist and are active (defense in depth).
    const branch = await db.branch.findUnique({ where: { id: String(branchId) } });
    if (!branch || !branch.isActive) return fail("BRANCH_INACTIVE", "The selected branch is not available.", 422);
    const category = await db.complaintCategory.findUnique({ where: { id: String(categoryId) } });
    if (!category || !category.isActive) return fail("CATEGORY_INACTIVE", "The selected category is not available.", 422);

    // Idempotency: client-supplied key, or a stable fallback derived from the payload.
    const headerKey = request.headers.get("idempotency-key") || "";
    const idempotencyKey = headerKey || `auto-${ip}-${String(customerPhone)}-${String(categoryId)}-${String(description).slice(0, 80)}`;

    const result = await createComplaint(
      {
        customerName: String(customerName),
        customerPhone: String(customerPhone),
        customerEmail: String(customerEmail),
        branchId: String(branchId),
        categoryId: String(categoryId),
        description: String(description),
        source: "PORTAL",
        idempotencyKey,
      },
      { ip },
    );

    return ok(
      {
        ticketNumber: result.ticket.ticketNumber,
        status: result.ticket.status,
        assigned: !!result.ticket.assignedToId,
        duplicate: result.duplicate,
        message: result.duplicate
          ? "This complaint was already registered. Please use the ticket number below to track it."
          : "Your complaint has been registered successfully.",
      },
      { status: result.duplicate ? 200 : 201 },
    );
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key, x-requested-with",
    },
  });
}
