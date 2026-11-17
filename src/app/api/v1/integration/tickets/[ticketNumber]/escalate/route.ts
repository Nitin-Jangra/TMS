// Integration API: escalate a ticket for priority attention (write scope).
// Body: { "reason": "..." } (optional)

import { fail, handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { apiActor, findTicketByNumber, pick, readBody } from "@/lib/integration";
import { escalateTicket, TicketError } from "@/lib/tickets";

export async function POST(request: Request, { params }: { params: Promise<{ ticketNumber: string }> }) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "write");
    const { ticketNumber } = await params;
    const body = await readBody(request);

    const ticket = await findTicketByNumber(ticketNumber);
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);

    try {
      await escalateTicket(ticket.id, pick(body, "reason", "note"), apiActor(client, pick(body, "actorName")));
      return ok({ ticketNumber: ticket.ticketNumber, escalated: true });
    } catch (err) {
      if (err instanceof TicketError) return fail(err.code, err.message, 409);
      throw err;
    }
  });
}
