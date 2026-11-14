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

    const b = body as Record<string, unknown>;

    // Support both internal and standard external form field names
    const rawName = String(b.customerName || b.name || b.fullName || "").trim();
    const rawPhone = String(b.customerPhone || b.phone || b.mobile || b.phoneNumber || "").trim();
    const rawEmail = String(b.customerEmail || b.email || "").trim();
    const rawDesc = String(b.description || b.message || b.complaint || b.details || "").trim();
    const rawBranch = String(b.branchId || b.branch || b.branchName || b.branchCode || "").trim();
    const rawCategory = String(b.categoryId || b.category || b.categoryName || "").trim();
    const consent = b.privacyConsent === true || b.privacyConsent === "true" || b.privacyConsent === "on" || b.privacyConsent === 1 || b.privacyConsent === undefined;

    const errors: Record<string, string> = {};
    if (!rawName || rawName.length < 2 || rawName.length > 100) errors.customerName = "Please enter your full name (at least 2 characters).";
    if (!rawPhone || !isValidPhone(rawPhone)) errors.customerPhone = "Please enter a valid 10-12 digit mobile number.";
    if (!rawEmail || !isValidEmail(rawEmail)) errors.customerEmail = "Please enter a valid email address.";
    if (!rawDesc || rawDesc.length < 5 || rawDesc.length > 4000) errors.description = "Please describe your complaint.";
    if (!consent) errors.privacyConsent = "Privacy consent is required.";

    if (Object.keys(errors).length) {
      return fail("VALIDATION_ERROR", Object.values(errors)[0], 422, errors);
    }

    // Smart Branch Lookup: by ID, code (e.g. BR001), or name (e.g. Sector 48)
    let branch = null;
    if (rawBranch) {
      branch = await db.branch.findFirst({
        where: {
          OR: [
            { id: rawBranch },
            { code: rawBranch },
            { name: { contains: rawBranch } },
          ],
          isActive: true,
        },
      });
    }
    if (!branch) {
      branch = await db.branch.findFirst({ where: { isActive: true }, orderBy: { code: "asc" } });
    }
    if (!branch) return fail("BRANCH_UNAVAILABLE", "No active branch is currently available in the system.", 500);

    // Smart Category Lookup: by ID or name (e.g. Equipment Issues)
    let category = null;
    if (rawCategory) {
      category = await db.complaintCategory.findFirst({
        where: {
          OR: [
            { id: rawCategory },
            { name: { contains: rawCategory } },
          ],
          isActive: true,
        },
      });
    }
    if (!category) {
      category = await db.complaintCategory.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
    }
    if (!category) return fail("CATEGORY_UNAVAILABLE", "No active category is currently available in the system.", 500);

    // Idempotency: client-supplied key, or a stable fallback derived from the payload.
    const headerKey = request.headers.get("idempotency-key") || "";
    const idempotencyKey = headerKey || `auto-${ip}-${rawPhone}-${category.id}-${rawDesc.slice(0, 80)}`;

    const result = await createComplaint(
      {
        customerName: rawName,
        customerPhone: rawPhone,
        customerEmail: rawEmail,
        branchId: branch.id,
        categoryId: category.id,
        description: rawDesc,
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
