"use client";

// Ticket list.
// - Global keyword search (Search button / Enter) across every column, in your
//   branch or — "All branches" — the whole workspace.
// - "Assigned to" filter: anyone, me, unassigned or any colleague (cover for
//   someone on leave). Colleagues who are away are marked.
// - Per-column keyword filters (apply as you type) + status / priority menus.
// - Click a column heading to sort: ascending → descending → normal.
// - Department filter, saved / built-in views, CSV export.
// - Tick tickets to reassign, move department, change status or escalate in bulk.
// All filtering and sorting runs on the server (covers every page); the URL
// keeps the current view so it can be bookmarked or shared.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PriorityBadge, StatusBadge } from "@/components/staff-nav";
import { StaffPicker, type StaffEntry } from "@/components/staff-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkBar } from "@/components/tickets/bulk-bar";
import { ViewsMenu } from "@/components/tickets/views-menu";
import { TICKET_STATUSES, PRIORITIES, PRIORITY_LABELS, STATUS_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Globe2, Loader2, Search, ShieldAlert, Star, TriangleAlert, UserRound, X,
} from "lucide-react";

interface TicketRow {
  id: string;
  ticketNumber: string;
  customerName: string;
  status: string;
  priority: string;
  createdAt: string;
  escalatedAt?: string | null;
  slaResolutionDueAt: string | null;
  branch: { id: string; name: string };
  category: { name: string };
  department?: { id: string; name: string } | null;
  feedback?: { rating: number } | null;
  assignee: { id: string; name: string } | null;
}

type SortField = "ticketNumber" | "customer" | "branch" | "category" | "assignee" | "status" | "priority" | "createdAt";
type SortOrder = "asc" | "desc";

/** Column keyword boxes: applied automatically shortly after typing stops. */
const COL_KEYS = ["ticketSearch", "customerSearch", "branchSearch", "categorySearch"] as const;
type ColKey = (typeof COL_KEYS)[number];
type ColFilters = Record<ColKey, string>;
const emptyCols = (): ColFilters => ({ ticketSearch: "", customerSearch: "", branchSearch: "", categorySearch: "" });

interface View {
  q: string; // global keywords (applied on Search / Enter)
  cols: ColFilters;
  status: string;
  priority: string;
  department: string; // "" any | department id | "none"
  from: string;
  to: string;
  overdue: boolean;
  escalated: boolean;
  assigned: string; // "" anyone | "me" | "unassigned" | staff id
  scope: "" | "all"; // "" = my branch (branch staff), "all" = every branch
  sort: SortField | "";
  order: SortOrder | "";
  page: number;
}

const emptyView = (): View => ({
  q: "", cols: emptyCols(), status: "", priority: "", department: "", from: "", to: "", overdue: false, escalated: false,
  assigned: "", scope: "", sort: "", order: "", page: 1,
});

function viewFromUrl(sp: URLSearchParams): View {
  const v = emptyView();
  v.q = sp.get("q") || "";
  for (const k of COL_KEYS) v.cols[k] = sp.get(k) || "";
  v.status = sp.get("status") || "";
  v.priority = sp.get("priority") || "";
  v.department = sp.get("departmentId") || "";
  v.from = sp.get("from") || "";
  v.to = sp.get("to") || "";
  v.overdue = sp.get("overdue") === "true";
  v.escalated = sp.get("escalated") === "true";
  v.assigned = sp.get("mine") === "true" ? "me" : sp.get("unassigned") === "true" ? "unassigned" : sp.get("assignedToId") || "";
  v.scope = sp.get("scope") === "all" ? "all" : "";
  v.sort = (sp.get("sort") as SortField) || "";
  v.order = sp.get("order") === "desc" ? "desc" : sp.get("order") === "asc" ? "asc" : "";
  v.page = Math.max(1, Number(sp.get("page") || "1") || 1);
  return v;
}

function viewToQuery(v: View): string {
  const p = new URLSearchParams();
  if (v.q.trim()) p.set("q", v.q.trim());
  for (const k of COL_KEYS) if (v.cols[k].trim()) p.set(k, v.cols[k].trim());
  if (v.status) p.set("status", v.status);
  if (v.priority) p.set("priority", v.priority);
  if (v.department) p.set("departmentId", v.department);
  if (v.from) p.set("from", v.from);
  if (v.to) p.set("to", v.to);
  if (v.overdue) p.set("overdue", "true");
  if (v.escalated) p.set("escalated", "true");
  if (v.assigned === "me") p.set("mine", "true");
  else if (v.assigned === "unassigned") p.set("unassigned", "true");
  else if (v.assigned) p.set("assignedToId", v.assigned);
  if (v.scope === "all") p.set("scope", "all");
  if (v.sort && v.order) { p.set("sort", v.sort); p.set("order", v.order); }
  p.set("page", String(v.page));
  p.set("pageSize", "15");
  return p.toString();
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });

function ListInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [view, setView] = useState<View>(() => viewFromUrl(searchParams));
  const [qDraft, setQDraft] = useState(view.q); // global search box (not yet applied)
  const [colDraft, setColDraft] = useState<ColFilters>(view.cols); // column boxes while typing

  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canAllBranches, setCanAllBranches] = useState(false);

  const [me, setMe] = useState<{ id: string; role: string; branchId: string | null; branchName: string | null } | null>(null);
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [canReassign, setCanReassign] = useState(false);

  const isCentral = !!me && ["ROOT_ADMIN", "CENTRAL_ADMIN", "CENTRAL_AGENT"].includes(me.role);
  const isBranchUser = !!me && (me.role === "SUPPORT_AGENT" || me.role === "BRANCH_MANAGER");
  const searchingAll = isCentral || view.scope === "all";

  /** Update the view; any change other than paging goes back to page 1. */
  const update = useCallback((patch: Partial<View>) => {
    setView((v) => ({ ...v, ...patch, page: patch.page ?? 1 }));
  }, []);

  // Column boxes: apply 400 ms after typing stops.
  useEffect(() => {
    const changed = COL_KEYS.some((k) => colDraft[k].trim() !== view.cols[k].trim());
    if (!changed) return;
    const id = setTimeout(() => update({ cols: { ...colDraft } }), 400);
    return () => clearTimeout(id);
  }, [colDraft, view.cols, update]);

  const query = useMemo(() => viewToQuery(view), [view]);

  // Load tickets; a newer request cancels the older one so results never
  // arrive out of order.
  const abortRef = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/support/tickets?${query}`, { signal: ctrl.signal });
      const body = await res.json();
      if (ctrl.signal.aborted) return;
      if (body.success) {
        setRows(body.data.tickets);
        setTotal(body.data.total);
        setTotalPages(body.data.totalPages);
        setCanAllBranches(!!body.data.canSearchAllBranches);
        setSelected(new Set());
      } else {
        setRows([]);
        setError(body.error?.message || "Could not load tickets.");
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setRows([]);
      setError("Network error — please try again.");
    }
    if (!ctrl.signal.aborted) setLoading(false);
  }, [query]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data loading
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the URL shareable (without adding history entries).
  useEffect(() => { router.replace(`/staff/tickets?${query}`, { scroll: false }); }, [query, router]);

  useEffect(() => {
    fetch("/api/v1/auth/me").then((r) => r.json()).then((d) => {
      const u = d.data?.user;
      if (u) setMe({ id: u.id, role: u.role, branchId: u.branchId ?? null, branchName: u.branchName ?? null });
    }).catch(() => undefined);
    fetch("/api/v1/support/staff-directory").then((r) => r.json()).then((d) => setStaff(d.data?.staff ?? [])).catch(() => undefined);
    fetch("/api/v1/public/branches").then((r) => r.json()).then((d) => setBranches(d.data?.branches ?? [])).catch(() => undefined);
    fetch("/api/v1/public/categories").then((r) => r.json()).then((d) => setCategories(d.data?.categories ?? [])).catch(() => undefined);
    fetch("/api/v1/support/departments").then((r) => r.json()).then((d) => setDepartments(d.data?.departments ?? [])).catch(() => undefined);
    fetch("/api/v1/support/staff-directory").then((r) => r.json()).then((d) => {
      const p = d.data?.policy;
      const role = d.data?.me?.role as string | undefined;
      setCanReassign(!!role && (role !== "SUPPORT_AGENT" || !!p?.agentsReassign));
    }).catch(() => undefined);
  }, []);

  /** Apply a saved / built-in view. */
  const applyView = (q: string) => {
    const v = viewFromUrl(new URLSearchParams(q));
    setQDraft(v.q);
    setColDraft(v.cols);
    setView({ ...v, page: 1 });
  };
  const exportHref = `/api/v1/support/tickets/export?${query.replace(/(^|&)(page|pageSize)=[^&]*/g, "")}`;

  const pageIds = rows?.map((r) => r.id) ?? [];
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(pageIds));
  const toggleOne = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  // Global search
  const runSearch = () => update({ q: qDraft });
  const clearSearch = () => { setQDraft(""); update({ q: "" }); };

  // Assigned-to: a colleague from another branch needs the all-branches view.
  const setAssigned = (value: string) => {
    const person = staffById.get(value);
    const otherBranch = !!person && isBranchUser && person.branchId !== me?.branchId;
    update({ assigned: value, ...(otherBranch ? { scope: "all" as const } : {}) });
  };

  // Sorting: none → asc → desc → none
  const cycleSort = (field: SortField) => {
    if (view.sort !== field) update({ sort: field, order: "asc" });
    else if (view.order === "asc") update({ sort: field, order: "desc" });
    else update({ sort: "", order: "" });
  };

  const activeCount =
    (view.q.trim() ? 1 : 0) +
    COL_KEYS.filter((k) => view.cols[k].trim()).length +
    [view.status, view.priority, view.department, view.from, view.to, view.assigned].filter(Boolean).length +
    (view.overdue ? 1 : 0) + (view.escalated ? 1 : 0);

  const clearAll = () => {
    setQDraft("");
    setColDraft(emptyCols());
    setView((v) => ({ ...emptyView(), scope: v.scope, sort: v.sort, order: v.order }));
  };

  const assignedSpecial = [
    { value: "", label: "Anyone" },
    { value: "me", label: "Assigned to me" },
    { value: "unassigned", label: "Unassigned" },
  ];

  /** Sortable column heading. */
  const head = (field: SortField, label: string, className = "") => {
    const active = view.sort === field && !!view.order;
    const Icon = !active ? ArrowUpDown : view.order === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={cn("text-xs", className)} aria-sort={active ? (view.order === "asc" ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          onClick={() => cycleSort(field)}
          className={cn(
            "inline-flex items-center gap-1 rounded px-1 py-0.5 -mx-1 font-medium hover:bg-slate-100 hover:text-slate-900",
            active ? "text-[#22618b]" : "text-slate-600",
          )}
          title={!active ? `Sort by ${label} (ascending)` : view.order === "asc" ? "Sorted ascending — click for descending" : "Sorted descending — click to reset"}
        >
          {label}
          <Icon className={cn("h-3 w-3", active ? "opacity-100" : "opacity-40")} aria-hidden />
        </button>
      </TableHead>
    );
  };

  /** Keyword box in the column filter row (render helper keeps focus). */
  const colInput = (k: ColKey, placeholder: string, list?: string) => (
    <div className="relative">
      <Input
        className="h-7 w-full min-w-[100px] px-2 pr-6 text-[11px] font-normal"
        placeholder={placeholder}
        value={colDraft[k]}
        list={list}
        onChange={(e) => setColDraft((d) => ({ ...d, [k]: e.target.value }))}
        onKeyDown={(e) => {
          if (e.key === "Enter") update({ cols: { ...colDraft } });
          if (e.key === "Escape") setColDraft((d) => ({ ...d, [k]: "" }));
        }}
        aria-label={`Filter by ${placeholder}`}
      />
      {colDraft[k] ? (
        <button type="button" className="absolute right-1.5 top-1.5 text-slate-400 hover:text-slate-600" onClick={() => setColDraft((d) => ({ ...d, [k]: "" }))} aria-label="Clear filter">
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );

  const scopeText = isCentral
    ? "All branches"
    : view.scope === "all"
      ? "All branches"
      : `Your branch${me?.branchName ? ` — ${me.branchName}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0a2350]">Tickets</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {scopeText} · {total} ticket{total === 1 ? "" : "s"} · page {view.page} of {totalPages}
            {view.sort && view.order ? ` · sorted by ${view.sort === "createdAt" ? "created" : view.sort} (${view.order === "asc" ? "ascending" : "descending"})` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewsMenu currentQuery={query} onApply={(q) => applyView(q)} />
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
            <a href={exportHref} download title="Download the filtered list as a CSV file (opens in Excel)">
              <Download className="h-3.5 w-3.5" aria-hidden /> Export
            </a>
          </Button>
        </div>
      </div>

      <div className="rounded border border-[#d1d7dc] bg-white shadow-sm overflow-hidden">
        {/* ServiceNow Quick Filter View Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-[#d1d7dc] bg-white px-3 pt-1">
          <button
            type="button"
            onClick={() => update({ status: "", assigned: "", overdue: false, escalated: false })}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition whitespace-nowrap",
              !view.status && !view.assigned && !view.overdue && !view.escalated
                ? "border-[#1f70c1] text-[#1f70c1]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            All Incidents
          </button>
          <button
            type="button"
            onClick={() => update({ assigned: "me", status: "", overdue: false, escalated: false })}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition whitespace-nowrap",
              view.assigned === "me"
                ? "border-[#1f70c1] text-[#1f70c1]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            Assigned to Me
          </button>
          <button
            type="button"
            onClick={() => update({ assigned: "unassigned", status: "", overdue: false, escalated: false })}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition whitespace-nowrap",
              view.assigned === "unassigned"
                ? "border-[#1f70c1] text-[#1f70c1]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            Unassigned Queue
          </button>
          <button
            type="button"
            onClick={() => update({ overdue: true, status: "", assigned: "", escalated: false })}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition whitespace-nowrap",
              view.overdue
                ? "border-red-600 text-red-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <TriangleAlert className="h-3.5 w-3.5" />
            SLA Overdue
          </button>
          <button
            type="button"
            onClick={() => update({ status: "RESOLVED", assigned: "", overdue: false, escalated: false })}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition whitespace-nowrap",
              view.status === "RESOLVED"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            Resolved
          </button>
        </div>

        {/* ServiceNow Condition Breadcrumb Bar */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-xs text-slate-600">
          <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400 mr-1">Condition Trail:</span>
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">All</span>
          <span className="text-slate-400">▶</span>
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">Active = true</span>

          {view.scope === "all" ? (
            <>
              <span className="text-slate-400">▶</span>
              <span className="inline-flex items-center gap-1 rounded bg-[#dbeafe] px-2 py-0.5 text-[11px] font-medium text-[#1e40af]">
                Scope = All Branches
                <button type="button" onClick={() => update({ scope: "" })} className="hover:text-red-600">×</button>
              </span>
            </>
          ) : null}

          {view.status ? (
            <>
              <span className="text-slate-400">▶</span>
              <span className="inline-flex items-center gap-1 rounded bg-[#e0f2fe] px-2 py-0.5 text-[11px] font-medium text-[#0369a1]">
                State = {STATUS_LABELS[view.status] || view.status}
                <button type="button" onClick={() => update({ status: "" })} className="hover:text-red-600">×</button>
              </span>
            </>
          ) : null}

          {view.assigned === "me" ? (
            <>
              <span className="text-slate-400">▶</span>
              <span className="inline-flex items-center gap-1 rounded bg-[#fef3c7] px-2 py-0.5 text-[11px] font-medium text-[#92400e]">
                Assigned to = Me
                <button type="button" onClick={() => update({ assigned: "" })} className="hover:text-red-600">×</button>
              </span>
            </>
          ) : view.assigned === "unassigned" ? (
            <>
              <span className="text-slate-400">▶</span>
              <span className="inline-flex items-center gap-1 rounded bg-[#fee2e2] px-2 py-0.5 text-[11px] font-medium text-[#991b1b]">
                Assigned to = Unassigned
                <button type="button" onClick={() => update({ assigned: "" })} className="hover:text-red-600">×</button>
              </span>
            </>
          ) : null}

          {view.q ? (
            <>
              <span className="text-slate-400">▶</span>
              <span className="inline-flex items-center gap-1 rounded bg-[#ede9fe] px-2 py-0.5 text-[11px] font-medium text-[#5b21b6]">
                Keyword contains "{view.q}"
                <button type="button" onClick={clearSearch} className="hover:text-red-600">×</button>
              </span>
            </>
          ) : null}

          {activeCount > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              className="ml-auto text-[11px] font-semibold text-[#1f70c1] hover:underline"
            >
              Clear All Conditions
            </button>
          ) : null}
        </div>

        {/* Row 1: global search, scope, assigned to */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <form
            className="flex w-full max-w-md flex-1 items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); runSearch(); }}
            role="search"
          >
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
              <Input
                className="h-9 pl-8 pr-7"
                placeholder="Keywords: ticket no., name, mobile, branch, issue…"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") clearSearch(); }}
                aria-label="Search tickets by keyword"
              />
              {qDraft ? (
                <button type="button" className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600" onClick={clearSearch} aria-label="Clear search">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <Button type="submit" size="sm" className="h-9 bg-[#22618b] px-4 hover:bg-[#1b4f72]">
              <Search className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Search
            </Button>
          </form>

          {isBranchUser && canAllBranches ? (
            <div className="inline-flex rounded-md border border-slate-200 p-0.5" role="group" aria-label="Search in">
              <button
                type="button"
                onClick={() => update({ scope: "" })}
                className={cn("rounded px-2.5 py-1 text-xs", view.scope === "" ? "bg-[#22618b] text-white" : "text-slate-600 hover:bg-slate-100")}
              >
                My branch
              </button>
              <button
                type="button"
                onClick={() => update({ scope: "all" })}
                className={cn("inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs", view.scope === "all" ? "bg-[#22618b] text-white" : "text-slate-600 hover:bg-slate-100")}
              >
                <Globe2 className="h-3 w-3" aria-hidden /> All branches
              </button>
            </div>
          ) : null}

          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 text-xs text-slate-500"><UserRound className="h-3.5 w-3.5" aria-hidden />Assigned to</span>
            <StaffPicker
              staff={staff}
              value={view.assigned}
              onChange={setAssigned}
              special={assignedSpecial}
              placeholder="Anyone"
              preferBranchId={me?.branchId}
              className="w-[210px]"
              ariaLabel="Assigned to filter"
            />
          </div>
        </div>

        {/* Row 2: quick toggles, dates, clear */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
          <Button variant={view.overdue ? "destructive" : "outline"} size="sm" className="h-8 text-xs" onClick={() => update({ overdue: !view.overdue })} aria-pressed={view.overdue}>
            <TriangleAlert className="mr-1 h-3 w-3" aria-hidden /> Overdue
          </Button>
          <Button variant={view.escalated ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => update({ escalated: !view.escalated })} aria-pressed={view.escalated}>
            <ShieldAlert className="mr-1 h-3 w-3" aria-hidden /> Escalated
          </Button>
          <Select value={view.department || "all"} onValueChange={(v) => update({ department: v === "all" ? "" : v })}>
            <SelectTrigger size="sm" className="h-8 w-[190px] text-xs" aria-label="Department filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              <SelectItem value="none">No department</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Created</span>
            <Input type="date" className="h-8 w-[140px] px-2 text-xs" value={view.from} max={view.to || undefined} onChange={(e) => update({ from: e.target.value })} aria-label="Created from" />
            <span>to</span>
            <Input type="date" className="h-8 w-[140px] px-2 text-xs" value={view.to} min={view.from || undefined} onChange={(e) => update({ to: e.target.value })} aria-label="Created to" />
          </div>
          {activeCount > 0 ? (
            <Button variant="ghost" size="sm" className="ml-auto h-8 text-xs" onClick={clearAll}>
              <X className="mr-1 h-3 w-3" aria-hidden /> Clear filters ({activeCount})
            </Button>
          ) : null}
        </div>

        <datalist id="fc-branch-options">{branches.map((b) => <option key={b.id} value={b.name} />)}</datalist>
        <datalist id="fc-category-options">{categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>

        {selected.size > 0 ? (
          <BulkBar
            selectedIds={[...selected]}
            staff={staff}
            departments={departments}
            preferBranchId={me?.branchId}
            canReassign={canReassign}
            onClear={() => setSelected(new Set())}
            onDone={() => { setSelected(new Set()); load(); }}
          />
        ) : null}

        <Table className="min-w-[1000px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead rowSpan={2} className="w-9 align-middle">
                <Checkbox checked={allOnPage} onCheckedChange={toggleAll} aria-label="Select all tickets on this page" disabled={!pageIds.length} />
              </TableHead>
              {head("ticketNumber", "Ticket", "w-[150px]")}
              {head("customer", "Customer")}
              {head("branch", "Branch")}
              {head("category", "Category")}
              {head("assignee", "Assignee")}
              {head("status", "Status", "w-[140px]")}
              {head("priority", "Priority", "w-[120px]")}
              {head("createdAt", "Created", "w-[100px]")}
            </TableRow>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead className="py-1.5 align-middle">{colInput("ticketSearch", "Ticket no.")}</TableHead>
              <TableHead className="py-1.5 align-middle">{colInput("customerSearch", "Name or mobile")}</TableHead>
              <TableHead className="py-1.5 align-middle">
                {searchingAll ? colInput("branchSearch", "Branch", "fc-branch-options") : <span className="text-[11px] font-normal text-slate-400">Your branch</span>}
              </TableHead>
              <TableHead className="py-1.5 align-middle">{colInput("categorySearch", "Category", "fc-category-options")}</TableHead>
              <TableHead className="py-1.5 align-middle">
                <span className="text-[11px] font-normal text-slate-400">Use “Assigned to” above</span>
              </TableHead>
              <TableHead className="py-1.5 align-middle">
                <Select value={view.status || "all"} onValueChange={(v) => update({ status: v === "all" ? "" : v })}>
                  <SelectTrigger size="sm" className="h-7 w-full text-[11px] font-normal" aria-label="Status filter"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="OPEN">Open (not resolved)</SelectItem>
                    {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="py-1.5 align-middle">
                <Select value={view.priority || "all"} onValueChange={(v) => update({ priority: v === "all" ? "" : v })}>
                  <SelectTrigger size="sm" className="h-7 w-full text-[11px] font-normal" aria-label="Priority filter"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All priorities</SelectItem>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="py-1.5" />
            </TableRow>
          </TableHeader>
          <TableBody className={cn(loading && rows !== null && "opacity-60 transition-opacity")}>
            {rows === null ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="p-10 text-center text-sm text-slate-400">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden /> Loading tickets...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="p-10 text-center text-sm text-red-600">
                  {error} <Button variant="link" size="sm" onClick={load}>Retry</Button>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="p-12 text-center">
                  <p className="text-sm font-medium text-slate-600">No tickets match these filters.</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Try fewer keywords or clear filters.
                    {isBranchUser && canAllBranches && view.scope !== "all" ? (
                      <> Looking for a ticket from another branch? <button type="button" className="text-[#22618b] underline" onClick={() => update({ scope: "all" })}>Search all branches</button>.</>
                    ) : null}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((t) => {
                const overdue = t.slaResolutionDueAt && !["RESOLVED", "CLOSED"].includes(t.status) && new Date(t.slaResolutionDueAt) < new Date();
                const away = t.assignee ? staffById.get(t.assignee.id)?.availabilityEnabled === false : false;
                return (
                  <TableRow key={t.id} className={cn("cursor-pointer", selected.has(t.id) && "bg-[#22618b]/5")} onClick={() => router.push(`/staff/tickets/${t.id}`)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleOne(t.id)} aria-label={`Select ${t.ticketNumber}`} />
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-[#0a2350]">
                      <Link href={`/staff/tickets/${t.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{t.ticketNumber}</Link>
                      {overdue ? <span className="ml-1.5 inline-flex items-center text-red-500" title="Overdue"><TriangleAlert className="h-3 w-3" aria-hidden /></span> : null}
                      {t.escalatedAt ? <span className="ml-1 inline-flex items-center text-purple-600" title="Escalated"><ShieldAlert className="h-3 w-3" aria-hidden /></span> : null}
                    </TableCell>
                    <TableCell className="text-xs">{t.customerName}</TableCell>
                    <TableCell className={cn("text-xs", me?.branchId && t.branch.id !== me.branchId && isBranchUser ? "font-medium text-[#22618b]" : "text-slate-500")}>{t.branch.name}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {t.category.name}
                      {t.department ? <span className="block text-[10px] text-slate-400">{t.department.name}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.assignee ? (
                        <span>
                          {t.assignee.name}
                          {away ? <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800" title="Availability off — on leave / away">away</span> : null}
                        </span>
                      ) : (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.status} />
                      {t.feedback ? (
                        <span className={cn("ml-1 inline-flex items-center gap-0.5 text-[10px] font-semibold", t.feedback.rating <= 2 ? "text-red-600" : "text-amber-600")} title={`Member rating ${t.feedback.rating}/5`}>
                          <Star className="h-3 w-3 fill-current" aria-hidden />{t.feedback.rating}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                    <TableCell className="text-xs text-slate-400">{fmt(t.createdAt)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t border-slate-100 p-3">
          <p className="text-xs text-slate-400">
            {loading && rows !== null ? <><Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden />Updating… </> : null}
            Page {view.page} of {totalPages} · {total} ticket{total === 1 ? "" : "s"}
          </p>
          {totalPages > 1 ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={view.page <= 1} onClick={() => update({ page: Math.max(1, view.page - 1) })} className="h-8">
                <ChevronLeft className="h-4 w-4" aria-hidden /> Prev
              </Button>
              <Button variant="outline" size="sm" disabled={view.page >= totalPages} onClick={() => update({ page: Math.min(totalPages, view.page + 1) })} className="h-8">
                Next <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Tip: click a column heading to sort (ascending → descending → normal). Pick a colleague under “Assigned to” to see and work on their tickets while
        they are away, and use the reassign panel inside a ticket to hand it to the right person. Unallocated complaints are also in the{" "}
        <Link href="/staff/assignment" className="text-[#2c6bdf] hover:underline">assignment queue</Link>.
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
