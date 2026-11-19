"use client";

// Customer tracking: Ticket ID + registered mobile (POST — phone never in URL).
// Shows the real event-history timeline, latest public update, resolution and
// reopen window. Supports reopening a RESOLVED ticket within the window.
// ServiceNow Employee Center Request Tracker UI.

import { useState } from "react";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { RatingForm } from "@/components/rating-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  History,
  Info,
  Loader2,
  Lock,
  MessageSquare,
  RotateCcw,
  Search,
  ShieldCheck,
  User,
} from "lucide-react";

interface TrackedTicket {
  ticketNumber: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  branchName: string;
  categoryName: string;
  description: string;
  priorityLabel: string;
  assigneeFirstName: string | null;
  timeline: { from: string | null; to: string; label: string; at: string; note: string }[];
  latestPublicUpdate: { body: string; author: string; at: string } | null;
  resolution: { message: string; resolvedAt: string } | null;
  closure: { closedAt: string } | null;
  reopenWindow: { open: boolean; deadline: string | null } | null;
  feedback?: { rating: number; comment: string } | null;
  canRate?: boolean;
}

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

// ServiceNow 5-step status progression
const STEPPER_STAGES = [
  { key: "NEW", label: "Ticket Registered", desc: "Logged in Service Catalog and routed to branch" },
  { key: "ASSIGNED", label: "Specialist Assigned", desc: "Branch Operations / Support Specialist assigned" },
  { key: "IN_PROGRESS", label: "Investigation & Action", desc: "Staff actively remediating the incident" },
  { key: "RESOLVED", label: "Incident Resolved", desc: "Root cause resolved and solution provided" },
  { key: "CLOSED", label: "Closed & Archived", desc: "Review complete & ticket archived" },
];

function getStageIndex(status: string, assignee: string | null): number {
  if (status === "CLOSED") return 4;
  if (status === "RESOLVED") return 3;
  if (status === "IN_PROGRESS" || status === "ON_HOLD") return 2;
  if (assignee) return 1;
  return 0;
}

