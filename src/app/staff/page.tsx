"use client";

// Role-aware dashboard:
// - SUPPORT_AGENT → every complaint raised in their own branch + a personal
//   "assigned to me" work queue.
// - BRANCH_MANAGER → their branch overview.
// - Central roles → the whole tenant.
// Data comes from /api/v1/support/dashboard/summary.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/staff-nav";
import { TICKET_STATUSES } from "@/lib/types";
import { AlertCircle, ArrowRight, Clock3, Inbox, TicketCheck, TriangleAlert, Users } from "lucide-react";

interface Summary {
  scope: "EMPLOYEE" | "BRANCH" | "CENTRAL";
  user: { name: string; role: string; branchName?: string | null };
  counts: Record<string, number>;
  branchName?: string;
  mine?: { total: number; open: number; resolved: number };
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

export default function StaffDashboardPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/v1/support/dashboard/summary")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setData(d.data);
        else setError(d.error?.message || "Failed to load dashboard.");
      })
      .catch(() => setError("Failed to load dashboard."));
  }, []);

  if (error) {
    return <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-red-600"><AlertCircle className="h-4 w-4" />{error}</CardContent></Card>;
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const c = data.counts;
  const scopeLabel =
    data.scope === "EMPLOYEE"
      ? `My branch — ${data.branchName || data.user.branchName || "—"}`
      : data.scope === "BRANCH"
        ? `Branch — ${data.branchName}`
        : "Central support · all branches (tenant-wide)";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {data.scope === "EMPLOYEE"
              ? `Agent Workspace — ${data.branchName || data.user.branchName || ""}`
              : data.scope === "BRANCH"
                ? "Branch Queue & Operations"
                : "Central Support ITIL Workspace"}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {scopeLabel} · Welcome back, <strong className="text-slate-700">{data.user.name.split(" ")[0]}</strong>
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/staff/tickets" className="text-xs font-semibold text-[#1F70C1] hover:underline">
            View all incidents →
          </Link>
          {data.scope !== "EMPLOYEE" ? (
            <Link href="/staff/assignment" className="text-xs font-semibold text-[#1F70C1] hover:underline">
              Round-robin queues →
            </Link>
          ) : null}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {TICKET_STATUSES.map((s) => (
          <Link key={s} href={`/staff/tickets?status=${s}`}>
            <Card className="border-[#D1D7DC] transition hover:border-[#1F70C1] hover:shadow-xs">
              <CardContent className="p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{STATUS_TITLES[s]}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{c[s] ?? 0}</p>
                <div className="mt-2"><StatusBadge status={s} /></div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-[#D1D7DC] shadow-xs">
          <CardHeader className="border-b border-[#E2E8F0] pb-2.5">
            <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
              <Inbox className="h-4 w-4 text-[#1F70C1]" aria-hidden />
              Attention Required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-3 text-xs">
            <div className="flex items-center justify-between rounded-md bg-amber-50 border border-amber-200/60 px-3 py-2">
              <span className="flex items-center gap-2 text-amber-900 font-medium">
                <Clock3 className="h-4 w-4 text-amber-600" aria-hidden />
                Unassigned Incidents
              </span>
              <span className="font-bold tabular-nums text-amber-900">{c.unassigned ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-red-50 border border-red-200/60 px-3 py-2">
              <span className="flex items-center gap-2 text-red-900 font-medium">
                <TriangleAlert className="h-4 w-4 text-red-600" aria-hidden />
                Overdue (SLA Breached / At Risk)
              </span>
              <span className="font-bold tabular-nums text-red-900">{c.overdue ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-slate-50 border border-slate-200/60 px-3 py-2">
              <span className="flex items-center gap-2 text-slate-700 font-medium">
                <Users className="h-4 w-4 text-slate-500" aria-hidden />
                Total Ticket Volume
              </span>
              <span className="font-bold tabular-nums text-slate-900">{c.total ?? 0}</span>
            </div>
          </CardContent>
        </Card>

        {data.scope === "BRANCH" && data.employees ? (
          <Card className="border-[#D1D7DC] shadow-xs">
            <CardHeader className="border-b border-[#E2E8F0] pb-2.5">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Team Agent Availability
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <ul className="space-y-1.5">
                {data.employees.map((e) => (
                  <li key={e.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-1.5 text-xs">
                    <span className="text-slate-800 font-medium">{e.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${e.isActive && e.availabilityEnabled ? "bg-[#D1FAE5] text-[#065F46] border border-[#059669]/20" : "bg-slate-100 text-slate-500"}`}>
                      {e.isActive ? (e.availabilityEnabled ? `Available · ${e.openCount} open` : "Away") : "Inactive"}
                    </span>
                  </li>
                ))}
              </ul>
              <Link href="/staff/employees" className="mt-3 inline-flex items-center text-xs font-semibold text-[#1F70C1] hover:underline">
                Manage agent capacity <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {data.scope === "CENTRAL" && data.branchBreakdown ? (
          <Card className="border-[#D1D7DC] shadow-xs">
            <CardHeader className="border-b border-[#E2E8F0] pb-2.5">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Branch Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <ul className="space-y-1.5">
                {data.branchBreakdown.map((b) => (
                  <li key={b.branchName} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-1.5 text-xs">
                    <span className="text-slate-800 font-medium">{b.branchName}</span>
                    <span className="text-xs text-slate-500"><span className="font-bold text-slate-900">{b.open}</span> open · {b.total} total</span>
                  </li>
                ))}
              </ul>
              <Link href="/admin" className="mt-3 inline-flex items-center text-xs font-semibold text-[#1F70C1] hover:underline">
                Master incident console <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {data.scope === "EMPLOYEE" && data.mine ? (
          <Card className="border-[#D1D7DC] shadow-xs">
            <CardHeader className="border-b border-[#E2E8F0] pb-2.5">
              <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                <TicketCheck className="h-4 w-4 text-[#1F70C1]" aria-hidden />
                My Queue Worklist
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-slate-50 border border-slate-200/60 px-2 py-2.5">
                  <p className="text-lg font-bold tabular-nums text-slate-900">{data.mine.open}</p>
                  <p className="text-[10px] uppercase font-bold text-slate-500">Assigned</p>
                </div>
                <div className="rounded-md bg-emerald-50 border border-emerald-200/60 px-2 py-2.5">
                  <p className="text-lg font-bold tabular-nums text-emerald-800">{data.mine.resolved}</p>
                  <p className="text-[10px] uppercase font-bold text-emerald-700">Resolved</p>
                </div>
                <div className="rounded-md bg-slate-50 border border-slate-200/60 px-2 py-2.5">
                  <p className="text-lg font-bold tabular-nums text-slate-700">{data.mine.total}</p>
                  <p className="text-[10px] uppercase font-bold text-slate-500">Lifetime</p>
                </div>
              </div>
              <Link href="/staff/tickets?mine=true" className="mt-3 inline-flex items-center text-xs font-semibold text-[#1F70C1] hover:underline">
                Open my active worklist <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-[#D1D7DC] shadow-xs">
          <CardHeader className="border-b border-[#E2E8F0] pb-2.5">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">
              ITIL SLA Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-3 text-xs text-slate-600">
            <div className="flex items-center justify-between px-1">
              <span>Average First Response</span>
              <span className="font-bold tabular-nums text-slate-900">{data.avgFirstResponseMinutes ?? "—"} min</span>
            </div>
            <div className="flex items-center justify-between px-1">
              <span>Average Resolution SLA</span>
              <span className="font-bold tabular-nums text-slate-900">{data.avgResolutionHours ?? "—"} h</span>
            </div>
            <p className="pt-1 text-[11px] text-slate-400">Calculated across active SLA contracts.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
