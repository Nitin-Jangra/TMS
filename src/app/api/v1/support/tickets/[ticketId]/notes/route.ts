// Internal notes. Never emailed to customers; visible to staff only.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addTicketMessage, canAccessTicket, getAccessPolicy, TicketError } from "@/lib/tickets";
import { getUserPermissions } from "@/lib/permissions";

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  return handleErrors(async () => {
    const { ticketId } = await params;
    const user = await requireUser();
    const permissions = await getUserPermissions(user);
    if (!permissions.addWorkNotes) {
      return fail("FORBIDDEN", "Your role or designation does not have permission to add work notes.", 403);
    }

    const body = await request.json().catch(() => null);
    const note = String((body as { note?: string })?.note || "").trim();
    if (!note || note.length < 2 || note.length > 4000) {
      return fail("VALIDATION_ERROR", "Note must be 2-4000 characters.", 422);
    }

    const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { branchId: true, assignedToId: true } });
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);
    const policy = await getAccessPolicy();
    if (!canAccessTicket(user, ticket, policy, permissions)) {
      return fail("FORBIDDEN", "You do not have permission to update this ticket.", 403);
    }

    try {
      await addTicketMessage(ticketId, { body: note, visibility: "INTERNAL", author: user }, {});
      return ok({ added: true }, { status: 201 });
    } catch (err) {
      if (err instanceof TicketError) return fail(err.code, err.message, 409);
      throw err;
    }
  });
}
