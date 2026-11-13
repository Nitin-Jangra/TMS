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

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { queueNotification } from "@/lib/notifications";

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

/**
 * Core round-robin step for one ticket. Returns the assigned employee, or
 * null when the branch has no eligible employee (ticket stays unassigned).
 */
export async function assignTicketRoundRobin(
  ticketId: string,
  actor: AssignmentActor | null,
  method: "ROUND_ROBIN" | "RETRY" | "REOPEN" = "ROUND_ROBIN",
): Promise<{ id: string; name: string } | null> {
  const result = await db.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new AssignmentError("Ticket not found.");
    if (ticket.status === "CLOSED") throw new AssignmentError("Closed tickets cannot be assigned or reassigned.");
    if (ticket.assignedToId) return { alreadyAssigned: true as const, employee: null };

    const employees = await tx.staffUser.findMany({
      where: {
        branchId: ticket.branchId,
        role: "SUPPORT_AGENT",
        isActive: true,
        availabilityEnabled: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    });

    if (employees.length === 0) return { alreadyAssigned: false as const, employee: null };

    // Persistent branch cursor: pick the next employee after the last one used.
    const cursor = await tx.branchCursor.findUnique({ where: { branchId: ticket.branchId } });
    let index = 0;
    if (cursor?.lastEmployeeId) {
      const lastIdx = employees.findIndex((e) => e.id === cursor.lastEmployeeId);
      index = (lastIdx + 1) % employees.length; // lastIdx = -1 → 0 (start of queue)
    }
    const chosen = employees[index];

    await tx.branchCursor.upsert({
      where: { branchId: ticket.branchId },
      create: { branchId: ticket.branchId, lastEmployeeId: chosen.id, lastAssignedAt: new Date() },
      update: { lastEmployeeId: chosen.id, lastAssignedAt: new Date() },
    });

    await tx.ticketAssignment.updateMany({ where: { ticketId, isCurrent: true }, data: { isCurrent: false } });
    await tx.ticketAssignment.create({
      data: {
        ticketId,
        assignedToId: chosen.id,
        assignedById: actor?.id ?? null,
        method,
        isCurrent: true,
        note: method === "ROUND_ROBIN" ? "Branch round-robin queue" : method === "RETRY" ? "Unassigned queue retry" : "Reopen re-assignment",
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
    variables: notificationVariables({ ticket: { ...ticket, assignee: { name: result.employee.name, email: "" } } }),
  });
  return result.employee;
}

/** Notify branch manager + central support when auto-assignment fails. */
export async function notifyAssignmentFailed(ticketId: string): Promise<void> {
  const { ticket, manager } = await getTicketContext(ticketId);
  const variables = {
    ...notificationVariables({ ...ticket, assignee: null }),
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
): Promise<void> {
  const { ticket } = await getTicketContext(ticketId);
  if (ticket.status === "CLOSED") throw new AssignmentError("Closed tickets are read-only and cannot be reassigned.");
  const employee = await db.staffUser.findUnique({ where: { id: toEmployeeId }, include: { branch: true } });
  if (!employee || !employee.isActive) throw new AssignmentError("Target employee not found or inactive.");
  if (employee.branchId !== ticket.branchId) {
    throw new AssignmentError("Employee belongs to a different branch. Use branch transfer instead.");
  }

  await db.$transaction(async (tx) => {
    await tx.ticketAssignment.updateMany({ where: { ticketId, isCurrent: true }, data: { isCurrent: false } });
    await tx.ticketAssignment.create({
      data: { ticketId, assignedToId: toEmployeeId, assignedById: actor.id, method: "MANUAL", isCurrent: true, note },
    });
    await tx.ticket.update({ where: { id: ticketId }, data: { assignedToId: toEmployeeId, assignedAt: new Date() } });
  });

  await logAudit({
    ticketId,
    actor,
    action: ticket.assignedToId ? "TICKET_REASSIGNED" : "TICKET_ASSIGNED",
    previousValue: ticket.assignedToId || "",
    newValue: employee.name,
    details: note || "Manual assignment",
  });
  await queueNotification({
    ticketId,
    ticketNumber: ticket.ticketNumber,
    event: "ASSIGNED",
    recipientKind: "ASSIGNEE",
    variables: notificationVariables({ ...ticket, assignee: { name: employee.name, email: employee.email } }),
  });
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

  await db.$transaction(async (tx) => {
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
