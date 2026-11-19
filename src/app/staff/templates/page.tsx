"use client";

// Reply templates (canned responses). Everyone can keep personal templates;
// branch managers and central staff also manage the shared ones.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2, Pencil, Plus, Search, Trash2, Users } from "lucide-react";

interface Template {
  id: string;
  title: string;
  body: string;
  categoryId: string | null;
  isShared: boolean;
  ownerName: string;
  canEdit: boolean;
}

const PLACEHOLDERS = ["{{customerName}}", "{{ticketNumber}}", "{{branchName}}", "{{categoryName}}", "{{agentName}}"];
const empty = { id: "", title: "", body: "", categoryId: "", isShared: false };

export default function TemplatesPage() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<typeof empty | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/support/canned");
    const body = await res.json().catch(() => ({}));
    setTemplates(body.data?.templates ?? []);
    setCanShare(!!body.data?.canManageShared);
  }, []);
   
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/v1/public/categories").then((r) => r.json()).then((d) => setCategories(d.data?.categories ?? [])).catch(() => undefined);
  }, []);

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const filtered = (templates || []).filter((t) => {
    const hay = `${t.title} ${t.body} ${catName.get(t.categoryId || "") || ""}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  });

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const payload = { title: editing.title.trim(), body: editing.body.trim(), categoryId: editing.categoryId || null, isShared: editing.isShared };
      const res = await fetch(editing.id ? `/api/v1/support/canned/${editing.id}` : "/api/v1/support/canned", {
        method: editing.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!body.success) {
        toast({ title: "Could not save template", description: body.error?.message, variant: "destructive" });
        return;
      }
      toast({ title: editing.id ? "Template updated" : "Template created" });
      setEditing(null);
      load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: Template) => {
    if (!window.confirm(`Delete the template “${t.title}”?`)) return;
    const res = await fetch(`/api/v1/support/canned/${t.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (body.success) { toast({ title: "Template deleted" }); load(); }
    else toast({ title: "Could not delete", description: body.error?.message, variant: "destructive" });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0a2350]">Reply templates</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Ready-made answers for common complaints. Insert them from any ticket with “Insert template”.
          </p>
        </div>
        <Button onClick={() => setEditing({ ...empty })} className="bg-[#22618b] hover:bg-[#1b4f72]">
          <Plus className="mr-1.5 h-4 w-4" aria-hidden /> New template
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
        <Input className="pl-8" placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search templates" />
      </div>

      {templates === null ? (
        <Skeleton className="h-40" />
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-slate-500">No templates yet. Create one to speed up replies.</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-[#0a2350]">
                      <FileText className="h-3.5 w-3.5 text-slate-400" aria-hidden />{t.title}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                      {t.isShared ? <span className="inline-flex items-center gap-0.5 rounded bg-[#22618b]/10 px-1.5 py-0.5 font-medium text-[#22618b]"><Users className="h-3 w-3" aria-hidden />Shared</span> : <span className="rounded bg-slate-100 px-1.5 py-0.5">Personal</span>}
                      {t.categoryId ? <span>· {catName.get(t.categoryId) || "Category"}</span> : null}
                      <span>· by {t.ownerName}</span>
                    </p>
                  </div>
                  {t.canEdit ? (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing({ id: t.id, title: t.title, body: t.body, categoryId: t.categoryId || "", isShared: t.isShared })} aria-label={`Edit ${t.title}`}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:bg-red-50" onClick={() => remove(t)} aria-label={`Delete ${t.title}`}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-2.5 text-xs leading-relaxed text-slate-600">{t.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit template" : "New template"}</DialogTitle>
            <DialogDescription>
              Placeholders are filled in automatically: {PLACEHOLDERS.join(" ")}
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-title">Title</Label>
                <Input id="tpl-title" value={editing.title} maxLength={80} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Refund initiated" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-body">Text</Label>
                <Textarea id="tpl-body" rows={6} value={editing.body} maxLength={4000} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder="Hi {{customerName}}, …" />
                <div className="flex flex-wrap gap-1">
                  {PLACEHOLDERS.map((p) => (
                    <button key={p} type="button" className="rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 hover:bg-slate-50"
                      onClick={() => setEditing({ ...editing, body: `${editing.body}${editing.body && !editing.body.endsWith(" ") ? " " : ""}${p}` })}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Suggest for category (optional)</Label>
                <Select value={editing.categoryId || "any"} onValueChange={(v) => setEditing({ ...editing, categoryId: v === "any" ? "" : v })}>
                  <SelectTrigger className="w-full" aria-label="Category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any category</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {canShare ? (
                <div className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Share with all staff</p>
                    <p className="text-xs text-slate-400">Shared templates appear for everyone.</p>
                  </div>
                  <Switch checked={editing.isShared} onCheckedChange={(v) => setEditing({ ...editing, isShared: v })} aria-label="Share template" />
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={busy || !editing || editing.title.trim().length < 2 || editing.body.trim().length < 5} className="bg-[#22618b] hover:bg-[#1b4f72]">
              {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
