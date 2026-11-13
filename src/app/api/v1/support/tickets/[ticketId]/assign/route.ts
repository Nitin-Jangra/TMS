// Manual assignment / reassignment / branch transfer.
// Support employees cannot assign; managers are restricted to their branch,
// central roles to any branch.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AssignmentError, manuallyAssignTicket, transferTicketBranch } from "@/lib/assignment";
import { canAssignTickets, isCentralRole } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  return handleErrors(async () => {
    const { ticketId } = await params;
    const user = await requireUser();
    if (!canAssignTickets(user.role)) return fail("FORBIDDEN", "Your role cannot assign tickets.", 403);

    const body = await request.json().catch(() => null);
    const employeeId = String((body as { employeeId?: string })?.employeeId || "");
    const note = String((body as { note?: string })?.note || "");
    const transferBranchId = String((body as { transferBranchId?: string })?.transferBranchId || "");

    const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { branchId: true } });
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);
    if (!isCentralRole(user.role) && user.role === "BRANCH_MANAGER" && user.branchId !== ticket.branchId) {
      return fail("FORBIDDEN", "Branch managers can only manage tickets in their own branch.", 403);
    }

    try {
      if (transferBranchId) {
        await transferTicketBranch(ticketId, transferBranchId, user);
        return ok({ transferred: true });
      }
      if (!employeeId) return fail("VALIDATION_ERROR", "employeeId is required.", 422);
      await manuallyAssignTicket(ticketId, employeeId, user, note);
      return ok({ assigned: true });
    } catch (err) {
      if (err instanceof AssignmentError) return fail("ASSIGNMENT_ERROR", err.message, 409);
      throw err;
    }
  });
}
