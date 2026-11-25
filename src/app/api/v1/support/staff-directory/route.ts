// Staff directory for the "Assigned to" filter and the reassign picker.
// Lists active branch staff (support agents + branch managers) with their
// branch, availability (off = on leave / away) and number of open tickets.
// Branch staff only see their own branch unless cross-branch access is on.

import { handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAccessPolicy } from "@/lib/tickets";
import { getUserPermissions } from "@/lib/permissions";
import { isCentralRole } from "@/lib/types";

export async function GET() {
  return handleErrors(async () => {
    const user = await requireUser();
    const [policy, permissions] = await Promise.all([getAccessPolicy(), getUserPermissions(user)]);
    const allBranches = isCentralRole(user.role) || !!permissions.viewCrossBranchTickets || !!permissions.transferBranch;
    const branchScope = allBranches ? {} : { branchId: user.branchId ?? "__none__" };

    const [staff, open] = await Promise.all([
      db.staffUser.findMany({
        where: { isActive: true, role: { in: ["SUPPORT_AGENT", "BRANCH_MANAGER"] }, branchId: { not: null }, ...branchScope },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          designation: true,
          availabilityEnabled: true,
          branchId: true,
          branch: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ name: "asc" }],
      }),
      db.ticket.groupBy({
        by: ["assignedToId"],
        where: { status: { in: ["NEW_COMPLAINT", "IN_PROGRESS", "ON_HOLD"] }, assignedToId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const openBy = new Map(open.map((r) => [r.assignedToId, r._count._all]));

    return ok({
      staff: staff.map((s) => ({ ...s, openTickets: openBy.get(s.id) ?? 0 })),
      allBranches,
      policy,
      me: { id: user.id, role: user.role, branchId: user.branchId },
    });
  });
}
