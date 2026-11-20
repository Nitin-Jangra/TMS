// Branch-wise Round-Robin Assignment Engine (spec section 8).
//
// - Every branch has an independent queue with a persistent cursor.
// - FIFO round-robin, equal distribution over a full cycle.
// - Concurrency-safe: the cursor is read+updated inside a single database
//   transaction. On SQLite the whole write is serialized; on the future
//   PostgreSQL (Supabase) deployment the same transaction maps to
//   SELECT ... FOR UPDATE row locking on the cursor row.
// - Unavailable employees (inactive / availability off) are skipped.
// - If no eligible employee exists the ticket stays NEW_COMPLAINT in the
//   unassigned queue and branch manager + central support are notified.

import { db, runInTransaction } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { queueNotification } from "@/lib/notifications";
import { emitWebhook } from "@/lib/webhooks";
import { getSetting } from "@/lib/settings";

export class AssignmentError extends Error {}

export interface AssignmentActor {
  id?: string;
  name?: string;
  role?: string;
}

export async function getEligibleEmployees(branchId: string) {
  return db.staffUser.findMany({
    where: {
      branchId,
      role: "SUPPORT_AGENT",
      isActive: true,
      availabilityEnabled: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, email: true, designation: true },
  });
}

async function getTicketContext(ticketId: string) {
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: {
      branch: true,
      category: true,
      assignee: { select: { id: true, name: true, email: true } },
    },
  });
  if (!ticket) throw new AssignmentError("Ticket not found.");
  const manager = await db.staffUser.findFirst({
    where: { branchId: ticket.branchId, role: "BRANCH_MANAGER", isActive: true },
    select: { id: true, name: true, email: true },
  });
  return { ticket, manager };
}

function notificationVariables(ctx: {
  ticket: {
    ticketNumber: string;
    customerName: string;
    customerEmail: string;
    description: string;
    priority: string;
    status: string;
    source: string;
    branch?: { name: string; notificationEmail: string } | null;
    category?: { name: string } | null;
  };
  assignee?: { name: string; email: string } | null;
}) {
  const t = ctx.ticket;
  const assignee = ctx.assignee ?? (t as unknown as { assignee?: { name: string; email: string } | null }).assignee;
  return {
    ticketNumber: t.ticketNumber,
    customerName: t.customerName,
    customerEmail: t.customerEmail,
    description: t.description,
    priority: t.priority,
    status: t.status,
    source: t.source,
    branchName: t.branch?.name || "",
    branchEmail: t.branch?.notificationEmail || "",
    categoryName: t.category?.name || "",
    assigneeName: assignee?.name || "",
    assigneeEmail: assignee?.email || "",
  };
}

const OPEN_STATUSES = ["NEW_COMPLAINT", "IN_PROGRESS", "ON_HOLD"];

export async function getAssignmentStrategy(): Promise<"least_busy" | "round_robin"> {
  return (await getSetting("assignment_strategy")) === "round_robin" ? "round_robin" : "least_busy";
}

type Tx = Parameters<Parameters<typeof runInTransaction>[0]>[0];

/**
 * Picks the next employee for a ticket (no writes except the branch cursor).
 *
 * Candidates: active, available support agents of the ticket's branch.
 * Department routing: members of the ticket's department first; if none is
 * available, generalists (no department); if none, anyone in the branch.
 * Strategy (setting assignment_strategy):
 *   round_robin — next person after the branch cursor (FIFO cycle)
 *   least_busy  — fewest open tickets; ties go in round-robin order
 */
