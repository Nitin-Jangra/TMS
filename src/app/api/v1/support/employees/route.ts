// Employee directory for availability management. Branch managers see their
// branch; central + root see all (optionally filtered by branchId).

import { handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageAvailability } from "@/lib/types";
import { getUserPermissions } from "@/lib/permissions";

export async function GET(request: Request) {
  return handleErrors(async () => {
    const user = await requireUser();
    const permissions = await getUserPermissions(user);
    if (!permissions.viewEmployees && !permissions.manageStaffAvailability && !canManageAvailability(user.role)) {
      return ok({ employees: [], branches: [], restricted: true });
    }
    const url = new URL(request.url);
    const branchFilter = url.searchParams.get("branchId") || undefined;
    const scopeBranchId = user.role === "BRANCH_MANAGER" ? user.branchId : branchFilter;

    const [employees, branches] = await Promise.all([
      db.staffUser.findMany({
        where: { role: "SUPPORT_AGENT", ...(scopeBranchId ? { branchId: scopeBranchId } : {}) },
        include: { branch: { select: { name: true, code: true } }, department: { select: { id: true, name: true } } },
        orderBy: [{ branchId: "asc" }, { createdAt: "asc" }],
      }),
      db.branch.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    ]);
    const open = await db.ticket.groupBy({
      by: ["assignedToId"],
      where: { assignedToId: { in: employees.map((e) => e.id) }, status: { in: ["NEW_COMPLAINT", "IN_PROGRESS", "ON_HOLD"] } },
      _count: { _all: true },
    });
    const openBy = new Map(open.map((o) => [o.assignedToId, o._count._all]));
    const canManage = canManageAvailability(user.role) || permissions.manageStaffAvailability;
    return ok({
      employees: employees.map(({ passwordHash: _omit, ...e }) => ({ ...e, openTickets: openBy.get(e.id) ?? 0 })),
      branches,
      restricted: false,
      canManage,
    });
  });
}
