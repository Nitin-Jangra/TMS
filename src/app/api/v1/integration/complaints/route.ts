// Integration API: register a complaint on behalf of a customer (CRM/LMS).
// Requires "write" scope. Same validation + round-robin assignment as the
// public portal; source is recorded as API_CRM / API_LMS.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { db } from "@/lib/db";
import { createComplaint, TicketError } from "@/lib/tickets";
import { isValidEmail, isValidPhone } from "@/lib/types";

export async function POST(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "write");

    const body = await request.json().catch(() => null);
    const data = (body || {}) as Record<string, unknown>;
    const source = client.name.toLowerCase().includes("lms") ? "API_LMS" : "API_CRM";

    const errors: Record<string, string> = {};
    if (!data.customerName || String(data.customerName).trim().length < 2) errors.customerName = "Required.";
    if (!data.customerPhone || !isValidPhone(String(data.customerPhone))) errors.customerPhone = "Valid mobile number required.";
    if (!data.customerEmail || !isValidEmail(String(data.customerEmail))) errors.customerEmail = "Valid email required.";
    if (!data.branchId) errors.branchId = "Required.";
    if (!data.categoryId) errors.categoryId = "Required.";
    if (!data.description || String(data.description).trim().length < 10) errors.description = "Minimum 10 characters.";
    if (Object.keys(errors).length) return fail("VALIDATION_ERROR", "Invalid complaint payload.", 422, errors);

    try {
      const result = await createComplaint(
        {
          customerName: String(data.customerName),
          customerPhone: String(data.customerPhone),
          customerEmail: String(data.customerEmail),
          branchId: String(data.branchId),
          categoryId: String(data.categoryId),
          description: String(data.description),
          priority: data.priority ? String(data.priority).toUpperCase() : undefined,
          source,
          idempotencyKey: request.headers.get("idempotency-key") || undefined,
        },
        { actorName: `API:${client.name}`, ip: request.headers.get("x-forwarded-for") || "" },
      );
      return ok({ ticketNumber: result.ticket.ticketNumber, status: result.ticket.status, assigned: !!result.ticket.assignedToId }, { status: 201 });
    } catch (err) {
      if (err instanceof TicketError) return fail(err.code, err.message, 422);
      throw err;
    }
  });
}
