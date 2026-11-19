"use client";

// Root Admin configuration: central/branch notification emails (blank until
// FitClass supplies them), closure policy, categories, SLA policies,
// notification preferences, upload restrictions. All changes audited.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/types";
import { Building2, Loader2, Mail, Network, Save, Settings2, Tags, TimerReset, Webhook, Workflow } from "lucide-react";
import { DepartmentsPanel } from "@/components/admin/departments-panel";
import { AutomationPanel } from "@/components/admin/automation-panel";

interface Settings { [key: string]: string }
interface Branch { id: string; code: string; name: string; notificationEmail: string; isActive: boolean }
interface Category { id: string; name: string; isActive: boolean }
interface SlaPolicy { id: string; priority: string; responseTargetMinutes: number; resolutionTargetMinutes: number }

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [busy, setBusy] = useState("");
  const [newCategory, setNewCategory] = useState("");

  const load = useCallback(async () => {
    const [sRes, bRes, cRes, pRes] = await Promise.all([
      fetch("/api/v1/admin/settings"),
      fetch("/api/v1/admin/branches"),
      fetch("/api/v1/public/categories"),
      fetch("/api/v1/admin/sla"),
    ]);
    const [sBody, bBody, cBody, pBody] = await Promise.all([sRes.json(), bRes.json(), cRes.json(), pRes.json()]);
    if (sBody.success) setSettings(sBody.data.settings);
    if (bBody.success) setBranches(bBody.data.branches);
    if (cBody.success) setCategories(cBody.data.categories);
    if (pBody.success) setPolicies(pBody.data.policies);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveGeneral() {
    if (!settings) return;
    setBusy("general");
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settings: {
            central_support_email: settings.central_support_email,
            webhook_url: (settings.webhook_url || "").trim(),
            webhook_secret: settings.webhook_secret || "",
            max_upload_mb: settings.max_upload_mb,
            allowed_upload_types: settings.allowed_upload_types,
            notification_customer_enabled: settings.notification_customer_enabled,
            notification_branch_enabled: settings.notification_branch_enabled,
            notification_central_enabled: settings.notification_central_enabled,
            maintenance_mode: settings.maintenance_mode,
            staff_cross_branch_access: settings.staff_cross_branch_access ?? "true",
            agents_can_reassign: settings.agents_can_reassign ?? "true",
          },
          reason: "Updated via settings panel",
        }),
      });
      const body = await res.json();
      toast(body.success ? { title: "Settings saved", description: "All changes recorded in the configuration audit." } : { title: "Save failed", description: body.error?.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  }

  async function saveClosure() {
    if (!settings) return;
    setBusy("closure");
    try {
      const res = await fetch("/api/v1/admin/settings/closure-policy", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reopenWindowHours: Number(settings.reopen_window_hours),
          autoClosureEnabled: settings.auto_closure_enabled === "true",
          applyToExisting: false,
        }),
      });
      const body = await res.json();
      toast(body.success ? { title: "Closure policy updated", description: `${body.data.reopenWindowHours}h reopening window. Existing resolved tickets keep their stored deadlines.` } : { title: "Save failed", description: body.error?.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  }

  async function saveBranchEmail(b: Branch, email: string) {
    setBusy(b.id);
    try {
      const res = await fetch("/api/v1/admin/branches", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: b.id, notificationEmail: email }),
      });
      const body = await res.json();
      if (body.success) {
        toast({ title: `Branch email saved for ${b.name}`, description: email ? "Branch notifications will be delivered here." : "Email left blank — branch notifications are skipped until set." });
        await load();
      } else {
        toast({ title: "Save failed", description: body.error?.message, variant: "destructive" });
      }
    } finally {
      setBusy("");
    }
  }

  async function saveSla() {
    setBusy("sla");
    try {
      const res = await fetch("/api/v1/admin/sla", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ policies: policies.map((p) => ({ priority: p.priority, responseTargetMinutes: p.responseTargetMinutes, resolutionTargetMinutes: p.resolutionTargetMinutes })) }),
      });
      const body = await res.json();
      toast(body.success ? { title: "SLA policies updated" } : { title: "Save failed", description: body.error?.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  }

  async function addCategory() {
    if (newCategory.trim().length < 2) return;
    setBusy("cat");
    try {
      const res = await fetch("/api/v1/admin/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newCategory.trim() }) });
      const body = await res.json();
      if (body.success) {
        toast({ title: "Category added" });
        setNewCategory("");
        await load();
      } else {
        toast({ title: "Failed", description: body.error?.message, variant: "destructive" });
      }
    } finally {
      setBusy("");
    }
  }

  async function toggleCategory(c: Category) {
    setBusy(c.id);
    try {
      await fetch("/api/v1/admin/categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: c.id, isActive: !c.isActive }) });
      await load();
    } finally {
      setBusy("");
    }
  }

  if (!settings) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#0a2350]">System settings</h1>
        <p className="mt-0.5 text-sm text-slate-500">Every change is audited with previous value, new value, actor and timestamp.</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="flex-wrap">
          <TabsTrigger value="general" className="gap-1.5"><Settings2 className="h-3.5 w-3.5" aria-hidden />General</TabsTrigger>
          <TabsTrigger value="branches" className="gap-1.5"><Building2 className="h-3.5 w-3.5" aria-hidden />Branch emails</TabsTrigger>
          <TabsTrigger value="closure" className="gap-1.5"><TimerReset className="h-3.5 w-3.5" aria-hidden />Closure policy</TabsTrigger>
          <TabsTrigger value="categories" className="gap-1.5"><Tags className="h-3.5 w-3.5" aria-hidden />Categories</TabsTrigger>
          <TabsTrigger value="sla" className="gap-1.5"><TimerReset className="h-3.5 w-3.5" aria-hidden />SLA</TabsTrigger>
          <TabsTrigger value="departments" className="gap-1.5"><Network className="h-3.5 w-3.5" aria-hidden />Departments</TabsTrigger>
          <TabsTrigger value="automation" className="gap-1.5"><Workflow className="h-3.5 w-3.5" aria-hidden />Automation</TabsTrigger>
        </TabsList>

        <TabsContent value="departments"><DepartmentsPanel /></TabsContent>
        <TabsContent value="automation"><AutomationPanel /></TabsContent>

        {/* General */}
        <TabsContent value="general">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-[#0a2350]">General configuration</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border border-dashed border-[#2c6bdf]/40 bg-[#eaf1fb]/50 p-4">
                <Label htmlFor="central_email" className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-[#2c6bdf]" aria-hidden />Central support email</Label>
                <Input id="central_email" type="email" className="mt-1.5" placeholder="Currently blank — FitClass will provide the official support mailbox" value={settings.central_support_email} onChange={(e) => setSettings((s) => ({ ...s!, central_support_email: e.target.value }))} />
                <p className="mt-1.5 text-xs text-slate-500">Left blank as requested. Central support notifications are recorded as SKIPPED until an address is set.</p>
              </div>

              <div className="rounded-lg border border-dashed border-[#2c6bdf]/40 bg-[#eaf1fb]/50 p-4">
                <Label htmlFor="webhook_url" className="flex items-center gap-1.5"><Webhook className="h-3.5 w-3.5 text-[#2c6bdf]" aria-hidden />LMS webhook URL</Label>
                <Input id="webhook_url" type="url" className="mt-1.5" placeholder="https://lms.fitclass.in/hooks/complaints (blank = webhooks off)" value={settings.webhook_url || ""} onChange={(e) => setSettings((s) => ({ ...s!, webhook_url: e.target.value }))} />
                <Label htmlFor="webhook_secret" className="mt-3 block">Webhook signing secret</Label>
                <Input id="webhook_secret" type="password" autoComplete="off" className="mt-1.5" placeholder="At least 16 characters, shared with the LMS" value={settings.webhook_secret || ""} onChange={(e) => setSettings((s) => ({ ...s!, webhook_secret: e.target.value }))} />
                <p className="mt-1.5 text-xs text-slate-500">Every ticket event (created, assigned, status changed, resolved, reopened, closed, escalated, message added) is POSTed to this URL, signed with the secret. See /docs/api.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="max_upload_mb">Max upload size (MB)</Label>
                  <Input id="max_upload_mb" type="number" min={1} max={50} value={settings.max_upload_mb} onChange={(e) => setSettings((s) => ({ ...s!, max_upload_mb: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="allowed_types">Allowed upload MIME types (comma separated)</Label>
                  <Input id="allowed_types" value={settings.allowed_upload_types} onChange={(e) => setSettings((s) => ({ ...s!, allowed_upload_types: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-2.5">
                {[
                  { key: "notification_customer_enabled", label: "Customer notifications", desc: "Acknowledgement, status, hold, resolution, closure emails to customers" },
                  { key: "notification_branch_enabled", label: "Branch notifications", desc: "New complaint alerts to branch mailbox" },
                  { key: "notification_central_enabled", label: "Central support notifications", desc: "New complaint + escalation alerts to central mailbox" },
                  { key: "maintenance_mode", label: "Maintenance mode", desc: "Show maintenance notice on the customer portal" },
                  { key: "staff_cross_branch_access", label: "Cross-branch ticket access", desc: "Branch staff can search, view and work on tickets of every branch (cover for colleagues on leave)" },
                  { key: "agents_can_reassign", label: "Support agents can reassign", desc: "Support agents can hand a ticket to another employee or branch (branch managers and central staff always can)" },
                ].map((row) => (
                  <div key={row.key} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{row.label}</p>
                      <p className="text-xs text-slate-400">{row.desc}</p>
                    </div>
                    <Switch
                      checked={(settings[row.key] ?? ("defaultOn" in row && row.defaultOn ? "true" : "false")) === "true"}
                      onCheckedChange={(v) => setSettings((s) => ({ ...s!, [row.key]: String(v) }))}
                      aria-label={row.label}
                    />
                  </div>
                ))}
              </div>

              <Button onClick={saveGeneral} disabled={busy === "general"} className="bg-[#0a2350] hover:bg-[#10306b]">
                {busy === "general" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />}Save general settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Branch emails */}
        <TabsContent value="branches">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-[#0a2350]">Branch notification emails</CardTitle>
              <p className="text-xs text-slate-500">Blank by default per FitClass instruction. Set an email when the branch mailbox is ready — notifications start flowing on the next complaint.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {branches.map((b) => (
                <div key={b.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center">
                  <div className="sm:w-56">
                    <p className="text-sm font-medium text-[#0a2350]">{b.name}</p>
                    <p className="text-[11px] text-slate-400">{b.code} · {b.isActive ? "Active" : "Inactive"}</p>
                  </div>
                  <Input
                    type="email"
                    placeholder="branch@fitclass.in (blank for now)"
                    defaultValue={b.notificationEmail}
                    id={`branch-email-${b.id}`}
                    className="flex-1"
                  />
                  <Button size="sm" variant="outline" disabled={busy === b.id} onClick={() => saveBranchEmail(b, (document.getElementById(`branch-email-${b.id}`) as HTMLInputElement).value.trim())}>
                    {busy === b.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden />}Save
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Closure policy */}
        <TabsContent value="closure">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-[#0a2350]">Reopening window & automatic closure</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="reopen_hours">Reopening window (hours)</Label>
                  <Input id="reopen_hours" type="number" min={1} max={720} value={settings.reopen_window_hours} onChange={(e) => setSettings((s) => ({ ...s!, reopen_window_hours: e.target.value }))} />
                  <p className="mt-1.5 text-xs text-slate-500">Resolved tickets auto-close after this window. Never hardcoded — configurable any time.</p>
                </div>
                <div className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2.5 self-end">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Automatic closure enabled</p>
                    <p className="text-xs text-slate-400">Background worker sweeps due jobs every 60 seconds</p>
                  </div>
                  <Switch checked={settings.auto_closure_enabled === "true"} onCheckedChange={(v) => setSettings((s) => ({ ...s!, auto_closure_enabled: String(v) }))} aria-label="Automatic closure" />
                </div>
              </div>
              <p className="rounded-md bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
                Changing the window affects NEW resolutions only. Existing resolved tickets keep their stored
                deadline (stored per-ticket <span className="font-mono">auto_close_at</span>) unless you explicitly
                re-apply the policy — which would immediately close tickets whose new deadline already passed.
              </p>
              <Button onClick={saveClosure} disabled={busy === "closure"} className="bg-[#0a2350] hover:bg-[#10306b]">
                {busy === "closure" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />}Save closure policy
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories */}
        <TabsContent value="categories">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-[#0a2350]">Complaint categories</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder="New category name" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }} />
                <Button onClick={addCategory} disabled={busy === "cat" || newCategory.trim().length < 2} className="bg-[#0a2350] hover:bg-[#10306b]">
                  {busy === "cat" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}Add
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {categories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2">
                    <span className={`text-sm ${c.isActive ? "text-slate-700" : "text-slate-400 line-through"}`}>{c.name}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-medium ${c.isActive ? "text-emerald-700" : "text-slate-400"}`}>{c.isActive ? "Active" : "Disabled"}</span>
                      <Switch checked={c.isActive} onCheckedChange={() => toggleCategory(c)} disabled={busy === c.id} aria-label={`Toggle ${c.name}`} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SLA */}
        <TabsContent value="sla">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-[#0a2350]">SLA policies (minutes)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm" aria-label="SLA policies">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="pb-2 font-medium">Priority</th>
                      <th className="pb-2 font-medium">First response target</th>
                      <th className="pb-2 font-medium">Resolution target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policies.map((p, idx) => (
                      <tr key={p.id} className="border-b border-slate-100">
                        <td className="py-2 font-medium text-[#0a2350]">{PRIORITY_LABELS[priority(p, PRIORITIES)] || p.priority}</td>
                        <td className="py-2 pr-4">
                          <Input type="number" min={1} value={p.responseTargetMinutes} onChange={(e) => setPolicies((ps) => ps.map((x, i) => (i === idx ? { ...x, responseTargetMinutes: Number(e.target.value) } : x)))} className="h-8 w-28" aria-label={`Response target for ${p.priority}`} />
                        </td>
                        <td className="py-2">
                          <Input type="number" min={1} value={p.resolutionTargetMinutes} onChange={(e) => setPolicies((ps) => ps.map((x, i) => (i === idx ? { ...x, resolutionTargetMinutes: Number(e.target.value) } : x)))} className="h-8 w-28" aria-label={`Resolution target for ${p.priority}`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button onClick={saveSla} disabled={busy === "sla"} className="bg-[#0a2350] hover:bg-[#10306b]">
                {busy === "sla" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />}Save SLA policies
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function priority(p: SlaPolicy, list: readonly string[]): string {
  return list.includes(p.priority) ? p.priority : "MEDIUM";
}
