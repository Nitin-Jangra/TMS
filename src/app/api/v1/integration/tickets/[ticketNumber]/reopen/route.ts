// Integration API: reopen a RESOLVED ticket on the member's behalf (write scope).
// Same rules as the public portal: only inside the reopening window, never
// after closure. Body: { "reason": "..." }

import { fail, handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { findTicketByNumber, pick, readBody } from "@/lib/integration";
import { reopenTicket, TicketError } from "@/lib/tickets";

export async function POST(request: Request, { params }: { params: Promise<{ ticketNumber: string }> }) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "write");
    const { ticketNumber } = await params;
    const body = await readBody(request);
    const reason = pick(body, "reason", "note");
    if (!reason) return fail("VALIDATION_ERROR", "reason is required.", 422);

    const ticket = await findTicketByNumber(ticketNumber);
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);

    try {
      const result = await reopenTicket(ticket.ticketNumber, ticket.customerPhone, `${reason} (via ${client.name})`);
      return ok(result);
    } catch (err) {
      if (err instanceof TicketError) return fail(err.code, err.message, 409);
      throw err;
    }
  });
}
