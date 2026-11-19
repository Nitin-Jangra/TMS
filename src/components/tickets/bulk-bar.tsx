"use client";

// Bulk action bar for the ticket list: reassign, move to department, change
// status (with the required hold reason / resolution), escalate.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StaffPicker, type StaffEntry } from "@/components/staff-picker";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X } from "lucide-react";

type Mode = "assign" | "department" | "status" | "escalate";

export function BulkBar({
  selectedIds,
  staff,
  departments,
  preferBranchId,
  canReassign,
  onClear,
  onDone,
}: {
  selectedIds: string[];
  staff: StaffEntry[];
  departments: { id: string; name: string }[];
  preferBranchId?: string | null;
  canReassign: boolean;
  onClear: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [reassign, setReassign] = useState(true);
  const [toStatus, setToStatus] = useState("IN_PROGRESS");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => { setMode(null); setEmployeeId(""); setDepartmentId(""); setText(""); setToStatus("IN_PROGRESS"); };

  const run = async () => {
    if (!mode) return;
    const payload: Record<string, unknown> = { ticketIds: selectedIds, action: mode };
    if (mode === "assign") Object.assign(payload, { employeeId, note: text });
    if (mode === "department") Object.assign(payload, { departmentId: departmentId === "none" ? null : departmentId, reassign });
    if (mode === "status") Object.assign(payload, { toStatus, reason: text, resolution: text, note: text });
    if (mode === "escalate") Object.assign(payload, { reason: text });
    setBusy(true);
    try {
      const res = await fetch("/api/v1/support/tickets/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!body.success) {
        toast({ title: "Bulk action failed", description: body.error?.message, variant: "destructive" });
        return;
      }
      const failed = (body.data.results as { ok: boolean; ticketNumber: string; message: string }[]).filter((r) => !r.ok);
      toast({
        title: `${body.data.succeeded} of ${selectedIds.length} ticket${selectedIds.length === 1 ? "" : "s"} updated`,
        description: failed.length ? failed.slice(0, 4).map((f) => `${f.ticketNumber}: ${f.message}`).join(" · ") + (failed.length > 4 ? " …" : "") : undefined,
        variant: failed.length && !body.data.succeeded ? "destructive" : undefined,
      });
      close();
      onDone();
    } catch {
      toast({ title: "Network error", description: "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const ready =
    (mode === "assign" && !!employeeId) ||
    (mode === "department" && !!departmentId) ||
    (mode === "status" && (toStatus === "IN_PROGRESS" || text.trim().length >= 3)) ||
    mode === "escalate";

  const title: Record<Mode, string> = {
    assign: "Reassign tickets",
    department: "Move to department",
    status: "Change status",
    escalate: "Escalate tickets",
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#22618b]/20 bg-[#22618b]/5 px-3 py-2" role="region" aria-label="Bulk actions">
        <span className="text-xs font-semibold text-[#22618b]">{selectedIds.length} selected</span>
        {canReassign ? (
          <>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setMode("assign")}>Reassign…</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setMode("department")}>Move to department…</Button>
          </>
        ) : null}
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setMode("status")}>Change status…</Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setMode("escalate")}>Escalate…</Button>
        <Button size="sm" variant="ghost" className="ml-auto h-8 text-xs" onClick={onClear}>
          <X className="mr-1 h-3 w-3" aria-hidden /> Clear selection
        </Button>
      </div>

      <Dialog open={!!mode} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode ? title[mode] : ""}</DialogTitle>
            <DialogDescription>Applies to {selectedIds.length} selected ticket{selectedIds.length === 1 ? "" : "s"}. Tickets you are not allowed to change, or closed tickets, are skipped and listed afterwards.</DialogDescription>
          </DialogHeader>

          {mode === "assign" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Assign to</Label>
                <StaffPicker staff={staff} value={employeeId} onChange={setEmployeeId} preferBranchId={preferBranchId} placeholder="Search employee…" className="h-9 w-full" />
                <p className="text-[11px] text-slate-500">Tickets from another branch move to the employee’s branch.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-note">Reason (optional)</Label>
                <Input id="bulk-note" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. covering leave" maxLength={500} />
              </div>
            </div>
          ) : null}

          {mode === "department" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger className="w-full" aria-label="Department"><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    <SelectItem value="none">No department (general queue)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={reassign} onCheckedChange={(v) => setReassign(v === true)} className="mt-0.5" />
                <span>Re-assign automatically to someone in that department<span className="block text-xs text-slate-400">Otherwise the current assignee keeps the ticket.</span></span>
              </label>
            </div>
          ) : null}

          {mode === "status" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>New status</Label>
                <Select value={toStatus} onValueChange={setToStatus}>
                  <SelectTrigger className="w-full" aria-label="New status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="ON_HOLD">On Hold</SelectItem>
                    <SelectItem value="RESOLVED">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {toStatus !== "IN_PROGRESS" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="bulk-text">{toStatus === "ON_HOLD" ? "Hold reason (sent to members)" : "Resolution (sent to members)"}</Label>
                  <Textarea id="bulk-text" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} />
                </div>
              ) : null}
              <p className="text-[11px] text-slate-500">Only valid changes are applied (e.g. a new ticket must be started before it can be resolved).</p>
            </div>
          ) : null}

          {mode === "escalate" ? (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-reason">Reason (optional)</Label>
              <Input id="bulk-reason" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. repeated complaints this week" maxLength={300} />
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={run} disabled={busy || !ready} className="bg-[#22618b] hover:bg-[#1b4f72]">
              {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Apply to {selectedIds.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
