// Bulk actions on many tickets at once (ticket list checkboxes).
// POST { ticketIds: string[] (max 100), action, ... }
//   action "assign"     { employeeId, note? }
//   action "department" { departmentId | null, reassign?: boolean }
//   action "status"     { toStatus, note?, reason? (ON_HOLD), resolution? (RESOLVED) }
//   action "escalate"   { reason? }
// Every ticket is checked individually against the caller's permissions; the
// response lists the outcome per ticket, so one failure never blocks the rest.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { AssignmentError, assignTicketRoundRobin, manuallyAssignTicket } from "@/lib/assignment";
import { applyStatusChange, canAccessTicket, canReassignTicket, escalateTicket, getAccessPolicy, TicketError } from "@/lib/tickets";
import { canUpdateTicketStatus, isCentralRole, TICKET_STATUSES, type TicketStatus } from "@/lib/types";
import { getUserPermissions } from "@/lib/permissions";

const ACTIONS = ["assign", "department", "status", "escalate"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(request: Request) {
  return handleErrors(async () => {
    const user = await requireUser();
    const permissions = await getUserPermissions(user);
    if (!permissions.bulkOperations) {
      return fail("FORBIDDEN", "Your role or designation does not have permission to perform bulk operations.", 403);
    }

    const body = ((await request.json().catch(() => null)) || {}) as Record<string, unknown>;
    const action = String(body.action || "") as Action;
    if (!ACTIONS.includes(action)) return fail("VALIDATION_ERROR", `action must be one of: ${ACTIONS.join(", ")}.`, 422);
    const ids = Array.isArray(body.ticketIds) ? [...new Set(body.ticketIds.map(String))].slice(0, 100) : [];
    if (!ids.length) return fail("VALIDATION_ERROR", "Select at least one ticket.", 422);

    const policy = await getAccessPolicy();
    const note = String(body.note || "").trim().slice(0, 500);

    // Validate action-specific input once.
    let toStatus: TicketStatus | null = null;
    let department: { id: string; name: string } | null = null;
    if (action === "status") {
      if (!permissions.updateStatus || !canUpdateTicketStatus(user.role)) return fail("FORBIDDEN", "Your role or designation cannot update ticket status.", 403);
      toStatus = String(body.toStatus || "") as TicketStatus;
      if (!TICKET_STATUSES.includes(toStatus) || toStatus === "CLOSED") {
        return fail("VALIDATION_ERROR", "toStatus must be IN_PROGRESS, ON_HOLD or RESOLVED.", 422);
      }
      if (toStatus === "ON_HOLD" && !String(body.reason || "").trim()) return fail("VALIDATION_ERROR", "A hold reason is required.", 422);
      if (toStatus === "RESOLVED" && !String(body.resolution || "").trim()) return fail("VALIDATION_ERROR", "A resolution note is required.", 422);
    }
    if (action === "escalate" && (!permissions.escalateTickets || !canUpdateTicketStatus(user.role))) return fail("FORBIDDEN", "Your role or designation cannot escalate tickets.", 403);
    if (action === "assign") {
      if (!permissions.reassignTickets) return fail("FORBIDDEN", "Your role or designation cannot reassign tickets.", 403);
      if (!String(body.employeeId || "")) return fail("VALIDATION_ERROR", "employeeId is required.", 422);
    }
    if (action === "department") {
      if (!permissions.changeDepartment) return fail("FORBIDDEN", "Your role or designation cannot change assignment groups.", 403);
      if (body.departmentId) {
        const d = await db.department.findUnique({ where: { id: String(body.departmentId) } });
        if (!d || !d.isActive) return fail("NOT_FOUND", "Department not found or inactive.", 404);
        department = { id: d.id, name: d.name };
      }
    }

    const tickets = await db.ticket.findMany({
      where: { id: { in: ids } },
      select: { id: true, ticketNumber: true, branchId: true, assignedToId: true, status: true, departmentId: true },
    });
    const byId = new Map(tickets.map((t) => [t.id, t]));
    const results: { ticketId: string; ticketNumber: string; ok: boolean; message: string }[] = [];

    for (const id of ids) {
      const t = byId.get(id);
      if (!t) { results.push({ ticketId: id, ticketNumber: "", ok: false, message: "Ticket not found." }); continue; }
      const push = (okFlag: boolean, message: string) => results.push({ ticketId: id, ticketNumber: t.ticketNumber, ok: okFlag, message });
      try {
        if (action === "assign" || action === "department") {
          if (!canReassignTicket(user, t, policy, permissions)) { push(false, "Not allowed to reassign this ticket."); continue; }
        } else if (!canAccessTicket(user, t, policy, permissions)) {
          push(false, "No access to this ticket."); continue;
        }
        if (t.status === "CLOSED") { push(false, "Closed tickets are read-only."); continue; }

        if (action === "assign") {
          if (t.assignedToId === String(body.employeeId)) { push(true, "Already assigned."); continue; }
          const r = await manuallyAssignTicket(id, String(body.employeeId), user, note || "Bulk reassignment", {
            allowBranchMove: isCentralRole(user.role) || !!permissions.transferBranch,
          });
          push(true, r.movedToBranch ? `Assigned and moved to ${r.movedToBranch}.` : "Assigned.");
        } else if (action === "department") {
          await db.ticket.update({ where: { id }, data: { departmentId: department?.id ?? null } });
          await logAudit({ ticketId: id, actor: user, action: "DEPARTMENT_CHANGED", newValue: department?.name || "(none)", details: "Bulk action" });
          if (body.reassign) {
            await db.ticketAssignment.updateMany({ where: { ticketId: id, isCurrent: true }, data: { isCurrent: false } });
            await db.ticket.update({ where: { id }, data: { assignedToId: null, assignedAt: null } });
            const a = await assignTicketRoundRobin(id, user);
            push(true, a ? `Moved; assigned to ${a.name}.` : "Moved; nobody available — left unassigned.");
          } else push(true, "Moved.");
        } else if (action === "status") {
          if (t.status === toStatus) { push(true, "Already in that status."); continue; }
          await applyStatusChange(id, { toStatus: toStatus!, note, reason: String(body.reason || ""), resolution: String(body.resolution || "") }, user);
          push(true, "Status updated.");
        } else {
          await escalateTicket(id, String(body.reason || "").trim() || "Bulk escalation", user);
          push(true, "Escalated.");
        }
      } catch (err) {
        push(false, err instanceof TicketError || err instanceof AssignmentError ? err.message : "Unexpected error.");
        if (!(err instanceof TicketError || err instanceof AssignmentError)) console.error("[fcms] bulk action error:", err);
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    await logAudit({ actor: user, action: "BULK_ACTION", newValue: action, details: `${succeeded}/${results.length} tickets succeeded` });
    return ok({ action, succeeded, failed: results.length - succeeded, results });
  });
}
