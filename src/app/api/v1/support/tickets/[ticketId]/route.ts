// Ticket detail: complaint, customer info, messages (internal + public),
// status history, assignment history, audit logs, attachments, SLA state.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessTicket, canReassignTicket, getAccessPolicy } from "@/lib/tickets";
import { getUserPermissions } from "@/lib/permissions";
import { isCentralRole } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  return handleErrors(async () => {
    const { ticketId } = await params;
    const user = await requireUser();
    const permissions = await getUserPermissions(user);

    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
      include: {
        branch: { select: { id: true, code: true, name: true } },
        category: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        feedback: { select: { rating: true, comment: true, createdAt: true } },
        assignee: { select: { id: true, name: true, email: true, designation: true } },
        messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, role: true } } } },
        statusHistory: { orderBy: { createdAt: "asc" } },
        assignments: {
          orderBy: { createdAt: "asc" },
          include: { assignee: { select: { id: true, name: true } } },
        },
        attachments: { orderBy: { createdAt: "asc" } },
        auditLogs: { orderBy: { createdAt: "asc" } },
        reopenHistory: { orderBy: { reopenedAt: "asc" } },
        slaTracking: true,
      },
    });
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);
    const policy = await getAccessPolicy();
    if (!canAccessTicket(user, ticket, policy, permissions)) {
      return fail("FORBIDDEN", "You do not have permission to view this ticket.", 403);
    }

    const canReassign = canReassignTicket(user, ticket, policy, permissions);
    const normalizedTicket = {
      ...ticket,
      status: ticket.status === "NEW_COMPLAINT" ? "IN_PROGRESS" : ticket.status,
      statusHistory: ticket.statusHistory.map((h) => ({
        ...h,
        fromStatus: h.fromStatus === "NEW_COMPLAINT" ? "IN_PROGRESS" : h.fromStatus,
        toStatus: h.toStatus === "NEW_COMPLAINT" ? "IN_PROGRESS" : h.toStatus,
      })),
    };
    return ok({
      ticket: normalizedTicket,
      viewer: {
        id: user.id,
        role: user.role,
        designation: user.designation,
        branchId: user.branchId,
        permissions,
        canReassign,
        canAssignAcrossBranches: canReassign && (isCentralRole(user.role) || permissions.transferBranch),
      },
    });
  });
}
