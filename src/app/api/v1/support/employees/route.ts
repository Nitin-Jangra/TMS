// Employee directory for availability management. Branch managers see their
// branch; central + root see all (optionally filtered by branchId).

import { handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageAvailability } from "@/lib/types";

export async function GET(request: Request) {
  return handleErrors(async () => {
    const user = await requireUser();
    if (!canManageAvailability(user.role)) {
      return ok({ employees: [], branches: [], restricted: true });
    }
    const url = new URL(request.url);
    const branchFilter = url.searchParams.get("branchId") || undefined;
    const scopeBranchId = user.role === "BRANCH_MANAGER" ? user.branchId : branchFilter;

    const [employees, branches] = await Promise.all([
      db.staffUser.findMany({
        where: { role: "SUPPORT_AGENT", ...(scopeBranchId ? { branchId: scopeBranchId } : {}) },
        include: { branch: { select: { name: true, code: true } } },
        orderBy: [{ branchId: "asc" }, { createdAt: "asc" }],
      }),
      db.branch.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    ]);
    return ok({ employees, branches, restricted: false });
  });
}
