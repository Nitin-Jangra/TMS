"use client";

// Ticket list with a global keyword search, per-column filters (Ticket,
// Customer, Branch, Category, Assignee, Status, Priority, Created) and quick
// toggles (assigned to me, unassigned, overdue). All filtering happens on the
// server so it covers every page, and the URL stays shareable.

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
import { ChevronLeft, ChevronRight, Filter, Loader2, Search, TriangleAlert, X } from "lucide-react";

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
  role?: string;
  branchName?: string | null;
}

/** Text filters: typed into the inputs, sent to the API after a short pause. */
const TEXT_KEYS = ["q", "ticketSearch", "customerSearch", "branchSearch", "categorySearch", "assigneeSearch"] as const;
type TextKey = (typeof TEXT_KEYS)[number];
/** Instant filters: dropdowns, dates and toggle buttons. */
const PICK_KEYS = ["status", "priority", "from", "to", "unassigned", "overdue", "mine"] as const;
type PickKey = (typeof PICK_KEYS)[number];

type TextFilters = Record<TextKey, string>;
type PickFilters = Record<PickKey, string>;

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
const emptyText = (): TextFilters => ({ q: "", ticketSearch: "", customerSearch: "", branchSearch: "", categorySearch: "", assigneeSearch: "" });
const emptyPick = (): PickFilters => ({ status: "", priority: "", from: "", to: "", unassigned: "", overdue: "", mine: "" });

function ListInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<Meta>({ branches: [], categories: [], isCentral: false });

  // What the user is typing, and the debounced copy that drives the query.
  const [typed, setTyped] = useState<TextFilters>(() => {
    const t = emptyText();
    for (const k of TEXT_KEYS) t[k] = searchParams.get(k) || "";
    return t;
  });
  const [text, setText] = useState<TextFilters>(typed);
  const [pick, setPick] = useState<PickFilters>(() => {
    const p = emptyPick();
    for (const k of PICK_KEYS) p[k] = searchParams.get(k) || "";
    return p;
  });
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get("page") || "1")));

  // Debounce typing so the API is not called on every keystroke.
  useEffect(() => {
    if (!TEXT_KEYS.some((k) => text[k].trim() !== typed[k].trim())) return;
    const id = setTimeout(() => { setText({ ...typed }); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [typed, text]);

  const setTypedKey = (k: TextKey, v: string) => setTyped((t) => ({ ...t, [k]: v }));
  const setPickKey = (k: PickKey, v: string) => { setPick((p) => ({ ...p, [k]: v })); setPage(1); };
  const toggle = (k: PickKey) => { setPick((p) => ({ ...p, [k]: p[k] === "true" ? "" : "true" })); setPage(1); };
  const flush = () => { setText({ ...typed }); setPage(1); }; // Enter = search now

  const query = useMemo(() => {
    const p = new URLSearchParams();
    for (const k of TEXT_KEYS) if (text[k].trim()) p.set(k, text[k].trim());
    for (const k of PICK_KEYS) if (pick[k]) p.set(k, pick[k]);
    p.set("page", String(page));
    p.set("pageSize", "15");
    return p.toString();
  }, [text, pick, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/support/tickets?${query}`);
      const body = await res.json();
      if (body.success) {
        setRows(body.data.tickets);
        setTotal(body.data.total);
        setTotalPages(body.data.totalPages);
      } else {
        setRows([]);
      }
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, [query]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount data loading
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/v1/public/branches").then((r) => r.json()).then((d) => setMeta((m) => ({ ...m, branches: d.data?.branches ?? [] })));
    fetch("/api/v1/public/categories").then((r) => r.json()).then((d) => setMeta((m) => ({ ...m, categories: d.data?.categories ?? [] })));
    fetch("/api/v1/auth/me").then((r) => r.json()).then((d) => setMeta((m) => ({
      ...m,
      isCentral: ["ROOT_ADMIN", "CENTRAL_ADMIN", "CENTRAL_AGENT"].includes(d.data?.user?.role),
      role: d.data?.user?.role,
      branchName: d.data?.user?.branchName ?? null,
    })));
  }, []);

  // keep URL shareable
  useEffect(() => { router.replace(`/staff/tickets?${query}`, { scroll: false }); }, [query, router]);

  const activeFilters =
    TEXT_KEYS.filter((k) => typed[k].trim()).length + PICK_KEYS.filter((k) => pick[k]).length;
  const clearAll = () => { setTyped(emptyText()); setText(emptyText()); setPick(emptyPick()); setPage(1); };
  const isBranchUser = meta.role === "SUPPORT_AGENT" || meta.role === "BRANCH_MANAGER";

  /** Small keyword box used in the column filter row (a render helper, not a
   *  component, so the input keeps focus while typing). */
  const colInput = (k: TextKey, placeholder: string, list?: string) => (
    <div className="relative">
      <Input
        className="h-7 min-w-[90px] px-2 pr-6 text-[11px] font-normal"
        placeholder={placeholder}
        value={typed[k]}
        list={list}
        onChange={(e) => setTypedKey(k, e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") flush(); }}
        aria-label={`Filter by ${placeholder}`}
      />
      {typed[k] ? (
        <button
          type="button"
          className="absolute right-1.5 top-1.5 text-slate-400 hover:text-slate-600"
          onClick={() => setTypedKey(k, "")}
          aria-label="Clear filter"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0a2350]">Tickets</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {isBranchUser
              ? `Complaints raised in your branch${meta.branchName ? ` — ${meta.branchName}` : ""} · `
              : meta.isCentral
                ? "All branches (tenant-wide) · "
                : ""}
            {total} ticket{total === 1 ? "" : "s"} · page {page} of {totalPages}
          </p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
          <Input
            className="pl-8"
            placeholder="Search keywords: ticket, name, mobile, branch, issue…"
            value={typed.q}
            onChange={(e) => setTypedKey("q", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") flush(); }}
            aria-label="Search tickets by keyword"
          />
        </div>
      </div>

      <div className="brand-ring rounded-xl border border-slate-200 bg-white">
        {/* Quick toggles */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <span className="flex items-center gap-1 text-xs font-medium text-slate-500"><Filter className="h-3.5 w-3.5" aria-hidden />Quick filters</span>
          {meta.role === "SUPPORT_AGENT" ? (
            <Button variant={pick.mine === "true" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => toggle("mine")}>
              Assigned to me
            </Button>
          ) : null}
          <Button variant={pick.unassigned === "true" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => toggle("unassigned")}>
            Unassigned
          </Button>
          <Button variant={pick.overdue === "true" ? "destructive" : "outline"} size="sm" className="h-8 text-xs" onClick={() => toggle("overdue")}>
            <TriangleAlert className="mr-1 h-3 w-3" aria-hidden /> Overdue
          </Button>
          <span className="text-[11px] text-slate-400">Use the boxes under each column heading to filter by that column. Several words = all must match.</span>
          {activeFilters > 0 ? (
            <Button variant="ghost" size="sm" className="ml-auto h-8 text-xs" onClick={clearAll}>
              <X className="mr-1 h-3 w-3" aria-hidden /> Clear all ({activeFilters})
            </Button>
          ) : null}
        </div>

        {/* Suggestions for the branch / category keyword boxes */}
        <datalist id="fc-branch-options">
          {meta.branches.map((b) => <option key={b.id} value={b.name} />)}
        </datalist>
        <datalist id="fc-category-options">
          {meta.categories.map((c) => <option key={c.id} value={c.name} />)}
        </datalist>

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
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead className="py-1.5">{colInput("ticketSearch", "FC-2026…")}</TableHead>
              <TableHead className="py-1.5">{colInput("customerSearch", "Name / mobile / email")}</TableHead>
              <TableHead className="py-1.5">
                {isBranchUser ? <span className="text-[11px] font-normal text-slate-400">Your branch</span> : colInput("branchSearch", "Branch / code", "fc-branch-options")}
              </TableHead>
              <TableHead className="py-1.5">{colInput("categorySearch", "Category", "fc-category-options")}</TableHead>
              <TableHead className="py-1.5">{colInput("assigneeSearch", "Name or “unassigned”")}</TableHead>
              <TableHead className="py-1.5">
                <Select value={pick.status || "all"} onValueChange={(v) => setPickKey("status", v === "all" ? "" : v)}>
                  <SelectTrigger className="h-7 min-w-[110px] text-[11px] font-normal" aria-label="Status filter"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="py-1.5">
                <Select value={pick.priority || "all"} onValueChange={(v) => setPickKey("priority", v === "all" ? "" : v)}>
                  <SelectTrigger className="h-7 min-w-[95px] text-[11px] font-normal" aria-label="Priority filter"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All priorities</SelectItem>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="py-1.5">
                <div className="flex flex-col items-end gap-1">
                  <Input type="date" className="h-7 w-[130px] px-1.5 text-[11px] font-normal" value={pick.from} max={pick.to || undefined} onChange={(e) => setPickKey("from", e.target.value)} aria-label="Created from" title="Created from" />
                  <Input type="date" className="h-7 w-[130px] px-1.5 text-[11px] font-normal" value={pick.to} min={pick.from || undefined} onChange={(e) => setPickKey("to", e.target.value)} aria-label="Created to" title="Created to" />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows === null ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="p-10 text-center text-sm text-slate-400">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden /> Loading tickets...
                </TableCell>
              </TableRow>
            ) : !rows || rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="p-12 text-center">
                  <p className="text-sm font-medium text-slate-600">No tickets match these filters.</p>
                  <p className="mt-1 text-xs text-slate-400">Try fewer keywords, clearing filters or registering a new complaint.</p>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((t) => (
                <TableRow key={t.id} className={`cursor-pointer ${loading ? "opacity-60" : ""}`} onClick={() => router.push(`/staff/tickets/${t.id}`)}>
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
              ))
            )}
          </TableBody>
        </Table>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-100 p-3">
            <p className="text-xs text-slate-400">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-8">
                <ChevronLeft className="h-4 w-4" aria-hidden /> Prev
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="h-8">
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
        {meta.role === "SUPPORT_AGENT" ? " Your view covers every complaint raised in your branch; use “Assigned to me” for your own work queue." : ""}
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
