"use client";

// Ticket record — modern service-desk workspace following PulseDesk layout and structure.
// - Sticky Contextual Action Bar: Back, record options, ticket number, status badge,
//   department subtitle, Discuss, Follow/Save, and Resolve.
// - Attachments Quick-Strip: horizontal file chips for quick access to diagnostic files.
// - Primary Ticket Form Card with Interactive Tabs:
//     Tab 1: Ticket Details (2-column layout: Requester & Identity | Triage & Routing)
//     Tab 2: Classification (Category, support level, short description, description)
//     Tab 3: Notes & Activity (dual-channel work notes & customer comments, activity timeline)
//     Tab 4: Resolution Information (resolution notes, auto-close, member rating & feedback)
// - Bottom Related Lists Card:
//     Task SLAs (visual progress bar, elapsed %, business time left, breach status),
//     Assignment History, State History, Attachments, Audit Trail.
// Preserves all existing functionality and API contracts.

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
import { cachedFetch } from "@/lib/client-cache";
import type { RolePermissions } from "@/lib/permissions";
import {
  ArrowLeft, ChevronLeft, Copy,
  FileText, Info, Link2, Loader2, Mail, Menu, MessageSquare, Paperclip,
  Printer, RefreshCw, Send, ShieldAlert, Star, Timer, Trash2, Upload, User, X,
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
    permissions?: RolePermissions;
  };
}

const PRIORITY_TEXT: Record<string, string> = { CRITICAL: "1 - Critical", HIGH: "2 - High", MEDIUM: "3 - Moderate", LOW: "4 - Low" };
const SOURCE_TEXT: Record<string, string> = { PORTAL: "Self-service portal", API_LMS: "LMS integration", API_CRM: "CRM integration", EMAIL: "Email", SEED: "Imported" };

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
  changes?: { field: string; to: string; from?: string }[];
  body?: string;
}

type MainTab = "details" | "classification" | "notes" | "resolution";
type RelatedTab = "slas" | "assignments" | "states" | "attachments" | "reopens" | "audit";

