// Integration API: ticket conversation.
// GET  (read)  — all messages on the ticket, oldest first.
// POST (write) — add a customer-facing reply (visibility PUBLIC, emailed to
//                the member) or an internal note (visibility INTERNAL, never emailed).

import { fail, handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiActor, findTicketByNumber, pick, readBody } from "@/lib/integration";
import { addTicketMessage, TicketError } from "@/lib/tickets";

export async function GET(request: Request, { params }: { params: Promise<{ ticketNumber: string }> }) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "read");
    const { ticketNumber } = await params;
    const ticket = await findTicketByNumber(ticketNumber);
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);
    const messages = await db.ticketMessage.findMany({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, authorType: true, authorName: true, visibility: true, body: true, createdAt: true },
    });
    return ok({ ticketNumber: ticket.ticketNumber, messages });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ ticketNumber: string }> }) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "write");
    const { ticketNumber } = await params;
    const body = await readBody(request);
    const text = pick(body, "body", "message", "note");
    const visibility = (pick(body, "visibility") || "INTERNAL").toUpperCase();

    if (text.length < 1 || text.length > 4000) return fail("VALIDATION_ERROR", "body is required (1-4000 characters).", 422);
    if (visibility !== "PUBLIC" && visibility !== "INTERNAL") return fail("VALIDATION_ERROR", "visibility must be PUBLIC or INTERNAL.", 422);

    const ticket = await findTicketByNumber(ticketNumber);
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);

    try {
      await addTicketMessage(ticket.id, { body: text, visibility, author: apiActor(client, pick(body, "authorName", "actorName")) });
      return ok({ ticketNumber: ticket.ticketNumber, visibility, added: true }, { status: 201 });
    } catch (err) {
      if (err instanceof TicketError) return fail(err.code, err.message, err.code === "TICKET_CLOSED" ? 409 : 422);
      throw err;
    }
  });
}
