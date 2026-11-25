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

let masterOverviewCache: { data: MasterOverview; expires: number } | null = null;

export function invalidateStatsCache() {
  masterOverviewCache = null;
}

export async function getMasterOverview(forceRefresh = false): Promise<MasterOverview> {
  const now = Date.now();
  if (!forceRefresh && masterOverviewCache && masterOverviewCache.expires > now) {
    return masterOverviewCache.data;
  }
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
    const normalizedStatus = t.status === "NEW_COMPLAINT" ? "IN_PROGRESS" : t.status;
    const isUnassigned = !t.assignedToId && (normalizedStatus === "IN_PROGRESS" || normalizedStatus === "ON_HOLD");
    const b = branchMap.get(t.branchId);
    if (b) {
      b.counts[normalizedStatus] = (b.counts[normalizedStatus] || 0) + 1;
      b.total += 1;
      if (isUnassigned) b.unassigned += 1;
      if (isTicketOverdue(t)) b.overdue += 1;
    }
    totals[normalizedStatus] = (totals[normalizedStatus] || 0) + 1;
    totals.total += 1;
    if (isUnassigned) totals.unassigned += 1;
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

  const result: MasterOverview = {
    totals,
    branches: branchStats,
    avgFirstResponseMinutes: avgMs ? Math.round(avgMs / 60000) : null,
    avgResolutionHours: avgResMs ? Math.round((avgResMs / 3600000) * 10) / 10 : null,
    generatedAt: new Date().toISOString(),
  };

  masterOverviewCache = { data: result, expires: now + 30000 };
  return result;
}

export interface UserAccountTicket {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerPhone: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  slaResolutionDueAt: string | null;
  category: { name: string } | null;
  department: { name: string } | null;
}

