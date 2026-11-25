// Escalate a ticket for priority attention (SLA risk or manual escalation).

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessTicket, getAccessPolicy, escalateTicket, TicketError } from "@/lib/tickets";
import { canUpdateTicketStatus } from "@/lib/types";
import { getUserPermissions } from "@/lib/permissions";

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  return handleErrors(async () => {
    const { ticketId } = await params;
    const user = await requireUser();
    const permissions = await getUserPermissions(user);
    if (!permissions.escalateTickets || !canUpdateTicketStatus(user.role)) {
      return fail("FORBIDDEN", "Your role or designation does not have permission to escalate tickets.", 403);
    }

    const body = await request.json().catch(() => null);
    const reason = String((body as { reason?: string })?.reason || "").trim();

    const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);
    if (!canAccessTicket(user, ticket, await getAccessPolicy(), permissions)) return fail("FORBIDDEN", "You do not have permission to update this ticket.", 403);

    try {
      await escalateTicket(ticketId, reason, user);
    } catch (err) {
      if (err instanceof TicketError) return fail(err.code, err.message, 409);
      throw err;
    }
    return ok({ escalated: true });
  });
}
