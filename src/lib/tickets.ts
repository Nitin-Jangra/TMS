// Ticket lifecycle engine: creation (unique ticket numbers, idempotency),
// status transitions, resolution + closure scheduling, customer tracking,
// reopening, and ticket messages. Closed tickets are read-only at this layer
// AND re-verified in every mutating API call — defence in depth.

import { db, runInTransaction } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { queueNotification } from "@/lib/notifications";
import { getReopenWindowHours, getSettings, isAutoClosureEnabled } from "@/lib/settings";
import { initSlaTracking, markFirstResponse, markResolution } from "@/lib/sla";
import { assignTicketRoundRobin, notifyAssignmentFailed } from "@/lib/assignment";
import { canTransition, normalizePhone, type SessionUser, type TicketStatus } from "@/lib/types";
import type { RolePermissions } from "@/lib/permissions";
import { emitWebhook } from "@/lib/webhooks";
import { feedbackUrl } from "@/lib/feedback";
import { invalidateStatsCache } from "@/lib/branch-stats";

export class TicketError extends Error {
  code: string;
  constructor(message: string, code = "TICKET_ERROR") {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Ticket number generation — transaction-safe sequence (FC-2026-000001)
// ---------------------------------------------------------------------------

async function nextTicketNumber(tx: { $transaction: unknown } | any): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = "FC";
  const seq = await tx.ticketSequence.upsert({
    where: { prefix_year: { prefix, year } },
    create: { prefix, year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `${prefix}-${year}-${String(seq.lastNumber).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Ticket context for notifications
// ---------------------------------------------------------------------------

async function getTicketContext(ticketId: string) {
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: {
      branch: true,
      category: true,
      assignee: { select: { id: true, name: true, email: true } },
    },
  });
  if (!ticket) throw new TicketError("Ticket not found.");
  const manager = await db.staffUser.findFirst({
    where: { branchId: ticket.branchId, role: "BRANCH_MANAGER", isActive: true },
    select: { id: true, name: true, email: true },
  });
  return { ticket, manager };
}

function vars(ctx: Awaited<ReturnType<typeof getTicketContext>>, extra: Record<string, string> = {}) {
  const { ticket, manager } = ctx;
  return {
    ticketNumber: ticket.ticketNumber,
    customerName: ticket.customerName,
    customerPhone: ticket.customerPhone,
    customerEmail: ticket.customerEmail,
    description: ticket.description.slice(0, 500),
    priority: ticket.priority,
    status: ticket.status,
    source: ticket.source,
    branchName: ticket.branch.name,
    branchEmail: ticket.branch.notificationEmail,
    categoryName: ticket.category.name,
    assigneeName: ticket.assignee?.name || "",
    assigneeEmail: ticket.assignee?.email || "",
    branchManagerEmail: manager?.email || "",
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Complaint creation
// ---------------------------------------------------------------------------

export interface CreateComplaintInput {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  branchId: string;
  categoryId: string;
  description: string;
  priority?: string;
  source?: string;
  idempotencyKey?: string;
}

export async function createComplaint(
  input: CreateComplaintInput,
  meta: { ip?: string; correlationId?: string; actor?: SessionUser | null; actorName?: string },
): Promise<{ ticket: { id: string; ticketNumber: string; status: string; assignedToId: string | null }; duplicate: boolean }> {
  // Idempotency: repeated submissions with the same key return the original ticket.
  if (input.idempotencyKey) {
    const existing = await db.idempotencyKey.findUnique({ where: { key: input.idempotencyKey } });
    if (existing) {
      const ticket = await db.ticket.findUnique({ where: { id: existing.ticketId } });
      if (ticket) {
        return {
          ticket: { id: ticket.id, ticketNumber: ticket.ticketNumber, status: ticket.status, assignedToId: ticket.assignedToId },
          duplicate: true,
        };
      }
    }
  }

  const branch = await db.branch.findUnique({ where: { id: input.branchId } });
  if (!branch || !branch.isActive) throw new TicketError("The selected branch is not available.", "BRANCH_INACTIVE");
  const categoryRow = await db.complaintCategory.findUnique({ where: { id: input.categoryId } });
  if (!categoryRow || !categoryRow.isActive) throw new TicketError("The selected complaint category is not available.", "CATEGORY_INACTIVE");

  const phone = normalizePhone(input.customerPhone);

  const ticket = await runInTransaction(async (tx) => {
    const ticketNumber = await nextTicketNumber(tx);
    const now = new Date();
    const created = await tx.ticket.create({
      data: {
        ticketNumber,
        customerName: input.customerName.trim(),
        customerPhone: phone,
        customerEmail: input.customerEmail.trim().toLowerCase(),
        branchId: input.branchId,
        categoryId: input.categoryId,
        departmentId: categoryRow.departmentId ?? null,
        description: input.description.trim(),
        status: "NEW_COMPLAINT",
        priority: input.priority || "MEDIUM",
        source: input.source || "PORTAL",
      },
    });
    await tx.ticketStatusHistory.create({
      data: { ticketId: created.id, fromStatus: null, toStatus: "NEW_COMPLAINT", changedByName: "System", note: "Complaint registered" },
    });
    await initSlaTracking(tx, created.id, created.priority, now);
    return created;
  });

  if (input.idempotencyKey) {
    await db.idempotencyKey.create({ data: { key: input.idempotencyKey, ticketId: ticket.id } }).catch(() => undefined);
  }

  await logAudit({
    ticketId: ticket.id,
    actor: meta.actor ?? null,
    actorName: meta.actorName || (meta.actor ? undefined : input.customerName),
    actorRole: meta.actor ? meta.actor.role : "CUSTOMER",
    action: "TICKET_CREATED",
    newValue: ticket.ticketNumber,
    details: `Complaint registered at ${branch.name}`,
    correlationId: meta.correlationId,
    ip: meta.ip,
  });

  // Complaint is saved; notifications start now. Email failure never rolls back the ticket.
  const ctx = await getTicketContext(ticket.id);
  const v = vars(ctx);
  await queueNotification({ ticketId: ticket.id, ticketNumber: ticket.ticketNumber, event: "COMPLAINT_REGISTERED", recipientKind: "CUSTOMER", variables: v });
  await queueNotification({ ticketId: ticket.id, ticketNumber: ticket.ticketNumber, event: "COMPLAINT_REGISTERED", recipientKind: "CENTRAL_SUPPORT", variables: v });
  await queueNotification({ ticketId: ticket.id, ticketNumber: ticket.ticketNumber, event: "COMPLAINT_REGISTERED", recipientKind: "BRANCH", variables: v });

  await emitWebhook("ticket.created", ticket.id);

  // Round-robin assignment
  const assigned = await assignTicketRoundRobin(ticket.id, null, "ROUND_ROBIN");
  if (!assigned) await notifyAssignmentFailed(ticket.id);

  invalidateStatsCache();
  const fresh = await db.ticket.findUnique({ where: { id: ticket.id }, select: { id: true, ticketNumber: true, status: true, assignedToId: true } });
  return { ticket: fresh!, duplicate: false };
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

export interface StatusChangeInput {
  toStatus: TicketStatus;
  note?: string;
  reason?: string;
  resolution?: string;
}

export async function applyStatusChange(
  ticketId: string,
  input: StatusChangeInput,
  actor: SessionUser,
  meta: { ip?: string; correlationId?: string } = {},
): Promise<{ ticketNumber: string; status: string }> {
  const ctx = await getTicketContext(ticketId);
  const { ticket } = ctx;

  // Permanent closed-ticket restriction — no role can bypass this (including Root Admin).
  if (ticket.status === "CLOSED") {
    throw new TicketError("This ticket is closed and can no longer be modified. Closed tickets are read-only.", "TICKET_CLOSED");
  }
  if (!canTransition(ticket.status, input.toStatus)) {
    throw new TicketError(`Transition ${ticket.status} → ${input.toStatus} is not allowed.`, "INVALID_TRANSITION");
  }

  if (input.toStatus === "RESOLVED" && !(input.resolution || input.note || "").trim()) {
    throw new TicketError("A resolution message is mandatory when resolving a ticket.", "RESOLUTION_REQUIRED");
  }
  if (input.toStatus === "ON_HOLD" && !(input.reason || input.note || "").trim()) {
    throw new TicketError("A reason is mandatory when placing a ticket on hold.", "HOLD_REASON_REQUIRED");
  }

  const now = new Date();
  let autoCloseAt: Date | null = null;

  if (input.toStatus === "RESOLVED") {
    const reopenHours = await getReopenWindowHours();
    const enabled = await isAutoClosureEnabled();
    if (enabled) autoCloseAt = new Date(now.getTime() + reopenHours * 3600 * 1000);
  }

  await runInTransaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status: input.toStatus,
        resolvedAt: input.toStatus === "RESOLVED" ? now : null,
        autoCloseAt: input.toStatus === "RESOLVED" ? autoCloseAt : null,
      },
    });
    await tx.ticketStatusHistory.create({
      data: {
        ticketId,
        fromStatus: ticket.status,
        toStatus: input.toStatus,
        changedById: actor.id || null,
        changedByName: actor.name,
        note: input.note || input.reason || input.resolution || "",
      },
    });
    if (input.toStatus === "RESOLVED" && autoCloseAt) {
      await tx.ticketClosureJob.create({ data: { ticketId, runAt: autoCloseAt, status: "SCHEDULED" } });
    }
  });

  await logAudit({
    ticketId,
    actor,
    action: input.toStatus === "RESOLVED" ? "RESOLUTION" : "STATUS_CHANGED",
    previousValue: ticket.status,
    newValue: input.toStatus,
    details: input.note || input.reason || input.resolution || "",
    correlationId: meta.correlationId,
    ip: meta.ip,
  });

  const v = vars(ctx, {
    reason: input.reason || input.note || "",
    resolution: input.resolution || "",
    reopenWindowHours: String(await getReopenWindowHours()),
    feedbackUrl: input.toStatus === "RESOLVED" ? await feedbackUrl(ticket.ticketNumber) : "",
  });

  if (input.toStatus === "IN_PROGRESS" && ticket.status === "NEW_COMPLAINT") {
    await markFirstResponse(ticketId);
  }
  if (input.toStatus === "RESOLVED") {
    await markResolution(ticketId, now);
    await queueNotification({ ticketId, ticketNumber: ticket.ticketNumber, event: "RESOLVED", recipientKind: "CUSTOMER", variables: v });
    await queueNotification({ ticketId, ticketNumber: ticket.ticketNumber, event: "CLOSURE_SCHEDULED", recipientKind: "ASSIGNEE", variables: v });
    await queueNotification({ ticketId, ticketNumber: ticket.ticketNumber, event: "RESOLVED", recipientKind: "BRANCH", variables: v });
    await queueNotification({ ticketId, ticketNumber: ticket.ticketNumber, event: "RESOLVED", recipientKind: "CENTRAL_SUPPORT", variables: v });
  } else if (input.toStatus === "ON_HOLD") {
    await queueNotification({ ticketId, ticketNumber: ticket.ticketNumber, event: "ON_HOLD", recipientKind: "CUSTOMER", variables: v });
  } else {
    await queueNotification({ ticketId, ticketNumber: ticket.ticketNumber, event: "STATUS_UPDATED", recipientKind: "CUSTOMER", variables: v });
  }

  await emitWebhook(input.toStatus === "RESOLVED" ? "ticket.resolved" : "ticket.status_changed", ticketId, {
    fromStatus: ticket.status,
    toStatus: input.toStatus,
    note: input.note || input.reason || input.resolution || "",
    changedBy: actor.name,
  });

  invalidateStatsCache();
  return { ticketNumber: ticket.ticketNumber, status: input.toStatus };
}

// ---------------------------------------------------------------------------
// Messages (internal notes + customer-facing replies)
// ---------------------------------------------------------------------------

export async function addTicketMessage(
  ticketId: string,
  input: { body: string; visibility: "INTERNAL" | "PUBLIC"; author: SessionUser },
  meta: { ip?: string } = {},
): Promise<void> {
  const ctx = await getTicketContext(ticketId);
  const { ticket } = ctx;
  if (ticket.status === "CLOSED") {
    throw new TicketError("This ticket is closed and read-only. No further updates can be added.", "TICKET_CLOSED");
  }

  await db.ticketMessage.create({
    data: {
      ticketId,
      authorType: "SUPPORT",
      visibility: input.visibility,
      authorId: input.author.id || null,
      authorName: input.author.name,
      body: input.body.trim(),
    },
  });

  await logAudit({
    ticketId,
    actor: input.author,
    action: input.visibility === "INTERNAL" ? "INTERNAL_NOTE" : "CUSTOMER_REPLY",
    details: input.body.slice(0, 200),
    ip: meta.ip,
  });

  // Public replies notify the customer; internal notes never trigger emails.
  if (input.visibility === "PUBLIC") {
    if (ticket.status === "NEW_COMPLAINT") await markFirstResponse(ticketId);
    await queueNotification({
      ticketId,
      ticketNumber: ticket.ticketNumber,
      event: "STATUS_UPDATED",
      recipientKind: "CUSTOMER",
      variables: vars(ctx, { description: input.body.slice(0, 500) }),
    });
  }

  await emitWebhook("ticket.message_added", ticketId, {
    visibility: input.visibility,
    body: input.body.trim(),
    author: input.author.name,
  });
}

// ---------------------------------------------------------------------------
// Customer tracking (Ticket ID + registered mobile)
// ---------------------------------------------------------------------------

export interface TrackedTicket {
  ticketNumber: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  branchName: string;
  categoryName: string;
  description: string;
  priorityLabel: string;
  assigneeFirstName: string | null;
  timeline: { from: string | null; to: string; label: string; at: string; note: string }[];
  latestPublicUpdate: { body: string; author: string; at: string } | null;
  resolution: { message: string; resolvedAt: string } | null;
  closure: { closedAt: string } | null;
  reopenWindow: { open: boolean; deadline: string | null } | null;
  feedback: { rating: number; comment: string } | null;
  canRate: boolean;
}

const GENERIC_TRACK_ERROR = "We could not find a ticket matching that Ticket ID and mobile number. Please check both values and try again.";

export async function trackTicket(ticketNumberInput: string, phoneInput: string): Promise<TrackedTicket> {
  const ticketNumber = ticketNumberInput.trim().toUpperCase();
  if (!/^(MSP|FC)-\d{4}-\d{6}$/.test(ticketNumber)) throw new TicketError(GENERIC_TRACK_ERROR, "TRACK_NOT_FOUND");
  const phone = normalizePhone(phoneInput);

  const ticket = await db.ticket.findUnique({
    where: { ticketNumber },
    include: {
      branch: { select: { name: true } },
      category: { select: { name: true } },
      assignee: { select: { name: true } },
      statusHistory: { orderBy: { createdAt: "asc" } },
      messages: { where: { visibility: "PUBLIC" }, orderBy: { createdAt: "desc" }, take: 1 },
      feedback: { select: { rating: true, comment: true } },
    },
  });

  // Generic error for invalid ticket/mobile combinations — no existence leaks.
  if (!ticket || !ticket.customerPhone || ticket.customerPhone !== phone) {
    throw new TicketError(GENERIC_TRACK_ERROR, "TRACK_NOT_FOUND");
  }

  const { STATUS_LABELS } = await import("@/lib/types");
  const timeline = ticket.statusHistory.map((h) => ({
    from: h.fromStatus,
    to: h.toStatus,
    label: STATUS_LABELS[h.toStatus] || h.toStatus,
    at: h.createdAt.toISOString(),
    note: h.note,
  }));

  const latestPublic = ticket.messages[0]
    ? { body: ticket.messages[0].body, author: ticket.messages[0].authorName, at: ticket.messages[0].createdAt.toISOString() }
    : null;

  const reopenOpen = ticket.status === "RESOLVED" && !!ticket.autoCloseAt && ticket.autoCloseAt.getTime() > Date.now();

  return {
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    statusLabel: STATUS_LABELS[ticket.status] || ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    branchName: ticket.branch.name,
    categoryName: ticket.category.name,
    description: ticket.description,
    priorityLabel: ticket.priority,
    assigneeFirstName: ticket.assignee ? ticket.assignee.name.split(" ")[0] : null,
    timeline,
    latestPublicUpdate: latestPublic,
    resolution:
      ticket.status === "RESOLVED" || ticket.status === "CLOSED"
        ? {
            message: ticket.statusHistory.find((h) => h.toStatus === "RESOLVED")?.note || "Your ticket has been resolved.",
            resolvedAt: (ticket.resolvedAt || ticket.updatedAt).toISOString(),
          }
        : null,
    closure: ticket.status === "CLOSED" ? { closedAt: (ticket.closedAt || ticket.updatedAt).toISOString() } : null,
    reopenWindow: reopenOpen ? { open: true, deadline: ticket.autoCloseAt!.toISOString() } : { open: false, deadline: ticket.autoCloseAt?.toISOString() || null },
    feedback: ticket.feedback ? { rating: ticket.feedback.rating, comment: ticket.feedback.comment } : null,
    canRate: (ticket.status === "RESOLVED" || ticket.status === "CLOSED") && !ticket.feedback,
  };
}

// ---------------------------------------------------------------------------
// Customer reopening
// ---------------------------------------------------------------------------

export async function reopenTicket(
  ticketNumberInput: string,
  phoneInput: string,
  reason: string,
  meta: { ip?: string } = {},
): Promise<{ ticketNumber: string; status: string }> {
  const ticketNumber = ticketNumberInput.trim().toUpperCase();
  if (!/^(MSP|FC)-\d{4}-\d{6}$/.test(ticketNumber)) throw new TicketError(GENERIC_TRACK_ERROR, "TRACK_NOT_FOUND");
  const phone = normalizePhone(phoneInput);

  const ticket = await db.ticket.findUnique({ where: { ticketNumber }, include: { assignee: true, branch: true } });
  if (!ticket || ticket.customerPhone !== phone) throw new TicketError(GENERIC_TRACK_ERROR, "TRACK_NOT_FOUND");

  if (ticket.status === "CLOSED") {
    throw new TicketError(
      "Your ticket has already been closed and can no longer be reopened. Please submit a new complaint if you need further assistance.",
      "TICKET_CLOSED",
    );
  }
  if (ticket.status !== "RESOLVED") {
    throw new TicketError("Only resolved tickets can be reopened.", "INVALID_REOPEN_STATE");
  }
  if (!ticket.autoCloseAt || ticket.autoCloseAt.getTime() <= Date.now()) {
    throw new TicketError("The reopening window for this ticket has expired. Please submit a new complaint if you need further assistance.", "REOPEN_WINDOW_EXPIRED");
  }
  if (!reason.trim()) throw new TicketError("A reopening reason is required.", "REOPEN_REASON_REQUIRED");

  const now = new Date();

  await runInTransaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: "IN_PROGRESS",
        autoCloseAt: null,
        reopenCount: { increment: 1 },
        lastReopenedAt: now,
      },
    });
    await tx.ticketStatusHistory.create({
      data: { ticketId: ticket.id, fromStatus: "RESOLVED", toStatus: "IN_PROGRESS", changedByName: "Customer", note: `Reopened by customer: ${reason.trim()}` },
    });
    await tx.ticketReopenHistory.create({
      data: { ticketId: ticket.id, reason: reason.trim(), previousStatus: "RESOLVED", reopenedAt: now, assignedTo: ticket.assignedToId },
    });
    await tx.ticketClosureJob.updateMany({
      where: { ticketId: ticket.id, status: "SCHEDULED" },
      data: { status: "CANCELLED" },
    });
  });

  await logAudit({ ticketId: ticket.id, actorName: "Customer", actorRole: "CUSTOMER", action: "REOPENED", previousValue: "RESOLVED", newValue: "IN_PROGRESS", details: reason.trim(), ip: meta.ip });

  // Retain original assignee if still eligible; otherwise re-enter the branch queue.
  const eligible = ticket.assignee
    ? await db.staffUser.findFirst({
        where: {
          id: ticket.assignee.id,
          branchId: ticket.branchId,
          role: "SUPPORT_AGENT",
          isActive: true,
          availabilityEnabled: true,
        },
      })
    : null;

  if (eligible) {
    await db.ticketAssignment.updateMany({ where: { ticketId: ticket.id, isCurrent: true }, data: { isCurrent: false } });
    await db.ticketAssignment.create({
      data: { ticketId: ticket.id, assignedToId: ticket.assignee!.id, method: "REOPEN", isCurrent: true, note: "Reopen — original assignee retained" },
    });
    await db.ticket.update({ where: { id: ticket.id }, data: { assignedToId: ticket.assignee!.id, assignedAt: now } });
  } else {
    const assigned = await assignTicketRoundRobin(ticket.id, null, "REOPEN");
    if (!assigned) await notifyAssignmentFailed(ticket.id);
  }

  const ctx = await getTicketContext(ticket.id);
  const v = vars(ctx, { reason: reason.trim() });
  await queueNotification({ ticketId: ticket.id, ticketNumber: ticket.ticketNumber, event: "REOPENED", recipientKind: "CUSTOMER", variables: v });
  await queueNotification({ ticketId: ticket.id, ticketNumber: ticket.ticketNumber, event: "REOPENED", recipientKind: "ASSIGNEE", variables: v });
  await queueNotification({ ticketId: ticket.id, ticketNumber: ticket.ticketNumber, event: "REOPENED", recipientKind: "BRANCH", variables: v });
  await queueNotification({ ticketId: ticket.id, ticketNumber: ticket.ticketNumber, event: "REOPENED", recipientKind: "CENTRAL_SUPPORT", variables: v });

  await emitWebhook("ticket.reopened", ticket.id, { reason: reason.trim() });
  invalidateStatsCache();

  return { ticketNumber: ticket.ticketNumber, status: "IN_PROGRESS" };
}

// ---------------------------------------------------------------------------
// Escalation (staff dashboard + integration API)
// ---------------------------------------------------------------------------

export async function escalateTicket(ticketId: string, reasonInput: string, actor: SessionUser): Promise<void> {
  const ctx = await getTicketContext(ticketId);
  const { ticket } = ctx;
  if (ticket.status === "CLOSED") throw new TicketError("Closed tickets are read-only.", "TICKET_CLOSED");
  if (ticket.escalatedAt) throw new TicketError("This ticket is already escalated.", "ALREADY_ESCALATED");
  const reason = reasonInput.trim() || "Manual escalation";

  await db.ticket.update({ where: { id: ticketId }, data: { escalatedAt: new Date() } });
  await logAudit({ ticketId, actor, action: "ESCALATED", details: reason });

  const v = vars(ctx, { reason });
  await queueNotification({ ticketId, ticketNumber: ticket.ticketNumber, event: "ESCALATED", recipientKind: "CENTRAL_SUPPORT", variables: v });
  await queueNotification({ ticketId, ticketNumber: ticket.ticketNumber, event: "ESCALATED", recipientKind: "BRANCH", variables: v });
  await emitWebhook("ticket.escalated", ticketId, { reason, escalatedBy: actor.name });
  invalidateStatsCache();
}

// ---------------------------------------------------------------------------
// Access control helper for staff ticket access (resource-level RBAC)
// ---------------------------------------------------------------------------

/**
 * Workspace-wide access policy (Root Admin → Settings → General).
 * - crossBranch:     branch staff may find, view and work on tickets of any
 *                    branch (cover for a colleague on leave, global search).
 * - agentsReassign:  support agents may reassign / transfer tickets (fix a
 *                    ticket that landed with the wrong person or branch).
 */
export interface AccessPolicy {
  crossBranch: boolean;
  agentsReassign: boolean;
}

/** Most restrictive policy — used when a caller does not pass one. */
export const STRICT_POLICY: AccessPolicy = { crossBranch: false, agentsReassign: false };

export async function getAccessPolicy(): Promise<AccessPolicy> {
  const settings = await getSettings();
  return {
    crossBranch: settings.staff_cross_branch_access !== "false",
    agentsReassign: settings.agents_can_reassign !== "false",
  };
}

export function canAccessTicket(
  user: SessionUser,
  ticket: { branchId: string; assignedToId: string | null },
  policy: AccessPolicy = STRICT_POLICY,
  permissions?: RolePermissions,
): boolean {
  if (user.role === "ROOT_ADMIN" || user.role === "CENTRAL_ADMIN" || user.role === "CENTRAL_AGENT") {
    return true;
  }

  if (permissions) {
    if (ticket.assignedToId && ticket.assignedToId === user.id) return true;
    if (permissions.searchGlobally) return true;
    if (permissions.viewAllBranchTickets) {
      return policy.crossBranch || (!!user.branchId && user.branchId === ticket.branchId);
    }
    return false;
  }

  switch (user.role) {
    case "BRANCH_MANAGER":
    case "SUPPORT_AGENT":
      return policy.crossBranch || (!!user.branchId && user.branchId === ticket.branchId);
    default:
      return false;
  }
}

/** May this user assign / reassign / transfer the given ticket? */
export function canReassignTicket(
  user: SessionUser,
  ticket: { branchId: string; assignedToId: string | null },
  policy: AccessPolicy = STRICT_POLICY,
  permissions?: RolePermissions,
): boolean {
  if (!canAccessTicket(user, ticket, policy, permissions)) return false;
  if (user.role === "ROOT_ADMIN" || user.role === "CENTRAL_ADMIN" || user.role === "CENTRAL_AGENT") {
    return true;
  }

  if (permissions !== undefined) {
    return permissions.reassignTickets;
  }

  switch (user.role) {
    case "BRANCH_MANAGER":
      return true;
    case "SUPPORT_AGENT":
      return policy.agentsReassign;
    default:
      return false;
  }
}