export async function pickEmployee(
  tx: Tx,
  ticket: { branchId: string; departmentId: string | null },
  opts: { excludeIds?: string[]; strategy?: string } = {},
): Promise<{ id: string; name: string; email: string; routedBy: string } | null> {
  const all = await tx.staffUser.findMany({
    where: { branchId: ticket.branchId, role: "SUPPORT_AGENT", isActive: true, availabilityEnabled: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, email: true, departmentId: true },
  });
  if (!all.length) return null;

  // Round-robin order: start right after the branch cursor.
  const cursor = await tx.branchCursor.findUnique({ where: { branchId: ticket.branchId } });
  const lastIdx = cursor?.lastEmployeeId ? all.findIndex((e) => e.id === cursor.lastEmployeeId) : -1;
  const rotated = [...all.slice(lastIdx + 1), ...all.slice(0, lastIdx + 1)].filter((e) => !opts.excludeIds?.includes(e.id));
  if (!rotated.length) return null;

  let pool = rotated;
  let routedBy = "branch queue";
  if (ticket.departmentId) {
    const inDept = rotated.filter((e) => e.departmentId === ticket.departmentId);
    const generalists = rotated.filter((e) => !e.departmentId);
    if (inDept.length) { pool = inDept; routedBy = "department"; }
    else if (generalists.length) { pool = generalists; routedBy = "branch generalists (no one available in the department)"; }
    else routedBy = "branch queue (no one available in the department)";
  }

  let chosen = pool[0];
  if (opts.strategy !== "round_robin" && pool.length > 1) {
    const counts = await tx.ticket.groupBy({
      by: ["assignedToId"],
      where: { assignedToId: { in: pool.map((e) => e.id) }, status: { in: OPEN_STATUSES } },
      _count: { _all: true },
    });
    const load = new Map(counts.map((c) => [c.assignedToId, c._count._all]));
    let best = Infinity;
    for (const e of pool) {
      const n = load.get(e.id) ?? 0;
      if (n < best) { best = n; chosen = e; }
    }
    routedBy += `, least busy (${best} open)`;
  }

  await tx.branchCursor.upsert({
    where: { branchId: ticket.branchId },
    create: { branchId: ticket.branchId, lastEmployeeId: chosen.id, lastAssignedAt: new Date() },
    update: { lastEmployeeId: chosen.id, lastAssignedAt: new Date() },
  });
  return { id: chosen.id, name: chosen.name, email: chosen.email, routedBy };
}

/**
 * Automatic assignment step for one ticket (department routing + strategy).
 * Returns the assigned employee, or null when the branch has no eligible
 * employee (ticket stays unassigned).
 */
export async function assignTicketRoundRobin(
  ticketId: string,
  actor: AssignmentActor | null,
  method: "ROUND_ROBIN" | "RETRY" | "REOPEN" = "ROUND_ROBIN",
): Promise<{ id: string; name: string } | null> {
  const strategy = await getAssignmentStrategy();
  const result = await runInTransaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new AssignmentError("Ticket not found.");
    if (ticket.status === "CLOSED") throw new AssignmentError("Closed tickets cannot be assigned or reassigned.");
    if (ticket.assignedToId) return { alreadyAssigned: true as const, employee: null };

    const chosen = await pickEmployee(tx, ticket, { strategy });
    if (!chosen) return { alreadyAssigned: false as const, employee: null };

    await tx.ticketAssignment.updateMany({ where: { ticketId, isCurrent: true }, data: { isCurrent: false } });
    await tx.ticketAssignment.create({
      data: {
        ticketId,
        assignedToId: chosen.id,
        assignedById: actor?.id || null,
        method,
        isCurrent: true,
        note: `${method === "ROUND_ROBIN" ? "Automatic assignment" : method === "RETRY" ? "Unassigned queue retry" : "Reopen re-assignment"} — ${chosen.routedBy}`,
      },
    });
    await tx.ticket.update({
      where: { id: ticketId },
      data: { assignedToId: chosen.id, assignedAt: new Date() },
    });
    return { alreadyAssigned: false as const, employee: chosen };
  });

  if (result.alreadyAssigned) {
    const { ticket, assignee } = await getTicketContext(ticketId);
    return assignee ? { id: assignee.id, name: assignee.name } : null;
  }
  if (!result.employee) return null;

  const { ticket } = await getTicketContext(ticketId);
  const employeeRecord = await db.staffUser.findUnique({
    where: { id: result.employee.id },
    select: { id: true, name: true, email: true },
  });
  await logAudit({
    ticketId,
    actor,
    actorRole: actor?.role || "SYSTEM",
    action: "TICKET_ASSIGNED",
    newValue: result.employee.name,
    details: `Assigned via ${method === "REOPEN" ? "reopen retention/re-assignment" : "branch round-robin queue"}`,
  });
  await queueNotification({
    ticketId,
    ticketNumber: ticket.ticketNumber,
    event: "ASSIGNED",
    recipientKind: "ASSIGNEE",
    variables: notificationVariables({ ticket: { ...ticket, assignee: { name: result.employee.name, email: employeeRecord?.email || "" } } }),
  });
  await emitWebhook("ticket.assigned", ticketId, { method, assignedBy: actor?.name || "System" });
  return result.employee;
}

/** Notify branch manager + central support when auto-assignment fails. */
export async function notifyAssignmentFailed(ticketId: string): Promise<void> {
  const { ticket, manager } = await getTicketContext(ticketId);
  const variables = {
    ...notificationVariables({ ticket: { ...ticket, assignee: null } }),
    branchManagerEmail: manager?.email || "",
  };
  const base = { ticketId, ticketNumber: ticket.ticketNumber, event: "ASSIGNMENT_FAILED" as const };
  await queueNotification({ ...base, recipientKind: "BRANCH", variables });
  await queueNotification({ ...base, recipientKind: "CENTRAL_SUPPORT", variables });
  await queueNotification({ ...base, recipientKind: "BRANCH_MANAGER", recipientEmail: manager?.email, variables });
  await logAudit({
    ticketId,
    action: "TICKET_ASSIGNED",
    details: "Auto-assignment failed: no eligible support employee available. Ticket placed in unassigned queue.",
  });
}

