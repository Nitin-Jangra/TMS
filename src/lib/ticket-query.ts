// Shared ticket list querying with role scoping + filters for all dashboards.

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/types";

export interface TicketFilters {
  status?: string;
  branchId?: string;
  assignedToId?: string;
  categoryId?: string;
  priority?: string;
  unassigned?: boolean;
  overdue?: boolean;
  q?: string;
  from?: string;
  to?: string;
}

export function parseFilters(searchParams: URLSearchParams): TicketFilters {
  return {
    status: searchParams.get("status") || undefined,
    branchId: searchParams.get("branchId") || undefined,
    assignedToId: searchParams.get("assignedToId") || undefined,
    categoryId: searchParams.get("categoryId") || undefined,
    priority: searchParams.get("priority") || undefined,
    unassigned: searchParams.get("unassigned") === "true" || undefined,
    overdue: searchParams.get("overdue") === "true" || undefined,
    q: searchParams.get("q") || undefined,
    from: searchParams.get("from") || undefined,
    to: searchParams.get("to") || undefined,
  };
}

/** Deny-by-default role scoping: support agents see only their own tickets, branch managers only their branch. */
export function roleScope(user: SessionUser): { branchId?: string; assignedToId?: string } {
  if (user.role === "SUPPORT_AGENT") {
    return { branchId: user.branchId || undefined, assignedToId: user.id };
  }
  if (user.role === "BRANCH_MANAGER") {
    return { branchId: user.branchId || undefined };
  }
  return {};
}

export function buildWhere(filters: TicketFilters, scope: { branchId?: string; assignedToId?: string }) {
  const where: Record<string, unknown> = { ...scope };
  if (filters.status) where.status = filters.status;
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.assignedToId) where.assignedToId = filters.assignedToId;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.priority) where.priority = filters.priority;
  if (filters.unassigned) {
    where.assignedToId = null;
    where.status = "NEW_COMPLAINT";
  }
  if (filters.overdue) {
    where.slaResolutionDueAt = { lt: new Date() };
    where.status = { in: ["NEW_COMPLAINT", "IN_PROGRESS", "ON_HOLD"] };
  }
  if (filters.q) {
    where.OR = [
      { ticketNumber: { contains: filters.q.toUpperCase() } },
      { customerName: { contains: filters.q } },
      { customerPhone: { contains: filters.q.replace(/\D/g, "") } },
    ];
  }
  if (filters.from || filters.to) {
    const createdAt: Record<string, Date> = {};
    if (filters.from) createdAt.gte = new Date(filters.from);
    if (filters.to) createdAt.lte = new Date(`${filters.to}T23:59:59.999Z`);
    where.createdAt = createdAt;
  }
  return where;
}

export const TICKET_INCLUDE = {
  branch: { select: { id: true, code: true, name: true } },
  category: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, email: true, designation: true } },
} as const;

export async function listTickets(
  filters: TicketFilters,
  scope: { branchId?: string; assignedToId?: string },
  page: { skip: number; take: number },
) {
  const where = buildWhere(filters, scope);
  const [rows, total] = await Promise.all([
    db.ticket.findMany({ where, include: TICKET_INCLUDE, orderBy: { createdAt: "desc" }, skip: page.skip, take: page.take }),
    db.ticket.count({ where }),
  ]);
  return { rows, total };
}
