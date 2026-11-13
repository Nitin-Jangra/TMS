// SLA engine: policies per priority, tracking rows maintained on create /
// first response / resolve. Overdue computation feeds dashboards.

import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import type { PrismaClient } from "@prisma/client";
import type { Priority } from "@/lib/types";

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export const DEFAULT_SLA_POLICIES: { priority: Priority; responseTargetMinutes: number; resolutionTargetMinutes: number }[] = [
  { priority: "CRITICAL", responseTargetMinutes: 15, resolutionTargetMinutes: 4 * 60 },
  { priority: "HIGH", responseTargetMinutes: 60, resolutionTargetMinutes: 24 * 60 },
  { priority: "MEDIUM", responseTargetMinutes: 4 * 60, resolutionTargetMinutes: 48 * 60 },
  { priority: "LOW", responseTargetMinutes: 8 * 60, resolutionTargetMinutes: 72 * 60 },
];

export async function getSlaPolicy(priority: string) {
  const policy = await db.slaPolicy.findUnique({ where: { priority } });
  if (policy && policy.isActive) return policy;
  return DEFAULT_SLA_POLICIES.find((p) => p.priority === priority) || DEFAULT_SLA_POLICIES[2];
}

/** Called inside ticket creation: compute SLA targets and store tracking row. */
export async function initSlaTracking(client: DbClient, ticketId: string, priority: string, createdAt: Date): Promise<void> {
  const policy = await getSlaPolicy(priority);
  await client.slaTracking.create({
    data: {
      ticketId,
      priority,
      responseTargetMinutes: policy.responseTargetMinutes,
      resolutionTargetMinutes: policy.resolutionTargetMinutes,
    },
  });
  await client.ticket.update({
    where: { id: ticketId },
    data: {
      slaResponseDueAt: new Date(createdAt.getTime() + policy.responseTargetMinutes * 60000),
      slaResolutionDueAt: new Date(createdAt.getTime() + policy.resolutionTargetMinutes * 60000),
    },
  });
}

/** Called when staff first acts on a ticket (first public reply / status start). */
export async function markFirstResponse(ticketId: string): Promise<void> {
  const tracking = await db.slaTracking.findUnique({ where: { ticketId } });
  if (!tracking || tracking.firstResponseMetAt) return;
  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { createdAt: true } });
  if (!ticket) return;
  const metAt = new Date();
  await db.slaTracking.update({
    where: { ticketId },
    data: {
      firstResponseMetAt: metAt,
      firstResponseBreached: metAt.getTime() > ticket.createdAt.getTime() + tracking.responseTargetMinutes * 60000,
    },
  });
  await db.ticket.update({ where: { id: ticketId }, data: { firstResponseAt: metAt } });
}

/** Called on resolution. */
export async function markResolution(ticketId: string, resolvedAt: Date): Promise<void> {
  const tracking = await db.slaTracking.findUnique({ where: { ticketId } });
  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { createdAt: true, slaResolutionDueAt: true } });
  if (!tracking || !ticket) return;
  await db.slaTracking.update({
    where: { ticketId },
    data: {
      resolutionBreached: ticket.slaResolutionDueAt ? resolvedAt.getTime() > ticket.slaResolutionDueAt.getTime() : false,
    },
  });
}

export function isTicketOverdue(ticket: { status: string; slaResolutionDueAt: Date | null }): boolean {
  if (!ticket.slaResolutionDueAt) return false;
  if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") return false;
  return Date.now() > ticket.slaResolutionDueAt.getTime();
}