/** Manual assignment / reassignment by central support or branch manager. */
export async function manuallyAssignTicket(
  ticketId: string,
  toEmployeeId: string,
  actor: AssignmentActor & { id: string; name: string; role: string },
  note = "",
  opts: { allowBranchMove?: boolean } = {},
): Promise<{ movedToBranch: string | null }> {
  const { ticket } = await getTicketContext(ticketId);
  if (ticket.status === "CLOSED") throw new AssignmentError("Closed tickets are read-only and cannot be reassigned.");
  const employee = await db.staffUser.findUnique({ where: { id: toEmployeeId }, include: { branch: true } });
  if (!employee || !employee.isActive) throw new AssignmentError("Target employee not found or inactive.");
  if (!employee.branchId || !employee.branch) {
    throw new AssignmentError("Tickets can only be assigned to branch staff (support agents or branch managers).");
  }
  if (ticket.assignedToId === toEmployeeId) {
    throw new AssignmentError(`This ticket is already assigned to ${employee.name}.`);
  }

  // Employee of another branch → move the ticket to that branch as well.
  const moving = employee.branchId !== ticket.branchId;
  if (moving && !opts.allowBranchMove) {
    throw new AssignmentError("Employee belongs to a different branch. Use branch transfer instead.");
  }
  if (moving && !employee.branch.isActive) throw new AssignmentError("The employee's branch is inactive.");

  const prevAssigneeName = ticket.assignee?.name || (ticket.assignedToId ? "Previous Staff" : "Unassigned");
  const isReassignment = Boolean(ticket.assignedToId);
  const assignmentNote = note || (isReassignment ? `Reassigned by ${actor.name} from ${prevAssigneeName}` : `Assigned by ${actor.name}`);
  const auditDetails = isReassignment
    ? `Reassigned by ${actor.name} from ${prevAssigneeName} to ${employee.name}${note ? `: ${note}` : ""}`
    : `Assigned by ${actor.name} to ${employee.name}${note ? `: ${note}` : ""}`;

  await runInTransaction(async (tx) => {
    await tx.ticketAssignment.updateMany({ where: { ticketId, isCurrent: true }, data: { isCurrent: false } });
    await tx.ticketAssignment.create({
      data: { ticketId, assignedToId: toEmployeeId, assignedById: actor.id || null, method: "MANUAL", isCurrent: true, note: assignmentNote },
    });
    await tx.ticket.update({
      where: { id: ticketId },
      data: { assignedToId: toEmployeeId, assignedAt: new Date(), ...(moving ? { branchId: employee.branchId! } : {}) },
    });
  });

  if (moving) {
    await logAudit({
      ticketId,
      actor,
      action: "BRANCH_TRANSFER",
      previousValue: ticket.branchId,
      newValue: employee.branch.name,
      details: `Moved with reassignment to ${employee.name} by ${actor.name}.`,
    });
    await emitWebhook("ticket.transferred", ticketId, { fromBranchId: ticket.branchId, toBranch: employee.branch.name, transferredBy: actor.name });
  }
  await logAudit({
    ticketId,
    actor,
    action: isReassignment ? "TICKET_REASSIGNED" : "TICKET_ASSIGNED",
    previousValue: prevAssigneeName,
    newValue: employee.name,
    details: auditDetails,
  });
  await queueNotification({
    ticketId,
    ticketNumber: ticket.ticketNumber,
    event: "ASSIGNED",
    recipientKind: "ASSIGNEE",
    variables: notificationVariables({ ticket: moving ? { ...ticket, branch: employee.branch, branchId: employee.branch.id } : ticket, assignee: { name: employee.name, email: employee.email } }),
  });
  await emitWebhook("ticket.assigned", ticketId, { method: "MANUAL", assignedBy: actor.name, note });
  return { movedToBranch: moving ? employee.branch.name : null };
}

