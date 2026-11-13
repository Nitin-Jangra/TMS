// Integration API: single ticket by ticket number + status updates.
// GET requires "read" scope; PATCH requires "write" scope and follows the
// same status-transition rules as the staff UI. Closed tickets are rejected.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyStatusChange, TicketError } from "@/lib/tickets";
import { TICKET_STATUSES, type TicketStatus } from "@/lib/types";
import { logAudit } from "@/lib/audit";

export async function GET(request: Request, { params }: { params: Promise<{ ticketNumber: string }> }) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "read");
    const { ticketNumber } = await params;
    const ticket = await db.ticket.findUnique({
      where: { ticketNumber: ticketNumber.toUpperCase() },
      include: {
        branch: { select: { id: true, code: true, name: true } },
        category: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
        statusHistory: { orderBy: { createdAt: "asc" } },
        reopenHistory: true,
      },
    });
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);
    return ok({ ticket, client: client.name });
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ ticketNumber: string }> }) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "write");
    const { ticketNumber } = await params;
    const body = await request.json().catch(() => null);
    const toStatus = String((body as { toStatus?: string })?.toStatus || "");
    const note = String((body as { note?: string })?.note || "");
    const reason = String((body as { reason?: string })?.reason || "");
    const resolution = String((body as { resolution?: string })?.resolution || "");

    if (!TICKET_STATUSES.includes(toStatus as TicketStatus)) return fail("VALIDATION_ERROR", "Invalid toStatus.", 422);

    const ticket = await db.ticket.findUnique({ where: { ticketNumber: ticketNumber.toUpperCase() } });
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);

    try {
      const result = await applyStatusChange(
        ticket.id,
        { toStatus: toStatus as TicketStatus, note, reason, resolution },
        {
          id: client.clientId,
          name: `API:${client.name}`,
          email: "",
          role: "CENTRAL_AGENT",
          branchId: null,
        },
        {},
      );
      return ok({ ...result, client: client.name });
    } catch (err) {
      if (err instanceof TicketError) return fail(err.code, err.message, err.code === "TICKET_CLOSED" || err.code === "INVALID_TRANSITION" ? 409 : 422);
      throw err;
    }
  });
}
