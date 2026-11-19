// Shared ticket list querying with role scoping + filters for all dashboards.

import { db } from "@/lib/db";
import { normalizePhone, type SessionUser } from "@/lib/types";

export interface TicketFilters {
  status?: string;
  branchId?: string;
  assignedToId?: string;
  categoryId?: string;
  priority?: string;
  unassigned?: boolean;
  overdue?: boolean;
  mine?: boolean;
  q?: string;
  from?: string;
  to?: string;
  phone?: string;
  email?: string;
  source?: string;
  updatedSince?: string;
  escalated?: boolean;
  ticketSearch?: string;
  customerSearch?: string;
  branchSearch?: string;
  categorySearch?: string;
  assigneeSearch?: string;
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
    mine: searchParams.get("mine") === "true" || undefined,
    q: searchParams.get("q") || undefined,
    from: searchParams.get("from") || undefined,
    to: searchParams.get("to") || undefined,
    phone: searchParams.get("phone") || searchParams.get("customerPhone") || undefined,
    email: searchParams.get("email") || searchParams.get("customerEmail") || undefined,
    source: searchParams.get("source") || undefined,
    updatedSince: searchParams.get("updatedSince") || undefined,
    escalated: searchParams.get("escalated") === "true" || undefined,
    ticketSearch: searchParams.get("ticketSearch") || undefined,
    customerSearch: searchParams.get("customerSearch") || undefined,
    branchSearch: searchParams.get("branchSearch") || undefined,
    categorySearch: searchParams.get("categorySearch") || undefined,
    assigneeSearch: searchParams.get("assigneeSearch") || undefined,
  };
}

/**
 * Deny-by-default role scoping:
 * - SUPPORT_AGENT  → every complaint raised in their own branch (branch-wide view).
 * - BRANCH_MANAGER → every complaint in their own branch.
 * - Central roles  → the whole tenant (all branches).
 */
export function roleScope(user: SessionUser): { branchId?: string; assignedToId?: string } {
  if (user.role === "SUPPORT_AGENT" || user.role === "BRANCH_MANAGER") {
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
  // Keyword filters. Every condition is AND-ed; each keyword may match any of
  // the fields listed for it. SQLite / D1 LIKE is case-insensitive for ASCII.
  const and: Record<string, unknown>[] = [];
  const words = (s?: string) => (s || "").trim().split(/\s+/).filter(Boolean).slice(0, 8);
  const digits = (w: string) => w.replace(/\D/g, "");

  // Global search: every word must appear somewhere in the ticket.
  for (const w of words(filters.q)) {
    const or: Record<string, unknown>[] = [
      { ticketNumber: { contains: w.toUpperCase() } },
      { customerName: { contains: w } },
      { customerEmail: { contains: w.toLowerCase() } },
      { description: { contains: w } },
      { branch: { name: { contains: w } } },
      { branch: { code: { contains: w.toUpperCase() } } },
      { branch: { city: { contains: w } } },
      { category: { name: { contains: w } } },
      { assignee: { name: { contains: w } } },
      { status: { contains: w.toUpperCase().replace(/\s+/g, "_") } },
      { priority: { contains: w.toUpperCase() } },
    ];
    if (digits(w).length >= 3) or.push({ customerPhone: { contains: digits(w) } });
    and.push({ OR: or });
  }
  // Per-column keyword filters (ticket list header row).
  for (const w of words(filters.ticketSearch)) and.push({ ticketNumber: { contains: w.toUpperCase() } });
  for (const w of words(filters.customerSearch)) {
    const or: Record<string, unknown>[] = [{ customerName: { contains: w } }, { customerEmail: { contains: w.toLowerCase() } }];
    if (digits(w).length >= 3) or.push({ customerPhone: { contains: digits(w) } });
    and.push({ OR: or });
  }
  for (const w of words(filters.branchSearch)) {
    and.push({ OR: [{ branch: { name: { contains: w } } }, { branch: { code: { contains: w.toUpperCase() } } }, { branch: { city: { contains: w } } }] });
  }
  for (const w of words(filters.categorySearch)) and.push({ category: { name: { contains: w } } });
  if (filters.assigneeSearch?.trim().toLowerCase() === "unassigned") {
    and.push({ assignedToId: null });
  } else {
    for (const w of words(filters.assigneeSearch)) {
      and.push({ OR: [{ assignee: { name: { contains: w } } }, { assignee: { email: { contains: w.toLowerCase() } } }] });
    }
  }
  if (and.length) where.AND = and;

  if (filters.phone) where.customerPhone = normalizePhone(filters.phone);
  if (filters.email) where.customerEmail = filters.email.trim().toLowerCase();
  if (filters.source) where.source = filters.source.toUpperCase();
  if (filters.escalated) where.escalatedAt = { not: null };
  if (filters.updatedSince) {
    const since = new Date(filters.updatedSince);
    if (!Number.isNaN(since.getTime())) where.updatedAt = { gte: since };
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
