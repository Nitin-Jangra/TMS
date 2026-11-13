// Support ticket list with filters + pagination (role-scoped, deny-by-default).
// Scopes: SUPPORT_AGENT / BRANCH_MANAGER → their own branch only;
// central roles → the whole tenant. `mine=true` narrows to tickets assigned
// to the current user (e.g. a support agent's personal work queue).

import { handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { listTickets, parseFilters, roleScope } from "@/lib/ticket-query";
import { paginationParams } from "@/lib/api-response";

export async function GET(request: Request) {
  return handleErrors(async () => {
    const user = await requireUser();
    const url = new URL(request.url);
    const filters = parseFilters(url.searchParams);
    if (filters.mine) filters.assignedToId = user.id; // "Assigned to me" view
    const page = paginationParams(url);

    const { rows, total } = await listTickets(filters, roleScope(user), page);
    return ok({
      tickets: rows,
      total,
      page: page.page > 1 ? page.page : page.page,
      pageSize: page.pageSize,
      totalPages: Math.max(1, Math.ceil(total / page.pageSize)),
    });
  });
}
