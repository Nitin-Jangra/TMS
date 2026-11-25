// Support ticket list with filters, sorting + pagination (role & designation scoped).
// Scopes:
// - ROOT_ADMIN / CENTRAL_ADMIN: whole tenant.
// - Senior Support Agent: all tickets in branch with full filtering.
// - Junior Support Agent: complaints assigned to them (or global search when query supplied).
// - Root Admin can toggle any capability in the Permissions & Feature Matrix.

import { handleErrors, ok, paginationParams } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { getAccessPolicy } from "@/lib/tickets";
import { listTickets, parseFilters, roleScope } from "@/lib/ticket-query";
import { getUserPermissions } from "@/lib/permissions";
import { isCentralRole } from "@/lib/types";

export async function GET(request: Request) {
  return handleErrors(async () => {
    const user = await requireUser();
    const permissions = await getUserPermissions(user);
    const url = new URL(request.url);
    const filters = parseFilters(url.searchParams);
    if (filters.mine) filters.assignedToId = user.id; // "Assigned to me" view
    const page = paginationParams(url);

    const hasGlobalQuery = Boolean(
      (filters.q && filters.q.trim().length > 0) ||
      (filters.ticketSearch && filters.ticketSearch.trim().length > 0) ||
      (filters.phone && filters.phone.trim().length > 0) ||
      (filters.email && filters.email.trim().length > 0)
    );

    const policy = await getAccessPolicy();
    const allowCrossBranch = isCentralRole(user.role) || !!permissions.viewCrossBranchTickets;
    if (!allowCrossBranch) {
      filters.branchId = undefined;
      filters.branchSearch = undefined;
    }
    const allBranches = allowCrossBranch && (url.searchParams.get("scope") === "all" || (hasGlobalQuery && permissions.searchGlobally));
    const scope = roleScope(user, {
      policy,
      allBranches,
      permissions,
      hasGlobalQuery,
    });

    const { rows, total } = await listTickets(filters, scope, page);
    return ok({
      tickets: rows,
      total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: Math.max(1, Math.ceil(total / page.pageSize)),
      scope: scope.branchId ? "branch" : "all",
      canSearchAllBranches: allowCrossBranch,
      permissions,
    });
  });
}
