// Escalate a ticket for priority attention (SLA risk or manual escalation).

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessTicket } from "@/lib/tickets";
import { logAudit } from "@/lib/audit";
import { queueNotification } from "@/lib/notifications";
import { canUpdateTicketStatus } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  return handleErrors(async () => {
    const { ticketId } = await params;
    const user = await requireUser();
    if (!canUpdateTicketStatus(user.role)) return fail("FORBIDDEN", "Your role cannot escalate tickets.", 403);

    const body = await request.json().catch(() => null);
    const reason = String((body as { reason?: string })?.reason || "").trim();

    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
      include: {
        branch: true,
        category: true,
        assignee: { select: { name: true, email: true } },
      },
    });
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);
    if (!canAccessTicket(user, ticket)) return fail("FORBIDDEN", "You do not have permission to update this ticket.", 403);
    if (ticket.status === "CLOSED") return fail("TICKET_CLOSED", "Closed tickets are read-only.", 409);
    if (ticket.escalatedAt) return fail("ALREADY_ESCALATED", "This ticket is already escalated.", 409);

    await db.ticket.update({ where: { id: ticketId }, data: { escalatedAt: new Date() } });
    await logAudit({ ticketId, actor: user, action: "ESCALATED", details: reason || "Manual escalation" });

    const v = {
      ticketNumber: ticket.ticketNumber,
      customerName: ticket.customerName,
      customerEmail: ticket.customerEmail,
      branchName: ticket.branch.name,
      branchEmail: ticket.branch.notificationEmail,
      categoryName: ticket.category.name,
      assigneeName: ticket.assignee?.name || "",
      assigneeEmail: ticket.assignee?.email || "",
      reason: reason || "Manual escalation",
      status: ticket.status,
    };
    await queueNotification({ ticketId, ticketNumber: ticket.ticketNumber, event: "ESCALATED", recipientKind: "CENTRAL_SUPPORT", variables: v });
    await queueNotification({ ticketId, ticketNumber: ticket.ticketNumber, event: "ESCALATED", recipientKind: "BRANCH", variables: v });

    return ok({ escalated: true });
  });
}