export async function getUserAccountStats(userId: string): Promise<{
  myCounts: StatusCounts & { total: number; unassigned: number; overdue: number; open: number };
  myRecentTickets: UserAccountTicket[];
}> {
  const userTickets = await db.ticket.findMany({
    where: { assignedToId: userId },
    select: {
      id: true,
      ticketNumber: true,
      customerName: true,
      customerPhone: true,
      description: true,
      status: true,
      priority: true,
      createdAt: true,
      slaResolutionDueAt: true,
      category: { select: { name: true } },
      department: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const myCounts: StatusCounts & { total: number; unassigned: number; overdue: number; open: number } = {
    IN_PROGRESS: 0,
    ON_HOLD: 0,
    RESOLVED: 0,
    CLOSED: 0,
    total: userTickets.length,
    unassigned: 0,
    overdue: 0,
    open: 0,
  };

  for (const t of userTickets) {
    const normalizedStatus = t.status === "NEW_COMPLAINT" ? "IN_PROGRESS" : t.status;
    if (myCounts[normalizedStatus] !== undefined) {
      myCounts[normalizedStatus]++;
    }
    const isOpen = normalizedStatus === "IN_PROGRESS" || normalizedStatus === "ON_HOLD";
    if (isOpen) {
      myCounts.open++;
      if (t.slaResolutionDueAt && new Date(t.slaResolutionDueAt) < now) {
        myCounts.overdue++;
      }
    }
  }

  const myRecentTickets: UserAccountTicket[] = userTickets.slice(0, 15).map((t) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    customerName: t.customerName,
    customerPhone: t.customerPhone,
    description: t.description,
    status: t.status === "NEW_COMPLAINT" ? "IN_PROGRESS" : t.status,
    priority: t.priority,
    createdAt: t.createdAt.toISOString(),
    slaResolutionDueAt: t.slaResolutionDueAt ? t.slaResolutionDueAt.toISOString() : null,
    category: t.category,
    department: t.department,
  }));

  return { myCounts, myRecentTickets };
}

/** Central support dashboard summary. */
export async function getCentralSummary(user?: SessionUser): Promise<{
  counts: StatusCounts & { total: number; unassigned: number; overdue: number };
  myCounts?: StatusCounts & { total: number; unassigned: number; overdue: number; open: number };
  myRecentTickets?: UserAccountTicket[];
  avgFirstResponseMinutes: number | null;
  avgResolutionHours: number | null;
  branchBreakdown: { branchName: string; open: number; total: number }[];
  canViewAllBranch: boolean;
}> {
  const overview = await getMasterOverview();
  const userStats = user ? await getUserAccountStats(user.id) : null;
  return {
    counts: overview.totals,
    myCounts: userStats?.myCounts,
    myRecentTickets: userStats?.myRecentTickets,
    avgFirstResponseMinutes: overview.avgFirstResponseMinutes,
    avgResolutionHours: overview.avgResolutionHours,
    branchBreakdown: overview.branches.map((b) => ({
      branchName: b.branchName,
      open: (b.counts.IN_PROGRESS || 0) + (b.counts.ON_HOLD || 0),
      total: b.total,
    })),
    canViewAllBranch: true,
  };
}

/**
 * Support employee workspace summary.
 * Prioritizes the individual logged-in user account details:
 * counts reflect tickets assigned to this user account.
 */
export async function getEmployeeSummary(
  user: SessionUser,
  perms?: { viewAllBranchTickets?: boolean }
): Promise<{
  branchId: string | null;
  branchName: string | null;
  counts: StatusCounts & { total: number; unassigned: number; overdue: number; open: number };
  myCounts: StatusCounts & { total: number; unassigned: number; overdue: number; open: number };
  branchCounts: StatusCounts & { total: number; unassigned: number; overdue: number };
  mine: { total: number; open: number; resolved: number };
  myRecentTickets: UserAccountTicket[];
  canViewAllBranch: boolean;
}> {
  const canViewAllBranch = perms ? !!perms.viewAllBranchTickets : false;
  const { myCounts, myRecentTickets } = await getUserAccountStats(user.id);

  let branchName: string | null = null;
  const branchCounts = EMPTY_COUNTS() as StatusCounts & { total: number; unassigned: number; overdue: number };

  if (canViewAllBranch) {
    const overview = await getMasterOverview();
    const branch = overview.branches.find((b) => b.branchId === user.branchId);
    if (branch) {
      for (const s of TICKET_STATUSES) branchCounts[s] = branch.counts[s] || 0;
      branchCounts.total = branch.total;
      branchCounts.unassigned = branch.unassigned;
      branchCounts.overdue = branch.overdue;
      branchName = branch.branchName;
    }
  } else if (user.branchId) {
    const b = await db.branch.findUnique({ where: { id: user.branchId }, select: { name: true } });
    branchName = b?.name ?? null;
  }

  // The primary counts reflect the user account
  const counts = myCounts;

  const mine = {
    total: myCounts.total,
    open: myCounts.open,
    resolved: (myCounts.RESOLVED || 0) + (myCounts.CLOSED || 0),
  };

  return {
    branchId: user.branchId,
    branchName,
    counts,
    myCounts,
    branchCounts,
    mine,
    myRecentTickets,
    canViewAllBranch,
  };
}

/** Branch manager dashboard summary. */
export async function getBranchSummary(
  user: SessionUser,
  perms?: { viewAllBranchTickets?: boolean }
): Promise<{
  branchId: string;
  branchName: string;
  counts: StatusCounts & { total: number; unassigned: number; overdue: number };
  myCounts: StatusCounts & { total: number; unassigned: number; overdue: number; open: number };
  branchCounts: StatusCounts & { total: number; unassigned: number; overdue: number };
  myRecentTickets: UserAccountTicket[];
  canViewAllBranch: boolean;
  employees: { id: string; name: string; role: string; availabilityEnabled: boolean; isActive: boolean; openCount: number; totalAssigned: number; resolvedCount: number }[];
}> {
  const overview = await getMasterOverview();
  const branch = overview.branches.find((b) => b.branchId === user.branchId);
  if (!branch) throw new Error("Branch not found for manager.");

  const { myCounts, myRecentTickets } = await getUserAccountStats(user.id);
  const branchCounts = {
    IN_PROGRESS: branch.counts.IN_PROGRESS || 0,
    ON_HOLD: branch.counts.ON_HOLD || 0,
    RESOLVED: branch.counts.RESOLVED || 0,
    CLOSED: branch.counts.CLOSED || 0,
    total: branch.total,
    unassigned: branch.unassigned,
    overdue: branch.overdue,
  };

  return {
    branchId: branch.branchId,
    branchName: branch.branchName,
    counts: branchCounts,
    branchCounts,
    myCounts,
    myRecentTickets,
    canViewAllBranch: true,
    employees: branch.employees,
  };
}
