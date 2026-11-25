// Full ticket history: status timeline, assignment history, reopen history.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessTicket, getAccessPolicy } from "@/lib/tickets";
import { getUserPermissions } from "@/lib/permissions";

export async function GET(_request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  return handleErrors(async () => {
    const { ticketId } = await params;
    const user = await requireUser();
    const permissions = await getUserPermissions(user);

    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        branchId: true,
        assignedToId: true,
        statusHistory: { orderBy: { createdAt: "asc" } },
        assignments: {
          orderBy: { createdAt: "asc" },
          include: { assignee: { select: { id: true, name: true } } },
        },
        reopenHistory: { orderBy: { reopenedAt: "asc" } },
      },
    });
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);
    if (!canAccessTicket(user, ticket, await getAccessPolicy(), permissions)) return fail("FORBIDDEN", "You do not have permission to view this ticket.", 403);

    const normalizedHistory = ticket.statusHistory.map((h) => ({
      ...h,
      fromStatus: h.fromStatus === "NEW_COMPLAINT" ? "IN_PROGRESS" : h.fromStatus,
      toStatus: h.toStatus === "NEW_COMPLAINT" ? "IN_PROGRESS" : h.toStatus,
    }));
    return ok({ statusHistory: normalizedHistory, assignments: ticket.assignments, reopenHistory: ticket.reopenHistory });
  });
}
