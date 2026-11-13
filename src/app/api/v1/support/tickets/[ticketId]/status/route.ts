// Status transitions with role checks, mandatory notes and closed-ticket
// protection. Every transition is validated against the allowed map and the
// ticket row is re-read inside the service; closed tickets are untouchable.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyStatusChange, canAccessTicket, TicketError } from "@/lib/tickets";
import { canUpdateTicketStatus, TICKET_STATUSES, type TicketStatus } from "@/lib/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  return handleErrors(async () => {
    const { ticketId } = await params;
    const user = await requireUser();

    if (!canUpdateTicketStatus(user.role)) {
      return fail("FORBIDDEN", "Your role cannot update ticket status.", 403);
    }

    const body = await request.json().catch(() => null);
    const toStatus = String((body as { toStatus?: string })?.toStatus || "");
    const note = String((body as { note?: string })?.note || "");
    const reason = String((body as { reason?: string })?.reason || "");
    const resolution = String((body as { resolution?: string })?.resolution || "");

    if (!TICKET_STATUSES.includes(toStatus as TicketStatus)) {
      return fail("VALIDATION_ERROR", "Invalid target status.", 422);
    }

    const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { branchId: true, assignedToId: true } });
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);
    if (!canAccessTicket(user, ticket)) return fail("FORBIDDEN", "You do not have permission to update this ticket.", 403);

    try {
      const result = await applyStatusChange(
        ticketId,
        { toStatus: toStatus as TicketStatus, note, reason, resolution },
        user,
        { ip: request.headers.get("x-forwarded-for") || "" },
      );
      return ok(result);
    } catch (err) {
      if (err instanceof TicketError) {
        const status = err.code === "TICKET_CLOSED" ? 409 : err.code === "INVALID_TRANSITION" ? 409 : 422;
        return fail(err.code, err.message, status);
      }
      throw err;
    }
  });
}