export default function TrackPage() {
  const [ticketNumber, setTicketNumber] = useState("");
  const [mobile, setMobile] = useState("");
  const [ticket, setTicket] = useState<TrackedTicket | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenError, setReopenError] = useState("");
  const [reopenBusy, setReopenBusy] = useState(false);
  const [reopenDone, setReopenDone] = useState("");

  async function track(ev?: React.FormEvent) {
    ev?.preventDefault();
    setError("");
    setTicket(null);
    setReopenDone("");
    if (!ticketNumber.trim() || !mobile.trim()) {
      setError("Please enter both the ticket ID and your registered mobile number.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/public/tickets/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketNumber: ticketNumber.trim(), mobileNumber: mobile.trim() }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body.error?.message || "Unable to track the ticket right now.");
        return;
      }
      setTicket(body.data.ticket as TrackedTicket);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function reopen() {
    if (!ticket) return;
    setReopenError("");
    if (reopenReason.trim().length < 10) {
      setReopenError("Please describe why you are reopening (minimum 10 characters).");
      return;
    }
    setReopenBusy(true);
    try {
      const res = await fetch(`/api/v1/public/tickets/${encodeURIComponent(ticket.ticketNumber)}/reopen`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mobileNumber: mobile.trim(), reason: reopenReason.trim() }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setReopenError(body.error?.message || "Unable to reopen the ticket.");
        return;
      }
      setReopenOpen(false);
      setReopenReason("");
      setReopenDone(body.data.message as string);
      await track();
    } catch {
      setReopenError("Network error. Please try again.");
    } finally {
      setReopenBusy(false);
    }
  }

  const currentStageIdx = ticket ? getStageIndex(ticket.status, ticket.assigneeFirstName) : 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F6F8] text-[#1E293B] selection:bg-[#1F70C1]/20 selection:text-[#1F70C1]">
      <SiteHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-10">
        {/* ServiceNow Breadcrumb Trail */}
        <div className="mb-6 flex items-center gap-2 text-xs font-medium text-slate-500">
          <Link href="/" className="hover:text-[#1F70C1] transition-colors">Employee Center</Link>
          <ChevronRight className="h-3 w-3 text-slate-400" />
          <Link href="/" className="hover:text-[#1F70C1] transition-colors">Requests & Incidents</Link>
          <ChevronRight className="h-3 w-3 text-slate-400" />
          <span className="text-slate-900 font-semibold">Incident Tracker</span>
        </div>

        {/* Search & Lookup Card */}
        <div className="overflow-hidden rounded-xl border border-[#D1D7DC] bg-white shadow-sm">
          <div className="border-b border-[#D1D7DC] bg-[#FAFBFC] p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#EBF4FA] text-[#00639B] border border-[#0084D1]/20">
                <Search className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  Incident Status & Resolution Tracker
                </h1>
                <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                  Enter your official ticket reference number and registered mobile phone to view real-time SLA milestones.
                </p>
              </div>
            </div>

            <form className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={track}>
              <div className="space-y-1.5">
                <Label htmlFor="ticketNumber" className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Incident / Ticket ID
                </Label>
                <Input
                  id="ticketNumber"
                  className="h-10 rounded-md border-[#D1D7DC] bg-white font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1F70C1] focus:ring-1 focus:ring-[#1F70C1]"
                  placeholder="e.g. MSP-2026-000001"
                  value={ticketNumber}
                  onChange={(e) => setTicketNumber(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mobile" className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Registered Mobile Number
                </Label>
                <Input
                  id="mobile"
                  inputMode="tel"
                  placeholder="10-digit mobile number"
                  className="h-10 rounded-md border-[#D1D7DC] bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1F70C1] focus:ring-1 focus:ring-[#1F70C1]"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="flex items-end">
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-10 w-full rounded-md bg-[#1F70C1] hover:bg-[#185999] text-xs font-bold text-white shadow-sm transition sm:w-auto sm:px-6"
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Search className="mr-2 h-4 w-4" aria-hidden />}
                  Track Ticket
                </Button>
              </div>
            </form>

            {error ? (
              <Alert variant="destructive" className="mt-4 border-red-200 bg-red-50 text-red-800">
                <AlertCircle className="h-4 w-4 text-red-600" aria-hidden />
                <AlertDescription className="text-xs font-medium">{error}</AlertDescription>
              </Alert>
            ) : null}

            {reopenDone ? (
              <Alert className="mt-4 border-emerald-200 bg-emerald-50 text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                <AlertDescription className="text-xs font-medium">{reopenDone}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          {/* Ticket Details & Timeline */}
          {ticket ? (
            <div className="p-6 sm:p-8 space-y-7">
              {/* Record Summary Banner */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#D1D7DC] bg-[#FAFBFC] p-5 shadow-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xl font-bold tracking-tight text-slate-900">
                      {ticket.ticketNumber}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_BADGE_CLASSES[ticket.status] || "bg-slate-100 text-slate-700 ring-slate-300"}`}>
                      {ticket.statusLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    <strong className="text-slate-800">{ticket.branchName}</strong> · {ticket.categoryName} · Registered {fmt(ticket.createdAt)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-200 px-2 py-1 font-mono text-[11px] font-bold text-slate-700">
                    Priority: {ticket.priorityLabel}
                  </span>
                </div>
              </div>

              {/* 5-Step Visual Progress Stepper (ServiceNow Style) */}
              <div className="rounded-xl border border-[#D1D7DC] bg-white p-5 shadow-xs">
                <div className="mb-4 flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Service Delivery Lifecycle
                  </h2>
                  <span className="text-[11px] text-slate-500 font-medium">Stage {currentStageIdx + 1} of 5</span>
                </div>

                {/* Horizontal Stepper (Desktop) */}
                <div className="hidden sm:grid sm:grid-cols-5 gap-2 relative">
                  {STEPPER_STAGES.map((st, i) => {
                    const isCompleted = i < currentStageIdx;
                    const isCurrent = i === currentStageIdx;
                    return (
                      <div key={st.key} className="flex flex-col items-center text-center">
                        <div className="relative flex items-center justify-center w-full">
                          {/* Step Connector Line */}
                          {i > 0 ? (
                            <div
                              className={`absolute right-1/2 left-[-50%] top-4 h-[2px] -z-0 ${
                                i <= currentStageIdx ? "bg-emerald-500" : "bg-slate-200"
                              }`}
                            />
                          ) : null}

                          {/* Node Icon */}
                          <div
                            className={`z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                              isCompleted
                                ? "bg-emerald-600 text-white shadow-sm"
                                : isCurrent
                                ? "bg-[#1F70C1] text-white ring-4 ring-[#1F70C1]/20 shadow-md"
                                : "border border-slate-300 bg-slate-100 text-slate-500"
                            }`}
                          >
                            {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                          </div>
                        </div>

                        <p className={`mt-2 text-xs font-bold ${isCurrent ? "text-[#1F70C1]" : isCompleted ? "text-slate-900" : "text-slate-400"}`}>
                          {st.label}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500 leading-tight">
                          {st.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Vertical Stepper (Mobile) */}
                <div className="sm:hidden space-y-3">
                  {STEPPER_STAGES.map((st, i) => {
                    const isCompleted = i < currentStageIdx;
                    const isCurrent = i === currentStageIdx;
                    return (
                      <div key={st.key} className="flex items-start gap-3">
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isCompleted
                              ? "bg-emerald-600 text-white"
                              : isCurrent
                              ? "bg-[#1F70C1] text-white ring-2 ring-[#1F70C1]/30"
                              : "border border-slate-300 bg-slate-100 text-slate-500"
                          }`}
                        >
                          {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                        </div>
                        <div>
                          <p className={`text-xs font-bold ${isCurrent ? "text-[#1F70C1]" : isCompleted ? "text-slate-900" : "text-slate-400"}`}>
                            {st.label}
                          </p>
                          <p className="text-[11px] text-slate-500">{st.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Assigned Specialist Pill */}
              {ticket.assigneeFirstName && ticket.status !== "CLOSED" ? (
                <div className="flex items-center gap-3 rounded-lg border border-[#D1D7DC] bg-[#FAFBFC] p-4 text-xs text-slate-700">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EBF4FA] text-[#00639B] border border-[#0084D1]/20 font-bold text-xs">
                    <User className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">
                      Assigned Agent: {ticket.assigneeFirstName}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Directly assigned at the {ticket.branchName} service desk.
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Latest Support Update (Customer Visible Note) */}
              {ticket.latestPublicUpdate ? (
                <div className="rounded-xl border border-blue-200 bg-[#EFF6FF] p-5 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1F70C1]">
                    <MessageSquare className="h-4 w-4" />
                    Latest Update from Support Team
                  </div>
                  <p className="mt-2 text-xs sm:text-sm text-slate-800 leading-relaxed">
                    {ticket.latestPublicUpdate.body}
                  </p>
                  <p className="mt-2 text-[11px] text-slate-500">
                    — Posted by {ticket.latestPublicUpdate.author} on {fmt(ticket.latestPublicUpdate.at)}
                  </p>
                </div>
              ) : null}

              {/* Official Resolution Card */}
              {ticket.resolution ? (
                <div className="rounded-xl border border-emerald-300 bg-[#D1FAE5]/60 p-5 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#065F46]">
                    <CheckCircle2 className="h-4 w-4 text-[#059669]" />
                    Official Resolution Summary
                  </div>
                  <p className="mt-2 text-xs sm:text-sm text-emerald-950 leading-relaxed font-medium">
                    {ticket.resolution.message}
                  </p>
                  <p className="mt-2 text-[11px] text-[#065F46]">
                    Resolved on {fmt(ticket.resolution.resolvedAt)}
                  </p>
                </div>
              ) : null}

              {/* Reopen Action Box */}
              {ticket.status === "RESOLVED" ? (
                ticket.reopenWindow?.open ? (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-xs">
                    <div>
                      <p className="text-sm font-bold text-amber-950">Is this issue still unresolved?</p>
                      <p className="mt-1 text-xs text-amber-800">
                        You have a 72-hour review period until{" "}
                        <strong className="text-amber-950">
                          {ticket.reopenWindow.deadline ? fmt(ticket.reopenWindow.deadline) : "the deadline"}
                        </strong>{" "}
                        to reopen this ticket.
                      </p>
                    </div>
                    <Button
                      onClick={() => setReopenOpen(true)}
                      className="rounded-md bg-amber-600 hover:bg-amber-700 text-xs font-bold text-white shadow-sm"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                      Reopen Incident
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-lg border border-slate-300 bg-slate-100 p-4 text-xs text-slate-600">
                    <Clock className="h-4 w-4 text-slate-500" aria-hidden />
                    The 72-hour resolution review window has expired. If you need further help, please submit a new ticket.
                  </div>
                )
              ) : null}

              {/* Feedback Rating / CSAT */}
              {ticket.canRate ? (
                <RatingForm ticketNumber={ticket.ticketNumber} mobileNumber={mobile} />
              ) : ticket.feedback ? (
                <div className="rounded-xl border border-[#D1D7DC] bg-[#FAFBFC] p-4 text-xs text-slate-700 flex items-center justify-between">
                  <span>Your feedback rating for this ticket:</span>
                  <strong className="text-slate-900 font-bold">{ticket.feedback.rating} / 5 Stars</strong>
                </div>
              ) : null}

              {/* Closed Archive Note */}
              {ticket.closure ? (
                <div className="flex items-center gap-2.5 rounded-lg border border-[#D1D7DC] bg-slate-50 p-4 text-xs text-slate-600">
                  <Lock className="h-4 w-4 text-slate-400" aria-hidden />
                  Closed & Archived on {fmt(ticket.closure.closedAt)}.
                </div>
              ) : null}

              {/* Audit Timeline / History */}
              <div className="rounded-xl border border-[#D1D7DC] bg-white p-5 shadow-xs">
                <div className="mb-4 flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5 text-slate-500" />
                    Complete Activity & Audit Trail
                  </h2>
                  <span className="text-[11px] text-slate-500">{ticket.timeline.length} updates logged</span>
                </div>

                <ol className="relative space-y-4 border-l-2 border-slate-200 pl-6" aria-label="Ticket progress timeline">
                  {ticket.timeline.map((t, i) => (
                    <li key={i} className="relative">
                      <span
                        className={`absolute -left-[31px] flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${
                          i === ticket.timeline.length - 1 ? "bg-[#1F70C1]" : "bg-slate-400"
                        }`}
                        aria-hidden
                      />
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <p className="text-xs font-bold text-slate-900">
                          {t.from ? `${STATUS_LABELS[t.from] || t.from} → ` : ""}
                          {t.label}
                        </p>
                        <span className="text-[11px] text-slate-400">{fmt(t.at)}</span>
                      </div>
                      {t.note ? <p className="mt-1 text-xs text-slate-600 leading-relaxed">{t.note}</p> : null}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      {/* Reopen Ticket Dialog */}
      <Dialog open={reopenOpen} onOpenChange={(open) => { setReopenOpen(open); if (!open) setReopenError(""); }}>
        <DialogContent className="border border-[#D1D7DC] bg-white text-slate-900 sm:max-w-md sm:rounded-xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Reopen Incident {ticket?.ticketNumber}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              This ticket will be transitioned back to In Progress and returned to your assigned specialist.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="reopenReason" className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Reason for Reopening <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reopenReason"
              rows={4}
              placeholder="Explain why the resolution did not fully resolve your issue (min 10 characters)..."
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              className="mt-1.5 rounded-md border-[#D1D7DC] bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#1F70C1] focus:ring-1 focus:ring-[#1F70C1]"
              aria-invalid={!!reopenError}
            />
            {reopenError ? <p className="mt-1 text-xs text-red-600 font-medium">{reopenError}</p> : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setReopenOpen(false)}
              className="rounded-md border-[#D1D7DC] text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </Button>
            <Button
              onClick={reopen}
              disabled={reopenBusy}
              className="rounded-md bg-amber-600 hover:bg-amber-700 text-xs font-bold text-white shadow-sm"
            >
              {reopenBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="mr-2 h-4 w-4" aria-hidden />}
              Confirm Reopen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SiteFooter />
    </div>
  );
}
