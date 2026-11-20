"use client";

// Account-aware ServiceNow Polaris Agent Workspace Dashboard:
// - Prioritizes the logged-in user account's assigned incidents and queues.
// - Supports toggling between "My Account Worklist" and "Branch Overview" for
//   users with branch-wide visibility permissions (e.g. Senior Support Agent, Manager).
// - Junior Support Agents are strictly focused on their own account details.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/staff-nav";
import { TICKET_STATUSES, PRIORITY_LABELS } from "@/lib/types";
import {
  AlertCircle,
  ArrowRight,
  Clock3,
  Inbox,
  TicketCheck,
  TriangleAlert,
  Users,
  User,
  Building2,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

interface UserAccountTicket {
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

interface Summary {
  scope: "EMPLOYEE" | "BRANCH" | "CENTRAL";
  user: {
    id: string;
    name: string;
    role: string;
    designation?: string;
    branchName?: string | null;
  };
  permissions?: {
    viewAllBranchTickets: boolean;
    searchGlobally: boolean;
    reassignTickets: boolean;
    transferBranch: boolean;
    updateStatus: boolean;
  };
  counts: Record<string, number> & { total?: number; unassigned?: number; overdue?: number; open?: number };
  myCounts?: Record<string, number> & { total: number; unassigned: number; overdue: number; open: number };
  branchCounts?: Record<string, number> & { total: number; unassigned: number; overdue: number };
  branchName?: string;
  mine?: { total: number; open: number; resolved: number };
  myRecentTickets?: UserAccountTicket[];
  canViewAllBranch?: boolean;
  employees?: { id: string; name: string; availabilityEnabled: boolean; isActive: boolean; openCount: number }[];
  branchBreakdown?: { branchName: string; open: number; total: number }[];
  avgFirstResponseMinutes?: number | null;
  avgResolutionHours?: number | null;
}

const STATUS_TITLES: Record<string, string> = {
  NEW_COMPLAINT: "New Complaints",
  IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const PRIORITY_DOT_CLASS: Record<string, string> = {
  CRITICAL: "bg-[#DC2626]",
  HIGH: "bg-[#EA580C]",
  MEDIUM: "bg-[#1F70C1]",
  LOW: "bg-[#64748B]",
};

export default function StaffDashboardPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"account" | "branch">("account");

  useEffect(() => {
    fetch("/api/v1/support/dashboard/summary")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setData(d.data);
          // Default to account view for all agents
          setViewMode("account");
        } else {
          setError(d.error?.message || "Failed to load dashboard.");
        }
      })
      .catch(() => setError("Failed to load dashboard."));
  }, []);

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  const isAccountView = viewMode === "account" || !data.canViewAllBranch;
  const activeCounts = isAccountView
    ? (data.myCounts || data.counts)
    : (data.branchCounts || data.counts);

  const userDesignation = data.user.designation || (data.user.role === "SUPPORT_AGENT" ? "Support Agent" : data.user.role.replace(/_/g, " "));
  const branchName = data.branchName || data.user.branchName || "Main Branch";

  return (
    <div className="space-y-6">
      {/* Top Banner & Scope Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D1D7DC] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-[#161F28]">
              {isAccountView ? "My Workspace & Assigned Queue" : `Branch Operations — ${branchName}`}
            </h1>
            <Badge className="bg-[#1F70C1] text-xs font-semibold">
              <User className="mr-1 h-3 w-3" />
              {data.user.name} ({userDesignation})
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {isAccountView
              ? `Showing real-time incident metrics assigned to your user account (${data.user.name}) at ${branchName}.`
              : `Showing aggregate branch-wide operational statistics for ${branchName}.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.canViewAllBranch ? (
            <div className="flex rounded-md border border-[#D1D7DC] bg-[#F4F6F8] p-1">
              <button
                type="button"
                onClick={() => setViewMode("account")}
                className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold transition ${
                  isAccountView
                    ? "bg-[#1F70C1] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <User className="h-3.5 w-3.5" />
                My Account Worklist
              </button>
              <button
                type="button"
                onClick={() => setViewMode("branch")}
                className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold transition ${
                  !isAccountView
                    ? "bg-[#161F28] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                Branch Overview
              </button>
            </div>
          ) : (
            <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-800 text-xs">
              <ShieldCheck className="mr-1 h-3.5 w-3.5 text-sky-600" />
              Account Scoped
            </Badge>
          )}

          <Link
            href={isAccountView ? "/staff/tickets?mine=true&status=OPEN" : "/staff/tickets"}
            className="flex items-center gap-1 rounded border border-[#D1D7DC] bg-white px-3 py-1.5 text-xs font-semibold text-[#1F70C1] hover:bg-slate-50"
          >
            {isAccountView ? "View My Worklist →" : "View All Branch Incidents →"}
          </Link>
        </div>
      </div>

      {/* Primary Status Stat Cards (Polaris Density) */}
      <div>
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
          <span>{isAccountView ? "My Assigned Incidents by State" : "Branch Incident State Breakdown"}</span>
          <span className="text-[11px] font-medium lowercase text-slate-400">Click any card to filter list</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {TICKET_STATUSES.map((s) => {
            const count = activeCounts[s] ?? 0;
            const targetUrl = isAccountView
              ? `/staff/tickets?mine=true&status=${s}`
              : `/staff/tickets?status=${s}`;
            return (
              <Link key={s} href={targetUrl}>
                <Card className="border-[#D1D7DC] transition hover:border-[#1F70C1] hover:shadow-xs">
                  <CardContent className="p-3.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        {STATUS_TITLES[s]}
                      </p>
                      {isAccountView && (
                        <span className="text-[10px] font-semibold text-slate-400">Mine</span>
                      )}
                    </div>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{count}</p>
                    <div className="mt-2">
                      <StatusBadge status={s} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Two-Column Middle Section: Operational Attention & SLA Metrics */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Attention Required Card */}
        <Card className="border-[#D1D7DC] shadow-xs">
          <CardHeader className="border-b border-[#E2E8F0] pb-2.5">
            <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
              <Inbox className="h-4 w-4 text-[#1F70C1]" aria-hidden />
              {isAccountView ? "Account Queue Attention" : "Branch Queue Attention"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-3 text-xs">
            {isAccountView ? (
              <>
                <div className="flex items-center justify-between rounded-md border border-red-200/60 bg-red-50 px-3 py-2">
                  <span className="flex items-center gap-2 font-medium text-red-900">
                    <TriangleAlert className="h-4 w-4 text-red-600" aria-hidden />
                    Overdue / SLA Breached
                  </span>
                  <span className="font-bold tabular-nums text-red-900">
                    {activeCounts.overdue ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-amber-200/60 bg-amber-50 px-3 py-2">
                  <span className="flex items-center gap-2 font-medium text-amber-900">
                    <Clock3 className="h-4 w-4 text-amber-600" aria-hidden />
                    Active Worklist (Open / WIP / Hold)
                  </span>
                  <span className="font-bold tabular-nums text-amber-900">
                    {(activeCounts as any).open ?? ((activeCounts.NEW_COMPLAINT || 0) + (activeCounts.IN_PROGRESS || 0) + (activeCounts.ON_HOLD || 0))}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-slate-200/60 bg-slate-50 px-3 py-2">
                  <span className="flex items-center gap-2 font-medium text-slate-700">
                    <TicketCheck className="h-4 w-4 text-slate-500" aria-hidden />
                    Total Lifetime Incidents Assigned
                  </span>
                  <span className="font-bold tabular-nums text-slate-900">
                    {activeCounts.total ?? 0}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-md border border-amber-200/60 bg-amber-50 px-3 py-2">
                  <span className="flex items-center gap-2 font-medium text-amber-900">
                    <Clock3 className="h-4 w-4 text-amber-600" aria-hidden />
                    Branch Unassigned Queue
                  </span>
                  <span className="font-bold tabular-nums text-amber-900">
                    {activeCounts.unassigned ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-red-200/60 bg-red-50 px-3 py-2">
                  <span className="flex items-center gap-2 font-medium text-red-900">
                    <TriangleAlert className="h-4 w-4 text-red-600" aria-hidden />
                    Branch Overdue (SLA Breached)
                  </span>
                  <span className="font-bold tabular-nums text-red-900">
                    {activeCounts.overdue ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-slate-200/60 bg-slate-50 px-3 py-2">
                  <span className="flex items-center gap-2 font-medium text-slate-700">
                    <Users className="h-4 w-4 text-slate-500" aria-hidden />
                    Total Branch Volume
                  </span>
                  <span className="font-bold tabular-nums text-slate-900">
                    {activeCounts.total ?? 0}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Second Column: Team Availability (Branch view) or Account Overview (Account view) */}
        {!isAccountView && data.employees ? (
          <Card className="border-[#D1D7DC] shadow-xs">
            <CardHeader className="border-b border-[#E2E8F0] pb-2.5">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Team Agent Availability
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <ul className="space-y-1.5">
                {data.employees.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-1.5 text-xs"
                  >
                    <span className="font-medium text-slate-800">{e.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        e.isActive && e.availabilityEnabled
                          ? "border border-[#059669]/20 bg-[#D1FAE5] text-[#065F46]"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {e.isActive
                        ? e.availabilityEnabled
                          ? `Available · ${e.openCount} open`
                          : "Away"
                        : "Inactive"}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href="/staff/employees"
                className="mt-3 inline-flex items-center text-xs font-semibold text-[#1F70C1] hover:underline"
              >
                Manage agent capacity <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-[#D1D7DC] shadow-xs">
            <CardHeader className="border-b border-[#E2E8F0] pb-2.5">
              <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                <TicketCheck className="h-4 w-4 text-[#1F70C1]" aria-hidden />
                My Account Workload Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border border-slate-200/60 bg-slate-50 px-2 py-2.5">
                  <p className="text-lg font-bold tabular-nums text-slate-900">
                    {data.mine?.open ?? 0}
                  </p>
                  <p className="text-[10px] font-bold uppercase text-slate-500">Open Work</p>
                </div>
                <div className="rounded-md border border-emerald-200/60 bg-emerald-50 px-2 py-2.5">
                  <p className="text-lg font-bold tabular-nums text-emerald-800">
                    {data.mine?.resolved ?? 0}
                  </p>
                  <p className="text-[10px] font-bold uppercase text-emerald-700">Resolved</p>
                </div>
                <div className="rounded-md border border-slate-200/60 bg-slate-50 px-2 py-2.5">
                  <p className="text-lg font-bold tabular-nums text-slate-700">
                    {data.mine?.total ?? 0}
                  </p>
                  <p className="text-[10px] font-bold uppercase text-slate-500">Lifetime</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">Logged in as: <strong className="text-slate-800">{data.user.name}</strong></span>
                <Link
                  href="/staff/tickets?mine=true&status=OPEN"
                  className="inline-flex items-center font-semibold text-[#1F70C1] hover:underline"
                >
                  My open list <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SLA Metrics Card */}
        <Card className="border-[#D1D7DC] shadow-xs">
          <CardHeader className="border-b border-[#E2E8F0] pb-2.5">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">
              ITIL Performance SLA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-3 text-xs text-slate-600">
            <div className="flex items-center justify-between px-1">
              <span>Target First Response</span>
              <span className="font-bold tabular-nums text-slate-900">
                {data.avgFirstResponseMinutes ?? 15} min
              </span>
            </div>
            <div className="flex items-center justify-between px-1">
              <span>Target Resolution SLA</span>
              <span className="font-bold tabular-nums text-slate-900">
                {data.avgResolutionHours ?? 4} h
              </span>
            </div>
            <div className="rounded-md bg-slate-50 border border-slate-100 p-2 mt-2">
              <p className="text-[11px] leading-relaxed text-slate-500">
                {isAccountView
                  ? "SLA countdowns on your assigned tickets are calculated in real time against branch operating hours."
                  : "Branch aggregate performance against standard ITIL Washington DC SLA matrix."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Interactive "My Assigned Incidents" Worklist Grid */}
      <Card className="border-[#D1D7DC] shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between border-b border-[#E2E8F0] pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#161F28]">
              <TicketCheck className="h-4 w-4 text-[#1F70C1]" />
              {isAccountView ? "My Assigned Incidents (Active Worklist)" : "Recent Branch Incidents"}
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAccountView
                ? "Immediate incidents assigned to your account requiring action or investigation."
                : `Recent incidents raised in ${branchName}.`}
            </p>
          </div>
          <Link
            href={isAccountView ? "/staff/tickets?mine=true" : "/staff/tickets"}
            className="text-xs font-semibold text-[#1F70C1] hover:underline flex items-center gap-1"
          >
            Open full grid <ExternalLink className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {data.myRecentTickets && data.myRecentTickets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#D1D7DC] bg-[#F4F6F8] text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3">Number</th>
                    <th className="py-2.5 px-3">Member</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Group</th>
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3">State</th>
                    <th className="py-2.5 px-3">Created</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {data.myRecentTickets.map((t) => {
                    const isOverdue = t.slaResolutionDueAt && new Date(t.slaResolutionDueAt) < new Date() && t.status !== "RESOLVED" && t.status !== "CLOSED";
                    const shortDesc = t.description.split(/\r?\n/)[0].slice(0, 60);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 font-semibold text-[#1F70C1]">
                          <Link href={`/staff/tickets/${t.id}`} className="hover:underline">
                            {t.ticketNumber}
                          </Link>
                        </td>
                        <td className="py-2 px-3">
                          <p className="font-medium text-slate-900">{t.customerName}</p>
                          <p className="text-[11px] text-slate-400">{t.customerPhone}</p>
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {t.category?.name || "General"}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {t.department?.name || "—"}
                        </td>
                        <td className="py-2 px-3">
                          <span className="flex items-center gap-1.5 font-medium text-slate-800">
                            <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT_CLASS[t.priority] || "bg-slate-400"}`} />
                            {PRIORITY_LABELS[t.priority] || t.priority}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-slate-500 tabular-nums">
                          {new Date(t.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          {isOverdue && (
                            <span className="ml-1.5 rounded bg-red-100 px-1 py-0.2 text-[9px] font-bold text-red-800">
                              OVERDUE
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Link
                            href={`/staff/tickets/${t.id}`}
                            className="inline-flex items-center rounded border border-[#D1D7DC] bg-white px-2 py-1 text-[11px] font-medium text-[#1F70C1] hover:bg-slate-50"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500/80 mb-2" />
              <p className="text-sm font-semibold text-slate-800">No active incidents assigned to your account</p>
              <p className="text-xs text-slate-500 mt-0.5">
                All assigned work has been completed, or new complaints are waiting in the round-robin queue.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Link
                  href="/staff/tickets"
                  className="rounded border border-[#D1D7DC] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Browse Branch Incidents
                </Link>
                <Link
                  href="/complaint"
                  target="_blank"
                  className="rounded bg-[#1F70C1] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#185999]"
                >
                  Create New Ticket
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
