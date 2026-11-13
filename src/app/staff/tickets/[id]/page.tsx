"use client";

// Ticket detail: complaint info, conversation (replies + internal notes),
// status timeline, staff actions (start/hold/resume/resolve/reply/note/
// escalate) and assignment panel (assign/reassign/transfer) with
// closed-ticket read-only enforcement.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { PriorityBadge, StatusBadge } from "@/components/staff-nav";
import { useToast } from "@/hooks/use-toast";
import { STATUS_LABELS } from "@/lib/types";
import {
  AlertTriangle, ArrowLeftRight, ArrowUpRight, FileText, Loader2, MessageSquarePlus,
  Paperclip, PauseCircle, PlayCircle, Reply, RotateCcw, Send, ShieldAlert, Timer, TriangleAlert, UserRound,
} from "lucide-react";

interface Detail {
  ticket: {
    id: string;
    ticketNumber: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    description: string;
    status: string;
    priority: string;
    source: string;
    createdAt: string;
    assignedAt: string | null;
    resolvedAt: string | null;
    autoCloseAt: string | null;
    closedAt: string | null;
    escalatedAt: string | null;
    reopenCount: number;
    slaResponseDueAt: string | null;
    slaResolutionDueAt: string | null;
    branch: { id: string; code: string; name: string };
    category: { id: string; name: string };
    assignee: { id: string; name: string; email: string; designation: string } | null;
    messages: { id: string; authorType: string; visibility: string; authorName: string; body: string; createdAt: string }[];
    statusHistory: { id: string; fromStatus: string | null; toStatus: string; changedByName: string; note: string; createdAt: string }[];
    assignments: { id: string; method: string; note: string; createdAt: string; assignee: { name: string } }[];
    attachments: { id: string; originalName: string; sizeBytes: number; mimeType: string }[];
    reopenHistory: { id: string; reason: string; reopenedAt: string }[];
    slaTracking: { firstResponseMetAt: string | null; firstResponseBreached: boolean; resolutionBreached: boolean } | null;
  };
  viewer: { id: string; role: string; branchId: string | null };
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState("");

  // action dialogs
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const [replyText, setReplyText] = useState("");
  const [noteText, setNoteText] = useState("");

