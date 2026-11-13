"use client";

// Role-aware dashboard: support employee workspace, branch manager overview,
// or central support summary. Data comes from /api/v1/support/dashboard/summary.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/staff-nav";
import { TICKET_STATUSES } from "@/lib/types";
import { AlertCircle, ArrowRight, Clock3, Inbox, TriangleAlert, Users } from "lucide-react";

interface Summary {
  scope: "EMPLOYEE" | "BRANCH" | "CENTRAL";
  user: { name: string; role: string; branchName?: string | null };
  counts: Record<string, number>;
  branchName?: string;
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
    data.scope === "EMPLOYEE" ? "My workspace" : data.scope === "BRANCH" ? `Branch — ${data.branchName}` : "Central support";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0a2350]">
            {data.scope === "EMPLOYEE" ? "My Tickets" : data.scope === "BRANCH" ? "Branch Overview" : "Central Support Overview"}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {scopeLabel} · Welcome back, {data.user.name.split(" ")[0]}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/staff/tickets" className="text-sm font-medium text-[#2c6bdf] hover:underline">
            View all tickets →
          </Link>
          {data.scope !== "EMPLOYEE" ? (
            <Link href="/staff/assignment" className="text-sm font-medium text-[#2c6bdf] hover:underline">
              Assignment queue →
            </Link>
          ) : null}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {TICKET_STATUSES.map((s) => (
          <Link key={s} href={`/staff/tickets?status=${s}`}>
            <Card className="transition hover:border-[#2c6bdf]/40 hover:shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-slate-500">{STATUS_TITLES[s]}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-[#0a2350]">{c[s] ?? 0}</p>
                <div className="mt-2"><StatusBadge status={s} /></div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#0a2350]"><Inbox className="h-4 w-4 text-[#2c6bdf]" aria-hidden />Attention needed</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-md bg-amber-50 px-3 py-2">
              <span className="flex items-center gap-2 text-amber-900"><Clock3 className="h-4 w-4 text-amber-500" aria-hidden />Unassigned (new complaints)</span>
              <span className="font-bold tabular-nums text-amber-900">{c.unassigned ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-red-50 px-3 py-2">
              <span className="flex items-center gap-2 text-red-900"><TriangleAlert className="h-4 w-4 text-red-500" aria-hidden />Overdue (SLA breach risk)</span>
              <span className="font-bold tabular-nums text-red-900">{c.overdue ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
              <span className="flex items-center gap-2 text-slate-700"><Users className="h-4 w-4 text-slate-400" aria-hidden />Total tickets</span>
              <span className="font-bold tabular-nums text-slate-700">{c.total ?? 0}</span>
            </div>
          </CardContent>
        </Card>

        {data.scope === "BRANCH" && data.employees ? (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-[#0a2350]">My team availability</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {data.employees.map((e) => (
                  <li key={e.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-1.5 text-sm">
                    <span className="text-slate-700">{e.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.isActive && e.availabilityEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {e.isActive ? (e.availabilityEnabled ? `Available · ${e.openCount} open` : "Unavailable") : "Inactive"}
                    </span>
                  </li>
                ))}
              </ul>
              <Link href="/staff/employees" className="mt-3 inline-flex items-center text-xs font-medium text-[#2c6bdf] hover:underline">
                Manage availability <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {data.scope === "CENTRAL" && data.branchBreakdown ? (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-[#0a2350]">Branch snapshot</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {data.branchBreakdown.map((b) => (
                  <li key={b.branchName} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-1.5 text-sm">
                    <span className="text-slate-700">{b.branchName}</span>
                    <span className="text-xs text-slate-500"><span className="font-bold text-[#0a2350]">{b.open}</span> open · {b.total} total</span>
                  </li>
                ))}
              </ul>
              <Link href="/admin" className="mt-3 inline-flex items-center text-xs font-medium text-[#2c6bdf] hover:underline">
                Master complaint panel <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-[#0a2350]">SLA performance</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <div className="flex items-center justify-between px-1">
              <span>Avg first response</span>
              <span className="font-bold tabular-nums text-[#0a2350]">{data.avgFirstResponseMinutes ?? "—"} min</span>
            </div>
            <div className="flex items-center justify-between px-1">
              <span>Avg resolution time</span>
              <span className="font-bold tabular-nums text-[#0a2350]">{data.avgResolutionHours ?? "—"} h</span>
            </div>
            <p className="pt-1 text-xs text-slate-400">Measured across all tickets in scope.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
