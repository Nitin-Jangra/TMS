"use client";

// Ticket list with filters (status, branch, category, priority, assignee,
// search, unassigned, overdue, date range) + pagination + sorting.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PriorityBadge, StatusBadge } from "@/components/staff-nav";
import { TICKET_STATUSES, PRIORITIES, PRIORITY_LABELS } from "@/lib/types";
import { ChevronLeft, ChevronRight, Filter, Loader2, Search, TriangleAlert } from "lucide-react";

interface TicketRow {
  id: string;
  ticketNumber: string;
  customerName: string;
  status: string;
  priority: string;
  createdAt: string;
  slaResolutionDueAt: string | null;
  branch: { name: string };
  category: { name: string };
  assignee: { id: string; name: string } | null;
}

interface Meta {
  branches: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  isCentral: boolean;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

function ListInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<Meta>({ branches: [], categories: [], isCentral: false });
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [filters, setFilters] = useState({
    status: searchParams.get("status") || "",
    branchId: "",
    categoryId: "",
    priority: "",
    unassigned: searchParams.get("unassigned") === "true" ? "true" : "",
    overdue: searchParams.get("overdue") === "true" ? "true" : "",
    sort: "newest",
  });
  const page = Math.max(1, Number(searchParams.get("page") || "1"));

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.status) p.set("status", filters.status);
    if (filters.branchId) p.set("branchId", filters.branchId);
    if (filters.categoryId) p.set("categoryId", filters.categoryId);
    if (filters.priority) p.set("priority", filters.priority);
    if (filters.unassigned === "true") p.set("unassigned", "true");
    if (filters.overdue === "true") p.set("overdue", "true");
    if (q.trim()) p.set("q", q.trim());
    p.set("page", String(page));
    p.set("pageSize", "15");
    return p.toString();
  }, [filters, q, page]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/v1/support/tickets?${query}`);
    const body = await res.json();
    if (body.success) {
      setRows(body.data.tickets);
      setTotal(body.data.total);
      setTotalPages(body.data.totalPages);
    } else {
      setRows([]);
    }
    setLoading(false);
  }, [query]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount data loading
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/v1/public/branches").then((r) => r.json()).then((d) => setMeta((m) => ({ ...m, branches: d.data?.branches ?? [] })));
    fetch("/api/v1/public/categories").then((r) => r.json()).then((d) => setMeta((m) => ({ ...m, categories: d.data?.categories ?? [] })));
    fetch("/api/v1/auth/me").then((r) => r.json()).then((d) => setMeta((m) => ({ ...m, isCentral: ["ROOT_ADMIN", "CENTRAL_ADMIN", "CENTRAL_AGENT"].includes(d.data?.user?.role) })));
  }, []);

  // keep URL shareable
  useEffect(() => { router.replace(`/staff/tickets?${query}`, { scroll: false }); }, [query, router]);

  const activeFilters = Object.values(filters).filter(Boolean).length + (q.trim() ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0a2350]">Tickets</h1>
          <p className="mt-0.5 text-sm text-slate-500">{total} ticket{total === 1 ? "" : "s"} in scope · page {page} of {totalPages}</p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
          <Input
            className="pl-8"
            placeholder="Search ticket no. / name / mobile"
            value={q}
            onChange={(e) => { setQ(e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
            aria-label="Search tickets"
          />
        </div>
      </div>

      <div className="brand-ring rounded-xl border border-slate-200 bg-white">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <span className="flex items-center gap-1 text-xs font-medium text-slate-500"><Filter className="h-3.5 w-3.5" aria-hidden />Filters</span>
          <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "all" ? "" : v }))}>
            <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Status filter"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          {meta.isCentral ? (
            <Select value={filters.branchId} onValueChange={(v) => setFilters((f) => ({ ...f, branchId: v === "all" ? "" : v }))}>
              <SelectTrigger className="h-8 w-[160px] text-xs" aria-label="Branch filter"><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {meta.branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : null}
          <Select value={filters.categoryId} onValueChange={(v) => setFilters((f) => ({ ...f, categoryId: v === "all" ? "" : v }))}>
            <SelectTrigger className="h-8 w-[170px] text-xs" aria-label="Category filter"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {meta.categories.map((ct) => <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.priority} onValueChange={(v) => setFilters((f) => ({ ...f, priority: v === "all" ? "" : v }))}>
            <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Priority filter"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant={filters.unassigned === "true" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setFilters((f) => ({ ...f, unassigned: f.unassigned === "true" ? "" : "true" }))}>
            Unassigned
          </Button>
          <Button variant={filters.overdue === "true" ? "destructive" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setFilters((f) => ({ ...f, overdue: f.overdue === "true" ? "" : "true" }))}>
            <TriangleAlert className="mr-1 h-3 w-3" aria-hidden /> Overdue
          </Button>
          {activeFilters > 0 ? (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilters({ status: "", branchId: "", categoryId: "", priority: "", unassigned: "", overdue: "", sort: "newest" }); setQ(""); }}>
              Clear all
            </Button>
          ) : null}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading tickets...
          </div>
        ) : rows === null ? (
          <div className="p-10 text-center text-sm text-slate-400">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-600">No tickets match these filters.</p>
            <p className="mt-1 text-xs text-slate-400">Try clearing filters or registering a new complaint.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">Ticket</TableHead>
                <TableHead className="text-xs">Customer</TableHead>
                <TableHead className="text-xs">Branch</TableHead>
                <TableHead className="text-xs">Category</TableHead>
                <TableHead className="text-xs">Assignee</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Priority</TableHead>
                <TableHead className="text-xs text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => router.push(`/staff/tickets/${t.id}`)}>
                  <TableCell className="font-mono text-xs font-semibold text-[#0a2350]">
                    {t.ticketNumber}
                    {t.slaResolutionDueAt && !["RESOLVED", "CLOSED"].includes(t.status) && new Date(t.slaResolutionDueAt) < new Date() ? (
                      <span className="ml-1.5 inline-flex items-center text-red-500" title="Overdue"><TriangleAlert className="h-3 w-3" aria-hidden /></span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">{t.customerName}</TableCell>
                  <TableCell className="text-xs text-slate-500">{t.branch.name}</TableCell>
                  <TableCell className="text-xs text-slate-500">{t.category.name}</TableCell>
                  <TableCell className="text-xs">
                    {t.assignee ? t.assignee.name : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Unassigned</span>}
                  </TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                  <TableCell className="text-right text-xs text-slate-400">{fmt(t.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-100 p-3">
            <p className="text-xs text-slate-400">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => router.push(`/staff/tickets?${query.replace(`page=${page}`, `page=${page - 1}`)}`)} className="h-8">
                <ChevronLeft className="h-4 w-4" aria-hidden /> Prev
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => router.push(`/staff/tickets?${query.replace(`page=${page}`, `page=${page + 1}`)}`)} className="h-8">
                Next <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-slate-400">
        Tip: click any row to open the ticket. Use the{" "}
        <Link href="/staff/assignment" className="text-[#2c6bdf] hover:underline">assignment queue</Link> to
        manually assign unallocated complaints.
      </p>
    </div>
  );
}

export default function TicketsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ListInner />
    </Suspense>
  );
}
