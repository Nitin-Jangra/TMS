"use client";

// Settings → Automation: assignment strategy, leave handover, SLA escalation
// ladder, daily digest, member feedback and the public link used in emails.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Save } from "lucide-react";

const KEYS = [
  "assignment_strategy", "auto_handover_on_leave", "escalation_enabled", "escalation_warn_percent", "escalation_critical_percent",
  "digest_enabled", "digest_hour", "feedback_enabled", "public_base_url",
] as const;
type Key = (typeof KEYS)[number];

function Row({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2.5">
      <div className="max-w-xl">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">{desc}</p>
      </div>
      {children}
    </div>
  );
}

export function AutomationPanel() {
  const { toast } = useToast();
  const [s, setS] = useState<Record<Key, string> | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const body = await fetch("/api/v1/admin/settings").then((r) => r.json()).catch(() => ({}));
    if (body.success) setS(Object.fromEntries(KEYS.map((k) => [k, body.data.settings[k] ?? ""])) as Record<Key, string>);
  }, []);
   
  useEffect(() => { load(); }, [load]);

  if (!s) return <Card><CardContent className="p-6 text-sm text-slate-400">Loading…</CardContent></Card>;
  const set = (k: Key, v: string) => setS((cur) => (cur ? { ...cur, [k]: v } : cur));
  const on = (k: Key) => s[k] !== "false";

  const save = async () => {
    const warn = Number(s.escalation_warn_percent);
    const crit = Number(s.escalation_critical_percent);
    if (!(warn >= 10 && warn <= 99) || !(crit >= 101 && crit <= 1000)) {
      toast({ title: "Check the escalation percentages", description: "Reminder: 10–99%. Critical: 101–1000%.", variant: "destructive" });
      return;
    }
    if (s.public_base_url && !/^https?:\/\/[^\s]+$/.test(s.public_base_url.trim())) {
      toast({ title: "Public link must start with https://", variant: "destructive" });
      return;
    }
    setBusy("save");
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings: { ...s, public_base_url: s.public_base_url.trim().replace(/\/+$/, "") }, reason: "Automation settings updated" }),
      });
      const body = await res.json();
      toast(body.success ? { title: "Automation settings saved" } : { title: "Save failed", description: body.error?.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const sendDigest = async () => {
    setBusy("digest");
    try {
      const res = await fetch("/api/v1/admin/workers/run?digest=now", { method: "POST" });
      const body = await res.json();
      toast(body.success
        ? { title: "Digest sent", description: `${body.data.digest?.sent ?? 0} email(s) queued — see Notification Mailbox.` }
        : { title: "Failed", description: body.error?.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-[#0a2350]">Automation</CardTitle></CardHeader>
      <CardContent className="space-y-2.5">
        <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Assignment</p>
        <Row label="How new tickets are assigned" desc="Least busy: the available employee with the fewest open tickets (department first). Round robin: strict rotation.">
          <Select value={s.assignment_strategy || "least_busy"} onValueChange={(v) => set("assignment_strategy", v)}>
            <SelectTrigger size="sm" className="h-8 w-[170px] text-xs" aria-label="Assignment strategy"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="least_busy">Least busy</SelectItem>
              <SelectItem value="round_robin">Round robin</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Auto handover on leave" desc="When an employee is marked away, their open tickets move to available colleagues in the same branch.">
          <Switch checked={on("auto_handover_on_leave")} onCheckedChange={(v) => set("auto_handover_on_leave", String(v))} aria-label="Auto handover on leave" />
        </Row>

        <p className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">SLA escalation ladder</p>
        <Row label="Escalate automatically" desc="Reminder to the assignee → branch manager when the deadline is missed → central support + department mailbox when far past it. Each step is sent once; on-hold tickets are skipped.">
          <Switch checked={on("escalation_enabled")} onCheckedChange={(v) => set("escalation_enabled", String(v))} aria-label="Escalation ladder" />
        </Row>
        <div className="grid gap-3 rounded-md border border-slate-100 px-3 py-2.5 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="warn-pct" className="text-xs">Remind assignee at (% of resolution time used)</Label>
            <Input id="warn-pct" type="number" min={10} max={99} value={s.escalation_warn_percent} onChange={(e) => set("escalation_warn_percent", e.target.value)} className="h-8 w-28" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="crit-pct" className="text-xs">Alert central support at (%)</Label>
            <Input id="crit-pct" type="number" min={101} max={1000} value={s.escalation_critical_percent} onChange={(e) => set("escalation_critical_percent", e.target.value)} className="h-8 w-28" />
          </div>
        </div>

        <p className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Daily digest</p>
        <Row label="Morning summary email" desc="Each branch manager gets their branch summary (open, overdue, unassigned, resolved, ratings); central support gets all branches.">
          <div className="flex items-center gap-2">
            <Select value={s.digest_hour || "9"} onValueChange={(v) => set("digest_hour", v)}>
              <SelectTrigger size="sm" className="h-8 w-[110px] text-xs" aria-label="Digest time"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, h) => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00 IST</SelectItem>)}
              </SelectContent>
            </Select>
            <Switch checked={on("digest_enabled")} onCheckedChange={(v) => set("digest_enabled", String(v))} aria-label="Daily digest" />
          </div>
        </Row>

        <p className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Member feedback</p>
        <Row label="Ask members to rate the support" desc="The resolved email includes a 1–5 star link; ratings of 2 or less alert the branch manager and central support.">
          <Switch checked={on("feedback_enabled")} onCheckedChange={(v) => set("feedback_enabled", String(v))} aria-label="Member feedback" />
        </Row>
        <div className="space-y-1 rounded-md border border-slate-100 px-3 py-2.5">
          <Label htmlFor="base-url" className="text-xs">Public link of this system (used for rating links in emails)</Label>
          <Input id="base-url" type="url" value={s.public_base_url} onChange={(e) => set("public_base_url", e.target.value)} placeholder="https://tms.your-subdomain.workers.dev" className="h-8" />
          <p className="text-[11px] text-slate-400">Leave blank to hide the link — members can still rate from the ticket tracking page.</p>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={save} disabled={busy === "save"} className="bg-[#0a2350] hover:bg-[#10306b]">
            {busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />}Save automation settings
          </Button>
          <Button variant="outline" onClick={sendDigest} disabled={busy === "digest"}>
            {busy === "digest" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Mail className="mr-2 h-4 w-4" aria-hidden />}Send today’s digest now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
