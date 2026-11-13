// Eligible round-robin employees for a branch (active + support role +
// availability on). Central roles may query any branch; managers only theirs.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEligibleEmployees } from "@/lib/assignment";
import { canAssignTickets, isCentralRole } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ branchId: string }> }) {
  return handleErrors(async () => {
    const { branchId } = await params;
    const user = await requireUser();
    if (!canAssignTickets(user.role)) return fail("FORBIDDEN", "Your role cannot view assignment queues.", 403);
    if (!isCentralRole(user.role) && user.branchId !== branchId) {
      return fail("FORBIDDEN", "Branch managers can only view their own branch queue.", 403);
    }
    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } });
    if (!branch) return fail("NOT_FOUND", "Branch not found.", 404);

    const [eligible, all] = await Promise.all([
      getEligibleEmployees(branchId),
      db.staffUser.findMany({
        where: { branchId, role: "SUPPORT_AGENT" },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, isActive: true, availabilityEnabled: true },
      }),
    ]);
    const cursor = await db.branchCursor.findUnique({ where: { branchId }, select: { lastEmployeeId: true } });
    return ok({
      branch,
      eligible,
      all,
      cursorLastEmployeeId: cursor?.lastEmployeeId || null,
    });
  });
}
