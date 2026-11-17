"use client";

// Development mailbox: the transactional outbox viewer. Shows every
// notification (sent to customers, skipped for blank branch/central emails)
// with full rendered body. No real email leaves the sandbox in development.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Mailbox, RefreshCcw } from "lucide-react";

interface Notification {
  id: string; event: string; recipientKind: string; recipientEmail: string;
  subject: string; body: string; status: string; attempts: number; lastError: string;
  createdAt: string; sentAt: string | null; ticket?: { ticketNumber: string } | null;
}

const STATUS_CLS: Record<string, string> = {
  SENT: "bg-emerald-50 text-emerald-700",
  SKIPPED: "bg-slate-100 text-slate-500",
  FAILED: "bg-red-50 text-red-700",
  PENDING: "bg-amber-50 text-amber-700",
};

const KIND_CLS: Record<string, string> = {
  CUSTOMER: "bg-blue-50 text-blue-700",
  BRANCH: "bg-purple-50 text-purple-700",
  CENTRAL_SUPPORT: "bg-sky-50 text-sky-700",
  ASSIGNEE: "bg-teal-50 text-teal-700",
  BRANCH_MANAGER: "bg-pink-50 text-pink-700",
};

export default function MailboxPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Notification[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState<Notification | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/notifications?page=${page}&pageSize=20`);
    const body = await res.json();
    if (body.success) {
      setRows(body.data.notifications);
      setTotalPages(body.data.totalPages);
      setTotal(body.data.total);
    }
  }, [page]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount data loading
  useEffect(() => { load(); }, [load]);

  async function retry(id: string) {
    const res = await fetch(`/api/v1/admin/notifications/${id}/retry`, { method: "POST" });
    const body = await res.json();
    if (body.success) {
      toast({ title: "Notification re-sent (dev adapter)" });
      setOpen(null);
      await load();
    } else {
      toast({ title: "Retry failed", description: body.error?.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0a2350]">Notification mailbox</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {total} notifications in the transactional outbox. SKIPPED rows are branch/central emails waiting
            for FitClass to configure the mailbox addresses.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCcw className="mr-2 h-3.5 w-3.5" aria-hidden />Refresh</Button>
      </div>

      {rows === null ? (
        <Skeleton className="h-96" />
      ) : rows.length === 0 ? (
        <div className="brand-ring rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
          <Mailbox className="mx-auto mb-2 h-8 w-8 text-slate-300" aria-hidden />
          No notifications yet.
        </div>
      ) : (
        <div className="brand-ring overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {rows.map((n) => (
              <li key={n.id} className="flex cursor-pointer flex-col gap-1 p-3.5 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between" onClick={() => setOpen(n)}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLS[n.status] || "bg-slate-100"}`}>{n.status}</span>
                    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${KIND_CLS[n.recipientKind] || "bg-slate-100"}`}>{n.recipientKind.replace(/_/g, " ")}</span>
                    {n.ticket ? <span className="font-mono text-xs font-semibold text-[#0a2350]">{n.ticket.ticketNumber}</span> : null}
                    <span className="text-[11px] font-medium text-slate-600">{n.event.replace(/_/g, " ")}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{n.subject}</p>
                  <p className="text-[11px] text-slate-400">
                    {n.recipientEmail ? `to ${n.recipientEmail}` : <span className="italic">{n.lastError || "no recipient"}</span>}
                    {" · "}{new Date(n.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-slate-300">view →</span>
              </li>
            ))}
          </ul>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-slate-100 p-3">
              <p className="text-xs text-slate-400">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8"><ChevronLeft className="h-4 w-4" aria-hidden /> Prev</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-8">Next <ChevronRight className="h-4 w-4" aria-hidden /></Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm">{open?.subject}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-xs text-slate-500">
            <p>To: {open?.recipientEmail || <span className="italic">no recipient ({open?.lastError})</span>}</p>
            <p>Status: {open?.status} · attempts: {open?.attempts}</p>
          </div>
          <pre className="thin-scroll max-h-[400px] overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-4 font-sans text-sm leading-relaxed text-slate-700">{open?.body}</pre>
          {open && (open.status === "SKIPPED" || open.status === "FAILED") ? (
            <Button size="sm" onClick={() => retry(open.id)}>Retry delivery</Button>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
