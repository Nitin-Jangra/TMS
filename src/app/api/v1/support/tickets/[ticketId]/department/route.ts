// Move a ticket to another department (wrong team). Optional automatic
// re-assignment inside the new department.
// PATCH { departmentId: "..." | null, reassign?: boolean }

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { assignTicketRoundRobin } from "@/lib/assignment";
import { canReassignTicket, getAccessPolicy } from "@/lib/tickets";
import { getUserPermissions } from "@/lib/permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  return handleErrors(async () => {
    const { ticketId } = await params;
    const user = await requireUser();
    const permissions = await getUserPermissions(user);
    const body = ((await request.json().catch(() => null)) || {}) as { departmentId?: string | null; reassign?: boolean };
    const departmentId = body.departmentId ? String(body.departmentId) : null;

    const ticket = await db.ticket.findUnique({ where: { id: ticketId }, include: { department: true } });
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);
    if (ticket.status === "CLOSED") return fail("TICKET_CLOSED", "Closed tickets are read-only.", 409);
    
    const policy = await getAccessPolicy();
    if (!canReassignTicket(user, ticket, policy, permissions) || !permissions.changeDepartment) {
      return fail("FORBIDDEN", "You are not allowed to change the assignment group of this ticket.", 403);
    }

    const department = departmentId ? await db.department.findUnique({ where: { id: departmentId } }) : null;
    if (departmentId && (!department || !department.isActive)) return fail("NOT_FOUND", "Department not found or inactive.", 404);
    if ((ticket.departmentId || null) === departmentId && !body.reassign) return ok({ unchanged: true });

    await db.ticket.update({ where: { id: ticketId }, data: { departmentId } });
    await logAudit({
      ticketId,
      actor: user,
      action: "DEPARTMENT_CHANGED",
      previousValue: ticket.department?.name || "(none)",
      newValue: department?.name || "(none)",
      details: `Assignment group changed from ${ticket.department?.name || "(none)"} to ${department?.name || "(none)"} by ${user.name}`,
    });

    let assignedTo: { id: string; name: string } | null = null;
    if (body.reassign) {
      await db.ticketAssignment.updateMany({ where: { ticketId, isCurrent: true }, data: { isCurrent: false } });
      await db.ticket.update({ where: { id: ticketId }, data: { assignedToId: null, assignedAt: null } });
      assignedTo = await assignTicketRoundRobin(ticketId, user);
    }
    return ok({ department: department ? { id: department.id, name: department.name } : null, assignedTo });
  });
}
