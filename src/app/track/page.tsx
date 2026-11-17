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
    <div className="flex min-h-screen flex-col bg-[#0c0c10] text-[#f4f4f7] selection:bg-[#22618b]/30 selection:text-white">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-12">
        <div className="rounded-2xl border border-[#ffffff14] bg-[#13131a] p-7 shadow-2xl sm:p-9">
          <div className="mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(114, 189, 208,0.3)] bg-[rgba(114, 189, 208,0.08)] px-3 py-1 text-xs font-bold text-[#72bdd0]">
              Ticket Status & Resolution Tracker
            </span>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Track Your Complaint</h1>
            <p className="mt-1.5 text-xs text-[#a1a1aa] sm:text-sm">
              Enter your Ticket ID and the registered mobile number. Zero password or account required.
            </p>
          </div>

          <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={track}>
            <div className="space-y-1.5">
              <Label htmlFor="ticketNumber" className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">Ticket ID</Label>
              <Input
                id="ticketNumber"
                className="h-11 rounded-xl border-[#ffffff1f] bg-[#171722] font-mono text-[#f4f4f7] placeholder-[#71717a] focus:border-[#72bdd0]"
                placeholder="FC-2026-000001"
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mobile" className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">Registered Mobile</Label>
              <Input
                id="mobile"
                inputMode="tel"
                placeholder="10-digit mobile number"
                className="h-11 rounded-xl border-[#ffffff1f] bg-[#171722] text-[#f4f4f7] placeholder-[#71717a] focus:border-[#72bdd0]"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={loading}
                style={{
                  background: "linear-gradient(135deg, #22618b, #1a4c6e)",
                  boxShadow: "0 4px 16px rgba(114, 189, 208, 0.4)",
                }}
                className="h-11 w-full rounded-xl border-none text-xs font-extrabold text-white transition hover:brightness-110 sm:w-auto sm:px-6"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Search className="mr-2 h-4 w-4" aria-hidden />}
                Track
              </Button>
            </div>
          </form>

          {error ? (
            <Alert variant="destructive" className="mt-5 border-red-500/30 bg-red-950/40 text-red-200">
              <AlertCircle className="h-4 w-4" aria-hidden />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          ) : null}

          {reopenDone ? (
            <Alert className="mt-5 border-emerald-500/30 bg-emerald-950/40 text-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
              <AlertDescription className="text-xs">{reopenDone}</AlertDescription>
            </Alert>
          ) : null}

          {ticket ? (
            <div className="mt-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#ffffff14] bg-[#171722] p-5">
                <div>
                  <p className="font-mono text-xl font-extrabold text-white">{ticket.ticketNumber}</p>
                  <p className="mt-1 text-xs text-[#a1a1aa]">
                    {ticket.branchName} · {ticket.categoryName} · Registered {fmt(ticket.createdAt)}
                  </p>
                </div>
                <span className={`inline-flex items-center rounded-full px-3.5 py-1 text-xs font-bold ring-1 ${STATUS_BADGE_CLASSES[ticket.status] || "bg-[#252538] text-white ring-white/10"}`}>
                  {ticket.statusLabel}
                </span>
              </div>

              <div>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-white">Progress Timeline</h2>
                <ol className="relative space-y-4 border-l-2 border-[#ffffff1f] pl-6" aria-label="Ticket progress timeline">
                  {ticket.timeline.map((t, i) => (
                    <li key={i} className="relative">
                      <span className={`absolute -left-[31px] flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-[#13131a] ${i === ticket.timeline.length - 1 ? "bg-[#22618b]" : "bg-[#3f3f46]"}`} aria-hidden />
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <p className="text-sm font-bold text-white">
                          {t.from ? `${STATUS_LABELS[t.from] || t.from} → ` : ""}
                          {t.label}
                        </p>
                        <span className="text-xs text-[#71717a]">{fmt(t.at)}</span>
                      </div>
                      {t.note ? <p className="mt-1 text-xs leading-relaxed text-[#a1a1aa]">{t.note}</p> : null}
                    </li>
                  ))}
                </ol>
              </div>

              {ticket.latestPublicUpdate ? (
                <div className="rounded-2xl border border-[#ffffff14] bg-[#171722] p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#72bdd0]">Latest Update from Support</p>
                  <p className="mt-2 text-xs leading-relaxed text-[#f4f4f7] sm:text-sm">{ticket.latestPublicUpdate.body}</p>
                  <p className="mt-2 text-[11px] text-[#71717a]">— {ticket.latestPublicUpdate.author}, {fmt(ticket.latestPublicUpdate.at)}</p>
                </div>
              ) : null}

              {ticket.assigneeFirstName && ticket.status !== "CLOSED" ? (
                <p className="flex items-center gap-2 text-xs text-[#a1a1aa]">
                  <History className="h-4 w-4 text-[#72bdd0]" aria-hidden />
                  Handled by <strong className="text-white">{ticket.assigneeFirstName}</strong> from the {ticket.branchName} support team.
                </p>
              ) : null}

              {ticket.resolution ? (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Official Resolution</p>
                  <p className="mt-2 text-xs leading-relaxed text-emerald-100 sm:text-sm">{ticket.resolution.message}</p>
                  <p className="mt-2 text-[11px] text-emerald-400">Resolved {fmt(ticket.resolution.resolvedAt)}</p>
                </div>
              ) : null}

              {ticket.closure ? (
                <div className="flex items-center gap-2.5 rounded-2xl border border-[#ffffff14] bg-[#171722] p-4 text-xs text-[#a1a1aa]">
                  <Lock className="h-4 w-4 text-[#71717a]" aria-hidden />
                  Closed {fmt(ticket.closure.closedAt)}. This ticket is archived. Please submit a new complaint if you need further assistance.
                </div>
              ) : null}

              {ticket.status === "RESOLVED" ? (
                ticket.reopenWindow?.open ? (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#72bdd0]/30 bg-[rgba(114, 189, 208,0.06)] p-5">
                    <div>
                      <p className="text-sm font-bold text-white">Not satisfied with this resolution?</p>
                      <p className="mt-1 text-xs text-[#a1a1aa]">
                        You can reopen this ticket until{" "}
                        <strong className="text-[#72bdd0]">{ticket.reopenWindow.deadline ? fmt(ticket.reopenWindow.deadline) : "the deadline"}</strong>.
                      </p>
                    </div>
                    <Button
                      onClick={() => setReopenOpen(true)}
                      style={{
                        background: "linear-gradient(135deg, #22618b, #1a4c6e)",
                        boxShadow: "0 4px 14px rgba(114, 189, 208, 0.4)",
                      }}
                      className="rounded-xl border-none text-xs font-bold text-white transition hover:brightness-110"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                      Reopen Ticket
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4 text-xs text-amber-200">
                    <Clock className="h-4 w-4 text-amber-400" aria-hidden />
                    The 72-hour review window has closed. Please submit a new complaint if you require further assistance.
                  </div>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      </main>

      <Dialog open={reopenOpen} onOpenChange={(open) => { setReopenOpen(open); if (!open) setReopenError(""); }}>
        <DialogContent className="border border-[#ffffff14] bg-[#13131a] text-[#f4f4f7] sm:max-w-md sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white">Reopen Ticket {ticket?.ticketNumber}</DialogTitle>
            <DialogDescription className="text-xs text-[#a1a1aa]">
              The ticket returns to In Progress and stays with your assigned manager. Please explain what is still unresolved.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            placeholder="Reopening reason (minimum 10 characters)..."
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            className="rounded-xl border-[#ffffff1f] bg-[#171722] text-[#f4f4f7] placeholder-[#71717a] focus:border-[#72bdd0]"
            aria-invalid={!!reopenError}
          />
          {reopenError ? <p className="text-xs text-red-400">{reopenError}</p> : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReopenOpen(false)} className="rounded-xl border-[#ffffff24] bg-[#171722] text-xs font-bold text-[#f4f4f7] hover:bg-[#1c1c28]">
              Cancel
            </Button>
            <Button
              onClick={reopen}
              disabled={reopenBusy}
              style={{
                background: "linear-gradient(135deg, #22618b, #1a4c6e)",
              }}
              className="rounded-xl border-none text-xs font-bold text-white hover:brightness-110"
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
