"use client";

// Employees (branch managers + central): availability (leave / away),
// department (assignment group), open workload and ticket handover.
// Marking someone unavailable hands their open tickets to available
// colleagues when "Auto handover on leave" is on (System Settings).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowRightLeft, Loader2, Search, UsersRound } from "lucide-react";

interface Employee {
  id: string;
  name: string;
  email: string;
  designation: string;
  isActive: boolean;
  availabilityEnabled: boolean;
  openTickets: number;
  branch: { code: string; name: string } | null;
  department: { id: string; name: string } | null;
}

interface Handover {
  moved: { ticketNumber: string; to: string }[];
  kept: string[];
}

function handoverText(h: Handover | null): string | undefined {
  if (!h || (!h.moved.length && !h.kept.length)) return undefined;
  const parts: string[] = [];
  if (h.moved.length) parts.push(`${h.moved.length} open ticket${h.moved.length === 1 ? "" : "s"} handed over`);
  if (h.kept.length) parts.push(`${h.kept.length} kept (no colleague available): ${h.kept.slice(0, 5).join(", ")}${h.kept.length > 5 ? "…" : ""}`);
  return parts.join(" · ");
}

export default function EmployeesPage() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState("");
  const [restricted, setRestricted] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/support/employees");
    const body = await res.json();
    if (body.success) {
      setEmployees(body.data.employees);
      setRestricted(body.data.restricted);
    } else setEmployees([]);
  }, []);

   
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/v1/support/departments").then((r) => r.json()).then((d) => setDepartments(d.data?.departments ?? [])).catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (employees || []).filter((e) => {
      const hay = `${e.name} ${e.email} ${e.branch?.name || ""} ${e.branch?.code || ""} ${e.department?.name || ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [employees, q]);

  async function toggle(e: Employee, enabled: boolean) {
    if (!enabled && e.openTickets > 0 && !window.confirm(`Mark ${e.name} as unavailable? Their ${e.openTickets} open ticket(s) will be handed to available colleagues.`)) return;
    setBusy(e.id);
    try {
      const res = await fetch(`/api/v1/support/employees/${e.id}/availability`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ availabilityEnabled: enabled }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        toast({ title: "Update failed", description: body.error?.message, variant: "destructive" });
        return;
      }
      const retry = body.data.retry as { assigned: number; remaining: number } | null;
      toast({
        title: `${e.name} is now ${enabled ? "available" : "unavailable"}`,
        description: retry ? `Unassigned queue retry: ${retry.assigned} assigned, ${retry.remaining} remaining.` : handoverText(body.data.handover),
      });
      await load();
    } finally {
      setBusy("");
    }
  }

  async function setDepartment(e: Employee, departmentId: string) {
    setBusy(e.id);
    try {
      const res = await fetch(`/api/v1/support/employees/${e.id}/department`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ departmentId: departmentId === "none" ? null : departmentId }),
      });
      const body = await res.json();
      if (!body.success) toast({ title: "Update failed", description: body.error?.message, variant: "destructive" });
      else toast({ title: `${e.name}: ${body.data.department?.name || "generalist (all categories)"}` });
      await load();
    } finally {
      setBusy("");
    }
  }

  async function handover(e: Employee) {
    if (!window.confirm(`Hand over ${e.name}'s ${e.openTickets} open ticket(s) to available colleagues now?`)) return;
    setBusy(e.id);
    try {
      const res = await fetch(`/api/v1/support/employees/${e.id}/handover`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await res.json();
      if (!body.success) toast({ title: "Handover failed", description: body.error?.message, variant: "destructive" });
      else toast({ title: "Handover done", description: handoverText(body.data) || "No open tickets to move." });
      await load();
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0a2350]">Employees</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-500">
            Available employees receive new complaints automatically — first from their department, then generalists.
            Turning availability off (leave / away) hands their open tickets to colleagues.
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
          <Input className="pl-8" placeholder="Search name, branch, department" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search employees" />
        </div>
      </div>

      {restricted ? (
        <Card><CardContent className="p-6 text-sm text-slate-500">Your role cannot manage employees.</CardContent></Card>
      ) : employees === null ? (
        <Skeleton className="h-64" />
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-slate-400">No support employees found.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e) => (
            <Card key={e.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-sm font-semibold text-[#0a2350]">
                  <span className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-[#2c6bdf]" aria-hidden />{e.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.openTickets ? "bg-[#22618b]/10 text-[#22618b]" : "bg-slate-100 text-slate-500"}`}>
                    {e.openTickets} open
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-slate-500">{e.designation || "Support"} · {e.branch?.name} ({e.branch?.code})</p>
                <p className="font-mono text-[11px] text-slate-400">{e.email}</p>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600">Department</span>
                  <Select value={e.department?.id || "none"} onValueChange={(v) => setDepartment(e, v)} disabled={busy === e.id}>
                    <SelectTrigger size="sm" className="h-8 w-[200px] text-xs" aria-label={`Department for ${e.name}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Generalist (all categories)</SelectItem>
                      {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="text-xs font-medium text-slate-600">Available for new tickets</span>
                  {busy === e.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-medium ${e.isActive ? (e.availabilityEnabled ? "text-emerald-700" : "text-amber-700") : "text-red-600"}`}>
                        {e.isActive ? (e.availabilityEnabled ? "Available" : "Away / on leave") : "Inactive"}
                      </span>
                      <Switch checked={e.availabilityEnabled} disabled={!e.isActive} onCheckedChange={(v) => toggle(e, v)} aria-label={`Toggle availability for ${e.name}`} />
                    </div>
                  )}
                </div>

                {e.openTickets > 0 ? (
                  <Button variant="outline" size="sm" className="h-8 w-full text-xs" disabled={busy === e.id} onClick={() => handover(e)}>
                    <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Hand over open tickets now
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
