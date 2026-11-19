// Support ticket list with filters, sorting + pagination (role-scoped).
// Scopes: SUPPORT_AGENT / BRANCH_MANAGER → their own branch by default;
// `scope=all` searches every branch when cross-branch access is enabled
// (Root Admin → Settings). Central roles always see the whole tenant.
// `mine=true` narrows to tickets assigned to the current user;
// `assignedToId=<staff id>` to any colleague (e.g. cover while on leave).

import { handleErrors, ok, paginationParams } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { getAccessPolicy } from "@/lib/tickets";
import { listTickets, parseFilters, roleScope } from "@/lib/ticket-query";
import { isCentralRole } from "@/lib/types";

export async function GET(request: Request) {
  return handleErrors(async () => {
    const user = await requireUser();
    const url = new URL(request.url);
    const filters = parseFilters(url.searchParams);
    if (filters.mine) filters.assignedToId = user.id; // "Assigned to me" view
    const page = paginationParams(url);

    const policy = await getAccessPolicy();
    const allBranches = url.searchParams.get("scope") === "all";
    const scope = roleScope(user, { policy, allBranches });

    const { rows, total } = await listTickets(filters, scope, page);
    return ok({
      tickets: rows,
      total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: Math.max(1, Math.ceil(total / page.pageSize)),
      scope: scope.branchId ? "branch" : "all",
      canSearchAllBranches: isCentralRole(user.role) || policy.crossBranch,
    });
  });
}
