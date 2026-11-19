// Integration API: list tickets with filters (LMS / CRM consumption).
// Auth: API key with scope "read".
//
// Filters: status, priority, source, branch (id / code / external id / name),
// categoryId, assignedToId, unassigned, overdue, escalated, phone, email,
// q (keywords; every word must match ticket no. / customer / phone / email /
// description / branch / category / assignee / status / priority),
// ticketSearch, customerSearch, branchSearch, categorySearch, assigneeSearch
// (per-column keywords; assigneeSearch=unassigned for unassigned tickets),
// from, to (created date, YYYY-MM-DD, India time), sort + order (asc/desc),
// updatedSince (ISO timestamp — for incremental sync), page, pageSize (max 100).

import { fail, handleErrors, ok, paginationParams } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { resolveBranch } from "@/lib/integration";
import { listTickets, parseFilters } from "@/lib/ticket-query";

export async function GET(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "read");
    const url = new URL(request.url);
    const filters = parseFilters(url.searchParams);

    const branchRef = url.searchParams.get("branch") || url.searchParams.get("branchCode") || "";
    if (branchRef) {
      const branch = await resolveBranch(branchRef, { activeOnly: false });
      if (!branch) return fail("BRANCH_NOT_FOUND", `No branch matches "${branchRef}".`, 422);
      filters.branchId = branch.id;
    }

    const page = paginationParams(url);
    const { rows, total } = await listTickets(filters, {}, page);
    return ok({ tickets: rows, total, page: page.page, pageSize: page.pageSize, totalPages: Math.max(1, Math.ceil(total / page.pageSize)), client: client.name });
  });
}
