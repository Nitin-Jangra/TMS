"use client";

// Employee availability management (branch managers + central). Toggling
// availability triggers the unassigned-queue retry for that branch.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UsersRound } from "lucide-react";

interface Employee {
  id: string; name: string; email: string; designation: string;
  isActive: boolean; availabilityEnabled: boolean; branch: { code: string; name: string };
}

export default function EmployeesPage() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [busy, setBusy] = useState("");
  const [restricted, setRestricted] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/support/employees");
    const body = await res.json();
    if (body.success) {
      setEmployees(body.data.employees);
      setRestricted(body.data.restricted);
    } else setEmployees([]);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(e: Employee, enabled: boolean) {
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
        description: retry ? `Unassigned queue retry: ${retry.assigned} assigned, ${retry.remaining} remaining.` : undefined,
      });
      await load();
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#0a2350]">Employee availability</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Only available, active support employees participate in their branch round-robin queue.
        </p>
      </div>

      {restricted ? (
        <Card><CardContent className="p-6 text-sm text-slate-500">Your role cannot manage availability.</CardContent></Card>
      ) : employees === null ? (
        <Skeleton className="h-64" />
      ) : employees.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-slate-400">No support employees found.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {employees.map((e) => (
            <Card key={e.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#0a2350]">
                  <UsersRound className="h-4 w-4 text-[#2c6bdf]" aria-hidden />{e.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-slate-500">{e.designation} · {e.branch.name} ({e.branch.code})</p>
                <p className="font-mono text-[11px] text-slate-400">{e.email}</p>
                <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="text-xs font-medium text-slate-600">Complaint assignment</span>
                  {busy === e.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-medium ${e.isActive ? (e.availabilityEnabled ? "text-emerald-700" : "text-slate-500") : "text-red-600"}`}>
                        {e.isActive ? (e.availabilityEnabled ? "In rotation" : "Unavailable") : "Inactive"}
                      </span>
                      <Switch
                        checked={e.availabilityEnabled}
                        disabled={!e.isActive}
                        onCheckedChange={(v) => toggle(e, v)}
                        aria-label={`Toggle availability for ${e.name}`}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
