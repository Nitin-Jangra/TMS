"use client";

// Master Admin complaint panel: how many complaints in which branch, what
// status each is in, and which lead is assigned to what — plus SLA averages
// and one-click worker triggers.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TICKET_STATUSES, STATUS_LABELS } from "@/lib/types";
import { Activity, Building2, Clock3, Inbox, Loader2, RefreshCcw, Table2, TriangleAlert, UsersRound } from "lucide-react";

interface Overview {
  totals: Record<string, number>;
  avgFirstResponseMinutes: number | null;
  avgResolutionHours: number | null;
  branches: {
    branchId: string; branchCode: string; branchName: string; notificationEmail: string;
    counts: Record<string, number>; total: number; unassigned: number; overdue: number;
    cursorLastEmployeeId: string;
    employees: { id: string; name: string; role: string; availabilityEnabled: boolean; isActive: boolean; openCount: number; totalAssigned: number; resolvedCount: number }[];
  }[];
}

const STATUS_DOT: Record<string, string> = {
  NEW_COMPLAINT: "bg-sky-500",
  IN_PROGRESS: "bg-blue-600",
  ON_HOLD: "bg-amber-500",
  RESOLVED: "bg-emerald-500",
  CLOSED: "bg-slate-400",
};

export default function MasterAdminPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/admin/overview");
    const body = await res.json();
    if (body.success) setData(body.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runWorkers() {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/admin/workers/run", { method: "POST" });
      const body = await res.json();
      if (body.success) {
        toast({ title: "Workers executed", description: `Closure sweep closed ${body.data.closure.closed}; assignment retry assigned ${body.data.assignment.assigned}.` });
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-7">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const t = data.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0a2350]">Master Complaint Panel</h1>
          <p className="mt-0.5 text-sm text-slate-500">All branches, all statuses, all assignments — refreshed live (generated {new Date(data.generatedAt).toLocaleTimeString("en-IN")}).</p>
        </div>
        <Button variant="outline" size="sm" onClick={runWorkers} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCcw className="mr-2 h-3.5 w-3.5" aria-hidden />}
          Run closure + assignment workers now
        </Button>
      </div>

      {/* Totals */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <Card className="border-[#0a2350]/20 bg-[#0a2350] text-white"><CardContent className="p-4"><p className="text-[11px] font-medium text-blue-200">Total complaints</p><p className="mt-1 text-3xl font-bold tabular-nums">{t.total}</p></CardContent></Card>
        {TICKET_STATUSES.map((s) => (
          <Card key={s}><CardContent className="p-4"><p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} aria-hidden />{STATUS_LABELS[s]}</p><p className="mt-1 text-3xl font-bold tabular-nums text-[#0a2350]">{t[s] ?? 0}</p></CardContent></Card>
        ))}
        <Card><CardContent className="p-4"><p className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600"><Inbox className="h-3 w-3" aria-hidden />Unassigned</p><p className="mt-1 text-3xl font-bold tabular-nums text-amber-700">{t.unassigned}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="flex items-center gap-1.5 text-[11px] font-medium text-red-600"><TriangleAlert className="h-3 w-3" aria-hidden />Overdue</p><p className="mt-1 text-3xl font-bold tabular-nums text-red-700">{t.overdue}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><Clock3 className="h-3 w-3" aria-hidden />Avg first response</p><p className="mt-1 text-2xl font-bold tabular-nums text-[#0a2350]">{data.avgFirstResponseMinutes ?? "—"}<span className="text-sm font-medium text-slate-400"> min</span></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><Activity className="h-3 w-3" aria-hidden />Avg resolution</p><p className="mt-1 text-2xl font-bold tabular-nums text-[#0a2350]">{data.avgResolutionHours ?? "—"}<span className="text-sm font-medium text-slate-400"> h</span></p></CardContent></Card>
      </div>

      {/* Branch x status matrix */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#0a2350]">
            <Table2 className="h-4 w-4 text-[#2c6bdf]" aria-hidden />Complaints by branch and status
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm" aria-label="Branch status matrix">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4 font-medium">Branch</th>
                {TICKET_STATUSES.map((s) => <th key={s} className="pb-2 pr-4 text-center font-medium">{STATUS_LABELS[s]}</th>)}
                <th className="pb-2 pr-4 text-center font-medium">Total</th>
                <th className="pb-2 text-center font-medium">Unassigned</th>
              </tr>
            </thead>
            <tbody>
              {data.branches.map((b) => (
                <tr key={b.branchId} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 pr-4">
                    <p className="font-medium text-[#0a2350]">{b.branchName}</p>
                    <p className="text-[11px] text-slate-400">{b.branchCode} · email: {b.notificationEmail ? b.notificationEmail : <span className="italic text-slate-400">not set (blank)</span>}</p>
                  </td>
                  {TICKET_STATUSES.map((s) => (
                    <td key={s} className="py-2.5 pr-4 text-center">
                      <span className={`inline-flex min-w-[34px] justify-center rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums ${b.counts[s] ? "bg-slate-100 text-[#0a2350]" : "text-slate-300"}`}>
                        {b.counts[s] ?? 0}
                      </span>
                    </td>
                  ))}
                  <td className="py-2.5 pr-4 text-center font-bold tabular-nums text-[#0a2350]">{b.total}</td>
                  <td className="py-2.5 text-center">
                    {b.unassigned ? <span className="rounded-md bg-amber-100 px-2 py-0.5 text-sm font-bold text-amber-800">{b.unassigned}</span> : <span className="text-slate-300">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Assignment overview */}
      <div className="grid gap-4 md:grid-cols-2">
        {data.branches.map((b) => (
          <Card key={b.branchId}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-semibold text-[#0a2350]">
                <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-[#2c6bdf]" aria-hidden />{b.branchName}</span>
                <span className="text-[11px] font-normal text-slate-400">cursor → {b.employees.find((e) => e.id === b.cursorLastEmployeeId)?.name || "—"}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {b.employees.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                  No support employees in this branch — new complaints land in the unassigned queue.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {b.employees.map((e) => (
                    <li key={e.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <UsersRound className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        <span>
                          <span className="text-slate-700">{e.name}</span>
                          <span className="text-[11px] text-slate-400"> · {e.role === "BRANCH_MANAGER" ? "Manager" : "Support"}</span>
                        </span>
                      </span>
                      <span className="flex items-center gap-3 text-[11px]">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${e.isActive ? (e.availabilityEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500") : "bg-red-50 text-red-600"}`}>
                          {e.isActive ? (e.availabilityEnabled ? "In rotation" : "Unavailable") : "Inactive"}
                        </span>
                        <span className="tabular-nums text-slate-600"><strong className="text-[#0a2350]">{e.openCount}</strong> open · <strong className="text-[#0a2350]">{e.resolvedCount}</strong> done</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex gap-3 text-[11px] text-slate-400">
                <Link href={`/staff/tickets?branchId=${b.branchId}`} className="text-[#2c6bdf] hover:underline">View branch tickets</Link>
                <Link href="/staff/assignment" className="text-[#2c6bdf] hover:underline">Assignment queue</Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
