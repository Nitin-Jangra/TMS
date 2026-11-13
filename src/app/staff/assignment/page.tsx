"use client";

// Assignment queue: unassigned NEW_COMPLAINT tickets + branch round-robin
// state (eligible employees, cursor). Central roles pick a branch; managers
// are scoped to their own branch. Manual assign with one click.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PriorityBadge, StatusBadge } from "@/components/staff-nav";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeftRight, Inbox, Loader2, RefreshCcw, Users } from "lucide-react";

interface UnassignedTicket {
  id: string; ticketNumber: string; customerName: string; priority: string; status: string;
  createdAt: string; branch: { name: string }; category: { name: string };
}
interface QueueData {
  branch: { id: string; name: string };
  eligible: { id: string; name: string; designation: string }[];
  all: { id: string; name: string; isActive: boolean; availabilityEnabled: boolean }[];
  cursorLastEmployeeId: string | null;
}

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export default function AssignmentPage() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [tickets, setTickets] = useState<UnassignedTicket[] | null>(null);
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [busy, setBusy] = useState("");
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    fetch("/api/v1/auth/me").then((r) => r.json()).then((d) => {
      const role = d.data?.user?.role as string;
      if (role === "BRANCH_MANAGER" && d.data?.user?.branchId) {
        setIsManager(true);
        setBranchId(d.data.user.branchId);
      } else {
        fetch("/api/v1/admin/branches").then((r) => r.json()).then((bd) => {
          const list = bd.data?.branches ?? [];
          setBranches(list);
          if (list.length) setBranchId(list[0].id);
        });
      }
    });
  }, []);

  const load = useCallback(async () => {
    if (!branchId) return;
    setTickets(null);
    setQueue(null);
    const [tRes, qRes] = await Promise.all([
      fetch("/api/v1/support/assignment/unassigned"),
      fetch(`/api/v1/support/assignment/eligible-employees/${branchId}`),
    ]);
    const [tBody, qBody] = await Promise.all([tRes.json(), qRes.json()]);
    if (tBody.success) {
      const all: UnassignedTicket[] = tBody.data.tickets;
      setTickets(all.filter((t) => t.branch.id === branchId));
    } else setTickets([]);
    if (qBody.success) setQueue(qBody.data);
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  async function assign(ticketId: string, employeeId: string, employeeName: string) {
    setBusy(ticketId);
    try {
      const res = await fetch(`/api/v1/support/tickets/${ticketId}/assign`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        toast({ title: "Assignment failed", description: body.error?.message, variant: "destructive" });
        return;
      }
      toast({ title: `Assigned to ${employeeName}` });
      await load();
    } finally {
      setBusy("");
    }
  }

  async function retryQueue() {
    setBusy("__retry");
    try {
      // Manual retry: assign happens via employee availability retry sweep; here we
      // simply reload to reflect the latest state after the background worker runs.
      await fetch("/api/v1/admin/workers/run", { method: "POST" }).catch(() => undefined);
      await load();
      toast({ title: "Queue refreshed", description: "Background workers re-ran the round-robin retry." });
    } finally {
      setBusy("");
    }
  }

  const cursorName = queue?.all.find((e) => e.id === queue.cursorLastEmployeeId)?.name || "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0a2350]">Assignment queue</h1>
          <p className="mt-0.5 text-sm text-slate-500">Branch-wise round-robin assignment. Tickets stay New Complaint until an eligible employee is picked.</p>
        </div>
        {!isManager && branches.length > 0 ? (
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-[220px]" aria-label="Select branch"><SelectValue /></SelectTrigger>
            <SelectContent>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : null}
        <Button variant="outline" size="sm" onClick={retryQueue} disabled={busy === "__retry"}>
          {busy === "__retry" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCcw className="mr-2 h-3.5 w-3.5" aria-hidden />}
          Retry round-robin
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#0a2350]">
              <Inbox className="h-4 w-4 text-[#2c6bdf]" aria-hidden />Unassigned tickets
              {tickets ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{tickets.length}</span> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {tickets === null ? (
              <Skeleton className="h-24" />
            ) : tickets.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                No unassigned tickets in this branch — the round-robin queue is fully drained.
              </p>
            ) : (
              tickets.map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Link href={`/staff/tickets/${t.id}`} className="font-mono text-sm font-bold text-[#0a2350] hover:underline">{t.ticketNumber}</Link>
                      <p className="text-xs text-slate-500">{t.customerName} · {t.category.name} · {fmt(t.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <PriorityBadge priority={t.priority} />
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                  {queue && queue.eligible.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5">
                      <span className="text-[11px] font-medium text-slate-400">Assign to:</span>
                      {queue.eligible.map((e) => (
                        <Button key={e.id} variant="outline" size="sm" className="h-7 text-xs" disabled={busy === t.id}
                          onClick={() => assign(t.id, e.id, e.name)}>
                          {busy === t.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden /> : <ArrowLeftRight className="mr-1 h-3 w-3" aria-hidden />}
                          {e.name}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 rounded bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                      No eligible employees in this branch. Make someone available from the Employees page — the retry sweep will assign automatically.
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#0a2350]">
              <Users className="h-4 w-4 text-[#2c6bdf]" aria-hidden />Round-robin state
            </CardTitle>
          </CardHeader>
          <CardContent>
            {queue === null ? (
              <Skeleton className="h-40" />
            ) : (
              <div className="space-y-3">
                <div className="rounded-md bg-slate-50 p-3 text-xs">
                  <p className="font-medium text-slate-600">Cursor (last assigned)</p>
                  <p className="mt-1 text-[#0a2350]">{cursorName} — next ticket goes to the next employee in rotation.</p>
                </div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Support employees</p>
                <ul className="space-y-1.5">
                  {queue.all.map((e) => (
                    <li key={e.id} className="flex items-center justify-between rounded border border-slate-100 px-2.5 py-1.5 text-xs">
                      <span className="text-slate-700">{e.name}</span>
                      <span className={`rounded-full px-2 py-0.5 font-medium ${queue.eligible.some((x) => x.id === e.id) ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {queue.eligible.some((x) => x.id === e.id) ? "In rotation" : "Skipped"}
                      </span>
                    </li>
                  ))}
                  {queue.all.length === 0 ? <li className="text-xs text-slate-400">No support employees in this branch.</li> : null}
                </ul>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Equal FIFO distribution: each available employee receives the same number of tickets
                  over a complete cycle. Queues are independent per branch.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