function computeSla(
  createdAt: string,
  dueAt: string | null,
  metAt: string | null,
  breached: boolean
) {
  if (!dueAt) return null;
  const start = new Date(createdAt).getTime();
  const due = new Date(dueAt).getTime();
  const end = metAt ? new Date(metAt).getTime() : Date.now();
  const totalDuration = Math.max(1, due - start);
  const elapsed = Math.max(0, end - start);
  const percent = Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)));

  const formatDuration = (ms: number) => {
    const totalMinutes = Math.floor(Math.abs(ms) / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${mins}m`;
  };

  const isCompleted = !!metAt;
  const isBreached = breached || (!isCompleted && Date.now() > due);
  const timeLeft = due - Date.now();

  return {
    isCompleted,
    status: isCompleted ? "Completed" : "Active",
    elapsedText: formatDuration(elapsed),
    percent,
    timeLeftText: isCompleted ? "Met" : timeLeft > 0 ? formatDuration(timeLeft) : "0m (Breached)",
    isBreached,
    breachStatus: isBreached ? "Breached" : "On track",
    targetTime: dt(dueAt),
  };
}

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { toast } = useToast();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState("");

  // Tab selections
  const [activeTab, setActiveTab] = useState<MainTab>("details");
  const [activeRelatedTab, setActiveRelatedTab] = useState<RelatedTab>("slas");

  // Form draft state
  const [branch, setBranch] = useState("");
  const [group, setGroup] = useState("");
  const [assignee, setAssignee] = useState("");
  const [comments, setComments] = useState("");
  const [workNotes, setWorkNotes] = useState("");
  const [noteType, setNoteType] = useState<"internal" | "comment">("internal");
  const [selectedState, setSelectedState] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [statusResolution, setStatusResolution] = useState("");

  // Modals state
  const [attachmentsModalOpen, setAttachmentsModalOpen] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);

  const [mailModalOpen, setMailModalOpen] = useState(false);
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [mailFiles, setMailFiles] = useState<File[]>([]);
  const [sendingMail, setSendingMail] = useState(false);

  // Supporting entities
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);

  // Filter for activity stream
  const [activityFilter, setActivityFilter] = useState<"all" | ActivityKind>("all");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/v1/support/tickets/${id}`);
      const body = await res.json();
      if (res.status === 404) { setNotFound(true); return; }
      if (!body.success) {
        toast({ title: "Could not load ticket", description: body.error?.message, variant: "destructive" });
        return;
      }
      const d: Detail = body.data;
      setDetail(d);
      setGroup(d.ticket.department?.id || "");
      setAssignee(d.ticket.assignee?.id || "");
      setBranch(d.ticket.branch.id);
      setSelectedState(d.ticket.status === "NEW_COMPLAINT" ? "IN_PROGRESS" : d.ticket.status);
      pushHistory({ id: d.ticket.id, number: d.ticket.ticketNumber, title: d.ticket.description.slice(0, 80) });
    } catch {
      toast({ title: "Network error", description: "Failed to fetch ticket record.", variant: "destructive" });
    }
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!detail?.viewer.canReassign) return;
    cachedFetch<any>("/api/v1/support/departments", { ttlMs: 300000 }).then((d) => d?.success && setDepartments(d.data.departments));
    cachedFetch<any>("/api/v1/support/staff-directory", { ttlMs: 60000 }).then((d) => d?.success && setStaff(d.data.staff));
    if (detail.viewer.canAssignAcrossBranches) {
      cachedFetch<any>("/api/v1/public/branches", { ttlMs: 300000 }).then((d) => d?.success && setBranches(d.data.branches));
    }
  }, [detail?.viewer.canReassign, detail?.viewer.canAssignAcrossBranches]);

  useEffect(() => {
    cachedFetch<any>("/api/v1/auth/me", { ttlMs: 60000 }).then((d) => d?.data?.user && setMe({ id: d.data.user.id, name: d.data.user.name }));
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
        title: internal ? "Work notes (Staff Only)" : m.authorType === "CUSTOMER" ? "Requester comment" : "Response (Customer Visible)",
        body: m.body,
      });
    }

    // Status transitions
    for (const h of t.statusHistory) {
      const toLabel = STATUS_LABELS[h.toStatus] || h.toStatus;
      const fromLabel = h.fromStatus ? STATUS_LABELS[h.fromStatus] || h.fromStatus : undefined;
      const who = h.changedByName || "Staff";
      let actionLabel = `Status changed to ${toLabel}`;
      if (h.toStatus === "IN_PROGRESS") actionLabel = `${who} started working on this ticket`;
      else if (h.toStatus === "RESOLVED") actionLabel = `${who} resolved this ticket`;
      else if (h.toStatus === "ON_HOLD") actionLabel = `${who} placed ticket on hold`;

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

    // Assignments
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
      <div className="mx-auto max-w-4xl p-8">
        <div className="flex items-center gap-2 mb-4">
          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded border border-border hover:bg-muted" onClick={() => router.push("/staff/tickets")} aria-label="Back">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <h1 className="text-xl font-bold">Ticket Not Found</h1>
        </div>
        <p className="text-sm text-muted-foreground">The requested ticket record was not found or you do not have permission to view it.</p>
        <Link href="/staff/tickets" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">Return to ticket queue</Link>
      </div>
    );
  }

  if (!detail) {
    return <div className="flex h-96 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />Loading ticket workspace…</div>;
  }

  const t = detail.ticket;
  const isClosed = t.status === "CLOSED";
  const perms = detail.viewer.permissions;
  const canAssign = (perms ? perms.reassignTickets : !!detail.viewer.canReassign) && !isClosed;
  const canUpdateStatus = (perms ? perms.updateStatus : true) && !isClosed;
  const canChangeDept = (perms ? perms.changeDepartment : canAssign) && !isClosed;
  const canWorkNote = (perms ? perms.addWorkNotes : true) && !isClosed;
  const canComment = (perms ? perms.addCustomerComments : true) && !isClosed;
  const canMail = (perms ? perms.sendCustomerEmail : true) && !isClosed;
  const canManageAttachments = perms ? perms.manageAttachments : true;
  const canUseCanned = perms ? perms.useCannedResponses : true;
  const canViewAudit = perms ? perms.viewAuditLogs : true;
  const acrossBranches = (perms ? perms.transferBranch : !!detail.viewer.canAssignAcrossBranches) && !isClosed;
  const overdue = !!t.slaResolutionDueAt && !["RESOLVED", "CLOSED"].includes(t.status) && new Date(t.slaResolutionDueAt) < new Date();
  const shortDescription = t.description.split(/\r?\n/)[0].slice(0, 160);
  const resolutionNote = [...t.statusHistory].reverse().find((h) => h.toStatus === "RESOLVED")?.note || "";

  const branchChanged = branch !== t.branch.id;
  const groupChanged = group !== (t.department?.id || "");
  const assigneeChanged = !!assignee && assignee !== (t.assignee?.id || "");
  const stateChanged = !!selectedState && selectedState !== t.status;
  const dirty = stateChanged || branchChanged || groupChanged || assigneeChanged || !!comments.trim() || !!workNotes.trim();
  const assigneeEntry = staff.find((s) => s.id === assignee);

  // Compute Task SLAs
  const firstResponseSla = computeSla(
    t.createdAt,
    t.slaResponseDueAt,
    t.firstResponseAt || t.slaTracking?.firstResponseMetAt || null,
    !!t.slaTracking?.firstResponseBreached
  );
  const resolutionSla = computeSla(
    t.createdAt,
    t.slaResolutionDueAt,
    t.resolvedAt,
    !!t.slaTracking?.resolutionBreached || overdue
  );

  const call = async (url: string, method: string, payload: unknown) => {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) throw new Error(body.error?.message || "Request failed.");
    return body.data;
  };

  const updateRecord = async (thenBack = false) => {
    if (!dirty) {
      if (thenBack) router.push("/staff/tickets");
      return;
    }

    if (stateChanged) {
      if (selectedState === "ON_HOLD" && !statusReason.trim()) {
        toast({ title: "Reason required", description: "Please enter an On Hold Reason in Ticket Details before saving.", variant: "destructive" });
        setActiveTab("details");
        return;
      }
      if (selectedState === "RESOLVED" && !statusResolution.trim()) {
        toast({ title: "Resolution required", description: "Please enter Resolution Notes in Ticket Details before saving.", variant: "destructive" });
        setActiveTab("details");
        return;
      }
    }

    setBusy("update");
    const done: string[] = [];
    try {
      if (stateChanged) {
        if (selectedState === "RESOLVED") {
          await call(`/api/v1/support/tickets/${t.id}/resolve`, "POST", { resolution: statusResolution.trim() });
          done.push("ticket resolved");
        } else {
          const defaultNote = selectedState === "IN_PROGRESS"
            ? (t.status === "ON_HOLD" ? "Resumed from hold" : "Work started")
            : `Status changed to ${STATUS_LABELS[selectedState] || selectedState}`;
          await call(`/api/v1/support/tickets/${t.id}/status`, "PATCH", {
            toStatus: selectedState,
            reason: statusReason.trim() || undefined,
            note: statusReason.trim() || defaultNote,
          });
          done.push(`status changed to ${STATUS_LABELS[selectedState] || selectedState}`);
        }
      }
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

  const handleUploadAttachments = async (files: File[]) => {
    if (files.length === 0) return;
    setUploadingFiles(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch(`/api/v1/support/tickets/${t.id}/attachments`, { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error?.message || "Upload failed");
      toast({ title: "Upload complete", description: `${files.length} file(s) attached.` });
      await load();
    } catch (err) {
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string, name: string) => {
    setDeletingAttachmentId(attachmentId);
    try {
      const res = await fetch(`/api/v1/attachments/${attachmentId}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error?.message || "Failed to remove attachment");
      toast({ title: "Attachment removed", description: `"${name}" was deleted.` });
      await load();
    } catch (err) {
      toast({ title: "Delete failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const handleSendMail = async () => {
    if (!mailBody.trim()) return;
    setSendingMail(true);
    try {
      if (mailFiles.length > 0) {
        const fd = new FormData();
        mailFiles.forEach((f) => fd.append("files", f));
        const upRes = await fetch(`/api/v1/support/tickets/${t.id}/attachments`, { method: "POST", body: fd });
        const upBody = await upRes.json();
        if (!upRes.ok || !upBody.success) throw new Error(upBody.error?.message || "Failed to upload email attachment");
      }
      const res = await fetch(`/api/v1/support/tickets/${t.id}/replies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reply: mailBody.trim() }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error?.message || "Failed to send email");
      toast({ title: "Email reply sent", description: "Your message has been emailed to the customer and logged in activity." });
      setMailModalOpen(false);
      setMailBody("");
      setMailFiles([]);
      await load();
    } catch (err) {
      toast({ title: "Failed to send email", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSendingMail(false);
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

  const assignToMe = () => me && stateAction("me", `/api/v1/support/tickets/${t.id}/assign`, "POST", { employeeId: me.id, note: "Assigned to self" }, "Assigned to you");
  const canSelfAssign = canAssign && !!me && t.assignee?.id !== me.id && staff.some((s) => s.id === me.id);

  const postQuickNote = async () => {
    if (noteType === "internal" && workNotes.trim()) {
      await updateRecord(false);
    } else if (noteType === "comment" && comments.trim()) {
      await updateRecord(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "RESOLVED":
      case "CLOSED":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden />
            {STATUS_LABELS[status] || status}
          </span>
        );
      case "ON_HOLD":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-600" aria-hidden />
            {STATUS_LABELS[status] || status}
          </span>
        );
      case "IN_PROGRESS":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800 border border-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" aria-hidden />
            {STATUS_LABELS[status] || status}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800 border border-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" aria-hidden />
            {STATUS_LABELS[status] || status}
          </span>
        );
    }
  };

  const filteredActivity = activity.filter((a) => activityFilter === "all" || a.kind === activityFilter);

  return (
    <div className="flex min-h-screen flex-col bg-background pb-16">
      {/* Sticky Contextual Ticket Action Bar */}
      <div className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur px-4 py-2.5 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          {/* Left: Back, Options Menu, Ticket Title & State */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/staff/tickets")}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Back to ticket queue"
              title="Back to queue"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Ticket options" title="Ticket menu">
                  <Menu className="h-4 w-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onSelect={() => { navigator.clipboard?.writeText(window.location.href); toast({ title: "URL copied to clipboard" }); }}><Link2 className="mr-2 h-4 w-4" aria-hidden />Copy Ticket Link</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { navigator.clipboard?.writeText(t.ticketNumber); toast({ title: "Ticket number copied" }); }}><Copy className="mr-2 h-4 w-4" aria-hidden />Copy Ticket Number</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => load()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden />Reload Form</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => window.print()}><Printer className="mr-2 h-4 w-4" aria-hidden />Print Ticket</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex flex-col ml-1">
              <div className="flex items-center gap-2">
                <h1 className="font-mono text-base font-bold text-foreground">{t.ticketNumber}</h1>
                {getStatusBadge(t.status)}
              </div>
              <span className="text-xs text-muted-foreground truncate max-w-xs sm:max-w-md">
                Standalone Ticket · {t.department?.name || "No Assignment Group"} · {t.branch.name}
              </span>
            </div>
          </div>

          {/* Right: Primary Workflow & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAttachmentsModalOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted relative"
              aria-label="Attachments"
              title={`View & manage attachments (${t.attachments.length})`}
            >
              <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="hidden sm:inline">Attachments</span>
              {t.attachments.length > 0 ? (
                <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {t.attachments.length}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("notes")}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted"
              title="Jump to Notes & Activity"
            >
              <MessageSquare className="h-3.5 w-3.5 text-primary" aria-hidden />
              <span className="hidden sm:inline">Discuss</span>
            </button>

            {canMail && (
              <button
                type="button"
                onClick={() => {
                  setMailSubject(`[${t.ticketNumber}] Regarding your ticket: ${t.category.name}`);
                  setMailBody("");
                  setMailFiles([]);
                  setMailModalOpen(true);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted"
                title="Reply to customer via Email"
              >
                <Mail className="h-3.5 w-3.5 text-blue-600" aria-hidden />
                <span className="hidden sm:inline">Mail</span>
              </button>
            )}

            {canSelfAssign ? (
              <button
                type="button"
                disabled={!!busy}
                onClick={assignToMe}
                className="inline-flex h-8 items-center rounded border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                Assign to me
              </button>
            ) : null}

            {!isClosed ? (
              <button
                type="button"
                disabled={!!busy || !dirty}
                onClick={() => updateRecord(false)}
                className="inline-flex h-8 items-center rounded bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 shadow-sm"
                title={dirty ? "Save your updates" : "No pending changes"}
              >
                {busy === "update" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}Save
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Main Workspace Container */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4">
        {/* Informational Status Banners */}
        {isClosed ? (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-xs text-blue-900 shadow-sm">
            <Info className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
            <span>This ticket is closed and read-only. Closed tickets are preserved as permanent historical records.</span>
          </div>
        ) : null}
        {t.escalatedAt ? (
          <div className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50/70 px-4 py-2.5 text-xs text-purple-900 shadow-sm">
            <ShieldAlert className="h-4 w-4 shrink-0 text-purple-600" aria-hidden />
            <span>Ticket was escalated on <strong className="font-semibold">{dt(t.escalatedAt)}</strong>.</span>
          </div>
        ) : null}

        {/* Attachments Quick-Strip */}
        <section aria-label="Ticket attachments" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-muted-foreground">Attachments ({t.attachments.length}):</span>
            {t.attachments.length ? (
              t.attachments.map((a) => (
                <div key={a.id} className="inline-flex items-center gap-1.5 rounded border border-border bg-muted/40 px-2.5 py-1 text-xs">
                  <FileText className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                  <span className="font-medium text-foreground max-w-xs truncate" title={a.originalName}>{a.originalName}</span>
                  <span className="text-muted-foreground text-[11px]">({Math.max(1, Math.round(a.sizeBytes / 1024))} KB)</span>
                  <a href={`/api/v1/attachments/${a.id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline ml-1 font-medium">View</a>
                  <span className="text-muted-foreground" aria-hidden>·</span>
                  <a href={`/api/v1/attachments/${a.id}`} download={a.originalName} className="text-primary hover:underline font-medium">Download</a>
                </div>
              ))
            ) : (
              <span className="text-muted-foreground">No files attached to this ticket.</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setAttachmentsModalOpen(true)}
            className="text-primary hover:underline font-medium ml-auto"
          >
            Manage attachments &rarr;
          </button>
        </section>

        {/* Primary Ticket Form Card with Interactive Tabs */}
        <section className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          {/* Tab Navigation Headers */}
          <div role="tablist" aria-label="Ticket sections" className="flex flex-wrap items-center border-b border-border bg-muted/30 px-3 text-xs font-semibold">
            <button
              role="tab"
              aria-selected={activeTab === "details"}
              onClick={() => setActiveTab("details")}
              className={cn("px-4 py-3 border-b-2 transition-colors", activeTab === "details" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              Ticket Details
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "classification"}
              onClick={() => setActiveTab("classification")}
              className={cn("px-4 py-3 border-b-2 transition-colors", activeTab === "classification" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              Classification
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "notes"}
              onClick={() => setActiveTab("notes")}
              className={cn("inline-flex items-center gap-1.5 px-4 py-3 border-b-2 transition-colors", activeTab === "notes" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              <span>Notes &amp; Activity</span>
              <span className="inline-flex h-4 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] text-foreground font-mono tabular-nums">
                {activity.length}
              </span>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "resolution"}
              onClick={() => setActiveTab("resolution")}
              className={cn("px-4 py-3 border-b-2 transition-colors", activeTab === "resolution" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              Resolution Information
            </button>
          </div>

          {/* Tab 1: Ticket Details (Two-Column Structured Grid) */}
          {activeTab === "details" && (
            <div className="p-6">
              <div className="grid grid-cols-1 gap-x-12 gap-y-4 lg:grid-cols-2 text-xs">
                {/* Left Column: Requester & Identity */}
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2">
                    <span className="font-medium text-muted-foreground sm:text-right">Ticket Number</span>
                    <input type="text" value={t.ticketNumber} disabled className="sm:col-span-2 h-8 rounded border border-border bg-muted/40 px-2.5 font-mono text-xs text-foreground cursor-not-allowed" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2">
                    <span className="font-medium text-muted-foreground sm:text-right">
                      <span className="text-red-500 mr-0.5">*</span> Requester
                    </span>
                    <div className="sm:col-span-2 relative flex items-center">
                      <User className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden />
                      <input
                        type="text"
                        value={t.customerName}
                        readOnly
                        className="w-full h-8 rounded border border-border bg-background pl-8 pr-2.5 text-xs text-foreground"
                      />
                      <Link
                        href={`/staff/tickets?customerSearch=${encodeURIComponent(t.customerPhone)}&scope=all`}
                        className="absolute right-2 text-primary hover:underline text-[11px]"
                        title="View other tickets from this member"
                      >
                        History
                      </Link>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2">
                    <span className="font-medium text-muted-foreground sm:text-right">Mobile Phone</span>
                    <input type="text" value={t.customerPhone} readOnly className="sm:col-span-2 h-8 rounded border border-border bg-background px-2.5 text-xs text-foreground" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2">
                    <span className="font-medium text-muted-foreground sm:text-right">Email Address</span>
                    <input type="email" value={t.customerEmail || "—"} readOnly className="sm:col-span-2 h-8 rounded border border-border bg-background px-2.5 text-xs text-foreground" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2">
                    <span className="font-medium text-muted-foreground sm:text-right">
                      <span className="text-red-500 mr-0.5">*</span> Branch
                    </span>
                    {canAssign && acrossBranches && branches.length ? (
                      <select
                        className={cn("sm:col-span-2 h-8 rounded border border-border bg-background px-2 text-xs text-foreground focus:border-primary", branchChanged && "border-amber-400 bg-amber-50/50")}
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        aria-label="Branch"
                      >
                        {!branches.some((b) => b.id === t.branch.id) ? <option value={t.branch.id}>{t.branch.name}</option> : null}
                        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={`${t.branch.name} (${t.branch.code})`} disabled className="sm:col-span-2 h-8 rounded border border-border bg-muted/40 px-2.5 text-xs text-foreground cursor-not-allowed" />
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2">
                    <span className="font-medium text-muted-foreground sm:text-right">Category</span>
                    <input type="text" value={t.category.name} disabled className="sm:col-span-2 h-8 rounded border border-border bg-muted/40 px-2.5 text-xs text-foreground cursor-not-allowed" />
                  </div>
                </div>

                {/* Right Column: Triage, Priority & Routing */}
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2">
                    <span className="font-medium text-muted-foreground sm:text-right">Opened</span>
                    <input type="text" value={dt(t.createdAt)} disabled className="sm:col-span-2 h-8 rounded border border-border bg-muted/40 px-2.5 font-mono text-xs text-muted-foreground cursor-not-allowed" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2">
                    <span className="font-medium text-muted-foreground sm:text-right">Contact Type</span>
                    <input type="text" value={SOURCE_TEXT[t.source] || t.source} readOnly className="sm:col-span-2 h-8 rounded border border-border bg-background px-2.5 text-xs text-foreground" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2">
                    <span className="font-medium text-muted-foreground sm:text-right">Priority</span>
                    <div className="sm:col-span-2 flex items-center h-8">
                      <span className="font-medium text-foreground">{PRIORITY_TEXT[t.priority] || t.priority}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 items-start gap-2">
                    <span className="font-medium text-muted-foreground sm:text-right pt-2">State</span>
                    <div className="sm:col-span-2 flex flex-col gap-2">
                      {isClosed ? (
                        <input
                          type="text"
                          value="Closed (Read-only)"
                          disabled
                          className="h-8 w-full rounded border border-border bg-muted/40 px-2.5 text-xs text-foreground cursor-not-allowed"
                        />
                      ) : canUpdateStatus ? (
                        <select
                          value={selectedState}
                          onChange={(e) => setSelectedState(e.target.value)}
                          className={cn(
                            "h-8 w-full rounded border border-border bg-background px-2 text-xs font-medium text-foreground focus:border-primary",
                            stateChanged && "border-amber-400 bg-amber-50/50"
                          )}
                          aria-label="Ticket state"
                        >
                          <option value="NEW_COMPLAINT">New Complaint</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="ON_HOLD">On Hold</option>
                          <option value="RESOLVED">Resolved</option>
                          <option value="CLOSED">Closed</option>
                        </select>
                      ) : (
                        <div className="flex items-center h-8">
                          {getStatusBadge(t.status)}
                        </div>
                      )}

                      {selectedState === "ON_HOLD" && selectedState !== t.status && (
                        <div className="rounded border border-amber-300 bg-amber-50/70 p-2.5 text-xs">
                          <label className="font-semibold text-amber-900 block mb-1">
                            On Hold Reason <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={statusReason}
                            onChange={(e) => setStatusReason(e.target.value)}
                            placeholder="Specify why ticket is being placed on hold…"
                            className="w-full h-8 rounded border border-amber-300 bg-background px-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
                          />
                        </div>
                      )}

                      {selectedState === "RESOLVED" && selectedState !== t.status && (
                        <div className="rounded border border-emerald-300 bg-emerald-50/70 p-2.5 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <label className="font-semibold text-emerald-900 block">
                              Resolution Notes <span className="text-red-500">*</span>
                            </label>
                            {canUseCanned && (
                              <CannedPicker
                                context={{ customerName: t.customerName, ticketNumber: t.ticketNumber, branchName: t.branch.name, categoryName: t.category.name, categoryId: t.category.id }}
                                onInsert={(text) => setStatusResolution((cur) => cur ? `${cur}\n${text}` : text)}
                              />
                            )}
                          </div>
                          <textarea
                            rows={2}
                            value={statusResolution}
                            onChange={(e) => setStatusResolution(e.target.value)}
                            placeholder="Document solution applied to resolve ticket…"
                            className="w-full rounded border border-emerald-300 bg-background p-2 text-xs text-foreground focus:outline-none focus:border-primary"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2">
                    <span className="font-medium text-muted-foreground sm:text-right">Assignment Group</span>
                    {canChangeDept ? (
                      <select
                        className={cn("sm:col-span-2 h-8 rounded border border-border bg-background px-2 text-xs text-foreground focus:border-primary", groupChanged && "border-amber-400 bg-amber-50/50")}
                        value={group}
                        onChange={(e) => setGroup(e.target.value)}
                        aria-label="Assignment group"
                      >
                        <option value="">-- None --</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={t.department?.name || "(None)"} disabled className="sm:col-span-2 h-8 rounded border border-border bg-muted/40 px-2.5 text-xs text-foreground cursor-not-allowed" />
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2">
                    <span className="font-medium text-muted-foreground sm:text-right">Assigned to</span>
                    <div className="sm:col-span-2">
                      {canAssign ? (
                        <div className={cn("rounded", assigneeChanged && "ring-1 ring-amber-400")}>
                          <StaffPicker
                            staff={acrossBranches ? staff : staff.filter((p) => p.branchId === t.branch.id)}
                            value={assignee}
                            onChange={setAssignee}
                            placeholder="(empty) — Select staff"
                            preferBranchId={branch}
                            className="!h-8 w-full text-xs"
                            ariaLabel="Assigned to"
                          />
                        </div>
                      ) : (
                        <input type="text" value={t.assignee?.name || "(Unassigned)"} disabled className="h-8 w-full rounded border border-border bg-muted/40 px-2.5 text-xs text-foreground cursor-not-allowed" />
                      )}
                      {assigneeChanged && assigneeEntry ? (
                        <p className="mt-1 text-[11px] text-amber-700">
                          {assigneeEntry.branchId !== branch ? `Will transfer to ${assigneeEntry.branch?.name}. ` : ""}
                          {!assigneeEntry.availabilityEnabled ? `${assigneeEntry.name} is on leave. ` : ""}
                          {assigneeEntry.openTickets} open ticket{assigneeEntry.openTickets === 1 ? "" : "s"}.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Classification */}
          {activeTab === "classification" && (
            <div className="p-6 flex flex-col gap-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="font-semibold text-muted-foreground">Category</span>
                  <input type="text" value={t.category.name} disabled className="h-8 rounded border border-border bg-muted/40 px-2.5 text-xs text-foreground cursor-not-allowed" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="font-semibold text-muted-foreground">Channel / Contact Method</span>
                  <input type="text" value={SOURCE_TEXT[t.source] || t.source} disabled className="h-8 rounded border border-border bg-muted/40 px-2.5 text-xs text-foreground cursor-not-allowed" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="font-semibold text-muted-foreground">Priority Tier</span>
                  <input type="text" value={PRIORITY_TEXT[t.priority] || t.priority} disabled className="h-8 rounded border border-border bg-muted/40 px-2.5 text-xs text-foreground cursor-not-allowed" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="font-semibold text-muted-foreground">Short Description</span>
                <input type="text" value={shortDescription} readOnly className="h-8 rounded border border-border bg-background px-2.5 text-xs text-foreground font-medium" />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="font-semibold text-muted-foreground">Full Description / Complaint Details</span>
                <textarea
                  rows={6}
                  readOnly
                  value={t.description}
                  className="w-full rounded border border-border bg-background p-2.5 text-xs text-foreground leading-relaxed outline-none"
                />
              </div>
            </div>
          )}

          {/* Tab 3: Notes & Activity */}
          {activeTab === "notes" && (
            <div className="p-6 flex flex-col gap-6 text-xs">
              {/* Note / Comment Editor */}
              {!isClosed && (canWorkNote || canComment) ? (
                <div className="rounded-lg border border-border bg-muted/20 p-4 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                    <div className="flex items-center gap-3">
                      {canWorkNote ? (
                        <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium">
                          <input
                            type="radio"
                            name="noteType"
                            checked={noteType === "internal"}
                            onChange={() => setNoteType("internal")}
                            className="text-primary focus:ring-primary"
                          />
                          <span>Work Notes (Staff only)</span>
                        </label>
                      ) : null}
                      {canComment ? (
                        <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium">
                          <input
                            type="radio"
                            name="noteType"
                            checked={noteType === "comment"}
                            onChange={() => setNoteType("comment")}
                            className="text-primary focus:ring-primary"
                          />
                          <span>Customer Comments (Visible &amp; Emailed)</span>
                        </label>
                      ) : null}
                    </div>

                    {noteType === "comment" && canUseCanned ? (
                      <CannedPicker
                        context={{ customerName: t.customerName, ticketNumber: t.ticketNumber, branchName: t.branch.name, categoryName: t.category.name, categoryId: t.category.id }}
                        onInsert={(text) => setComments((cur) => (cur.trim() ? `${cur.trimEnd()}\n\n${text}` : text))}
                      />
                    ) : null}
                  </div>

                  {noteType === "internal" ? (
                    <textarea
                      rows={3}
                      value={workNotes}
                      onChange={(e) => setWorkNotes(e.target.value)}
                      placeholder="Add internal investigation notes, handover context, or technical findings…"
                      className="w-full rounded border border-border bg-background p-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                  ) : (
                    <textarea
                      rows={3}
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      placeholder="Reply to the member (will be sent via email notification)…"
                      className="w-full rounded border border-border bg-background p-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={!!busy || (noteType === "internal" ? !workNotes.trim() : !comments.trim())}
                      onClick={postQuickNote}
                      className="rounded bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                    >
                      {busy === "update" ? <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" aria-hidden /> : null}Post Note
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Activity Timeline */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                  <h3 className="font-semibold text-sm text-foreground">Activity Timeline ({activity.length})</h3>
                  <div className="flex items-center gap-1">
                    {(["all", "comment", "worknote", "field"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setActivityFilter(k)}
                        className={cn("rounded px-2.5 py-1 text-xs transition-colors", activityFilter === k ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted")}
                      >
                        {k === "all" ? `All (${activity.length})` : k === "comment" ? "Comments" : k === "worknote" ? "Work Notes" : "Field Changes"}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredActivity.length === 0 ? (
                  <p className="py-6 text-center text-muted-foreground">No matching activity events recorded.</p>
                ) : (
                  <div className="space-y-3">
                    {filteredActivity.map((a) => (
                      <div
                        key={a.id}
                        className={cn(
                          "rounded-lg border border-border p-3 flex flex-col gap-1 transition-colors",
                          a.kind === "worknote" && "bg-amber-50/40 border-amber-200",
                          a.kind === "comment" && "bg-blue-50/40 border-blue-200",
                          a.kind === "field" && "bg-card"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">{a.who} <span className="font-normal text-muted-foreground">· {a.title}</span></span>
                          <span className="font-mono text-[11px] text-muted-foreground">{dt(a.at)}</span>
                        </div>
                        {a.changes?.map((c, i) => (
                          <p key={i} className="text-xs text-foreground">
                            <span className="font-semibold">{c.field}:</span> {c.to} {c.from ? <span className="text-muted-foreground">(was {c.from})</span> : null}
                          </p>
                        ))}
                        {a.body ? <p className="mt-1 whitespace-pre-wrap text-xs text-foreground leading-relaxed">{a.body}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 4: Resolution Information */}
          {activeTab === "resolution" && (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <span className="font-semibold text-muted-foreground">Resolved Timestamp</span>
                <input type="text" value={dt(t.resolvedAt) || "Pending resolution"} disabled className="h-8 rounded border border-border bg-muted/40 px-2.5 font-mono text-xs text-muted-foreground cursor-not-allowed" />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="font-semibold text-muted-foreground">Auto-Close Scheduled On</span>
                <input type="text" value={dt(t.autoCloseAt) || "—"} disabled className="h-8 rounded border border-border bg-muted/40 px-2.5 font-mono text-xs text-muted-foreground cursor-not-allowed" />
              </div>

              <div className="md:col-span-2 flex flex-col gap-1.5">
                <span className="font-semibold text-muted-foreground">Resolution Notes</span>
                <textarea rows={3} readOnly value={resolutionNote || "No resolution documented yet."} className="w-full rounded border border-border bg-background p-2.5 text-xs text-foreground outline-none" />
              </div>

              {t.feedback ? (
                <div className="md:col-span-2 rounded border border-amber-200 bg-amber-50/50 p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-amber-900">Member Satisfaction Rating:</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={cn("h-4 w-4", n <= t.feedback!.rating ? "fill-amber-400 text-amber-400" : "text-slate-300")} aria-hidden />
                      ))}
                      <span className="ml-1 font-bold text-amber-900">{t.feedback.rating} / 5</span>
                    </div>
                  </div>
                  {t.feedback.comment ? (
                    <p className="text-xs text-amber-950 italic">"{t.feedback.comment}"</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </section>

        {/* Bottom Related Lists Card: Task SLAs & Logs */}
        <section aria-label="Related records and SLAs" className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          {/* Related Tab Headers */}
          <div role="tablist" aria-label="Related lists" className="flex flex-wrap items-center border-b border-border bg-muted/30 px-3 text-xs font-semibold">
            <button
              role="tab"
              aria-selected={activeRelatedTab === "slas"}
              onClick={() => setActiveRelatedTab("slas")}
              className={cn("inline-flex items-center gap-1.5 px-4 py-3 border-b-2 transition-colors", activeRelatedTab === "slas" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              <Timer className="h-3.5 w-3.5" aria-hidden />
              <span>Task SLAs (2)</span>
            </button>
            <button
              role="tab"
              aria-selected={activeRelatedTab === "assignments"}
              onClick={() => setActiveRelatedTab("assignments")}
              className={cn("inline-flex items-center gap-1.5 px-4 py-3 border-b-2 transition-colors", activeRelatedTab === "assignments" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              <span>Assignment History ({t.assignments.length})</span>
            </button>
            <button
              role="tab"
              aria-selected={activeRelatedTab === "states"}
              onClick={() => setActiveRelatedTab("states")}
              className={cn("inline-flex items-center gap-1.5 px-4 py-3 border-b-2 transition-colors", activeRelatedTab === "states" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              <span>State History ({t.statusHistory.length})</span>
            </button>
            <button
              role="tab"
              aria-selected={activeRelatedTab === "attachments"}
              onClick={() => setActiveRelatedTab("attachments")}
              className={cn("inline-flex items-center gap-1.5 px-4 py-3 border-b-2 transition-colors", activeRelatedTab === "attachments" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              <span>Attachments ({t.attachments.length})</span>
            </button>
            {canViewAudit && (
              <button
                role="tab"
                aria-selected={activeRelatedTab === "audit"}
                onClick={() => setActiveRelatedTab("audit")}
                className={cn("inline-flex items-center gap-1.5 px-4 py-3 border-b-2 transition-colors", activeRelatedTab === "audit" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
              >
                <span>Audit Trail ({t.auditLogs?.length || 0})</span>
              </button>
            )}
          </div>

          {/* Panel: Task SLAs Table with Visual Progress Bar */}
          {activeRelatedTab === "slas" && (
            <div className="overflow-x-auto text-xs">
              <table className="w-full border-collapse text-left">
                <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">SLA Definition</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Business Elapsed</th>
                    <th className="px-4 py-2.5 min-w-[160px]">Elapsed %</th>
                    <th className="px-4 py-2.5">Time Left</th>
                    <th className="px-4 py-2.5">Breach Status</th>
                    <th className="px-4 py-2.5">Target Due Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {/* First Response SLA */}
                  <tr className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">First Response SLA</td>
                    <td className="px-4 py-3 text-muted-foreground">{firstResponseSla?.status || "Active"}</td>
                    <td className="px-4 py-3 font-mono text-foreground tabular-nums">{firstResponseSla?.elapsedText || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-foreground w-12 tabular-nums">{firstResponseSla?.percent || 0}%</span>
                        <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", firstResponseSla?.isBreached ? "bg-red-500" : "bg-emerald-500")}
                            style={{ width: `${firstResponseSla?.percent || 0}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-foreground tabular-nums">{firstResponseSla?.timeLeftText || "—"}</td>
                    <td className="px-4 py-3">
                      {firstResponseSla?.isBreached ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 border border-red-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden />Breached
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden />On track
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground tabular-nums">{firstResponseSla?.targetTime || "—"}</td>
                  </tr>

                  {/* Resolution SLA */}
                  <tr className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">Resolution SLA</td>
                    <td className="px-4 py-3 text-muted-foreground">{resolutionSla?.status || "Active"}</td>
                    <td className="px-4 py-3 font-mono text-foreground tabular-nums">{resolutionSla?.elapsedText || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-foreground w-12 tabular-nums">{resolutionSla?.percent || 0}%</span>
                        <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", resolutionSla?.isBreached ? "bg-red-500" : "bg-emerald-500")}
                            style={{ width: `${resolutionSla?.percent || 0}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-foreground tabular-nums">{resolutionSla?.timeLeftText || "—"}</td>
                    <td className="px-4 py-3">
                      {resolutionSla?.isBreached ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 border border-red-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden />Breached
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden />On track
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground tabular-nums">{resolutionSla?.targetTime || "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Panel: Assignment History */}
          {activeRelatedTab === "assignments" && (
            <div className="overflow-x-auto text-xs">
              <table className="w-full border-collapse text-left">
                <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                  <tr><th className="px-4 py-2.5">Assigned to</th><th className="px-4 py-2.5">Method</th><th className="px-4 py-2.5">Note</th><th className="px-4 py-2.5">Time</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {t.assignments.length ? [...t.assignments].reverse().map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium text-foreground">{a.assignee.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{a.method.replace(/_/g, " ").toLowerCase()}</td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-md truncate">{a.note}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground tabular-nums">{dt(a.createdAt)}</td>
                    </tr>
                  )) : <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No assignment records</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Panel: State History */}
          {activeRelatedTab === "states" && (
            <div className="overflow-x-auto text-xs">
              <table className="w-full border-collapse text-left">
                <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                  <tr><th className="px-4 py-2.5">From</th><th className="px-4 py-2.5">To</th><th className="px-4 py-2.5">Changed by</th><th className="px-4 py-2.5">Note</th><th className="px-4 py-2.5">Time</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...t.statusHistory].reverse().map((h) => (
                    <tr key={h.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-muted-foreground">{h.fromStatus ? STATUS_LABELS[h.fromStatus] || h.fromStatus : "—"}</td>
                      <td className="px-4 py-2.5 font-medium text-foreground">{STATUS_LABELS[h.toStatus] || h.toStatus}</td>
                      <td className="px-4 py-2.5 text-foreground">{h.changedByName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-md truncate">{h.note || "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground tabular-nums">{dt(h.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Panel: Attachments */}
          {activeRelatedTab === "attachments" && (
            <div className="overflow-x-auto text-xs">
              <table className="w-full border-collapse text-left">
                <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                  <tr><th className="px-4 py-2.5">File Name</th><th className="px-4 py-2.5">File Type</th><th className="px-4 py-2.5">File Size</th><th className="px-4 py-2.5 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {t.attachments.length ? t.attachments.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        <span className="inline-flex items-center gap-2">
                          <FileText className="h-4 w-4 text-emerald-600" aria-hidden />
                          {a.originalName}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{a.mimeType}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground tabular-nums">{Math.max(1, Math.round(a.sizeBytes / 1024))} KB</td>
                      <td className="px-4 py-2.5 text-right space-x-2">
                        <a href={`/api/v1/attachments/${a.id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">View</a>
                        <a href={`/api/v1/attachments/${a.id}`} download={a.originalName} className="text-primary hover:underline font-medium">Download</a>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No attachments on this ticket</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Panel: Audit Trail */}
          {activeRelatedTab === "audit" && canViewAudit && (
            <div className="overflow-x-auto text-xs">
              <table className="w-full border-collapse text-left">
                <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                  <tr><th className="px-4 py-2.5">Action</th><th className="px-4 py-2.5">Actor</th><th className="px-4 py-2.5">Role</th><th className="px-4 py-2.5">Previous Value</th><th className="px-4 py-2.5">New Value</th><th className="px-4 py-2.5">Details</th><th className="px-4 py-2.5">Time</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {t.auditLogs?.length ? [...t.auditLogs].reverse().map((al) => (
                    <tr key={al.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-semibold text-foreground">{al.action.replace(/_/g, " ")}</td>
                      <td className="px-4 py-2.5 font-medium text-primary">{al.actorName}</td>
                      <td className="px-4 py-2.5"><span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{al.actorRole}</span></td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-[140px] truncate">{al.previousValue || "—"}</td>
                      <td className="px-4 py-2.5 font-medium text-foreground max-w-[140px] truncate">{al.newValue || "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-[320px] truncate">{al.details || "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground tabular-nums whitespace-nowrap">{dt(al.createdAt)}</td>
                    </tr>
                  )) : <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No audit logs recorded</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Attachments Management Dialog */}
      <Dialog open={attachmentsModalOpen} onOpenChange={setAttachmentsModalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Paperclip className="h-5 w-5 text-primary" aria-hidden />
              <span>Ticket Attachments ({t.attachments.length})</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              View, download, upload, or remove diagnostic documents associated with ticket #{t.ticketNumber}.
            </DialogDescription>
          </DialogHeader>

          {/* Upload Drop Zone */}
          {!isClosed && canManageAttachments && (
            <div className="rounded-lg border-2 border-dashed border-border bg-muted/20 p-4 text-center">
              <input
                type="file"
                multiple
                id="modal-attachment-upload-input"
                className="hidden"
                disabled={uploadingFiles}
                onChange={async (e) => {
                  const files = e.target.files;
                  if (!files || files.length === 0) return;
                  await handleUploadAttachments(Array.from(files));
                  e.target.value = "";
                }}
              />
              <label
                htmlFor="modal-attachment-upload-input"
                className="inline-flex items-center gap-2 cursor-pointer rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {uploadingFiles ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                <span>{uploadingFiles ? "Uploading Files..." : "Upload New Attachments"}</span>
              </label>
              <p className="mt-1.5 text-[11px] text-muted-foreground">Select one or multiple files (images, PDF, documents up to 10 MB each)</p>
            </div>
          )}

          {/* Files List */}
          <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1 text-xs">
            {t.attachments.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">No attachments linked with this ticket.</p>
            ) : (
              t.attachments.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-xs shadow-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="h-5 w-5 text-emerald-600 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate max-w-xs sm:max-w-sm" title={a.originalName}>{a.originalName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {Math.max(1, Math.round(a.sizeBytes / 1024))} KB · {a.mimeType}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`/api/v1/attachments/${a.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                    >
                      View
                    </a>
                    <a
                      href={`/api/v1/attachments/${a.id}`}
                      download={a.originalName}
                      className="inline-flex items-center rounded border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                    >
                      Download
                    </a>
                    {!isClosed && canManageAttachments && (
                      <button
                        type="button"
                        disabled={deletingAttachmentId === a.id}
                        onClick={() => handleDeleteAttachment(a.id, a.originalName)}
                        className="inline-flex items-center rounded border border-red-200 text-red-600 hover:bg-red-50 p-1.5 disabled:opacity-50 transition-colors"
                        title="Remove attachment from ticket"
                        aria-label="Remove attachment"
                      >
                        {deletingAttachmentId === a.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              onClick={() => setAttachmentsModalOpen(false)}
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Email Reply Dialog */}
      <Dialog open={mailModalOpen} onOpenChange={setMailModalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Mail className="h-5 w-5 text-blue-600" aria-hidden />
              <span>Reply to Customer via Email</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Compose an official response to {t.customerName}. The email will be delivered to {t.customerEmail || t.customerPhone} and logged in the ticket history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 flex-1 overflow-y-auto pr-1 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2">
              <span className="font-semibold text-muted-foreground sm:text-right">To:</span>
              <input
                type="text"
                readOnly
                value={`${t.customerName} <${t.customerEmail || t.customerPhone}>`}
                className="sm:col-span-3 h-8 rounded border border-border bg-muted/40 px-2.5 text-xs text-foreground font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2">
              <span className="font-semibold text-muted-foreground sm:text-right">Subject:</span>
              <input
                type="text"
                value={mailSubject}
                onChange={(e) => setMailSubject(e.target.value)}
                className="sm:col-span-3 h-8 rounded border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-foreground">
                  Email Message Body <span className="text-red-500">*</span>
                </label>
                {canUseCanned && (
                  <CannedPicker
                    context={{ customerName: t.customerName, ticketNumber: t.ticketNumber, branchName: t.branch.name, categoryName: t.category.name, categoryId: t.category.id }}
                    onInsert={(text) => setMailBody((cur) => cur.trim() ? `${cur.trimEnd()}\n\n${text}` : text)}
                  />
                )}
              </div>
              <textarea
                rows={5}
                value={mailBody}
                onChange={(e) => setMailBody(e.target.value)}
                placeholder="Write your email reply to the customer…"
                className="w-full rounded border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:border-primary leading-relaxed"
              />
            </div>

            {/* Email Attachments Area */}
            {canManageAttachments && (
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    Email Attachments ({mailFiles.length})
                  </span>
                  <label
                    htmlFor="mail-attachment-upload-input"
                    className="cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                  >
                    + Add attachments
                  </label>
                  <input
                    id="mail-attachment-upload-input"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        setMailFiles((cur) => [...cur, ...Array.from(e.target.files!)]);
                        e.target.value = "";
                      }
                    }}
                  />
                </div>

                {mailFiles.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {mailFiles.map((f, idx) => (
                      <div key={idx} className="inline-flex items-center gap-1.5 rounded border border-border bg-muted/40 px-2 py-1 text-xs">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span className="max-w-[150px] truncate" title={f.name}>{f.name}</span>
                        <span className="text-muted-foreground text-[10px]">({Math.max(1, Math.round(f.size / 1024))} KB)</span>
                        <button
                          type="button"
                          onClick={() => setMailFiles((cur) => cur.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-red-600 ml-1"
                          aria-label="Remove attached file"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">No files attached to this email.</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              onClick={() => setMailModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sendingMail || !mailBody.trim()}
              onClick={handleSendMail}
              className="rounded bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {sendingMail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              <span>Send Email</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
