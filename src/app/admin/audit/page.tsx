"use client";

// Audit log viewer (read-only by design — audit rows are never editable).

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, ScrollText, Search } from "lucide-react";

const ACTIONS = [
  "TICKET_CREATED", "TICKET_ASSIGNED", "TICKET_REASSIGNED", "BRANCH_TRANSFER", "STATUS_CHANGED",
  "INTERNAL_NOTE", "CUSTOMER_REPLY", "RESOLUTION", "REOPENED", "AUTO_CLOSED", "ESCALATED",
  "CONFIG_CHANGED", "AVAILABILITY_CHANGED", "AUTH_FAILURE", "AUTH_SUCCESS", "ACCESS_DENIED", "API_KEY_CREATED",
];

const ACTION_COLORS: Record<string, string> = {
  TICKET_CREATED: "bg-sky-50 text-sky-700",
  TICKET_ASSIGNED: "bg-blue-50 text-blue-700",
  TICKET_REASSIGNED: "bg-blue-50 text-blue-700",
  BRANCH_TRANSFER: "bg-purple-50 text-purple-700",
  STATUS_CHANGED: "bg-indigo-50 text-indigo-700",
  RESOLUTION: "bg-emerald-50 text-emerald-700",
  REOPENED: "bg-amber-50 text-amber-700",
  AUTO_CLOSED: "bg-slate-100 text-slate-600",
  ESCALATED: "bg-red-50 text-red-700",
  CONFIG_CHANGED: "bg-orange-50 text-orange-700",
  AUTH_FAILURE: "bg-red-50 text-red-700",
};

interface LogRow {
  id: string; ticketId: string | null; actorName: string; actorRole: string; action: string;
  previousValue: string; newValue: string; details: string; createdAt: string;
  ticket?: { ticketNumber: string } | null;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const p = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (action) p.set("action", action);
    if (query.trim()) p.set("q", query.trim());
    const res = await fetch(`/api/v1/admin/audit-logs?${p}`);
    const body = await res.json();
    if (body.success) {
      setLogs(body.data.logs);
      setTotal(body.data.total);
      setTotalPages(body.data.totalPages);
    } else setLogs([]);
  }, [page, action, query]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount data loading
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0a2350]">Audit logs</h1>
          <p className="mt-0.5 text-sm text-slate-500">{total} immutable events. Audit history cannot be edited or deleted by any application role.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <Input className="w-52 pl-8" placeholder="Search actor / ticket / details" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); setQuery(q); } }} aria-label="Search audit logs" />
          </div>
          <Select value={action} onValueChange={(v) => { setAction(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[200px]" aria-label="Filter by action"><SelectValue placeholder="All actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="brand-ring rounded-xl border border-slate-200 bg-white">
        {logs === null ? (
          <div className="p-6"><Skeleton className="h-64" /></div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">No audit events match.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-col gap-1 p-3.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${ACTION_COLORS[l.action] || "bg-slate-100 text-slate-600"}`}>{l.action.replace(/_/g, " ")}</span>
                    {l.ticket ? <span className="font-mono text-xs font-semibold text-[#0a2350]">{l.ticket.ticketNumber}</span> : null}
                    <span className="text-xs text-slate-500">{l.actorName} <span className="text-slate-400">({l.actorRole})</span></span>
                  </div>
                  {(l.previousValue || l.newValue) ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {l.previousValue ? <><span className="text-slate-400">from</span> <span className="font-medium">{l.previousValue}</span> </> : null}
                      {l.newValue ? <><span className="text-slate-400">to</span> <span className="font-medium">{l.newValue}</span></> : null}
                    </p>
                  ) : null}
                  {l.details ? <p className="mt-0.5 truncate text-xs text-slate-400">{l.details}</p> : null}
                </div>
                <span className="shrink-0 text-[11px] text-slate-400">{new Date(l.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
              </li>
            ))}
          </ul>
        )}
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
    </div>
  );
}
