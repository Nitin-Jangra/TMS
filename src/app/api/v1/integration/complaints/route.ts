// Integration API: register a complaint on behalf of a member (LMS / CRM).
// Requires "write" scope. Same round-robin assignment, SLA tracking and
// notifications as the public portal; source is recorded as API_LMS / API_CRM.
//
// The branch may be given as its id, code (BR001), LMS external id or name;
// the category as its id or name. Email is optional for API-created tickets.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { apiSource, pick, readBody, resolveBranch, resolveCategory } from "@/lib/integration";
import { createComplaint, TicketError } from "@/lib/tickets";
import { isValidEmail, isValidPhone, PRIORITIES, type Priority } from "@/lib/types";

export async function POST(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "write");

    const data = await readBody(request);
    const name = pick(data, "customerName", "name", "fullName");
    const phone = pick(data, "customerPhone", "phone", "mobile", "phoneNumber");
    const email = pick(data, "customerEmail", "email");
    const description = pick(data, "description", "message", "complaint", "details");
    const branchRef = pick(data, "branchId", "branchCode", "branchExternalId", "branch", "branchName");
    const categoryRef = pick(data, "categoryId", "category", "categoryName");
    const priority = pick(data, "priority").toUpperCase();

    const errors: Record<string, string> = {};
    if (name.length < 2 || name.length > 100) errors.customerName = "Required (2-100 characters).";
    if (!isValidPhone(phone)) errors.customerPhone = "A valid 10-12 digit mobile number is required.";
    if (email && !isValidEmail(email)) errors.customerEmail = "Not a valid email address (omit the field if unknown).";
    if (description.length < 5 || description.length > 4000) errors.description = "Required (5-4000 characters).";
    if (!branchRef) errors.branch = "Required: branchId, branchCode, branchExternalId or branch (name).";
    if (!categoryRef) errors.category = "Required: categoryId or category (name).";
    if (priority && !PRIORITIES.includes(priority as Priority)) errors.priority = `Must be one of ${PRIORITIES.join(", ")}.`;
    if (Object.keys(errors).length) return fail("VALIDATION_ERROR", "Invalid complaint payload.", 422, errors);

    const branch = await resolveBranch(branchRef);
    if (!branch) return fail("BRANCH_NOT_FOUND", `No active branch matches "${branchRef}". See GET /api/v1/integration/branches.`, 422);
    const category = await resolveCategory(categoryRef);
    if (!category) return fail("CATEGORY_NOT_FOUND", `No active category matches "${categoryRef}". See GET /api/v1/integration/categories.`, 422);

    try {
      const result = await createComplaint(
        {
          customerName: name,
          customerPhone: phone,
          customerEmail: email,
          branchId: branch.id,
          categoryId: category.id,
          description,
          priority: priority || undefined,
          source: apiSource(client, data.source),
          idempotencyKey: request.headers.get("idempotency-key") || pick(data, "idempotencyKey", "externalId", "leadId") || undefined,
        },
        { actorName: `API:${client.name}`, ip: request.headers.get("x-forwarded-for") || "" },
      );
      return ok(
        {
          ticketNumber: result.ticket.ticketNumber,
          status: result.ticket.status,
          assigned: !!result.ticket.assignedToId,
          duplicate: result.duplicate,
          branch: { id: branch.id, code: branch.code, name: branch.name },
          category: { id: category.id, name: category.name },
        },
        { status: result.duplicate ? 200 : 201 },
      );
    } catch (err) {
      if (err instanceof TicketError) return fail(err.code, err.message, 422);
      throw err;
    }
  });
}
