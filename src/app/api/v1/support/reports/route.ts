// Reports for branch managers and central staff.
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=&departmentId=   (India time; default last 30 days)
// Branch managers always see their own branch only.
//
// Definitions
// - created / resolved: tickets created / resolved inside the range
// - SLA met %: of tickets resolved in the range, share resolved before their
//   resolution deadline
// - avg first response: minutes from creation to first staff action (tickets
//   created in range that got a response)
// - avg resolution: hours from creation to resolution (resolved in range)
// - reopen rate: share of tickets resolved in range that were reopened at least once
// - rating: average member rating (1-5) received in the range
// - open / overdue / unassigned: right now (not limited to the range)

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canViewReports, isCentralRole } from "@/lib/types";
import { getUserPermissions } from "@/lib/permissions";

const IST = "+05:30";
const OPEN = ["NEW_COMPLAINT", "IN_PROGRESS", "ON_HOLD"];

function dayKey(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

interface Acc {
  created: number;
  resolved: number;
  slaMet: number;
  slaKnown: number;
  resolutionHours: number[];
  firstResponseMinutes: number[];
  reopened: number;
  ratings: number[];
  open: number;
  overdue: number;
  unassigned: number;
  escalated: number;
}
const acc = (): Acc => ({
  created: 0, resolved: 0, slaMet: 0, slaKnown: 0, resolutionHours: [], firstResponseMinutes: [], reopened: 0, ratings: [],
  open: 0, overdue: 0, unassigned: 0, escalated: 0,
});
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

function summarize(a: Acc) {
  return {
    created: a.created,
    resolved: a.resolved,
    open: a.open,
    overdue: a.overdue,
    unassigned: a.unassigned,
    escalated: a.escalated,
    slaMetPercent: a.slaKnown ? Math.round((a.slaMet / a.slaKnown) * 100) : null,
    avgResolutionHours: round1(mean(a.resolutionHours)),
    avgFirstResponseMinutes: a.firstResponseMinutes.length ? Math.round(mean(a.firstResponseMinutes)!) : null,
    reopenRatePercent: a.resolved ? Math.round((a.reopened / a.resolved) * 100) : null,
    rating: round1(mean(a.ratings)),
    ratingCount: a.ratings.length,
  };
}

export async function GET(request: Request) {
  return handleErrors(async () => {
    const user = await requireUser();
    const permissions = await getUserPermissions(user);
    if (!permissions.viewReports && !canViewReports(user.role)) {
      return fail("FORBIDDEN", "Reports are not enabled for your role or designation.", 403);
    }
    const url = new URL(request.url);

    const todayIst = dayKey(new Date());
    const toDay = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("to") || "") ? url.searchParams.get("to")! : todayIst;
    const defaultFrom = dayKey(new Date(new Date(`${toDay}T00:00:00${IST}`).getTime() - 29 * 86400_000));
    const fromDay = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("from") || "") ? url.searchParams.get("from")! : defaultFrom;
    const from = new Date(`${fromDay}T00:00:00.000${IST}`);
    const to = new Date(`${toDay}T23:59:59.999${IST}`);
    if (from > to) return fail("VALIDATION_ERROR", "'from' must be before 'to'.", 422);
    if (to.getTime() - from.getTime() > 400 * 86400_000) return fail("VALIDATION_ERROR", "Choose a range of 400 days or less.", 422);

    const central = isCentralRole(user.role);
    const branchId = central ? url.searchParams.get("branchId") || "" : user.branchId || "__none__";
    const departmentId = url.searchParams.get("departmentId") || "";

    const scope: Record<string, unknown> = {};
    if (branchId) scope.branchId = branchId;
    if (departmentId) scope.departmentId = departmentId === "none" ? null : departmentId;

    const tickets = await db.ticket.findMany({
      where: {
        ...scope,
        OR: [{ createdAt: { gte: from, lte: to } }, { resolvedAt: { gte: from, lte: to } }, { status: { in: OPEN } }],
      },
      select: {
        id: true, status: true, createdAt: true, resolvedAt: true, firstResponseAt: true, slaResolutionDueAt: true,
        reopenCount: true, escalatedAt: true, assignedToId: true, branchId: true, categoryId: true, departmentId: true,
      },
    });
    const feedback = await db.ticketFeedback.findMany({
      where: { createdAt: { gte: from, lte: to }, ticket: scope },
      select: { rating: true, ticket: { select: { branchId: true, categoryId: true, departmentId: true, assignedToId: true } } },
    });

    const total = acc();
    const byBranch = new Map<string, Acc>();
    const byCategory = new Map<string, Acc>();
    const byDepartment = new Map<string, Acc>();
    const byAgent = new Map<string, Acc>();
    const trend = new Map<string, { created: number; resolved: number }>();
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400_000)) trend.set(dayKey(d), { created: 0, resolved: 0 });

    const get = (m: Map<string, Acc>, k: string) => {
      let a = m.get(k);
      if (!a) { a = acc(); m.set(k, a); }
      return a;
    };
    const now = Date.now();

    for (const t of tickets) {
      const groups = [total, get(byBranch, t.branchId), get(byCategory, t.categoryId), get(byDepartment, t.departmentId || "none")];
      if (t.assignedToId) groups.push(get(byAgent, t.assignedToId));
      const createdIn = t.createdAt >= from && t.createdAt <= to;
      const resolvedIn = !!t.resolvedAt && t.resolvedAt >= from && t.resolvedAt <= to;
      const isOpen = OPEN.includes(t.status);
      for (const g of groups) {
        if (createdIn) {
          g.created += 1;
          if (t.firstResponseAt) g.firstResponseMinutes.push((t.firstResponseAt.getTime() - t.createdAt.getTime()) / 60000);
          if (t.escalatedAt) g.escalated += 1;
        }
        if (resolvedIn) {
          g.resolved += 1;
          g.resolutionHours.push((t.resolvedAt!.getTime() - t.createdAt.getTime()) / 3600000);
          if (t.slaResolutionDueAt) {
            g.slaKnown += 1;
            if (t.resolvedAt! <= t.slaResolutionDueAt) g.slaMet += 1;
          }
          if (t.reopenCount > 0) g.reopened += 1;
        }
        if (isOpen) {
          g.open += 1;
          if (!t.assignedToId) g.unassigned += 1;
          if (t.slaResolutionDueAt && t.slaResolutionDueAt.getTime() < now && t.status !== "ON_HOLD") g.overdue += 1;
        }
      }
      if (createdIn) { const d = trend.get(dayKey(t.createdAt)); if (d) d.created += 1; }
      if (resolvedIn) { const d = trend.get(dayKey(t.resolvedAt!)); if (d) d.resolved += 1; }
    }
    for (const f of feedback) {
      total.ratings.push(f.rating);
      get(byBranch, f.ticket.branchId).ratings.push(f.rating);
      get(byCategory, f.ticket.categoryId).ratings.push(f.rating);
      get(byDepartment, f.ticket.departmentId || "none").ratings.push(f.rating);
      if (f.ticket.assignedToId) get(byAgent, f.ticket.assignedToId).ratings.push(f.rating);
    }

    const [branches, categories, departments, staff] = await Promise.all([
      db.branch.findMany({ where: { id: { in: [...byBranch.keys()] } }, select: { id: true, name: true, code: true } }),
      db.complaintCategory.findMany({ where: { id: { in: [...byCategory.keys()] } }, select: { id: true, name: true } }),
      db.department.findMany({ where: { id: { in: [...byDepartment.keys()].filter((k) => k !== "none") } }, select: { id: true, name: true } }),
      db.staffUser.findMany({ where: { id: { in: [...byAgent.keys()] } }, select: { id: true, name: true, branch: { select: { name: true } } } }),
    ]);
    const nameOf = <T extends { id: string; name: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
    const bN = nameOf(branches), cN = nameOf(categories), dN = nameOf(departments), sN = nameOf(staff);

    const table = (m: Map<string, Acc>, label: (id: string) => Record<string, unknown>) =>
      [...m.entries()]
        .map(([id, a]) => ({ id, ...label(id), ...summarize(a) }))
        .filter((r) => r.created || r.resolved || r.open || r.ratingCount)
        .sort((a, b) => b.created - a.created || b.open - a.open);

    return ok({
      range: { from: fromDay, to: toDay },
      filters: { branchId: branchId === "__none__" ? "" : branchId, departmentId },
      scopeLabel: central ? (branchId ? bN.get(branchId)?.name || "Branch" : "All branches") : "Your branch",
      totals: summarize(total),
      trend: [...trend.entries()].map(([day, v]) => ({ day, ...v })),
      byBranch: central ? table(byBranch, (id) => ({ name: bN.get(id)?.name || "Unknown", code: (bN.get(id) as { code?: string })?.code || "" })) : [],
      byCategory: table(byCategory, (id) => ({ name: cN.get(id)?.name || "Unknown" })),
      byDepartment: table(byDepartment, (id) => ({ name: id === "none" ? "No department" : dN.get(id)?.name || "Unknown" })),
      byAgent: table(byAgent, (id) => ({ name: sN.get(id)?.name || "Unknown", branch: (sN.get(id) as { branch?: { name: string } | null })?.branch?.name || "" })),
    });
  });
}
