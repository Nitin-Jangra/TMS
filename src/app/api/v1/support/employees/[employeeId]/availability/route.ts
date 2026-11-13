// Availability toggle. When an employee becomes available, the unassigned
// queue for their branch is retried automatically (round-robin).

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { retryUnassignedTickets } from "@/lib/assignment";
import { logAudit } from "@/lib/audit";
import { canManageAvailability } from "@/lib/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  return handleErrors(async () => {
    const { employeeId } = await params;
    const user = await requireUser();
    if (!canManageAvailability(user.role)) return fail("FORBIDDEN", "Your role cannot change availability.", 403);

    const body = await request.json().catch(() => null);
    const availabilityEnabled = (body as { availabilityEnabled?: boolean })?.availabilityEnabled;
    if (typeof availabilityEnabled !== "boolean") {
      return fail("VALIDATION_ERROR", "availabilityEnabled (boolean) is required.", 422);
    }

    const employee = await db.staffUser.findUnique({ where: { id: employeeId }, include: { branch: true } });
    if (!employee || employee.role !== "SUPPORT_AGENT") return fail("NOT_FOUND", "Support employee not found.", 404);
    if (user.role === "BRANCH_MANAGER" && user.branchId !== employee.branchId) {
      return fail("FORBIDDEN", "Branch managers can only manage their own branch employees.", 403);
    }
    if (!employee.isActive) return fail("VALIDATION_ERROR", "Inactive employees cannot be made available.", 422);

    await db.staffUser.update({ where: { id: employeeId }, data: { availabilityEnabled } });
    await logAudit({
      actor: user,
      actorRole: user.role,
      action: "AVAILABILITY_CHANGED",
      previousValue: String(employee.availabilityEnabled),
      newValue: String(availabilityEnabled),
      details: `Availability for ${employee.name} (${employee.branch?.name || "-"})`,
    });

    let retry: { assigned: number; remaining: number } | null = null;
    if (availabilityEnabled && employee.branchId) {
      retry = await retryUnassignedTickets(employee.branchId);
    }
    return ok({ employeeId, availabilityEnabled, retry });
  });
}
