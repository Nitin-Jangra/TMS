"use client";

// Ticket record — classic service-desk form view.
// Header bar (back, record menu, title, action buttons), state flow, a
// two-column field layout (assignment group / assigned to / branch editable
// and saved with "Update"), Notes (customer-visible comments + work notes),
// an activity stream and related lists (attachments, assignment history,
// state history, reopen history). Closed tickets are read-only.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { STATUS_LABELS } from "@/lib/types";
import { StaffPicker, type StaffEntry } from "@/components/staff-picker";
import { CannedPicker } from "@/components/canned-picker";
import { pushHistory } from "@/components/sn/modules";
import { cn } from "@/lib/utils";
import {
  Activity, ChevronDown, ChevronLeft, ChevronUp, Copy, FileText, Info, Link2, Loader2, Menu, Paperclip, Printer,
  RefreshCw, ShieldAlert, Star, TriangleAlert,
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
    updatedAt: string;
    assignedAt: string | null;
    firstResponseAt: string | null;
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
    attachments: { id: string; originalName: string; sizeBytes: number; mimeType: string; createdAt?: string }[];
    reopenHistory: { id: string; reason: string; reopenedAt: string }[];
    slaTracking: { firstResponseMetAt: string | null; firstResponseBreached: boolean; resolutionBreached: boolean } | null;
    auditLogs?: { id: string; actorName: string; actorRole: string; action: string; previousValue: string; newValue: string; details: string; createdAt: string }[];
  };
  viewer: {
    id: string;
    role: string;
    designation?: string;
    branchId: string | null;
    canReassign?: boolean;
    canAssignAcrossBranches?: boolean;
    permissions?: {
      viewAllBranchTickets: boolean;
      searchGlobally: boolean;
      reassignTickets: boolean;
      transferBranch: boolean;
      updateStatus: boolean;
      changePriority: boolean;
      changeDepartment: boolean;
      addWorkNotes: boolean;
      addCustomerComments: boolean;
      viewReports: boolean;
      viewEmployees: boolean;
      exportTickets: boolean;
    };
  };
}

