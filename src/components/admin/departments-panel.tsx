"use client";

// Settings → Departments: create / rename / switch off departments (assignment
// groups), set an optional team mailbox, and map each complaint category to a
// department (the routing rule used when a complaint comes in).

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Save } from "lucide-react";

interface Department {
  id: string;
  name: string;
  description: string;
  email: string;
  isActive: boolean;
  staffCount: number;
  categories: { id: string; name: string }[];
}

export function DepartmentsPanel() {
  const { toast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { name: string; email: string; description: string }>>({});
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const [d, c] = await Promise.all([
      fetch("/api/v1/support/departments?includeInactive=true").then((r) => r.json()).catch(() => ({})),
      fetch("/api/v1/public/categories").then((r) => r.json()).catch(() => ({})),
    ]);
    const list: Department[] = d.data?.departments ?? [];
    setDepartments(list);
    setDrafts(Object.fromEntries(list.map((x) => [x.id, { name: x.name, email: x.email, description: x.description }])));
    setCategories(c.data?.categories ?? []);
  }, []);
   
  useEffect(() => { load(); }, [load]);

  const deptOfCategory = new Map<string, string>();
  for (const d of departments) for (const c of d.categories) deptOfCategory.set(c.id, d.id);

  const call = async (key: string, url: string, method: string, payload: unknown, okMsg: string) => {
    setBusy(key);
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!body.success) {
        toast({ title: "Failed", description: body.error?.message, variant: "destructive" });
        return false;
      }
      toast({ title: okMsg });
      await load();
      return true;
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#0a2350]">Departments</CardTitle>
          <p className="text-xs text-slate-500">
            Each complaint goes to the department of its category. Employees join a department on the Employees page;
            employees without a department are generalists and pick up anything in their branch.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="New department name, e.g. Spa & Steam" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={async (e) => { if (e.key === "Enter" && newName.trim().length >= 2 && await call("new", "/api/v1/admin/departments", "POST", { name: newName.trim() }, "Department added")) setNewName(""); }} />
            <Button disabled={busy === "new" || newName.trim().length < 2} className="bg-[#0a2350] hover:bg-[#10306b]"
              onClick={async () => { if (await call("new", "/api/v1/admin/departments", "POST", { name: newName.trim() }, "Department added")) setNewName(""); }}>
              {busy === "new" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Plus className="mr-1.5 h-4 w-4" aria-hidden />}Add
            </Button>
          </div>
          <div className="space-y-2">
            {departments.map((d) => {
              const draft = drafts[d.id] || { name: d.name, email: d.email, description: d.description };
              const dirty = draft.name !== d.name || draft.email !== d.email || draft.description !== d.description;
              return (
                <div key={d.id} className={`grid gap-2 rounded-md border px-3 py-2.5 md:grid-cols-[1.2fr_1.5fr_1.2fr_auto] md:items-center ${d.isActive ? "border-slate-100" : "border-dashed border-slate-200 bg-slate-50"}`}>
                  <div>
                    <Input className="h-8 text-sm" value={draft.name} maxLength={60} aria-label="Department name"
                      onChange={(e) => setDrafts((s) => ({ ...s, [d.id]: { ...draft, name: e.target.value } }))} />
                    <p className="mt-1 text-[11px] text-slate-400">
                      {d.staffCount} employee{d.staffCount === 1 ? "" : "s"} · {d.categories.length ? d.categories.map((c) => c.name).join(", ") : "no categories routed"}
                    </p>
                  </div>
                  <Input className="h-8 text-xs" value={draft.description} maxLength={200} placeholder="What this team handles" aria-label="Description"
                    onChange={(e) => setDrafts((s) => ({ ...s, [d.id]: { ...draft, description: e.target.value } }))} />
                  <Input className="h-8 text-xs" type="email" value={draft.email} placeholder="Team mailbox (optional)" aria-label="Team mailbox"
                    onChange={(e) => setDrafts((s) => ({ ...s, [d.id]: { ...draft, email: e.target.value } }))} />
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-8" disabled={!dirty || busy === d.id}
                      onClick={() => call(d.id, "/api/v1/admin/departments", "PATCH", { id: d.id, ...draft }, "Department saved")}>
                      {busy === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
                    </Button>
                    <Switch checked={d.isActive} disabled={busy === d.id} aria-label={`${d.isActive ? "Disable" : "Enable"} ${d.name}`}
                      onCheckedChange={(v) => call(d.id, "/api/v1/admin/departments", "PATCH", { id: d.id, isActive: v }, v ? "Department enabled" : "Department disabled")} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400">The team mailbox receives critical SLA escalations for its tickets.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#0a2350]">Routing rules — category → department</CardTitle>
          <p className="text-xs text-slate-500">Applies to new complaints. Existing tickets keep their department (move them from the ticket page or in bulk).</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2">
                <span className="text-sm text-slate-700">{c.name}</span>
                <Select value={deptOfCategory.get(c.id) || "none"} disabled={busy === c.id}
                  onValueChange={(v) => call(c.id, "/api/v1/admin/categories", "PATCH", { id: c.id, departmentId: v === "none" ? null : v }, `${c.name} routed`)}>
                  <SelectTrigger size="sm" className="h-8 w-[210px] text-xs" aria-label={`Department for ${c.name}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">General queue (any employee)</SelectItem>
                    {departments.filter((d) => d.isActive).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
