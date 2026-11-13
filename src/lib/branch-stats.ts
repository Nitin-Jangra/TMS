// Aggregated statistics for the Master Admin complaint panel, central
// dashboard, branch dashboard and support employee workspace.

import { db } from "@/lib/db";
import { isTicketOverdue } from "@/lib/sla";
import { TICKET_STATUSES, type SessionUser } from "@/lib/types";

export type StatusCounts = Record<string, number>;

export interface BranchStats {
  branchId: string;
  branchCode: string;
  branchName: string;
  notificationEmail: string;
  counts: StatusCounts;
  total: number;
  unassigned: number;
  overdue: number;
  employees: { id: string; name: string; role: string; availabilityEnabled: boolean; isActive: boolean; openCount: number; totalAssigned: number; resolvedCount: number }[];
  cursorLastEmployeeId: string;
}

export interface MasterOverview {
  totals: StatusCounts & { total: number; unassigned: number; overdue: number };
  branches: BranchStats[];
  avgFirstResponseMinutes: number | null;
  avgResolutionHours: number | null;
  generatedAt: string;
}

const EMPTY_COUNTS = (): StatusCounts => Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0]));

export async function getMasterOverview(): Promise<MasterOverview> {
  const branches = await db.branch.findMany({ orderBy: { code: "asc" } });
  const tickets = await db.ticket.findMany({
    select: { id: true, branchId: true, status: true, assignedToId: true, slaResolutionDueAt: true, createdAt: true, resolvedAt: true },
  });
  const employees = await db.staffUser.findMany({
    where: { role: { in: ["SUPPORT_AGENT", "BRANCH_MANAGER"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, role: true, branchId: true, availabilityEnabled: true, isActive: true },
  });
  const cursors = await db.branchCursor.findMany();
  const slaRows = await db.slaTracking.findMany({ select: { ticketId: true, firstResponseMetAt: true } });

  const firstResponseDurations: number[] = [];
  const ticketCreatedMap = new Map(tickets.map((t) => [t.id, t.createdAt]));
  for (const row of slaRows) {
    if (row.firstResponseMetAt) {
      const created = ticketCreatedMap.get(row.ticketId);
      if (created) firstResponseDurations.push(row.firstResponseMetAt.getTime() - created.getTime());
    }
  }

  const resolutionDurations: number[] = [];
  const branchStats: BranchStats[] = branches.map((b) => ({
    branchId: b.id,
    branchCode: b.code,
    branchName: b.name,
    notificationEmail: b.notificationEmail,
    counts: EMPTY_COUNTS(),
    total: 0,
    unassigned: 0,
    overdue: 0,
    employees: [],
    cursorLastEmployeeId: cursors.find((c) => c.branchId === b.id)?.lastEmployeeId || "",
  }));
  const branchMap = new Map(branchStats.map((b) => [b.branchId, b]));
  const totals = { ...EMPTY_COUNTS(), total: 0, unassigned: 0, overdue: 0 } as StatusCounts & { total: number; unassigned: number; overdue: number };

  // employee open/assigned counts
  const empOpen = new Map<string, number>();
  const empTotal = new Map<string, number>();
  const empResolved = new Map<string, number>();

  for (const t of tickets) {
    const b = branchMap.get(t.branchId);
    if (b) {
      b.counts[t.status] = (b.counts[t.status] || 0) + 1;
      b.total += 1;
      if (!t.assignedToId && t.status === "NEW_COMPLAINT") b.unassigned += 1;
      if (isTicketOverdue(t)) b.overdue += 1;
    }
    totals[t.status] = (totals[t.status] || 0) + 1;
    totals.total += 1;
    if (!t.assignedToId && t.status === "NEW_COMPLAINT") totals.unassigned += 1;
    if (isTicketOverdue(t)) totals.overdue += 1;
    if (t.assignedToId) {
      empTotal.set(t.assignedToId, (empTotal.get(t.assignedToId) || 0) + 1);
      if (t.status === "RESOLVED" || t.status === "CLOSED") {
        empResolved.set(t.assignedToId, (empResolved.get(t.assignedToId) || 0) + 1);
      } else {
        empOpen.set(t.assignedToId, (empOpen.get(t.assignedToId) || 0) + 1);
      }
    }
    if (t.resolvedAt) resolutionDurations.push(t.resolvedAt.getTime() - t.createdAt.getTime());
  }

  for (const b of branchStats) {
    b.employees = employees
      .filter((e) => e.branchId === b.branchId)
      .map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        availabilityEnabled: e.availabilityEnabled,
        isActive: e.isActive,
        openCount: empOpen.get(e.id) || 0,
        totalAssigned: empTotal.get(e.id) || 0,
        resolvedCount: empResolved.get(e.id) || 0,
      }));
  }

  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, c) => a + c, 0) / arr.length) : null);
  const avgMs = avg(firstResponseDurations);
  const avgResMs = avg(resolutionDurations);

  return {
    totals,
    branches: branchStats,
    avgFirstResponseMinutes: avgMs ? Math.round(avgMs / 60000) : null,
    avgResolutionHours: avgResMs ? Math.round((avgResMs / 3600000) * 10) / 10 : null,
    generatedAt: new Date().toISOString(),
  };
}