const PRIORITY_TEXT: Record<string, string> = { CRITICAL: "1 - Critical", HIGH: "2 - High", MEDIUM: "3 - Moderate", LOW: "4 - Low" };
const SOURCE_TEXT: Record<string, string> = { PORTAL: "Self-service portal", API_LMS: "LMS integration", API_CRM: "CRM integration", EMAIL: "Email", SEED: "Imported" };
const FLOW = ["NEW_COMPLAINT", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"];

const dt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(",", "")
    : "";

type ActivityKind = "comment" | "worknote" | "field";
interface ActivityEntry {
  id: string;
  at: string;
  who: string;
  kind: ActivityKind;
  title: string;
  body?: string;
  changes?: { field: string; to: string; from?: string }[];
}

type DialogKind = "hold" | "resolve" | "escalate" | null;

export default function TicketFormPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState("");
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);

  // Editable form fields (saved with Update)
  const [group, setGroup] = useState("");
  const [assignee, setAssignee] = useState("");
  const [branch, setBranch] = useState("");
  const [comments, setComments] = useState("");
  const [workNotes, setWorkNotes] = useState("");

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [dialogText, setDialogText] = useState("");
  const [notesOpen, setNotesOpen] = useState(true);
  const [activityFilter, setActivityFilter] = useState<"all" | ActivityKind>("all");
  const [tab, setTab] = useState<"attachments" | "assignments" | "states" | "reopens" | "audit">("assignments");

  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/support/tickets/${id}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) {
      setNotFound(true);
      return;
    }
    const d = body.data as Detail;
    setDetail(d);
    setGroup(d.ticket.department?.id || "");
    setAssignee(d.ticket.assignee?.id || "");
    setBranch(d.ticket.branch.id);
    pushHistory({ id: d.ticket.id, number: d.ticket.ticketNumber, title: d.ticket.description.slice(0, 80) });
  }, [id]);

   
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!detail?.viewer.canReassign) return;
    fetch("/api/v1/support/departments").then((r) => r.json()).then((d) => d.success && setDepartments(d.data.departments)).catch(() => undefined);
    fetch("/api/v1/support/staff-directory").then((r) => r.json()).then((d) => d.success && setStaff(d.data.staff)).catch(() => undefined);
    if (detail.viewer.canAssignAcrossBranches) {
      fetch("/api/v1/public/branches").then((r) => r.json()).then((d) => d.success && setBranches(d.data.branches)).catch(() => undefined);
    }
  }, [detail?.viewer.canReassign, detail?.viewer.canAssignAcrossBranches]);

  useEffect(() => {
    fetch("/api/v1/auth/me").then((r) => r.json()).then((d) => d.data?.user && setMe({ id: d.data.user.id, name: d.data.user.name })).catch(() => undefined);
  }, []);

  const activity = useMemo<ActivityEntry[]>(() => {
    if (!detail) return [];
    const t = detail.ticket;
    const out: ActivityEntry[] = [];

    // Messages: Work notes & Customer comments
    for (const m of t.messages) {
      const internal = m.visibility === "INTERNAL";
      out.push({
        id: `m-${m.id}`,
        at: m.createdAt,
        who: m.authorName,
        kind: internal ? "worknote" : "comment",
        title: internal ? "Work notes (Staff Only)" : m.authorType === "CUSTOMER" ? "Additional comments (Member)" : "Additional comments (Customer Visible)",
        body: m.body,
      });
    }

    // Status transitions with actor who changed status & work status
    for (const h of t.statusHistory) {
      const toLabel = STATUS_LABELS[h.toStatus] || h.toStatus;
      const fromLabel = h.fromStatus ? STATUS_LABELS[h.fromStatus] || h.fromStatus : undefined;
      const who = h.changedByName || "Staff";
      let actionLabel = `Status changed to ${toLabel}`;
      if (h.toStatus === "IN_PROGRESS") {
        actionLabel = `${who} started working on this ticket`;
      } else if (h.toStatus === "RESOLVED") {
        actionLabel = `${who} resolved this ticket`;
      } else if (h.toStatus === "ON_HOLD") {
        actionLabel = `${who} placed ticket on hold`;
      }

      out.push({
        id: `s-${h.id}`,
        at: h.createdAt,
        who,
        kind: "field",
        title: actionLabel,
        changes: [{ field: "State", to: toLabel, from: fromLabel }],
        body: h.note || undefined,
      });
    }

    // Assignments: explicit who assigned whom
    for (const a of t.assignments) {
      const matchingAudit = t.auditLogs?.find(
        (al) => (al.action === "TICKET_ASSIGNED" || al.action === "TICKET_REASSIGNED") &&
          Math.abs(new Date(al.createdAt).getTime() - new Date(a.createdAt).getTime()) < 10000
      );
      const who = matchingAudit?.actorName || (a.note.includes("by ") ? a.note.split("by ")[1]?.split(" ")[0] || "Staff" : a.method === "MANUAL" ? "Staff" : "System Round-Robin");
      const title = a.note ? `Assigned to ${a.assignee.name} (${a.note})` : `Assigned to ${a.assignee.name}`;

      out.push({
        id: `a-${a.id}`,
        at: a.createdAt,
        who,
        kind: "field",
        title,
        changes: [{ field: "Assigned to", to: a.assignee.name }],
        body: matchingAudit?.details || a.note || `Assignment via ${a.method.replace(/_/g, " ").toLowerCase()}`,
      });
    }

    // Audit logs for group changes, branch transfer, escalation
    if (t.auditLogs) {
      for (const al of t.auditLogs) {
        if (["STATUS_CHANGED", "RESOLUTION", "INTERNAL_NOTE", "CUSTOMER_REPLY", "TICKET_ASSIGNED", "TICKET_REASSIGNED"].includes(al.action)) {
          continue;
        }
        if (al.action === "DEPARTMENT_CHANGED") {
          out.push({
            id: `al-${al.id}`,
            at: al.createdAt,
            who: al.actorName,
            kind: "field",
            title: `Assignment Group updated by ${al.actorName}`,
            changes: [{ field: "Assignment group", to: al.newValue, from: al.previousValue || undefined }],
            body: al.details,
          });
        } else if (al.action === "BRANCH_TRANSFER") {
          out.push({
            id: `al-${al.id}`,
            at: al.createdAt,
            who: al.actorName,
            kind: "field",
            title: `Branch transfer by ${al.actorName}`,
            changes: [{ field: "Branch", to: al.newValue, from: al.previousValue || undefined }],
            body: al.details,
          });
        } else if (al.action === "ESCALATED") {
          out.push({
            id: `al-${al.id}`,
            at: al.createdAt,
            who: al.actorName,
            kind: "field",
            title: `Escalated by ${al.actorName}`,
            body: al.details,
          });
        }
      }
    }

    // Reopen history
    for (const r of t.reopenHistory) {
      out.push({ id: `r-${r.id}`, at: r.reopenedAt, who: t.customerName, kind: "comment", title: "Reopened by member", body: r.reason });
    }
    if (t.feedback) {
      out.push({ id: "fb", at: t.feedback.createdAt, who: t.customerName, kind: "comment", title: `Member rating ${t.feedback.rating}/5`, body: t.feedback.comment || undefined });
    }
    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [detail]);

  if (notFound) {
    return (
      <div className="-m-5 ui16">
        <div className="u-bar flex items-center gap-2 px-3">
          <button type="button" className="u-icon-btn" onClick={() => router.push("/staff/tickets")} aria-label="Back"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
          <h1 className="text-[17px] font-semibold">Ticket</h1>
        </div>
        <p className="p-6 text-sm text-[var(--u-text-2)]">Record not found, or you do not have access to it. <Link href="/staff/tickets" className="u-link">Back to the list</Link></p>
      </div>
    );
  }
  if (!detail) {
    return <div className="-m-5 p-6 text-sm text-[var(--u-text-2)]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />Loading record…</div>;
  }

  const t = detail.ticket;
  const isClosed = t.status === "CLOSED";
  const perms = detail.viewer.permissions;
  const canAssign = (perms ? perms.reassignTickets : !!detail.viewer.canReassign) && !isClosed;
  const canUpdateStatus = (perms ? perms.updateStatus : true) && !isClosed;
  const canChangeDept = (perms ? perms.changeDepartment : canAssign) && !isClosed;
  const canWorkNote = (perms ? perms.addWorkNotes : true) && !isClosed;
  const canComment = (perms ? perms.addCustomerComments : true) && !isClosed;
  const acrossBranches = (perms ? perms.transferBranch : !!detail.viewer.canAssignAcrossBranches) && !isClosed;
  const overdue = !!t.slaResolutionDueAt && !["RESOLVED", "CLOSED"].includes(t.status) && new Date(t.slaResolutionDueAt) < new Date();
  const shortDescription = t.description.split(/\r?\n/)[0].slice(0, 160);
  const resolutionNote = [...t.statusHistory].reverse().find((h) => h.toStatus === "RESOLVED")?.note || "";

  const branchChanged = branch !== t.branch.id;
  const groupChanged = group !== (t.department?.id || "");
  const assigneeChanged = !!assignee && assignee !== (t.assignee?.id || "");
  const dirty = branchChanged || groupChanged || assigneeChanged || !!comments.trim() || !!workNotes.trim();
  const assigneeEntry = staff.find((s) => s.id === assignee);

  const call = async (url: string, method: string, payload: unknown) => {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) throw new Error(body.error?.message || "Request failed.");
    return body.data;
  };

  /** Save every changed field / journal entry, in a safe order. */
  const update = async (thenBack = false) => {
    if (!dirty) {
      if (thenBack) router.push("/staff/tickets");
      return;
    }
    setBusy("update");
    const done: string[] = [];
    try {
      if (branchChanged) { await call(`/api/v1/support/tickets/${t.id}/assign`, "POST", { transferBranchId: branch }); done.push("branch transferred"); }
      if (groupChanged) { await call(`/api/v1/support/tickets/${t.id}/department`, "PATCH", { departmentId: group || null, reassign: false }); done.push("assignment group updated"); }
      if (assigneeChanged) { await call(`/api/v1/support/tickets/${t.id}/assign`, "POST", { employeeId: assignee }); done.push("assigned"); }
      if (comments.trim()) { await call(`/api/v1/support/tickets/${t.id}/replies`, "POST", { reply: comments.trim() }); setComments(""); done.push("comment sent to member"); }
      if (workNotes.trim()) { await call(`/api/v1/support/tickets/${t.id}/notes`, "POST", { note: workNotes.trim() }); setWorkNotes(""); done.push("work note added"); }
      toast({ title: `Record updated`, description: done.join(" · ") });
      if (thenBack) router.push("/staff/tickets");
      else await load();
    } catch (err) {
      toast({ title: "Update failed", description: `${(err as Error).message}${done.length ? ` (saved before the error: ${done.join(", ")})` : ""}`, variant: "destructive" });
      await load();
    } finally {
      setBusy("");
    }
  };

  const stateAction = async (key: string, url: string, method: string, payload: unknown, okMsg: string) => {
    setBusy(key);
    try {
      await call(url, method, payload);
      toast({ title: okMsg });
      setDialog(null);
      setDialogText("");
      await load();
    } catch (err) {
      toast({ title: "Action failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const startWork = () => stateAction("start", `/api/v1/support/tickets/${t.id}/status`, "PATCH", { toStatus: "IN_PROGRESS", note: t.status === "ON_HOLD" ? "Resumed from hold" : "Work started" }, t.status === "ON_HOLD" ? "Ticket resumed" : "Work started");
  const assignToMe = () => me && stateAction("me", `/api/v1/support/tickets/${t.id}/assign`, "POST", { employeeId: me.id, note: "Assigned to self" }, "Assigned to you");
  const canSelfAssign = canAssign && !!me && t.assignee?.id !== me.id && staff.some((s) => s.id === me.id);

  const submitDialog = () => {
    const text = dialogText.trim();
    if (dialog === "hold") return stateAction("hold", `/api/v1/support/tickets/${t.id}/status`, "PATCH", { toStatus: "ON_HOLD", reason: text }, "Ticket placed on hold");
    if (dialog === "resolve") return stateAction("resolve", `/api/v1/support/tickets/${t.id}/resolve`, "POST", { resolution: text }, "Ticket resolved — closure scheduled");
    if (dialog === "escalate") return stateAction("escalate", `/api/v1/support/tickets/${t.id}/escalate`, "POST", { reason: text || "Manual escalation" }, "Ticket escalated");
  };

  const actionButtons = (
    <>
      {!isClosed ? (
        <button type="button" className="u-btn u-btn-primary" disabled={!!busy || !dirty} onClick={() => update(false)} title={dirty ? "Save your changes" : "No changes to save"}>
          {busy === "update" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}Update
        </button>
      ) : null}
      {canSelfAssign ? <button type="button" className="u-btn" disabled={!!busy} onClick={assignToMe}>Assign to me</button> : null}
      {canUpdateStatus && t.status === "NEW_COMPLAINT" ? <button type="button" className="u-btn" disabled={!!busy} onClick={startWork}>{busy === "start" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}Start Work</button> : null}
      {canUpdateStatus && t.status === "ON_HOLD" ? <button type="button" className="u-btn" disabled={!!busy} onClick={startWork}>{busy === "start" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}Resume</button> : null}
      {canUpdateStatus && t.status === "IN_PROGRESS" ? <button type="button" className="u-btn" disabled={!!busy} onClick={() => { setDialogText(""); setDialog("hold"); }}>On Hold</button> : null}
      {canUpdateStatus && t.status === "IN_PROGRESS" ? <button type="button" className="u-btn" disabled={!!busy} onClick={() => { setDialogText(""); setDialog("resolve"); }}>Resolve Ticket</button> : null}
      {!isClosed && !t.escalatedAt && t.status !== "RESOLVED" ? <button type="button" className="u-btn" disabled={!!busy} onClick={() => { setDialogText(""); setDialog("escalate"); }}>Escalate</button> : null}
    </>
  );

  const ro = (value: string, extra?: React.ReactNode) => (
    <div className="flex items-center gap-1.5">
      <input className="u-input" readOnly value={value} />
      {extra}
    </div>
  );

  const field = (label: string, control: React.ReactNode, opts: { req?: boolean; htmlFor?: string } = {}) => (
    <div className="u-field">
      <label className={cn("u-label", opts.req && "req")} htmlFor={opts.htmlFor}>{label}</label>
      <div className="min-w-0">{control}</div>
    </div>
  );

  const filtered = activity.filter((a) => activityFilter === "all" || a.kind === activityFilter);

  return (
    <div className="-m-5 flex min-h-[calc(100vh-52px)] flex-col bg-white">
      {/* Form header */}
      <div className="u-bar sticky -top-5 z-20 flex flex-wrap items-center gap-2 px-3 py-2">
        <button type="button" className="u-icon-btn" onClick={() => router.push("/staff/tickets")} aria-label="Back to list" title="Back"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="u-icon-btn" aria-label="Record menu" title="Additional actions"><Menu className="h-4 w-4" aria-hidden /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => { navigator.clipboard?.writeText(window.location.href); toast({ title: "Link copied" }); }}><Link2 className="mr-2 h-4 w-4" aria-hidden />Copy URL</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { navigator.clipboard?.writeText(t.ticketNumber); toast({ title: "Ticket number copied" }); }}><Copy className="mr-2 h-4 w-4" aria-hidden />Copy ticket number</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => load()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden />Reload form</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => window.print()}><Printer className="mr-2 h-4 w-4" aria-hidden />Print</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <h1 className="mr-2 truncate text-[17px] font-semibold">Ticket - {t.ticketNumber}</h1>
        <a href="#related" className="u-ghost-icon" title={`Attachments (${t.attachments.length})`} aria-label="Attachments">
          <Paperclip className="h-[18px] w-[18px]" aria-hidden />
        </a>
        <a href="#activity" className="u-ghost-icon" title="Activity" aria-label="Activity"><Activity className="h-[18px] w-[18px]" aria-hidden /></a>
        <div className="ml-auto flex flex-wrap items-center gap-2">{actionButtons}</div>
      </div>

      {/* State flow */}
      <div className="u-flow" aria-label="Ticket state">
        {FLOW.map((s) => {
          const idx = FLOW.indexOf(t.status);
          const i = FLOW.indexOf(s);
          const onHoldSkipped = s === "ON_HOLD" && t.status !== "ON_HOLD" && !t.statusHistory.some((h) => h.toStatus === "ON_HOLD");
          const cls = s === t.status ? "current" : i < idx && !onHoldSkipped ? "done" : "";
          return <div key={s} className={cn("u-flow-step", cls)}>{STATUS_LABELS[s] || s}</div>;
        })}
      </div>

      {/* Info messages */}
      {isClosed ? (
        <div className="border-b border-[#c7d8ee] bg-[#eef5fd] px-4 py-2 text-sm text-[#1e4f87]">
          <Info className="mr-2 inline h-4 w-4" aria-hidden />This ticket is closed and read-only. Closed tickets are kept as a historical record.
        </div>
      ) : null}
      {overdue ? (
        <div className="border-b border-[#f3c4c0] bg-[#fdf0ef] px-4 py-2 text-sm text-[#9b2c22]">
          <TriangleAlert className="mr-2 inline h-4 w-4" aria-hidden />Resolution deadline passed on {dt(t.slaResolutionDueAt)}.
        </div>
      ) : null}
      {t.escalatedAt ? (
        <div className="border-b border-[#ddd0f7] bg-[#f6f2fe] px-4 py-2 text-sm text-[#5b3aa8]">
          <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden />Escalated on {dt(t.escalatedAt)}.
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[1400px] space-y-8 px-6 py-6">
        {/* Fields */}
        <section className="space-y-3">
          <div className="u-form-grid">
            <div className="space-y-2.5">
              {field("Number", ro(t.ticketNumber))}
              {field("Member", ro(t.customerName, (
                <a className="u-icon-btn shrink-0" href={`/staff/tickets?customerSearch=${encodeURIComponent(t.customerPhone)}&scope=all`} title="Other tickets from this member" aria-label="Other tickets from this member">
                  <Info className="h-4 w-4 text-[var(--u-accent)]" aria-hidden />
                </a>
              )), { req: true })}
              {field("Mobile", ro(t.customerPhone))}
              {field("Email", ro(t.customerEmail))}
              {field("Branch", canAssign && acrossBranches && branches.length ? (
                <select className={cn("u-select", branchChanged && "u-changed")} value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch">
                  {!branches.some((b) => b.id === t.branch.id) ? <option value={t.branch.id}>{t.branch.name}</option> : null}
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              ) : ro(`${t.branch.name} (${t.branch.code})`), { req: true })}
              {field("Category", ro(t.category.name), { req: true })}
              {field("Priority", ro(PRIORITY_TEXT[t.priority] || t.priority))}
            </div>
            <div className="space-y-2.5">
              {field("Opened", ro(dt(t.createdAt)))}
              {field("Contact type", ro(SOURCE_TEXT[t.source] || t.source))}
              {field("State", ro(STATUS_LABELS[t.status] || t.status))}
              {field("Assignment group", canChangeDept ? (
                <select className={cn("u-select", groupChanged && "u-changed")} value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Assignment group">
                  <option value="">-- None --</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              ) : ro(t.department?.name || ""))}
              {field("Assigned to", canAssign ? (
                <div className={cn("rounded-[3px]", assigneeChanged && "u-changed")}>
                  <StaffPicker
                    staff={acrossBranches ? staff : staff.filter((p) => p.branchId === t.branch.id)}
                    value={assignee}
                    onChange={setAssignee}
                    placeholder="(empty) — select employee"
                    preferBranchId={branch}
                    className="!h-8 w-full !rounded-[3px] !border-[var(--u-input-line)] !text-sm"
                    ariaLabel="Assigned to"
                  />
                </div>
              ) : ro(t.assignee?.name || ""))}
              {assigneeChanged && assigneeEntry ? (
                <p className="pl-[calc(34%+12px)] text-xs text-[#8a5a00]">
                  {assigneeEntry.branchId !== branch ? `Ticket will move to ${assigneeEntry.branch?.name}. ` : ""}
                  {!assigneeEntry.availabilityEnabled ? `${assigneeEntry.name} is marked away. ` : ""}
                  {assigneeEntry.openTickets} open ticket{assigneeEntry.openTickets === 1 ? "" : "s"}.
                </p>
              ) : null}
              {field("Escalated", ro(t.escalatedAt ? `Yes — ${dt(t.escalatedAt)}` : "No"))}
              {field("Resolution due", ro(dt(t.slaResolutionDueAt) + (t.slaTracking?.resolutionBreached || overdue ? "  (breached)" : "")))}
            </div>
          </div>

          <div className="u-field-wide pt-1">
            <label className="u-label req pt-1.5">Short description</label>
            <input className="u-input" readOnly value={shortDescription} />
          </div>
          <div className="u-field-wide">
            <label className="u-label pt-1.5">Description</label>
            <textarea className="u-textarea" readOnly rows={Math.min(8, Math.max(3, Math.ceil(t.description.length / 140)))} value={t.description} />
          </div>
        </section>

        {/* Notes */}
        <section id="activity" className="space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--u-line)] pb-1.5">
            <h2 className="u-section-title">Notes</h2>
            <button type="button" className="u-ghost-icon" onClick={() => setNotesOpen((v) => !v)} aria-label={notesOpen ? "Collapse notes" : "Expand notes"} aria-expanded={notesOpen}>
              {notesOpen ? <ChevronUp className="h-5 w-5" aria-hidden /> : <ChevronDown className="h-5 w-5" aria-hidden />}
            </button>
          </div>

          {notesOpen ? (
            <>
              {!isClosed && (canComment || canWorkNote) ? (
                <>
                  {canComment ? (
                    <div className="u-field-wide">
                      <div className="u-label pt-1.5">
                        Additional comments
                        <span className="block text-xs text-[var(--u-text-2)]">(Member visible — emailed)</span>
                      </div>
                      <div className="space-y-1">
                        <textarea className="u-textarea" rows={3} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Reply to the member…" aria-label="Additional comments (member visible)" />
                        <div className="flex justify-end">
                          <CannedPicker
                            context={{ customerName: t.customerName, ticketNumber: t.ticketNumber, branchName: t.branch.name, categoryName: t.category.name, categoryId: t.category.id }}
                            onInsert={(text) => setComments((cur) => (cur.trim() ? `${cur.trimEnd()}\n\n${text}` : text))}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {canWorkNote ? (
                    <div className="u-field-wide">
                      <label className="u-label pt-1.5" htmlFor="work-notes">
                        Work notes
                        <span className="block text-xs text-[var(--u-text-2)]">(Staff only)</span>
                      </label>
                      <textarea id="work-notes" className="u-textarea u-worknotes" rows={3} value={workNotes} onChange={(e) => setWorkNotes(e.target.value)} placeholder="Internal note for the team…" />
                    </div>
                  ) : null}
                  <div className="u-field-wide">
                    <span />
                    <div className="flex justify-end">
                      <button type="button" className="u-btn u-btn-primary" disabled={!!busy || (!comments.trim() && !workNotes.trim())} onClick={() => update(false)}>Post</button>
                    </div>
                  </div>
                </>
              ) : null}

              {/* Activity stream */}
              <div className="u-field-wide">
                <div className="u-label pt-1">Activity</div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1 text-sm">
                    {(["all", "comment", "worknote", "field"] as const).map((k) => (
                      <button key={k} type="button" onClick={() => setActivityFilter(k)}
                        className={cn("rounded px-2 py-1", activityFilter === k ? "bg-[#e3effc] font-semibold text-[var(--u-link)]" : "text-[var(--u-text-2)] hover:bg-[#f1f2f3]")}>
                        {k === "all" ? `All (${activity.length})` : k === "comment" ? "Comments" : k === "worknote" ? "Work notes" : "Field changes"}
                      </button>
                    ))}
                  </div>
                  {filtered.length === 0 ? <p className="text-sm text-[var(--u-text-2)]">No activity yet.</p> : null}
                  {filtered.map((a) => (
                    <div key={a.id} className={cn("u-activity px-3 py-2", a.kind === "comment" && "is-comment", a.kind === "worknote" && "is-worknote", a.kind === "field" && "is-field")}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                        <span>
                          <span className="mr-2 tabular-nums text-[var(--u-text-2)]">{dt(a.at)}</span>
                          <span className="font-semibold text-[#1d5fb0]">{a.who}</span>
                        </span>
                        <span className="text-xs font-medium text-[var(--u-text-2)]">{a.title}</span>
                      </div>
                      {a.changes?.map((c, i) => (
                        <p key={i} className="mt-1 text-[13px]">
                          <span className="font-semibold">{c.field}:</span> {c.to}
                          {c.from ? <span className="text-[var(--u-text-2)]"> was {c.from}</span> : null}
                        </p>
                      ))}
                      {a.body ? <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{a.body}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </section>

        {/* Resolution & SLA */}
        <section className="space-y-3">
          <div className="border-b border-[var(--u-line)] pb-1.5"><h2 className="u-section-title">Resolution information &amp; SLA</h2></div>
          <div className="u-form-grid">
            <div className="space-y-2.5">
              {field("Resolved", ro(dt(t.resolvedAt)))}
              {field("Auto-close on", ro(t.status === "RESOLVED" ? dt(t.autoCloseAt) : ""))}
              {field("Closed", ro(dt(t.closedAt)))}
              {field("Reopen count", ro(String(t.reopenCount)))}
            </div>
            <div className="space-y-2.5">
              {field("Response due", ro(dt(t.slaResponseDueAt) + (t.slaTracking?.firstResponseBreached ? "  (breached)" : "")))}
              {field("First response", ro(dt(t.firstResponseAt || t.slaTracking?.firstResponseMetAt || null)))}
              {field("Member rating", t.feedback ? (
                <div className="flex h-8 items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cn("h-4 w-4", n <= t.feedback!.rating ? "fill-[#f4b400] text-[#f4b400]" : "text-[#c4c9cf]")} aria-hidden />)}
                  <span className="ml-1 text-sm font-semibold">{t.feedback.rating}/5</span>
                </div>
              ) : ro(t.status === "RESOLVED" || isClosed ? "Not rated yet" : ""))}
              {field("Updated", ro(dt(t.updatedAt)))}
            </div>
          </div>
          <div className="u-field-wide">
            <label className="u-label pt-1.5">Resolution notes</label>
            <textarea className="u-textarea" readOnly rows={2} value={resolutionNote} />
          </div>
          {t.feedback?.comment ? (
            <div className="u-field-wide">
              <label className="u-label pt-1.5">Member feedback</label>
              <textarea className="u-textarea" readOnly rows={2} value={t.feedback.comment} />
            </div>
          ) : null}
        </section>

        {/* Bottom buttons (as in the header) */}
        {!isClosed ? <div className="flex flex-wrap gap-2 border-t border-[var(--u-line)] pt-4">{actionButtons}</div> : null}
      </div>

      {/* Related lists */}
      <section id="related" className="mt-auto border-t border-[var(--u-bar-line)] bg-white">
        <div className="flex overflow-x-auto border-b border-[var(--u-line)] bg-[var(--u-bar)] px-3" role="tablist">
          {([
            ["assignments", `Assignment history (${t.assignments.length})`],
            ["states", `State history (${t.statusHistory.length})`],
            ["attachments", `Attachments (${t.attachments.length})`],
            ["reopens", `Reopen history (${t.reopenHistory.length})`],
            ["audit", `Audit trail (${t.auditLogs?.length || 0})`],
          ] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={cn("u-tab", tab === k && "is-active")} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="u-table min-w-[720px]">
            {tab === "assignments" ? (
              <>
                <thead><tr><th>Assigned to</th><th>Method</th><th>Note</th><th>Created</th></tr></thead>
                <tbody>
                  {t.assignments.length ? [...t.assignments].reverse().map((a) => (
                    <tr key={a.id}><td>{a.assignee.name}</td><td>{a.method.replace(/_/g, " ").toLowerCase()}</td><td className="max-w-[520px]">{a.note}</td><td className="whitespace-nowrap tabular-nums">{dt(a.createdAt)}</td></tr>
                  )) : <tr><td colSpan={4} className="text-center text-[var(--u-text-2)]">No records to display</td></tr>}
                </tbody>
              </>
            ) : null}
            {tab === "states" ? (
              <>
                <thead><tr><th>From</th><th>To</th><th>Changed by</th><th>Note</th><th>Created</th></tr></thead>
                <tbody>
                  {[...t.statusHistory].reverse().map((h) => (
                    <tr key={h.id}><td>{h.fromStatus ? STATUS_LABELS[h.fromStatus] || h.fromStatus : "—"}</td><td>{STATUS_LABELS[h.toStatus] || h.toStatus}</td><td>{h.changedByName}</td><td className="max-w-[520px]">{h.note}</td><td className="whitespace-nowrap tabular-nums">{dt(h.createdAt)}</td></tr>
                  ))}
                </tbody>
              </>
            ) : null}
            {tab === "attachments" ? (
              <>
                <thead><tr><th>File name</th><th>Type</th><th>Size</th></tr></thead>
                <tbody>
                  {t.attachments.length ? t.attachments.map((a) => (
                    <tr key={a.id}>
                      <td><a href={`/api/v1/attachments/${a.id}`} target="_blank" rel="noreferrer" className="u-link inline-flex items-center gap-1.5"><FileText className="h-4 w-4" aria-hidden />{a.originalName}</a></td>
                      <td>{a.mimeType}</td><td className="tabular-nums">{Math.max(1, Math.round(a.sizeBytes / 1024))} KB</td>
                    </tr>
                  )) : <tr><td colSpan={3} className="text-center text-[var(--u-text-2)]">No records to display</td></tr>}
                </tbody>
              </>
            ) : null}
            {tab === "reopens" ? (
              <>
                <thead><tr><th>Reason</th><th>Reopened</th></tr></thead>
                <tbody>
                  {t.reopenHistory.length ? t.reopenHistory.map((r) => (
                    <tr key={r.id}><td>{r.reason}</td><td className="whitespace-nowrap tabular-nums">{dt(r.reopenedAt)}</td></tr>
                  )) : <tr><td colSpan={2} className="text-center text-[var(--u-text-2)]">No records to display</td></tr>}
                </tbody>
              </>
            ) : null}
            {tab === "audit" ? (
              <>
                <thead><tr><th>Action</th><th>Actor</th><th>Role</th><th>Previous</th><th>New</th><th>Details</th><th>Time</th></tr></thead>
                <tbody>
                  {t.auditLogs?.length ? [...t.auditLogs].reverse().map((al) => (
                    <tr key={al.id}>
                      <td className="font-semibold text-slate-900">{al.action.replace(/_/g, " ")}</td>
                      <td className="font-medium text-[#1F70C1]">{al.actorName}</td>
                      <td><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{al.actorRole}</span></td>
                      <td className="max-w-[140px] truncate text-slate-500">{al.previousValue || "—"}</td>
                      <td className="max-w-[140px] truncate font-medium text-slate-800">{al.newValue || "—"}</td>
                      <td className="max-w-[340px]">{al.details || "—"}</td>
                      <td className="whitespace-nowrap tabular-nums text-slate-500">{dt(al.createdAt)}</td>
                    </tr>
                  )) : <tr><td colSpan={7} className="text-center text-[var(--u-text-2)]">No audit logs recorded</td></tr>}
                </tbody>
              </>
            ) : null}
          </table>
        </div>
      </section>

      {/* Action dialogs */}
      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) { setDialog(null); setDialogText(""); } }}>
        <DialogContent className="ui16 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog === "hold" ? "Put ticket on hold" : dialog === "resolve" ? "Resolve ticket" : "Escalate ticket"}</DialogTitle>
            <DialogDescription>
              {dialog === "hold" ? "The reason is shared with the member." : dialog === "resolve" ? "Resolution notes are emailed to the member, who can reopen within the reopen window." : "Central support and the branch are notified."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className={cn("text-sm font-medium", dialog !== "escalate" && "after:ml-0.5 after:text-[#d93025] after:content-['*']")} htmlFor="dialog-text">
                {dialog === "hold" ? "On hold reason" : dialog === "resolve" ? "Resolution notes" : "Reason (optional)"}
              </label>
              {dialog === "resolve" ? (
                <CannedPicker
                  context={{ customerName: t.customerName, ticketNumber: t.ticketNumber, branchName: t.branch.name, categoryName: t.category.name, categoryId: t.category.id }}
                  onInsert={(text) => setDialogText((cur) => (cur.trim() ? `${cur.trimEnd()}\n\n${text}` : text))}
                />
              ) : null}
            </div>
            <textarea id="dialog-text" className="u-textarea" rows={4} value={dialogText} onChange={(e) => setDialogText(e.target.value)} maxLength={2000} />
          </div>
          <DialogFooter>
            <button type="button" className="u-btn" onClick={() => setDialog(null)}>Cancel</button>
            <button type="button" className="u-btn u-btn-primary" disabled={!!busy || (dialog !== "escalate" && dialogText.trim().length < 3)} onClick={submitDialog}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {dialog === "hold" ? "Put on hold" : dialog === "resolve" ? "Resolve" : "Escalate"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
