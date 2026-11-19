// Hand over all open tickets of an employee to available colleagues now
// (e.g. sudden leave). Managers (own branch) and central admins / root.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { handoverOpenTickets } from "@/lib/assignment";
import { canManageAvailability } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  return handleErrors(async () => {
    const { employeeId } = await params;
    const user = await requireUser();
    if (!canManageAvailability(user.role)) return fail("FORBIDDEN", "Your role cannot hand over tickets.", 403);
    const employee = await db.staffUser.findUnique({ where: { id: employeeId } });
    if (!employee) return fail("NOT_FOUND", "Employee not found.", 404);
    if (user.role === "BRANCH_MANAGER" && user.branchId !== employee.branchId) {
      return fail("FORBIDDEN", "Branch managers can only manage their own branch employees.", 403);
    }
    const body = ((await request.json().catch(() => null)) || {}) as { reason?: string };
    const reason = String(body.reason || "").trim().slice(0, 200) || `Handover requested by ${user.name}`;
    const result = await handoverOpenTickets(employeeId, user, reason);
    await logAudit({
      actor: user,
      action: "LEAVE_HANDOVER",
      previousValue: employee.name,
      newValue: `${result.moved.length} moved, ${result.kept.length} kept`,
      details: result.kept.length ? `No colleague available for: ${result.kept.join(", ")}` : reason,
    });
    return ok(result);
  });
}
