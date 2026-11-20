// Manual assignment / reassignment / branch transfer.
// Supports dynamic permissions per role and designation.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AssignmentError, manuallyAssignTicket, transferTicketBranch } from "@/lib/assignment";
import { canReassignTicket, getAccessPolicy } from "@/lib/tickets";
import { getUserPermissions } from "@/lib/permissions";
import { isCentralRole } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  return handleErrors(async () => {
    const { ticketId } = await params;
    const user = await requireUser();
    const permissions = await getUserPermissions(user);

    const body = (await request.json().catch(() => null)) as { employeeId?: string; note?: string; transferBranchId?: string } | null;
    const employeeId = String(body?.employeeId || "");
    const note = String(body?.note || "").trim().slice(0, 500);
    const transferBranchId = String(body?.transferBranchId || "");

    const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { branchId: true, assignedToId: true } });
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);

    const policy = await getAccessPolicy();
    if (!canReassignTicket(user, ticket, policy, permissions)) {
      return fail("FORBIDDEN", "You are not allowed to assign or transfer this ticket.", 403);
    }
    const acrossBranches = isCentralRole(user.role) || policy.crossBranch || permissions.transferBranch;

    try {
      if (transferBranchId) {
        if (!permissions.transferBranch && !acrossBranches) {
          return fail("FORBIDDEN", "Branch transfer is not allowed for your role or designation.", 403);
        }
        await transferTicketBranch(ticketId, transferBranchId, user);
        return ok({ transferred: true });
      }
      if (!employeeId) return fail("VALIDATION_ERROR", "employeeId is required.", 422);
      const result = await manuallyAssignTicket(ticketId, employeeId, user, note, { allowBranchMove: acrossBranches });
      return ok({ assigned: true, movedToBranch: result.movedToBranch });
    } catch (err) {
      if (err instanceof AssignmentError) return fail("ASSIGNMENT_ERROR", err.message, 409);
      throw err;
    }
  });
}
