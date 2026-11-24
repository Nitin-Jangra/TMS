// Availability toggle.
// - Becoming available retries the branch's unassigned queue.
// - Becoming unavailable (leave / away) hands their open tickets to available
//   colleagues when "auto_handover_on_leave" is on (send "handover": false to
//   keep them).

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handoverOpenTickets, retryUnassignedTickets } from "@/lib/assignment";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { canManageAvailability } from "@/lib/types";
import { getUserPermissions } from "@/lib/permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  return handleErrors(async () => {
    const { employeeId } = await params;
    const user = await requireUser();
    const permissions = await getUserPermissions(user);
    if (!permissions.manageStaffAvailability && !canManageAvailability(user.role)) {
      return fail("FORBIDDEN", "Your role or designation cannot change availability.", 403);
    }

    const body = await request.json().catch(() => null);
    const availabilityEnabled = (body as { availabilityEnabled?: boolean })?.availabilityEnabled;
    const handoverRequested = (body as { handover?: boolean })?.handover;
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
    let handover: { moved: { ticketNumber: string; to: string }[]; kept: string[] } | null = null;
    const autoHandover = (await getSetting("auto_handover_on_leave")) !== "false";
    if (!availabilityEnabled && (handoverRequested ?? autoHandover)) {
      handover = await handoverOpenTickets(employeeId, user, `${employee.name} marked unavailable by ${user.name}`);
      if (handover.moved.length || handover.kept.length) {
        await logAudit({
          actor: user,
          action: "LEAVE_HANDOVER",
          previousValue: employee.name,
          newValue: `${handover.moved.length} moved, ${handover.kept.length} kept`,
          details: handover.kept.length ? `No colleague available for: ${handover.kept.join(", ")}` : "",
        });
      }
    }
    return ok({ employeeId, availabilityEnabled, retry, handover });
  });
}