/** Central support dashboard summary. */
export async function getCentralSummary(): Promise<{
  counts: StatusCounts & { total: number; unassigned: number; overdue: number };
  avgFirstResponseMinutes: number | null;
  avgResolutionHours: number | null;
  branchBreakdown: { branchName: string; open: number; total: number }[];
}> {
  const overview = await getMasterOverview();
  return {
    counts: overview.totals,
    avgFirstResponseMinutes: overview.avgFirstResponseMinutes,
    avgResolutionHours: overview.avgResolutionHours,
    branchBreakdown: overview.branches.map((b) => ({
      branchName: b.branchName,
      open: (b.counts.NEW_COMPLAINT || 0) + (b.counts.IN_PROGRESS || 0) + (b.counts.ON_HOLD || 0),
      total: b.total,
    })),
  };
}

/**
 * Support employee workspace summary. Visibility is branch-wide: every
 * complaint raised in the agent's own branch, plus a personal "assigned to me"
 * breakdown for their own work queue.
 */
export async function getEmployeeSummary(user: SessionUser): Promise<{
  branchId: string | null;
  branchName: string | null;
  counts: StatusCounts & { total: number; unassigned: number; overdue: number };
  mine: { total: number; open: number; resolved: number };
}> {
  const overview = await getMasterOverview();
  const branch = overview.branches.find((b) => b.branchId === user.branchId);

  const counts = EMPTY_COUNTS() as StatusCounts & { total: number; unassigned: number; overdue: number };
  if (branch) {
    for (const s of TICKET_STATUSES) counts[s] = branch.counts[s] || 0;
    counts.total = branch.total;
    counts.unassigned = branch.unassigned;
    counts.overdue = branch.overdue;
  }

  const mineTickets = await db.ticket.findMany({
    where: { assignedToId: user.id },
    select: { status: true },
  });
  const mine = {
    total: mineTickets.length,
    open: mineTickets.filter((t) => t.status === "NEW_COMPLAINT" || t.status === "IN_PROGRESS" || t.status === "ON_HOLD").length,
    resolved: mineTickets.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length,
  };

  return { branchId: user.branchId, branchName: branch?.branchName ?? null, counts, mine };
}

/** Branch manager dashboard summary. */
export async function getBranchSummary(user: SessionUser): Promise<{
  branchId: string;
  branchName: string;
  counts: StatusCounts & { total: number; unassigned: number; overdue: number };
  employees: { id: string; name: string; role: string; availabilityEnabled: boolean; isActive: boolean; openCount: number; totalAssigned: number; resolvedCount: number }[];
}> {
  const overview = await getMasterOverview();
  const branch = overview.branches.find((b) => b.branchId === user.branchId);
  if (!branch) throw new Error("Branch not found for manager.");
  return {
    branchId: branch.branchId,
    branchName: branch.branchName,
    counts: {
      NEW_COMPLAINT: branch.counts.NEW_COMPLAINT || 0,
      IN_PROGRESS: branch.counts.IN_PROGRESS || 0,
      ON_HOLD: branch.counts.ON_HOLD || 0,
      RESOLVED: branch.counts.RESOLVED || 0,
      CLOSED: branch.counts.CLOSED || 0,
      total: branch.total,
      unassigned: branch.unassigned,
      overdue: branch.overdue,
    },
    employees: branch.employees,
  };
}
