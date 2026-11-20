// Resolve a ticket with a mandatory resolution message.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyStatusChange, canAccessTicket, getAccessPolicy, TicketError } from "@/lib/tickets";
import { getUserPermissions } from "@/lib/permissions";
import { canUpdateTicketStatus } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  return handleErrors(async () => {
    const { ticketId } = await params;
    const user = await requireUser();
    const permissions = await getUserPermissions(user);
    if (!canUpdateTicketStatus(user.role) || !permissions.updateStatus) {
      return fail("FORBIDDEN", "Your role or designation does not have permission to resolve tickets.", 403);
    }

    const body = await request.json().catch(() => null);
    const resolution = String((body as { resolution?: string })?.resolution || "").trim();
    if (!resolution || resolution.length < 10) {
      return fail("VALIDATION_ERROR", "A resolution message (minimum 10 characters) is mandatory.", 422, { resolution: "Please describe the resolution provided." });
    }

    const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { branchId: true, assignedToId: true } });
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);
    const policy = await getAccessPolicy();
    if (!canAccessTicket(user, ticket, policy, permissions)) {
      return fail("FORBIDDEN", "You do not have permission to update this ticket.", 403);
    }

    try {
      const result = await applyStatusChange(ticketId, { toStatus: "RESOLVED", resolution }, user, {});
      return ok(result);
    } catch (err) {
      if (err instanceof TicketError) return fail(err.code, err.message, err.code === "TICKET_CLOSED" ? 409 : 422);
      throw err;
    }
  });
}