/** Branch transfer (central support). Ticket is re-queued into the new branch. */
export async function transferTicketBranch(
  ticketId: string,
  toBranchId: string,
  actor: AssignmentActor & { id: string; name: string; role: string },
): Promise<void> {
  const { ticket } = await getTicketContext(ticketId);
  if (ticket.status === "CLOSED") throw new AssignmentError("Closed tickets are read-only and cannot be transferred.");
  if (toBranchId === ticket.branchId) throw new AssignmentError("Ticket is already in that branch.");
  const branch = await db.branch.findUnique({ where: { id: toBranchId } });
  if (!branch || !branch.isActive) throw new AssignmentError("Target branch not found or inactive.");

  await runInTransaction(async (tx) => {
    await tx.ticketAssignment.updateMany({ where: { ticketId, isCurrent: true }, data: { isCurrent: false } });
    await tx.ticket.update({ where: { id: ticketId }, data: { branchId: toBranchId, assignedToId: null, assignedAt: null } });
  });

  await logAudit({
    ticketId,
    actor,
    action: "BRANCH_TRANSFER",
    previousValue: ticket.branchId,
    newValue: branch.name,
    details: "Branch transfer; ticket re-queued to the new branch round-robin queue.",
  });

  await emitWebhook("ticket.transferred", ticketId, { fromBranchId: ticket.branchId, toBranch: branch.name, transferredBy: actor.name });

  const assigned = await assignTicketRoundRobin(ticketId, actor, "ROUND_ROBIN");
  if (!assigned) await notifyAssignmentFailed(ticketId);
}

/** Called when an employee becomes available: retry the unassigned queue. */
export async function retryUnassignedTickets(branchId?: string): Promise<{ assigned: number; remaining: number }> {
  const tickets = await db.ticket.findMany({
    where: {
      status: "NEW_COMPLAINT",
      assignedToId: null,
      ...(branchId ? { branchId } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, branchId: true },
  });
  let assigned = 0;
  for (const t of tickets) {
    try {
      const employee = await assignTicketRoundRobin(t.id, null, "RETRY");
      if (employee) assigned += 1;
    } catch {
      // keep processing the rest
    }
  }
  const remaining = await db.ticket.count({
    where: { status: "NEW_COMPLAINT", assignedToId: null, ...(branchId ? { branchId } : {}) },
  });
  return { assigned, remaining };
}

/**
 * Leave handover: moves every open ticket of an employee who is away to an
 * available colleague (same branch; department routing + assignment strategy
 * apply). Tickets for which nobody is available stay with the employee and
 * are reported back so a manager can handle them.
 */
export async function handoverOpenTickets(
  employeeId: string,
  actor: AssignmentActor & { id: string; name: string; role: string },
  reason = "Employee unavailable (leave / away)",
): Promise<{ moved: { ticketNumber: string; to: string }[]; kept: string[] }> {
  const strategy = await getAssignmentStrategy();
  const from = await db.staffUser.findUnique({ where: { id: employeeId }, select: { name: true } });
  const tickets = await db.ticket.findMany({
    where: { assignedToId: employeeId, status: { in: OPEN_STATUSES } },
    orderBy: { createdAt: "asc" },
    select: { id: true, ticketNumber: true, branchId: true, departmentId: true },
  });
  const moved: { ticketNumber: string; to: string }[] = [];
  const kept: string[] = [];

  for (const t of tickets) {
    const chosen = await runInTransaction(async (tx) => {
      const pick = await pickEmployee(tx, t, { excludeIds: [employeeId], strategy });
      if (!pick) return null;
      await tx.ticketAssignment.updateMany({ where: { ticketId: t.id, isCurrent: true }, data: { isCurrent: false } });
      await tx.ticketAssignment.create({
        data: {
          ticketId: t.id,
          assignedToId: pick.id,
          assignedById: actor.id || null,
          method: "HANDOVER",
          isCurrent: true,
          note: `Handover from ${from?.name || "colleague"}: ${reason} — ${pick.routedBy}`,
        },
      });
      await tx.ticket.update({ where: { id: t.id }, data: { assignedToId: pick.id, assignedAt: new Date() } });
      return pick;
    });
    if (!chosen) {
      kept.push(t.ticketNumber);
      continue;
    }
    moved.push({ ticketNumber: t.ticketNumber, to: chosen.name });
    await logAudit({
      ticketId: t.id,
      actor,
      action: "TICKET_REASSIGNED",
      previousValue: from?.name || employeeId,
      newValue: chosen.name,
      details: `Leave handover: ${reason}`,
    });
    const { ticket } = await getTicketContext(t.id);
    await queueNotification({
      ticketId: t.id,
      ticketNumber: ticket.ticketNumber,
      event: "ASSIGNED",
      recipientKind: "ASSIGNEE",
      variables: notificationVariables({ ticket, assignee: { name: chosen.name, email: chosen.email } }),
    });
    await emitWebhook("ticket.assigned", t.id, { method: "HANDOVER", assignedBy: actor.name, from: from?.name || "", note: reason });
  }
  return { moved, kept };
}
