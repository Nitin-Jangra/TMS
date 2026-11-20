"use client";

// "Views" menu for the ticket list: one-click built-in views, saved personal
// and shared views, and "Save current view".

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Bookmark, BookmarkPlus, ChevronDown, Trash2, Users } from "lucide-react";

interface SavedView {
  id: string;
  name: string;
  query: string;
  isShared: boolean;
  ownerName: string;
  mine: boolean;
}

export const BUILT_IN_VIEWS: { name: string; query: string; hint: string }[] = [
  { name: "My open tickets", query: "mine=true&status=OPEN&sort=priority&order=desc", hint: "Assigned to you, not resolved yet" },
  { name: "Overdue", query: "overdue=true&sort=createdAt&order=asc", hint: "Past the resolution deadline, oldest first" },
  { name: "Unassigned", query: "unassigned=true&status=OPEN&sort=createdAt&order=asc", hint: "Waiting for an owner" },
  { name: "Escalated & open", query: "escalated=true&status=OPEN", hint: "Escalated tickets still being worked" },
  { name: "Open, most urgent first", query: "status=OPEN&sort=priority&order=desc", hint: "Every open ticket, critical at the top" },
];

export function ViewsMenu({ currentQuery, onApply, triggerClassName }: { currentQuery: string; onApply: (query: string, name: string) => void; triggerClassName?: string }) {
  const { toast } = useToast();
  const [views, setViews] = useState<SavedView[]>([]);
  const [canShare, setCanShare] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/v1/support/views")
      .then((r) => r.json())
      .then((d) => { if (d.success) { setViews(d.data.views); setCanShare(!!d.data.canShare); } })
      .catch(() => undefined);
  }, []);
   
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/support/views", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), query: currentQuery, isShared: share }),
      });
      const body = await res.json();
      if (!body.success) {
        toast({ title: "Could not save view", description: body.error?.message, variant: "destructive" });
        return;
      }
      toast({ title: `View “${name.trim()}” saved` });
      setSaveOpen(false);
      setName("");
      setShare(false);
      load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (v: SavedView) => {
    const res = await fetch(`/api/v1/support/views/${v.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (body.success) { toast({ title: `View “${v.name}” deleted` }); load(); }
    else toast({ title: "Could not delete view", description: body.error?.message, variant: "destructive" });
  };

  const mine = views.filter((v) => v.mine);
  const shared = views.filter((v) => !v.mine);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={triggerClassName || "h-9 gap-1.5 text-xs"}>
            <Bookmark className="h-3.5 w-3.5" aria-hidden /> Views <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-slate-400">Quick views</DropdownMenuLabel>
          {BUILT_IN_VIEWS.map((v) => (
            <DropdownMenuItem key={v.name} onSelect={() => onApply(v.query, v.name)} className="flex-col items-start gap-0 text-xs">
              <span className="font-medium">{v.name}</span>
              <span className="text-[11px] text-slate-400">{v.hint}</span>
            </DropdownMenuItem>
          ))}
          {mine.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-slate-400">My views</DropdownMenuLabel>
              {mine.map((v) => (
                <DropdownMenuItem key={v.id} onSelect={() => onApply(v.query, v.name)} className="justify-between text-xs">
                  <span className="flex items-center gap-1.5 truncate">
                    {v.isShared ? <Users className="h-3 w-3 text-slate-400" aria-label="Shared" /> : null}
                    {v.name}
                  </span>
                  <button
                    type="button"
                    className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(v); }}
                    aria-label={`Delete view ${v.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          {shared.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-slate-400">Shared with everyone</DropdownMenuLabel>
              {shared.map((v) => (
                <DropdownMenuItem key={v.id} onSelect={() => onApply(v.query, v.name)} className="flex-col items-start gap-0 text-xs">
                  <span className="font-medium">{v.name}</span>
                  <span className="text-[11px] text-slate-400">by {v.ownerName}</span>
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSaveOpen(true)} className="text-xs font-medium text-[#22618b]">
            <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Save current filters as a view…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>Saves the current search, filters and sorting so you can open them again with one click.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="view-name">Name</Label>
              <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sector 48 billing, overdue" maxLength={60} autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && name.trim().length >= 2) save(); }} />
            </div>
            {canShare ? (
              <div className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-700">Share with everyone</p>
                  <p className="text-xs text-slate-400">All staff will see this view in their menu.</p>
                </div>
                <Switch checked={share} onCheckedChange={setShare} aria-label="Share view" />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy || name.trim().length < 2} className="bg-[#22618b] hover:bg-[#1b4f72]">Save view</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
