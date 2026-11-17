// Integration API: single ticket by ticket number + status updates.
// GET requires "read" scope and returns the full record (history, messages,
// assignments, attachments). PATCH requires "write" scope and follows the same
// status-transition rules as the staff UI. Closed tickets are rejected.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiActor, findTicketByNumber, pick, readBody } from "@/lib/integration";
import { applyStatusChange, TicketError } from "@/lib/tickets";
import { ALLOWED_TRANSITIONS, TICKET_STATUSES, type TicketStatus } from "@/lib/types";

export async function GET(request: Request, { params }: { params: Promise<{ ticketNumber: string }> }) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "read");
    const { ticketNumber } = await params;
    const ticket = await db.ticket.findUnique({
      where: { ticketNumber: ticketNumber.toUpperCase() },
      include: {
        branch: { select: { id: true, code: true, name: true, city: true, crmExternalId: true } },
        category: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true, crmExternalId: true } },
        statusHistory: { orderBy: { createdAt: "asc" } },
        reopenHistory: true,
        messages: { orderBy: { createdAt: "asc" } },
        assignments: {
          orderBy: { createdAt: "asc" },
          include: { assignee: { select: { id: true, name: true, email: true } } },
        },
        attachments: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true } },
        slaTracking: true,
      },
    });
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);
    return ok({
      ticket,
      allowedTransitions: ALLOWED_TRANSITIONS[ticket.status as TicketStatus] || [],
      client: client.name,
    });
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ ticketNumber: string }> }) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "write");
    const { ticketNumber } = await params;
    const body = await readBody(request);
    const toStatus = pick(body, "toStatus", "status").toUpperCase();

    if (!TICKET_STATUSES.includes(toStatus as TicketStatus)) {
      return fail("VALIDATION_ERROR", `toStatus must be one of ${TICKET_STATUSES.join(", ")}.`, 422);
    }

    const ticket = await findTicketByNumber(ticketNumber);
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);

    try {
      const result = await applyStatusChange(
        ticket.id,
        {
          toStatus: toStatus as TicketStatus,
          note: pick(body, "note"),
          reason: pick(body, "reason"),
          resolution: pick(body, "resolution"),
        },
        apiActor(client, pick(body, "actorName", "updatedBy")),
        {},
      );
      return ok({ ...result, client: client.name });
    } catch (err) {
      if (err instanceof TicketError) return fail(err.code, err.message, err.code === "TICKET_CLOSED" || err.code === "INVALID_TRANSITION" ? 409 : 422);
      throw err;
    }
  });
}
