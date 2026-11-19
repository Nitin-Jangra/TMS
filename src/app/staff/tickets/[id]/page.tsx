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
import { StaffPicker, type StaffEntry } from "@/components/staff-picker";
import { CannedPicker } from "@/components/canned-picker";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertTriangle, ArrowLeftRight, ArrowUpRight, FileText, Loader2, MessageSquarePlus,
  Paperclip, PauseCircle, PlayCircle, Reply, RotateCcw, Send, ShieldAlert, Star, Timer, TriangleAlert, UserRound,
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
    department: { id: string; name: string } | null;
    feedback: { rating: number; comment: string; createdAt: string } | null;
    assignee: { id: string; name: string; email: string; designation: string } | null;
    messages: { id: string; authorType: string; visibility: string; authorName: string; body: string; createdAt: string }[];
    statusHistory: { id: string; fromStatus: string | null; toStatus: string; changedByName: string; note: string; createdAt: string }[];
    assignments: { id: string; method: string; note: string; createdAt: string; assignee: { name: string } }[];
    attachments: { id: string; originalName: string; sizeBytes: number; mimeType: string }[];
    reopenHistory: { id: string; reason: string; reopenedAt: string }[];
    slaTracking: { firstResponseMetAt: string | null; firstResponseBreached: boolean; resolutionBreached: boolean } | null;
  };
  viewer: { id: string; role: string; branchId: string | null; canReassign?: boolean; canAssignAcrossBranches?: boolean };
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
  const [journalMode, setJournalMode] = useState<"comments" | "work_notes">("comments");
  const [activityFilter, setActivityFilter] = useState<"all" | "comments" | "notes" | "history">("all");

  // assignment
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [transferTo, setTransferTo] = useState("");
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [moveDept, setMoveDept] = useState("");
  const [moveReassign, setMoveReassign] = useState(true);

  const canAssign = !!detail?.viewer.canReassign;
  const acrossBranches = !!detail?.viewer.canAssignAcrossBranches;
  const isClosed = detail?.ticket.status === "CLOSED";

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/support/tickets/${id}`);
    const body = await res.json();
    if (!res.ok || !body.success) {
      setNotFound(true);
      return;
    }
    setDetail(body.data);
    if (body.data.viewer.canReassign) {
      fetch("/api/v1/support/departments")
        .then((r) => r.json())
        .then((d) => { if (d.success) setDepartments(d.data.departments); })
        .catch(() => undefined);
      fetch("/api/v1/support/staff-directory")
        .then((r) => r.json())
        .then((d) => { if (d.success) setStaff(d.data.staff); })
        .catch(() => undefined);
      if (body.data.viewer.canAssignAcrossBranches) {
        fetch("/api/v1/public/branches")
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
      {/* ServiceNow Record Sub-Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#d1d7dc] bg-white p-4 shadow-sm">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
            <button onClick={() => router.push("/staff/tickets")} className="hover:text-[#1f70c1] hover:underline font-medium">
              Incidents & Tickets
            </button>
            <span>/</span>
            <span className="font-semibold text-slate-700">{t.ticketNumber}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-xl font-bold text-[#161f28]">{t.ticketNumber}</h1>
            <StatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} />
            {overdue ? <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-800 ring-1 ring-red-300"><TriangleAlert className="h-3 w-3" />SLA Breached</span> : null}
            {t.escalatedAt ? <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-semibold text-purple-800 ring-1 ring-purple-300"><ShieldAlert className="h-3 w-3" />Escalated</span> : null}
            {t.reopenCount > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-300"><RotateCcw className="h-3 w-3" />Reopened ({t.reopenCount})</span> : null}
          </div>
        </div>

        {/* Status Actions (ServiceNow Header Actions) */}
        <div className="flex flex-wrap items-center gap-2">
          {!isClosed && t.status === "NEW_COMPLAINT" ? (
            <Button size="sm" className="bg-[#1f70c1] hover:bg-[#155799] text-white" disabled={!!busy}
              onClick={() => act("start", () => fetch(`/api/v1/support/tickets/${t.id}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ toStatus: "IN_PROGRESS", note: "Started working on the ticket" }) }), "Ticket started")}>
              {busy === "start" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : <PlayCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
              Start Working
            </Button>
          ) : null}
          {!isClosed && (t.status === "IN_PROGRESS" || t.status === "ON_HOLD") ? (
            <>
              {t.status === "IN_PROGRESS" ? (
                <Button size="sm" variant="outline" className="border-slate-300" disabled={!!busy} onClick={() => setHoldOpen(true)}>
                  <PauseCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Place on Hold
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="border-slate-300" disabled={!!busy}
                  onClick={() => act("resume", () => fetch(`/api/v1/support/tickets/${t.id}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ toStatus: "IN_PROGRESS", note: "Resumed from hold" }) }), "Ticket resumed")}>
                  {busy === "resume" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : <PlayCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                  Resume Work
                </Button>
              )}
              <Button size="sm" className="bg-[#059669] hover:bg-[#047857] text-white" disabled={!!busy} onClick={() => setResolveOpen(true)}>
                <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Resolve Incident
              </Button>
              {!t.escalatedAt ? (
                <Button size="sm" variant="outline" className="border-slate-300" disabled={!!busy}
                  onClick={() => act("escalate", () => fetch(`/api/v1/support/tickets/${t.id}/escalate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "Manual escalation from dashboard" }) }), "Ticket escalated")}>
                  <ShieldAlert className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Escalate
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {/* ServiceNow Progress State Flow Chevron Bar */}
      <div className="flex overflow-x-auto rounded border border-[#d1d7dc] bg-white p-1 text-xs shadow-sm select-none">
        {[
          { key: "NEW_COMPLAINT", step: "1. New", label: "New Complaint" },
          { key: "IN_PROGRESS", step: "2. Work in Progress", label: "Work in Progress" },
          { key: "ON_HOLD", step: "3. Pending / Hold", label: "On Hold" },
          { key: "RESOLVED", step: "4. Resolved", label: "Resolved" },
          { key: "CLOSED", step: "5. Closed", label: "Closed" },
        ].map((s) => {
          const isCurrent = t.status === s.key;
          const statusOrder = ["NEW_COMPLAINT", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"];
          const isPassed = statusOrder.indexOf(t.status) > statusOrder.indexOf(s.key);
          return (
            <div
              key={s.key}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-center border-r last:border-r-0 font-semibold transition whitespace-nowrap ${
                isCurrent
                  ? "bg-[#1f70c1] text-white font-bold shadow-xs"
                  : isPassed
                  ? "bg-[#ecfdf5] text-[#065f46]"
                  : "bg-[#f8fafc] text-slate-400"
              }`}
            >
              {isPassed ? <CheckCircle2 className="h-3.5 w-3.5 text-[#059669]" /> : null}
              <span>{s.step}</span>
            </div>
          );
        })}
      </div>

      {isClosed ? (
        <div className="flex items-center gap-2 rounded border border-slate-300 bg-slate-100 p-3 text-xs text-slate-600">
          <Timer className="h-4 w-4 text-slate-400" aria-hidden />
          This incident is <strong>Closed</strong> and permanently read-only in compliance with ITIL audit rules.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column: ServiceNow Form sections + Dual-channel Activity Stream */}
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
                <p className="text-slate-600">Department: {t.department?.name || <span className="text-slate-400">None (general queue)</span>}</p>
                <p className="text-slate-600">Source: {t.source}</p>
                <p className="text-slate-600">Submitted: {fmt(t.createdAt)}</p>
                <p className="text-slate-600">Assigned: {t.assignee ? `${fmt(t.assignedAt)} → ${t.assignee.name}` : "Not assigned"}</p>
                {t.autoCloseAt && t.status === "RESOLVED" ? <p className="text-slate-600">Auto-close deadline: {fmt(t.autoCloseAt)}</p> : null}
                {t.closedAt ? <p className="text-slate-600">Closed: {fmt(t.closedAt)}</p> : null}
                <p className="text-slate-600">SLA response due: {fmt(t.slaResponseDueAt)} {t.slaTracking?.firstResponseBreached ? <span className="text-red-600">(breached)</span> : null}</p>
                <p className="text-slate-600">SLA resolution due: {fmt(t.slaResolutionDueAt)} {t.slaTracking?.resolutionBreached ? <span className="text-red-600">(breached)</span> : null}</p>
              </div>
              {t.feedback ? (
                <div className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${t.feedback.rating <= 2 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Member rating</span>
                  <span className="flex items-center gap-0.5" aria-label={`${t.feedback.rating} out of 5 stars`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`h-4 w-4 ${n <= t.feedback!.rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} aria-hidden />
                    ))}
                  </span>
                  <span className="font-semibold text-slate-700">{t.feedback.rating}/5</span>
                  {t.feedback.comment ? <span className="w-full text-slate-600">“{t.feedback.comment}”</span> : null}
                </div>
              ) : null}
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

          {/* Dual-Channel Activity Stream (ServiceNow Polaris Journal) */}
          <Card className="border border-[#d1d7dc] shadow-sm">
            <CardHeader className="border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Activity Stream & Journal
                </CardTitle>
                <div className="flex items-center gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setActivityFilter("all")}
                    className={`rounded px-2 py-0.5 font-semibold transition ${activityFilter === "all" ? "bg-[#1f70c1] text-white" : "text-slate-600 hover:bg-slate-200"}`}
                  >
                    All ({t.messages.length + t.statusHistory.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter("comments")}
                    className={`rounded px-2 py-0.5 font-semibold transition ${activityFilter === "comments" ? "bg-[#1f70c1] text-white" : "text-slate-600 hover:bg-slate-200"}`}
                  >
                    Comments
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter("notes")}
                    className={`rounded px-2 py-0.5 font-semibold transition ${activityFilter === "notes" ? "bg-[#1f70c1] text-white" : "text-slate-600 hover:bg-slate-200"}`}
                  >
                    Work Notes
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter("history")}
                    className={`rounded px-2 py-0.5 font-semibold transition ${activityFilter === "history" ? "bg-[#1f70c1] text-white" : "text-slate-600 hover:bg-slate-200"}`}
                  >
                    History
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              {/* Dual-Channel Composer */}
              {!isClosed ? (
                <div className="rounded border border-[#d1d7dc] bg-white p-3 shadow-xs">
                  {/* Mode Tabs */}
                  <div className="mb-2 flex items-center gap-1 border-b border-slate-200 pb-2">
                    <button
                      type="button"
                      onClick={() => setJournalMode("comments")}
                      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition ${
                        journalMode === "comments"
                          ? "bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe]"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      <Reply className="h-3.5 w-3.5" />
                      Additional Comments (Customer Visible)
                    </button>
                    <button
                      type="button"
                      onClick={() => setJournalMode("work_notes")}
                      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition ${
                        journalMode === "work_notes"
                          ? "bg-[#fffbeb] text-[#b45309] border border-[#fde68a]"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      Work Notes (Staff Internal Only)
                    </button>
                  </div>

                  {journalMode === "comments" ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="text-[#1d4ed8] font-medium">Customer-facing reply (will be dispatched via email)</span>
                        <CannedPicker
                          context={{ customerName: t.customerName, ticketNumber: t.ticketNumber, branchName: t.branch.name, categoryName: t.category.name, categoryId: t.category.id }}
                          onInsert={(text) => setReplyText((cur) => (cur.trim() ? `${cur.trimEnd()}\n\n${text}` : text))}
                          disabled={!!busy}
                        />
                      </div>
                      <Textarea
                        rows={3}
                        placeholder="Write a clear response to the customer..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="rounded border-[#bfdbfe] bg-[#eff6ff]/30 text-xs focus:border-[#3b82f6]"
                        disabled={!!busy}
                      />
                      <Button
                        size="sm"
                        className="bg-[#1f70c1] hover:bg-[#155799] text-white text-xs font-semibold"
                        disabled={!!busy || replyText.trim().length < 2}
                        onClick={async () => {
                          const okRes = await act("reply", () => fetch(`/api/v1/support/tickets/${t.id}/replies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reply: replyText.trim() }) }), "Reply sent to customer");
                          if (okRes) setReplyText("");
                        }}
                      >
                        {busy === "reply" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                        Post Customer Update
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-[#b45309] font-medium">
                        Private Work Note (Internal to staff — strictly hidden from customer)
                      </div>
                      <Textarea
                        rows={3}
                        placeholder="Document investigation findings, telephone calls, or vendor follow-ups..."
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        className="rounded border-[#fde68a] bg-[#fffbeb]/40 text-xs focus:border-[#f59e0b]"
                        disabled={!!busy}
                      />
                      <Button
                        size="sm"
                        className="bg-[#d97706] hover:bg-[#b45309] text-white text-xs font-semibold"
                        disabled={!!busy || noteText.trim().length < 2}
                        onClick={async () => {
                          const okRes = await act("note", () => fetch(`/api/v1/support/tickets/${t.id}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note: noteText.trim() }) }), "Internal note added");
                          if (okRes) setNoteText("");
                        }}
                      >
                        {busy === "note" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />}
                        Save Work Note
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Feed Stream */}
              <div className="space-y-3 pt-2">
                {t.messages.length === 0 ? (
                  <p className="rounded border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                    No communication posted on this incident yet.
                  </p>
                ) : (
                  t.messages
                    .filter((m) => {
                      if (activityFilter === "comments") return m.visibility !== "INTERNAL";
                      if (activityFilter === "notes") return m.visibility === "INTERNAL";
                      return true;
                    })
                    .map((m) => (
                      <div
                        key={m.id}
                        className={`rounded p-3 text-xs shadow-xs ${
                          m.visibility === "INTERNAL"
                            ? "sn-work-notes"
                            : "sn-customer-comments"
                        }`}
                      >
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-1">
                          <div className="flex items-center gap-1.5 font-bold">
                            <span className="text-slate-800">{m.authorName}</span>
                            <span
                              className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider ${
                                m.visibility === "INTERNAL"
                                  ? "bg-amber-200 text-amber-900"
                                  : "bg-blue-200 text-blue-900"
                              }`}
                            >
                              {m.visibility === "INTERNAL" ? "Work Note (Internal)" : "Customer Comment"}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">{fmt(m.createdAt)}</span>
                        </div>
                        <p className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">{m.body}</p>
                      </div>
                    ))
                )}
              </div>
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

        {/* Right column: ServiceNow Contextual Side Panel */}
        <div className="space-y-4">
          {/* ServiceNow SLA Countdown Widget */}
          <Card className="border border-[#d1d7dc] shadow-sm">
            <CardHeader className="border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-2.5">
              <CardTitle className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Timer className="h-4 w-4 text-[#1f70c1]" />
                  Service Level Agreement (SLA)
                </span>
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${overdue ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {overdue ? "SLA Breached" : "Within Target"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 text-xs">
              <div>
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span>Resolution Target:</span>
                  <span className="font-semibold text-slate-800">{fmt(t.slaResolutionDueAt)}</span>
                </div>
                {/* Visual Risk Gauge */}
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                  <div
                    className={`h-full transition-all ${overdue ? "w-full bg-red-600" : t.status === "RESOLVED" || t.status === "CLOSED" ? "w-full bg-emerald-500" : "w-3/4 bg-[#1f70c1]"}`}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 border-t border-slate-100 pt-2">
                <div>
                  <span className="text-slate-400 block">First Response:</span>
                  <span className="font-medium text-slate-700">{t.slaTracking?.firstResponseMetAt ? "Met ✓" : t.slaTracking?.firstResponseBreached ? "Breached ✕" : "Pending"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Reopen Window:</span>
                  <span className="font-medium text-slate-700">{t.autoCloseAt ? fmt(t.autoCloseAt) : "72 Hours"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-[#d1d7dc] shadow-sm">
            <CardHeader className="border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-2.5">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">Assignment & Routing</CardTitle>
            </CardHeader>
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
                    <Label>{t.assignee ? "Reassign to" : "Assign to"}</Label>
                    <StaffPicker
                      staff={acrossBranches ? staff : staff.filter((p) => p.branchId === t.branch.id)}
                      value={assignTo}
                      onChange={setAssignTo}
                      placeholder="Search employee…"
                      preferBranchId={t.branch.id}
                      excludeIds={t.assignee ? [t.assignee.id] : []}
                      className="h-9 w-full"
                      ariaLabel="Select employee"
                    />
                    {(() => {
                      const target = staff.find((p) => p.id === assignTo);
                      if (!target) return null;
                      return (
                        <p className="text-[11px] text-slate-500">
                          {target.branchId !== t.branch.id ? (
                            <span className="font-medium text-amber-700">The ticket will move from {t.branch.name} to {target.branch?.name}. </span>
                          ) : null}
                          {!target.availabilityEnabled ? <span className="text-amber-700">{target.name} is marked away. </span> : null}
                          {target.openTickets} open ticket{target.openTickets === 1 ? "" : "s"}.
                        </p>
                      );
                    })()}
                    <Input
                      value={assignNote}
                      onChange={(e) => setAssignNote(e.target.value)}
                      placeholder="Reason (optional)"
                      className="h-9 text-xs"
                      maxLength={500}
                      aria-label="Reassignment reason"
                    />
                    <Button size="sm" className="w-full bg-[#0a2350] hover:bg-[#10306b]" disabled={!!busy || !assignTo}
                      onClick={async () => {
                        const okRes = await act("assign", () => fetch(`/api/v1/support/tickets/${t.id}/assign`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ employeeId: assignTo, note: assignNote.trim() }) }), t.assignee ? "Ticket reassigned" : "Ticket assigned");
                        if (okRes) { setAssignTo(""); setAssignNote(""); }
                      }}>
                      {busy === "assign" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" aria-hidden />} {t.assignee ? "Reassign ticket" : "Assign ticket"}
                    </Button>
                  </div>
                  {departments.length > 0 ? (
                    <div className="space-y-1.5 border-t border-slate-100 pt-3">
                      <Label>Move to department</Label>
                      <Select value={moveDept} onValueChange={setMoveDept}>
                        <SelectTrigger className="w-full" aria-label="Select department"><SelectValue placeholder={t.department ? `Now: ${t.department.name}` : "Select department"} /></SelectTrigger>
                        <SelectContent>
                          {departments.filter((d) => d.id !== t.department?.id).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                          {t.department ? <SelectItem value="none">No department (general queue)</SelectItem> : null}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <Checkbox checked={moveReassign} onCheckedChange={(v) => setMoveReassign(v === true)} />
                        Re-assign to someone in that department
                      </label>
                      <Button size="sm" variant="outline" className="w-full" disabled={!!busy || !moveDept}
                        onClick={async () => {
                          const okRes = await act("dept", () => fetch(`/api/v1/support/tickets/${t.id}/department`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ departmentId: moveDept === "none" ? null : moveDept, reassign: moveReassign }) }), "Department updated");
                          if (okRes) setMoveDept("");
                        }}>
                        {busy === "dept" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Move ticket
                      </Button>
                    </div>
                  ) : null}
                  {branches.length > 0 ? (
                    <div className="space-y-1.5 border-t border-slate-100 pt-3">
                      <Label>Transfer to another branch</Label>
                      <Select value={transferTo} onValueChange={setTransferTo}>
                        <SelectTrigger className="w-full" aria-label="Select branch"><SelectValue placeholder="Select branch" /></SelectTrigger>
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
