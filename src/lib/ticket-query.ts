// Shared ticket list querying with role scoping, filters and sorting for all
// dashboards and the integration API.
//
// Every filter is AND-ed, so combinations behave predictably (e.g. status +
// unassigned + a keyword). Keyword matching uses SQLite / D1 LIKE, which is
// case-insensitive for ASCII.

import { db } from "@/lib/db";
import type { AccessPolicy } from "@/lib/tickets";
import { normalizePhone, type SessionUser } from "@/lib/types";

export const SORT_FIELDS = ["ticketNumber", "customer", "branch", "category", "assignee", "status", "priority", "createdAt"] as const;
export type SortField = (typeof SORT_FIELDS)[number];

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
  /** Column to sort by; omitted = default order (newest first). */
  sort?: SortField;
  order?: "asc" | "desc";
}

export function parseFilters(searchParams: URLSearchParams): TicketFilters {
  const sort = searchParams.get("sort") || "";
  const order = (searchParams.get("order") || "").toLowerCase();
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
    sort: (SORT_FIELDS as readonly string[]).includes(sort) ? (sort as SortField) : undefined,
    order: order === "asc" ? "asc" : order === "desc" ? "desc" : undefined,
  };
}

/**
 * Deny-by-default role scoping:
 * - SUPPORT_AGENT / BRANCH_MANAGER → their own branch, or every branch when
 *   they ask for it (`allBranches`) and cross-branch access is enabled.
 * - Central roles → the whole tenant (all branches).
 */
export function roleScope(
  user: SessionUser,
  opts: { policy?: AccessPolicy; allBranches?: boolean } = {},
): { branchId?: string; assignedToId?: string } {
  if (user.role === "SUPPORT_AGENT" || user.role === "BRANCH_MANAGER") {
    if (opts.allBranches && opts.policy?.crossBranch) return {};
    return { branchId: user.branchId || "__no_branch__" };
  }
  return {};
}

/** YYYY-MM-DD → Date at the start / end of that day in India time (IST). */
function istDay(day: string, end: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const d = new Date(day);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(`${day}T${end ? "23:59:59.999" : "00:00:00.000"}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const OPEN_STATUSES = ["NEW_COMPLAINT", "IN_PROGRESS", "ON_HOLD"];

export function buildWhere(filters: TicketFilters, scope: { branchId?: string; assignedToId?: string }) {
  const and: Record<string, unknown>[] = [];
  if (scope.branchId) and.push({ branchId: scope.branchId });
  if (scope.assignedToId) and.push({ assignedToId: scope.assignedToId });

  if (filters.status) and.push({ status: filters.status });
  if (filters.branchId) and.push({ branchId: filters.branchId });
  if (filters.assignedToId) and.push({ assignedToId: filters.assignedToId });
  if (filters.categoryId) and.push({ categoryId: filters.categoryId });
  if (filters.priority) and.push({ priority: filters.priority });
  if (filters.unassigned) and.push({ assignedToId: null });
  if (filters.overdue) and.push({ slaResolutionDueAt: { lt: new Date() } }, { status: { in: OPEN_STATUSES } });
  if (filters.phone) and.push({ customerPhone: normalizePhone(filters.phone) });
  if (filters.email) and.push({ customerEmail: filters.email.trim().toLowerCase() });
  if (filters.source) and.push({ source: filters.source.toUpperCase() });
  if (filters.escalated) and.push({ escalatedAt: { not: null } });
  if (filters.updatedSince) {
    const since = new Date(filters.updatedSince);
    if (!Number.isNaN(since.getTime())) and.push({ updatedAt: { gte: since } });
  }
  const from = filters.from ? istDay(filters.from, false) : null;
  const to = filters.to ? istDay(filters.to, true) : null;
  if (from) and.push({ createdAt: { gte: from } });
  if (to) and.push({ createdAt: { lte: to } });

  const words = (s?: string) => (s || "").trim().split(/\s+/).filter(Boolean).slice(0, 8);
  const digits = (w: string) => w.replace(/\D/g, "");

  // Global keyword search: every word must appear somewhere in the ticket.
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

  return and.length ? { AND: and } : {};
}

export const TICKET_INCLUDE = {
  branch: { select: { id: true, code: true, name: true } },
  category: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, email: true, designation: true } },
} as const;

// Lifecycle / severity order used when sorting by status or priority
// (alphabetical order would be meaningless for these).
const STATUS_RANK: Record<string, number> = { NEW_COMPLAINT: 0, IN_PROGRESS: 1, ON_HOLD: 2, RESOLVED: 3, CLOSED: 4 };
const PRIORITY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

function orderByFor(sort: SortField | undefined, dir: "asc" | "desc") {
  switch (sort) {
    case "ticketNumber":
      return [{ ticketNumber: dir }];
    case "customer":
      return [{ customerName: dir }, { createdAt: "desc" as const }];
    case "branch":
      return [{ branch: { name: dir } }, { createdAt: "desc" as const }];
    case "category":
      return [{ category: { name: dir } }, { createdAt: "desc" as const }];
    case "assignee":
      return [{ assignee: { name: dir } }, { createdAt: "desc" as const }];
    case "createdAt":
      return [{ createdAt: dir }];
    default:
      return [{ createdAt: "desc" as const }];
  }
}

export async function listTickets(
  filters: TicketFilters,
  scope: { branchId?: string; assignedToId?: string },
  page: { skip: number; take: number },
) {
  const where = buildWhere(filters, scope);
  const dir = filters.order || "asc";

  // Status / priority: sort by rank in memory over the (light) id list, then
  // load the full rows for the requested page only.
  if (filters.sort === "status" || filters.sort === "priority") {
    const field = filters.sort;
    const rank = field === "status" ? STATUS_RANK : PRIORITY_RANK;
    const light = await db.ticket.findMany({ where, select: { id: true, status: true, priority: true, createdAt: true } });
    const sign = dir === "asc" ? 1 : -1;
    light.sort((a, b) => sign * ((rank[a[field]] ?? 99) - (rank[b[field]] ?? 99)) || b.createdAt.getTime() - a.createdAt.getTime());
    const ids = light.slice(page.skip, page.skip + page.take).map((r) => r.id);
    const rows = ids.length ? await db.ticket.findMany({ where: { id: { in: ids } }, include: TICKET_INCLUDE }) : [];
    const pos = new Map(ids.map((id, i) => [id, i]));
    rows.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
    return { rows, total: light.length };
  }

  const [rows, total] = await Promise.all([
    db.ticket.findMany({ where, include: TICKET_INCLUDE, orderBy: orderByFor(filters.sort, dir), skip: page.skip, take: page.take }),
    db.ticket.count({ where }),
  ]);
  return { rows, total };
}