  // assignment
  const [eligible, setEligible] = useState<{ id: string; name: string; designation: string }[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [transferTo, setTransferTo] = useState("");

  const canAssign = ["ROOT_ADMIN", "CENTRAL_ADMIN", "CENTRAL_AGENT", "BRANCH_MANAGER"].includes(detail?.viewer.role || "");
  const isClosed = detail?.ticket.status === "CLOSED";

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/support/tickets/${id}`);
    const body = await res.json();
    if (!res.ok || !body.success) {
      setNotFound(true);
      return;
    }
    setDetail(body.data);
    if (["ROOT_ADMIN", "CENTRAL_ADMIN", "CENTRAL_AGENT", "BRANCH_MANAGER"].includes(body.data.viewer.role)) {
      fetch(`/api/v1/support/assignment/eligible-employees/${body.data.ticket.branch.id}`)
        .then((r) => r.json())
        .then((d) => { if (d.success) setEligible(d.data.eligible); })
        .catch(() => undefined);
      if (["ROOT_ADMIN", "CENTRAL_ADMIN", "CENTRAL_AGENT"].includes(body.data.viewer.role)) {
        fetch("/api/v1/admin/branches")
          .then((r) => r.json())
          .then((d) => { if (d.success) setBranches(d.data.branches); })
          .catch(() => undefined);
      }
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function act(key: string, fn: () => Promise<Response>, okMsg: string) {
    setBusy(key);
    try {
      const res = await fn();
      const body = await res.json();
      if (!res.ok || !body.success) {
        toast({ title: "Action failed", description: body.error?.message || "Please try again.", variant: "destructive" });
        return false;
      }
      toast({ title: okMsg });
      await load();
      return true;
    } catch {
      toast({ title: "Network error", description: "Please try again.", variant: "destructive" });
      return false;
    } finally {
      setBusy("");
    }
  }

  if (notFound) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-sm font-medium text-slate-600">Ticket not found or you do not have access to it.</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push("/staff/tickets")}>Back to tickets</Button>
        </CardContent>
      </Card>
    );
  }
  if (!detail) return <Skeleton className="h-[600px]" />;

  const t = detail.ticket;
  const overdue = t.slaResolutionDueAt && !["RESOLVED", "CLOSED"].includes(t.status) && new Date(t.slaResolutionDueAt) < new Date();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={() => router.push("/staff/tickets")} className="mb-1 flex items-center text-xs text-slate-400 hover:text-[#2c6bdf]">
            ← Back to tickets
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-xl font-bold text-[#0a2350]">{t.ticketNumber}</h1>
            <StatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} />
            {overdue ? <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200"><TriangleAlert className="h-3 w-3" aria-hidden />Overdue</span> : null}
            {t.escalatedAt ? <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 ring-1 ring-purple-200"><ShieldAlert className="h-3 w-3" aria-hidden />Escalated</span> : null}
            {t.reopenCount > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-300"><RotateCcw className="h-3 w-3" aria-hidden />Reopened ×{t.reopenCount}</span> : null}
          </div>
        </div>

        {/* Status actions */}
        <div className="flex flex-wrap gap-2">
          {!isClosed && t.status === "NEW_COMPLAINT" ? (
            <Button size="sm" className="bg-[#2c6bdf] hover:bg-[#1c4297]" disabled={!!busy}
              onClick={() => act("start", () => fetch(`/api/v1/support/tickets/${t.id}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ toStatus: "IN_PROGRESS", note: "Started working on the ticket" }) }), "Ticket started")}>
              {busy === "start" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : <PlayCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
              Start working
            </Button>
          ) : null}
          {!isClosed && (t.status === "IN_PROGRESS" || t.status === "ON_HOLD") ? (
            <>
              {t.status === "IN_PROGRESS" ? (
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setHoldOpen(true)}>
                  <PauseCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Put on hold
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={!!busy}
                  onClick={() => act("resume", () => fetch(`/api/v1/support/tickets/${t.id}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ toStatus: "IN_PROGRESS", note: "Resumed from hold" }) }), "Ticket resumed")}>
                  {busy === "resume" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : <PlayCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                  Resume
                </Button>
              )}
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={!!busy} onClick={() => setResolveOpen(true)}>
                <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Resolve
              </Button>
              {!t.escalatedAt ? (
                <Button size="sm" variant="outline" disabled={!!busy}
                  onClick={() => act("escalate", () => fetch(`/api/v1/support/tickets/${t.id}/escalate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "Manual escalation from dashboard" }) }), "Ticket escalated")}>
                  <ShieldAlert className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Escalate
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {isClosed ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm text-slate-600">
          <Timer className="h-4 w-4 text-slate-400" aria-hidden />
          This ticket is <strong>Closed</strong> and permanently read-only. No role can modify closed tickets — they are retained as historical records only.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column: complaint + conversation */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-[#0a2350]">Complaint details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="rounded-md bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">{t.description}</p>
              <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <p className="flex items-center gap-1.5 text-slate-600"><UserRound className="h-3.5 w-3.5 text-slate-400" aria-hidden />{t.customerName}</p>
                <p className="text-slate-600">Phone: <span className="font-mono text-xs">{t.customerPhone}</span></p>
                <p className="truncate text-slate-600">Email: {t.customerEmail}</p>
                <p className="text-slate-600">Branch: {t.branch.name} ({t.branch.code})</p>
                <p className="text-slate-600">Category: {t.category.name}</p>
                <p className="text-slate-600">Source: {t.source}</p>
                <p className="text-slate-600">Submitted: {fmt(t.createdAt)}</p>
                <p className="text-slate-600">Assigned: {t.assignee ? `${fmt(t.assignedAt)} → ${t.assignee.name}` : "Not assigned"}</p>
                {t.autoCloseAt && t.status === "RESOLVED" ? <p className="text-slate-600">Auto-close deadline: {fmt(t.autoCloseAt)}</p> : null}
                {t.closedAt ? <p className="text-slate-600">Closed: {fmt(t.closedAt)}</p> : null}
                <p className="text-slate-600">SLA response due: {fmt(t.slaResponseDueAt)} {t.slaTracking?.firstResponseBreached ? <span className="text-red-600">(breached)</span> : null}</p>
                <p className="text-slate-600">SLA resolution due: {fmt(t.slaResolutionDueAt)} {t.slaTracking?.resolutionBreached ? <span className="text-red-600">(breached)</span> : null}</p>
              </div>
              {t.attachments.length > 0 ? (
                <div>
                  <Separator className="my-3" />
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500"><Paperclip className="h-3.5 w-3.5" aria-hidden />Attachments</p>
                  <div className="flex flex-wrap gap-2">
                    {t.attachments.map((a) => (
                      <a key={a.id} href={`/api/v1/attachments/${a.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-[#2c6bdf] hover:bg-[#eaf1fb]">
                        <FileText className="h-3.5 w-3.5" aria-hidden />{a.originalName} <span className="text-slate-400">({Math.round(a.sizeBytes / 1024)} KB)</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-[#0a2350]">Conversation</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {t.messages.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No messages yet. Reply to the customer or add an internal note below.</p>
              ) : (
                t.messages.map((m) => (
                  <div key={m.id} className={`rounded-lg border p-3 ${m.visibility === "INTERNAL" ? "border-amber-200 bg-amber-50/70" : "border-slate-200 bg-white"}`}>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-700">
                        {m.authorName}
                        <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${m.visibility === "INTERNAL" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>
                          {m.visibility === "INTERNAL" ? "Internal note" : "To customer"}
                        </span>
                      </p>
                      <span className="text-[11px] text-slate-400">{fmt(m.createdAt)}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700">{m.body}</p>
                  </div>
                ))
              )}

              {!isClosed ? (
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="reply">Customer reply</Label>
                    <Textarea id="reply" rows={3} placeholder="Write a customer-facing reply (emails the customer)..." value={replyText} onChange={(e) => setReplyText(e.target.value)} disabled={!!busy} />
                    <Button size="sm" className="bg-[#2c6bdf] hover:bg-[#1c4297]" disabled={!!busy || replyText.trim().length < 2}
                      onClick={async () => {
                        const okRes = await act("reply", () => fetch(`/api/v1/support/tickets/${t.id}/replies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reply: replyText.trim() }) }), "Reply sent to customer");
                        if (okRes) setReplyText("");
                      }}>
                      {busy === "reply" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />} Send reply
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="note" className="flex items-center gap-1.5"><MessageSquarePlus className="h-3.5 w-3.5 text-amber-500" aria-hidden />Internal note <span className="font-normal text-slate-400">(never emailed)</span></Label>
                    <Textarea id="note" rows={2} placeholder="Internal observation for the team..." value={noteText} onChange={(e) => setNoteText(e.target.value)} disabled={!!busy} />
                    <Button size="sm" variant="outline" disabled={!!busy || noteText.trim().length < 2}
                      onClick={async () => {
                        const okRes = await act("note", () => fetch(`/api/v1/support/tickets/${t.id}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note: noteText.trim() }) }), "Internal note added");
                        if (okRes) setNoteText("");
                      }}>
                      {busy === "note" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Add note
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-[#0a2350]">Status history</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5">
                {t.statusHistory.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[26.5px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#2c6bdf] ring-2 ring-white" aria-hidden />
                    <p className="text-sm text-slate-800">
                      {h.fromStatus ? `${STATUS_LABELS[h.fromStatus] || h.fromStatus} → ` : ""}
                      <strong>{STATUS_LABELS[h.toStatus] || h.toStatus}</strong>
                      <span className="ml-2 text-xs text-slate-400">by {h.changedByName} · {fmt(h.createdAt)}</span>
                    </p>
                    {h.note ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{h.note}</p> : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* Right column: assignment */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-[#0a2350]">Assignment</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Current assignee</p>
                {t.assignee ? (
                  <p className="mt-1 text-slate-700">{t.assignee.name} <span className="text-xs text-slate-400">· {t.assignee.designation}</span></p>
                ) : (
                  <p className="mt-1 flex items-center gap-1.5 text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden /> Unassigned — awaiting round-robin
                  </p>
                )}
              </div>

              {canAssign && !isClosed ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Assign / reassign within {t.branch.name}</Label>
                    <Select value={assignTo} onValueChange={setAssignTo}>
                      <SelectTrigger aria-label="Select employee"><SelectValue placeholder="Select employee" /></SelectTrigger>
                      <SelectContent>
                        {eligible.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                        {eligible.length === 0 ? <SelectItem value="__none" disabled>No eligible employees</SelectItem> : null}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="w-full bg-[#0a2350] hover:bg-[#10306b]" disabled={!!busy || !assignTo}
                      onClick={async () => {
                        const okRes = await act("assign", () => fetch(`/api/v1/support/tickets/${t.id}/assign`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ employeeId: assignTo }) }), "Ticket assigned");
                        if (okRes) setAssignTo("");
                      }}>
                      {busy === "assign" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" aria-hidden />} Apply assignment
                    </Button>
                  </div>
                  {branches.length > 0 ? (
                    <div className="space-y-1.5 border-t border-slate-100 pt-3">
                      <Label>Transfer to another branch</Label>
                      <Select value={transferTo} onValueChange={setTransferTo}>
                        <SelectTrigger aria-label="Select branch"><SelectValue placeholder="Select branch" /></SelectTrigger>
                        <SelectContent>
                          {branches.filter((b) => b.id !== t.branch.id).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className="w-full" disabled={!!busy || !transferTo}
                        onClick={async () => {
                          const okRes = await act("transfer", () => fetch(`/api/v1/support/tickets/${t.id}/assign`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transferBranchId: transferTo }) }), "Branch transferred — re-queued to new branch");
                          if (okRes) setTransferTo("");
                        }}>
                        {busy === "transfer" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Transfer branch
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">Assignment history</p>
                <ul className="space-y-1 text-xs text-slate-500">
                  {t.assignments.map((a) => (
                    <li key={a.id} className="rounded border border-slate-100 px-2 py-1.5">
                      <span className="font-medium text-slate-700">{a.assignee.name}</span> · {a.method} · {fmt(a.createdAt)}
                      {a.note ? <span className="block text-[11px] text-slate-400">{a.note}</span> : null}
                    </li>
                  ))}
                  {t.assignments.length === 0 ? <li>No assignment records.</li> : null}
                </ul>
              </div>
            </CardContent>
          </Card>

          {t.reopenHistory.length > 0 ? (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-[#0a2350]">Reopen history</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-xs text-slate-600">
                  {t.reopenHistory.map((r) => (
                    <li key={r.id} className="rounded border border-slate-100 p-2">
                      <p className="font-medium text-slate-700">{fmt(r.reopenedAt)}</p>
                      <p className="mt-0.5 leading-relaxed text-slate-500">{r.reason}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Hold dialog */}
      <Dialog open={holdOpen} onOpenChange={(o) => { setHoldOpen(o); if (!o) setHoldReason(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Put {t.ticketNumber} on hold</DialogTitle><DialogDescription>A reason is mandatory. The customer is notified by email.</DialogDescription></DialogHeader>
          <Textarea rows={3} placeholder="Why is this ticket on hold?" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldOpen(false)}>Cancel</Button>
            <Button disabled={holdReason.trim().length < 2 || busy === "hold"}
              onClick={async () => {
                const okRes = await act("hold", () => fetch(`/api/v1/support/tickets/${t.id}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ toStatus: "ON_HOLD", reason: holdReason.trim() }) }), "Ticket on hold");
                if (okRes) { setHoldOpen(false); setHoldReason(""); }
              }}>
              {busy === "hold" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <PauseCircle className="mr-2 h-4 w-4" aria-hidden />} Put on hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve dialog */}
      <Dialog open={resolveOpen} onOpenChange={(o) => { setResolveOpen(o); if (!o) setResolution(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Resolve {t.ticketNumber}</DialogTitle><DialogDescription>The resolution message is mandatory and is emailed to the customer. Auto-closure is scheduled after the reopening window.</DialogDescription></DialogHeader>
          <Textarea rows={4} placeholder="Describe the solution provided to the customer (minimum 10 characters)..." value={resolution} onChange={(e) => setResolution(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={resolution.trim().length < 10 || busy === "resolve"}
              onClick={async () => {
                const okRes = await act("resolve", () => fetch(`/api/v1/support/tickets/${t.id}/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resolution: resolution.trim() }) }), "Ticket resolved — closure scheduled");
                if (okRes) { setResolveOpen(false); setResolution(""); }
              }}>
              {busy === "resolve" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <ArrowUpRight className="mr-2 h-4 w-4" aria-hidden />} Mark resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
