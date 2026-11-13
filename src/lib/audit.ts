// Audit + activity logging. Records every important action with actor,
// previous/new values and correlation id. Audit rows are never editable
// or deletable through any application API.

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/types";

export type AuditAction =
  | "TICKET_CREATED"
  | "TICKET_ASSIGNED"
  | "TICKET_REASSIGNED"
  | "BRANCH_TRANSFER"
  | "STATUS_CHANGED"
  | "INTERNAL_NOTE"
  | "CUSTOMER_REPLY"
  | "RESOLUTION"
  | "REOPENED"
  | "AUTO_CLOSED"
  | "ESCALATED"
  | "CONFIG_CHANGED"
  | "AVAILABILITY_CHANGED"
  | "AUTH_FAILURE"
  | "AUTH_SUCCESS"
  | "ACCESS_DENIED"
  | "API_KEY_CREATED";

export interface AuditContext {
  ticketId?: string | null;
  actor?: SessionUser | null;
  actorName?: string; // for customers / system / api clients
  actorRole?: string;
  action: AuditAction;
  previousValue?: string;
  newValue?: string;
  details?: string;
  correlationId?: string;
  ip?: string;
}

export async function logAudit(ctx: AuditContext): Promise<void> {
  await db.auditLog.create({
    data: {
      ticketId: ctx.ticketId ?? null,
      actorId: ctx.actor?.id ?? null,
      actorRole: ctx.actor?.role ?? ctx.actorRole ?? "SYSTEM",
      actorName: ctx.actor?.name ?? ctx.actorName ?? "System",
      action: ctx.action,
      previousValue: ctx.previousValue ?? "",
      newValue: ctx.newValue ?? "",
      details: ctx.details ?? "",
      correlationId: ctx.correlationId ?? "",
      ip: ctx.ip ?? "",
    },
  });
}
