"use client";

// Customer tracking: Ticket ID + registered mobile (POST — phone never in URL).
// Shows the real event-history timeline, latest public update, resolution and
// reopen window. Supports reopening a RESOLVED ticket within the window.

import { useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, Clock, History, Loader2, Lock, Search, RotateCcw } from "lucide-react";

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
}

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

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

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <div className="brand-ring rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-bold text-[#0a2350]">Track your complaint</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your Ticket ID and the mobile number you registered with. No account needed.
          </p>

          <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={track}>
            <div className="space-y-1.5">
              <Label htmlFor="ticketNumber">Ticket ID</Label>
              <Input id="ticketNumber" className="font-mono" placeholder="FC-2026-000001" value={ticketNumber} onChange={(e) => setTicketNumber(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mobile">Registered Mobile</Label>
              <Input id="mobile" inputMode="tel" placeholder="10-digit mobile number" value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="off" />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={loading} className="w-full bg-[#0a2350] hover:bg-[#10306b] sm:w-auto">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Search className="mr-2 h-4 w-4" aria-hidden />}
                Track
              </Button>
            </div>
          </form>

          {error ? (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" aria-hidden />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {reopenDone ? (
            <Alert className="mt-4 border-emerald-200 bg-emerald-50 text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
              <AlertDescription>{reopenDone}</AlertDescription>
            </Alert>
          ) : null}

          {ticket ? (
            <div className="mt-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4">
                <div>
                  <p className="font-mono text-lg font-bold text-[#0a2350]">{ticket.ticketNumber}</p>
                  <p className="text-xs text-slate-500">
                    {ticket.branchName} · {ticket.categoryName} · Registered {fmt(ticket.createdAt)}
                  </p>
                </div>
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${STATUS_BADGE_CLASSES[ticket.status] || "bg-slate-100 text-slate-600 ring-slate-300"}`}>
                  {ticket.statusLabel}
                </span>
              </div>

              <div>
                <h2 className="mb-2 text-sm font-semibold text-[#0a2350]">Progress timeline</h2>
                <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5" aria-label="Ticket progress timeline">
                  {ticket.timeline.map((t, i) => (
                    <li key={i} className="relative">
                      <span className={`absolute -left-[26.5px] flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-white ${i === ticket.timeline.length - 1 ? "bg-[#2c6bdf]" : "bg-slate-300"}`} aria-hidden />
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <p className="text-sm font-medium text-slate-800">
                          {t.from ? `${STATUS_LABELS[t.from] || t.from} → ` : ""}
                          {t.label}
                        </p>
                        <span className="text-xs text-slate-400">{fmt(t.at)}</span>
                      </div>
                      {t.note ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{t.note}</p> : null}
                    </li>
                  ))}
                </ol>
              </div>

              {ticket.latestPublicUpdate ? (
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Latest update from support</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{ticket.latestPublicUpdate.body}</p>
                  <p className="mt-1.5 text-xs text-slate-400">— {ticket.latestPublicUpdate.author}, {fmt(ticket.latestPublicUpdate.at)}</p>
                </div>
              ) : null}

              {ticket.assigneeFirstName && ticket.status !== "CLOSED" ? (
                <p className="flex items-center gap-1.5 text-sm text-slate-500">
                  <History className="h-4 w-4 text-[#2c6bdf]" aria-hidden />
                  Handled by {ticket.assigneeFirstName} from the {ticket.branchName} support team.
                </p>
              ) : null}

              {ticket.resolution ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Resolution</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-emerald-900">{ticket.resolution.message}</p>
                  <p className="mt-1.5 text-xs text-emerald-600">Resolved {fmt(ticket.resolution.resolvedAt)}</p>
                </div>
              ) : null}

              {ticket.closure ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <Lock className="h-4 w-4 text-slate-400" aria-hidden />
                  Closed {fmt(ticket.closure.closedAt)}. This ticket is read-only. Please submit a new complaint if you need further assistance.
                </div>
              ) : null}

              {ticket.status === "RESOLVED" ? (
                ticket.reopenWindow?.open ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#2c6bdf]/30 bg-[#eaf1fb]/50 p-4">
                    <div>
                      <p className="text-sm font-medium text-[#0a2350]">Not satisfied with this resolution?</p>
                      <p className="text-xs text-slate-500">
                        You can reopen this ticket until{" "}
                        {ticket.reopenWindow.deadline ? fmt(ticket.reopenWindow.deadline) : "the deadline"}.
                      </p>
                    </div>
                    <Button onClick={() => setReopenOpen(true)} className="bg-[#2c6bdf] hover:bg-[#1c4297]">
                      <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                      Reopen ticket
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <Clock className="h-4 w-4 text-amber-500" aria-hidden />
                    The reopening window for this ticket has expired. Please submit a new complaint if you need further assistance.
                  </div>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      </main>

      <Dialog open={reopenOpen} onOpenChange={(open) => { setReopenOpen(open); if (!open) setReopenError(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reopen ticket {ticket?.ticketNumber}</DialogTitle>
            <DialogDescription>
              The ticket returns to In Progress and stays with the same support executive when
              available. Please explain what is still wrong.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={4} placeholder="Reopening reason (minimum 10 characters)" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} aria-invalid={!!reopenError} />
          {reopenError ? <p className="text-xs text-red-600">{reopenError}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)}>Cancel</Button>
            <Button onClick={reopen} disabled={reopenBusy} className="bg-[#2c6bdf] hover:bg-[#1c4297]">
              {reopenBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="mr-2 h-4 w-4" aria-hidden />}
              Reopen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SiteFooter />
    </div>
  );
}
