"use client";

// Ticket list — classic service-desk list view.
// - Title bar: list menu, "New", "Go to <field> <value>" search, record
//   navigation ("1 to 20 of 163").
// - Condition breadcrumb ("All > State = Open > Assigned to = me"): click a
//   crumb to keep conditions up to it; the funnel opens the filter builder.
// - Column headers sort (click) and have a column menu; the magnifier shows a
//   per-column search row; the gear chooses visible columns.
// - Rows: checkbox, (i) preview, linked number, opened, short description …
// - "Actions on selected rows…" for bulk changes.
// All filtering and sorting runs on the server; the URL keeps the view.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StaffPicker, type StaffEntry } from "@/components/staff-picker";
import { BulkBar, type BulkMode } from "@/components/tickets/bulk-bar";
import { ViewsMenu, BUILT_IN_VIEWS } from "@/components/tickets/views-menu";
import { PRIORITIES, STATUS_LABELS, TICKET_STATUSES } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowDown, ArrowUp, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Download, Filter, Info, Loader2, Menu,
  RefreshCw, Search, Settings, ShieldAlert, Star, TriangleAlert, X,
} from "lucide-react";

interface TicketRow {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerPhone: string;
  description: string;
  status: string;
  priority: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  escalatedAt?: string | null;
  slaResolutionDueAt: string | null;
  branch: { id: string; name: string; code?: string };
  category: { name: string };
  department?: { id: string; name: string } | null;
  feedback?: { rating: number } | null;
  assignee: { id: string; name: string } | null;
}

type SortField = "ticketNumber" | "customer" | "branch" | "category" | "department" | "assignee" | "status" | "priority" | "createdAt" | "updatedAt";
type SortOrder = "asc" | "desc";

const COL_KEYS = ["ticketSearch", "customerSearch", "branchSearch", "categorySearch", "assigneeSearch"] as const;
type ColKey = (typeof COL_KEYS)[number];
type ColFilters = Record<ColKey, string>;
const emptyCols = (): ColFilters => ({ ticketSearch: "", customerSearch: "", branchSearch: "", categorySearch: "", assigneeSearch: "" });

interface View {
  q: string;
  cols: ColFilters;
  status: string;
  priority: string;
  department: string;
  from: string;
  to: string;
  overdue: boolean;
  escalated: boolean;
  assigned: string; // "" | "me" | "unassigned" | staff id
  scope: "" | "all";
  sort: SortField | "";
  order: SortOrder | "";
  page: number;
  pageSize: number;
}

const PAGE_SIZES = [10, 20, 50, 100];
const emptyView = (pageSize = 20): View => ({
  q: "", cols: emptyCols(), status: "", priority: "", department: "", from: "", to: "", overdue: false, escalated: false,
  assigned: "", scope: "", sort: "", order: "", page: 1, pageSize,
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
  const ps = Number(sp.get("pageSize") || "20");
  v.pageSize = PAGE_SIZES.includes(ps) ? ps : 20;
  return v;
}

function viewToQuery(v: View, withPaging = true): string {
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
  if (withPaging) {
    p.set("page", String(v.page));
    p.set("pageSize", String(v.pageSize));
  }
  return p.toString();
}

const PRIORITY_TEXT: Record<string, string> = { CRITICAL: "1 - Critical", HIGH: "2 - High", MEDIUM: "3 - Moderate", LOW: "4 - Low" };
const PRIORITY_DOT: Record<string, string> = { CRITICAL: "bg-[#e5372f]", HIGH: "bg-[#f28c1f]" };

const dt = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const time = d.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return { date, time };
};

// Columns (id → label, sort field). "number" is always visible.
const COLUMNS: { id: string; label: string; sort?: SortField }[] = [
  { id: "number", label: "Number", sort: "ticketNumber" },
  { id: "opened", label: "Opened", sort: "createdAt" },
  { id: "short", label: "Short description" },
  { id: "member", label: "Member", sort: "customer" },
  { id: "priority", label: "Priority", sort: "priority" },
  { id: "state", label: "State", sort: "status" },
  { id: "category", label: "Category", sort: "category" },
  { id: "group", label: "Assignment group", sort: "department" },
  { id: "assigned", label: "Assigned to", sort: "assignee" },
  { id: "branch", label: "Branch", sort: "branch" },
  { id: "updated", label: "Updated", sort: "updatedAt" },
];
const COLS_KEY = "fc.list.columns";

const GOTO_FIELDS: { id: "q" | ColKey; label: string }[] = [
  { id: "ticketSearch", label: "Number" },
  { id: "q", label: "Keywords" },
  { id: "customerSearch", label: "Member / mobile" },
  { id: "branchSearch", label: "Branch" },
  { id: "categorySearch", label: "Category" },
  { id: "assigneeSearch", label: "Assigned to" },
];

function ListInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [view, setView] = useState<View>(() => viewFromUrl(searchParams));
  const [colDraft, setColDraft] = useState<ColFilters>(view.cols);
  const [qDraft, setQDraft] = useState(view.q);
  const [gotoField, setGotoField] = useState<"q" | ColKey>("ticketSearch");
  const [gotoValue, setGotoValue] = useState("");
  const [showSearchRow, setShowSearchRow] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [rowInput, setRowInput] = useState("1");

  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [total, setTotal] = useState(0);
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
  const [bulkMode, setBulkMode] = useState<BulkMode | null>(null);

  const isCentral = !!me && ["ROOT_ADMIN", "CENTRAL_ADMIN", "CENTRAL_AGENT"].includes(me.role);
  const isBranchUser = !!me && (me.role === "SUPPORT_AGENT" || me.role === "BRANCH_MANAGER");

  const update = useCallback((patch: Partial<View>) => {
    setView((v) => ({ ...v, ...patch, page: patch.page ?? 1 }));
  }, []);

  // Column search boxes apply 400 ms after typing stops.
  useEffect(() => {
    const changed = COL_KEYS.some((k) => colDraft[k].trim() !== view.cols[k].trim());
    if (!changed) return;
    const id = setTimeout(() => update({ cols: { ...colDraft } }), 400);
    return () => clearTimeout(id);
  }, [colDraft, view.cols, update]);

  const query = useMemo(() => viewToQuery(view), [view]);

  // URL ⇄ view. Navigator links change the URL of this same page: adopt them.
  const lastPushed = useRef(query);
  useEffect(() => {
    const incoming = searchParams.toString();
    if (incoming === lastPushed.current) return;
    const v = viewFromUrl(searchParams);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with navigation
    setView(v);
    setColDraft(v.cols);
    setQDraft(v.q);
    lastPushed.current = viewToQuery(v);
  }, [searchParams]);
  useEffect(() => {
    if (query === lastPushed.current && query === searchParams.toString()) return;
    lastPushed.current = query;
    router.replace(`/staff/tickets?${query}`, { scroll: false });
  }, [query, router, searchParams]);

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
  // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the row box in step with paging
  useEffect(() => { setRowInput(String(total ? (view.page - 1) * view.pageSize + 1 : 0)); }, [view.page, view.pageSize, total]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate column choice
      if (saved) setHidden(JSON.parse(saved));
    } catch { /* ignore */ }
    fetch("/api/v1/auth/me").then((r) => r.json()).then((d) => {
      const u = d.data?.user;
      if (u) setMe({ id: u.id, role: u.role, branchId: u.branchId ?? null, branchName: u.branchName ?? null });
    }).catch(() => undefined);
    fetch("/api/v1/support/staff-directory").then((r) => r.json()).then((d) => {
      setStaff(d.data?.staff ?? []);
      const role = d.data?.me?.role as string | undefined;
      setCanReassign(!!role && (role !== "SUPPORT_AGENT" || !!d.data?.policy?.agentsReassign));
    }).catch(() => undefined);
    fetch("/api/v1/public/branches").then((r) => r.json()).then((d) => setBranches(d.data?.branches ?? [])).catch(() => undefined);
    fetch("/api/v1/public/categories").then((r) => r.json()).then((d) => setCategories(d.data?.categories ?? [])).catch(() => undefined);
    fetch("/api/v1/support/departments").then((r) => r.json()).then((d) => setDepartments(d.data?.departments ?? [])).catch(() => undefined);
  }, []);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const applyView = (q: string) => {
    const v = viewFromUrl(new URLSearchParams(q));
    setQDraft(v.q);
    setColDraft(v.cols);
    setView({ ...v, pageSize: view.pageSize, page: 1 });
  };
  const exportHref = `/api/v1/support/tickets/export?${viewToQuery(view, false)}`;

  const setAssigned = (value: string) => {
    const person = staffById.get(value);
    const otherBranch = !!person && isBranchUser && person.branchId !== me?.branchId;
    update({ assigned: value, ...(otherBranch ? { scope: "all" as const } : {}) });
  };

  const setSort = (field: SortField, order: SortOrder | "") => update({ sort: order ? field : "", order });
  const clickSort = (field: SortField) => {
    if (view.sort !== field) setSort(field, "asc");
    else setSort(field, view.order === "asc" ? "desc" : "asc");
  };

  // Paging (record based, like "1 to 20 of 163")
  const totalPages = Math.max(1, Math.ceil(total / view.pageSize));
  const firstRow = total ? (view.page - 1) * view.pageSize + 1 : 0;
  const lastRow = Math.min(total, view.page * view.pageSize);
  const goPage = (p: number) => update({ page: Math.min(totalPages, Math.max(1, p)) });

  // Go to
  const runGoto = (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = gotoValue.trim();
    if (gotoField === "q") { setQDraft(value); update({ q: value }); }
    else { const cols = { ...view.cols, [gotoField]: value }; setColDraft(cols); update({ cols }); }
  };

  // Breadcrumb conditions, in a stable order. Each knows how to remove itself.
  const crumbs = useMemo(() => {
    const list: { key: string; label: string; clear: Partial<View> }[] = [];
    if (view.scope === "all" && !isCentral) list.push({ key: "scope", label: "Branch = any", clear: { scope: "" } });
    if (view.status) list.push({ key: "status", label: `State = ${view.status === "OPEN" ? "Open (not resolved)" : STATUS_LABELS[view.status] || view.status}`, clear: { status: "" } });
    if (view.assigned) {
      const label = view.assigned === "me" ? "me" : view.assigned === "unassigned" ? "(empty)" : staffById.get(view.assigned)?.name || "employee";
      list.push({ key: "assigned", label: `Assigned to = ${label}`, clear: { assigned: "" } });
    }
    if (view.priority) list.push({ key: "priority", label: `Priority = ${PRIORITY_TEXT[view.priority] || view.priority}`, clear: { priority: "" } });
    if (view.department) list.push({ key: "department", label: `Assignment group = ${view.department === "none" ? "(empty)" : deptName.get(view.department) || "department"}`, clear: { department: "" } });
    if (view.overdue) list.push({ key: "overdue", label: "Resolution due < now", clear: { overdue: false } });
    if (view.escalated) list.push({ key: "escalated", label: "Escalated = true", clear: { escalated: false } });
    if (view.from) list.push({ key: "from", label: `Opened on or after ${view.from}`, clear: { from: "" } });
    if (view.to) list.push({ key: "to", label: `Opened on or before ${view.to}`, clear: { to: "" } });
    if (view.q.trim()) list.push({ key: "q", label: `Keywords = ${view.q.trim()}`, clear: { q: "" } });
    const colLabel: Record<ColKey, string> = { ticketSearch: "Number", customerSearch: "Member", branchSearch: "Branch", categorySearch: "Category", assigneeSearch: "Assigned to" };
    for (const k of COL_KEYS) {
      if (view.cols[k].trim()) list.push({ key: k, label: `${colLabel[k]} contains ${view.cols[k].trim()}`, clear: { cols: { ...view.cols, [k]: "" } } });
    }
    return list;
  }, [view, staffById, deptName, isCentral]);

  /** Keep conditions up to and including index i (or none with -1). */
  const keepCrumbs = (i: number) => {
    let next: View = { ...view, page: 1 };
    for (const c of crumbs.slice(i + 1)) {
      if (c.clear.cols) next = { ...next, cols: { ...next.cols, [c.key]: "" } };
      else next = { ...next, ...c.clear };
    }
    setColDraft(next.cols);
    setQDraft(next.q);
    setView(next);
  };
  const removeCrumb = (i: number) => {
    const c = crumbs[i];
    const next = c.clear.cols ? { ...view, cols: { ...view.cols, [c.key]: "" }, page: 1 } : { ...view, ...c.clear, page: 1 };
    setColDraft(next.cols);
    setQDraft(next.q);
    setView(next);
  };
  const clearAll = () => {
    setColDraft(emptyCols());
    setQDraft("");
    setView((v) => ({ ...emptyView(v.pageSize), scope: v.scope, sort: v.sort, order: v.order }));
  };

  const pageIds = rows?.map((r) => r.id) ?? [];
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(pageIds));
  const toggleOne = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const visible = COLUMNS.filter((c) => c.id === "number" || !hidden.includes(c.id));
  const toggleColumn = (id: string) => {
    setHidden((h) => {
      const next = h.includes(id) ? h.filter((x) => x !== id) : [...h, id];
      try { localStorage.setItem(COLS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const scopeText = isCentral || view.scope === "all" ? "All branches" : `Your branch${me?.branchName ? ` — ${me.branchName}` : ""}`;

  const pager = (compact = false) => (
    <div className="flex items-center gap-1 text-sm text-[var(--u-text)]">
      <button type="button" className="u-ghost-icon" onClick={() => goPage(1)} disabled={view.page <= 1} aria-label="First page" title="First page"><ChevronFirst className="h-5 w-5" aria-hidden /></button>
      <button type="button" className="u-ghost-icon" onClick={() => goPage(view.page - 1)} disabled={view.page <= 1} aria-label="Previous page" title="Previous page"><ChevronLeft className="h-5 w-5" aria-hidden /></button>
      {compact ? (
        <span className="px-1 tabular-nums">{firstRow} to {lastRow} of {total}</span>
      ) : (
        <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); const r = Number(rowInput); if (r >= 1) goPage(Math.ceil(r / view.pageSize)); }}>
          <input className="u-input !h-8 !w-16 text-right tabular-nums" value={rowInput} onChange={(e) => setRowInput(e.target.value.replace(/\D/g, ""))} aria-label="First row to show" />
          <span className="whitespace-nowrap tabular-nums">to {lastRow} of {total}</span>
        </form>
      )}
      <button type="button" className="u-ghost-icon" onClick={() => goPage(view.page + 1)} disabled={view.page >= totalPages} aria-label="Next page" title="Next page"><ChevronRight className="h-5 w-5" aria-hidden /></button>
      <button type="button" className="u-ghost-icon" onClick={() => goPage(totalPages)} disabled={view.page >= totalPages} aria-label="Last page" title="Last page"><ChevronLast className="h-5 w-5" aria-hidden /></button>
    </div>
  );

  const colSearch = (k: ColKey, placeholder: string, list?: string) => (
    <input
      className="u-input !h-7 !text-[13px]"
      placeholder={placeholder}
      value={colDraft[k]}
      list={list}
      onChange={(e) => setColDraft((d) => ({ ...d, [k]: e.target.value }))}
      onKeyDown={(e) => { if (e.key === "Enter") update({ cols: { ...colDraft } }); if (e.key === "Escape") setColDraft((d) => ({ ...d, [k]: "" })); }}
      aria-label={`Search ${placeholder}`}
    />
  );

  const searchCell = (id: string) => {
    switch (id) {
      case "number": return colSearch("ticketSearch", "Search");
      case "short": return (
        <input className="u-input !h-7 !text-[13px]" placeholder="Search" value={qDraft} onChange={(e) => setQDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") update({ q: qDraft }); }} onBlur={() => qDraft !== view.q && update({ q: qDraft })} aria-label="Search short description" />
      );
      case "member": return colSearch("customerSearch", "Search");
      case "branch": return isCentral || view.scope === "all" ? colSearch("branchSearch", "Search", "fc-branch-options") : null;
      case "category": return colSearch("categorySearch", "Search", "fc-category-options");
      case "assigned": return colSearch("assigneeSearch", "Search");
      case "state": return (
        <select className="u-select !h-7 !text-[13px]" value={view.status} onChange={(e) => update({ status: e.target.value })} aria-label="Filter state">
          <option value="">-- All --</option>
          <option value="OPEN">Open (not resolved)</option>
          {TICKET_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>)}
        </select>
      );
      case "priority": return (
        <select className="u-select !h-7 !text-[13px]" value={view.priority} onChange={(e) => update({ priority: e.target.value })} aria-label="Filter priority">
          <option value="">-- All --</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_TEXT[p]}</option>)}
        </select>
      );
      case "group": return (
        <select className="u-select !h-7 !text-[13px]" value={view.department} onChange={(e) => update({ department: e.target.value })} aria-label="Filter assignment group">
          <option value="">-- All --</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          <option value="none">(empty)</option>
        </select>
      );
      default: return null;
    }
  };

  const cell = (id: string, t: TicketRow) => {
    switch (id) {
      case "number": {
        const overdue = t.slaResolutionDueAt && !["RESOLVED", "CLOSED"].includes(t.status) && new Date(t.slaResolutionDueAt) < new Date();
        return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Link href={`/staff/tickets/${t.id}`} className="u-link">{t.ticketNumber}</Link>
            {overdue ? <span title="Overdue"><TriangleAlert className="h-3.5 w-3.5 text-[#e5372f]" aria-label="Overdue" /></span> : null}
            {t.escalatedAt ? <span title="Escalated"><ShieldAlert className="h-3.5 w-3.5 text-[#8b5cf6]" aria-label="Escalated" /></span> : null}
          </span>
        );
      }
      case "opened": { const d = dt(t.createdAt); return <span className="whitespace-nowrap tabular-nums">{d.date}<br />{d.time}</span>; }
      case "updated": { const d = dt(t.updatedAt); return <span className="whitespace-nowrap tabular-nums">{d.date}<br />{d.time}</span>; }
      case "short": return <span className="line-clamp-2 max-w-[280px]" title={t.description}>{t.description}</span>;
      case "member": return (
        <button type="button" className="u-link text-left" onClick={() => { const cols = { ...view.cols, customerSearch: t.customerPhone || t.customerName }; setColDraft(cols); update({ cols }); }} title="Show this member's tickets">
          {t.customerName}
        </button>
      );
      case "priority": return (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          {PRIORITY_DOT[t.priority] ? <span className={`h-2.5 w-2.5 rounded-full ${PRIORITY_DOT[t.priority]}`} aria-hidden /> : null}
          {PRIORITY_TEXT[t.priority] || t.priority}
        </span>
      );
      case "state": return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {STATUS_LABELS[t.status] || t.status}
          {t.feedback ? (
            <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold", t.feedback.rating <= 2 ? "text-[#e5372f]" : "text-[#b7791f]")} title={`Member rating ${t.feedback.rating}/5`}>
              <Star className="h-3 w-3 fill-current" aria-hidden />{t.feedback.rating}
            </span>
          ) : null}
        </span>
      );
      case "category": return t.category.name;
      case "group": return t.department ? (
        <button type="button" className="u-link text-left" onClick={() => update({ department: t.department!.id })} title="Show this group's tickets">{t.department.name}</button>
      ) : null;
      case "assigned": {
        if (!t.assignee) return <span className="text-[var(--u-text-2)]">(empty)</span>;
        const away = staffById.get(t.assignee.id)?.availabilityEnabled === false;
        return (
          <span className="inline-flex items-center gap-1.5">
            <button type="button" className="u-link text-left" onClick={() => setAssigned(t.assignee!.id)} title="Show this person's tickets">{t.assignee.name}</button>
            {away ? <span className="rounded bg-[#fff1cc] px-1 text-[10px] font-semibold text-[#8a5a00]" title="Away / on leave">away</span> : null}
          </span>
        );
      }
      case "branch": return t.branch.name;
      default: return null;
    }
  };

  const bulkOptions: { mode: BulkMode; label: string; show: boolean }[] = [
    { mode: "assign", label: "Reassign…", show: canReassign },
    { mode: "department", label: "Move to assignment group…", show: canReassign },
    { mode: "status", label: "Change state…", show: true },
    { mode: "escalate", label: "Escalate…", show: true },
  ];

  return (
    <div className="-m-5 flex h-[calc(100vh-52px)] flex-col">
      {/* Title bar */}
      <div className="u-bar flex flex-wrap items-center gap-2 px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="u-icon-btn" aria-label="List menu" title="List menu"><Menu className="h-4 w-4" aria-hidden /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>View</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {BUILT_IN_VIEWS.map((v) => <DropdownMenuItem key={v.name} onSelect={() => applyView(v.query)}>{v.name}</DropdownMenuItem>)}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Show</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {PAGE_SIZES.map((n) => (
                  <DropdownMenuCheckboxItem key={n} checked={view.pageSize === n} onCheckedChange={() => update({ pageSize: n })}>{n} rows per page</DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><a href={exportHref} download><Download className="mr-2 h-4 w-4" aria-hidden />Export → CSV (Excel)</a></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => load()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden />Refresh list</DropdownMenuItem>
            <DropdownMenuItem onSelect={clearAll}><X className="mr-2 h-4 w-4" aria-hidden />Clear all conditions</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <h1 className="text-[17px] font-semibold text-[var(--u-text)]">Tickets</h1>
        <a href="/complaint" target="_blank" rel="noreferrer" className="u-btn u-btn-primary" title="Open the complaint form in a new tab">New</a>
        <ViewsMenu currentQuery={viewToQuery(view, false)} onApply={(q) => applyView(q)} triggerClassName="u-btn !h-8 !rounded-[3px] !text-[13px]" />

        <form className="ml-1 flex items-center gap-2" onSubmit={runGoto}>
          <label className="text-sm text-[var(--u-text-2)]" htmlFor="goto-field">Go to</label>
          <select id="goto-field" className="u-select !w-36" value={gotoField} onChange={(e) => setGotoField(e.target.value as "q" | ColKey)}>
            {GOTO_FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <div className="relative">
            <input className="u-input !w-48 pr-8" value={gotoValue} onChange={(e) => setGotoValue(e.target.value)} placeholder="Search" aria-label="Go to value" />
            <button type="submit" className="absolute right-1.5 top-1.5 text-[var(--u-text-2)] hover:text-[var(--u-text)]" aria-label="Search"><Search className="h-4 w-4" aria-hidden /></button>
          </div>
        </form>

        <div className="ml-auto flex items-center gap-2">
          {loading && rows !== null ? <Loader2 className="h-4 w-4 animate-spin text-[var(--u-text-2)]" aria-label="Loading" /> : null}
          {pager()}
        </div>
      </div>

      {/* Condition breadcrumb */}
      <div className="u-subbar flex flex-wrap items-center gap-1.5 px-3 py-2 text-sm">
        <button type="button" onClick={() => setShowFilter((v) => !v)} className={cn("u-ghost-icon", showFilter && "!bg-[#e3effc] !text-[var(--u-accent)]")} aria-label="Show filter builder" aria-expanded={showFilter} title="Filter">
          <Filter className="h-5 w-5" aria-hidden />
        </button>
        <button type="button" className="u-crumb" onClick={() => keepCrumbs(-1)} title="Remove all conditions">All</button>
        {crumbs.map((c, i) => (
          <span key={c.key} className="group inline-flex items-center gap-1">
            <span className="text-[var(--u-text-2)]">&gt;</span>
            <button type="button" className="u-crumb" onClick={() => keepCrumbs(i)} title="Keep conditions up to here">{c.label}</button>
            <button type="button" onClick={() => removeCrumb(i)} className="rounded text-[var(--u-text-2)] opacity-0 hover:text-[#e5372f] group-hover:opacity-100" aria-label={`Remove condition ${c.label}`}>
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        ))}
        {isBranchUser && canAllBranches ? (
          <select className="u-select ml-auto !h-7 !w-36 !text-[13px]" value={view.scope} onChange={(e) => update({ scope: e.target.value as "" | "all" })} aria-label="Branch scope" title="Which branches to show">
            <option value="">My branch</option>
            <option value="all">All branches</option>
          </select>
        ) : (
          <span className="ml-auto text-xs text-[var(--u-text-2)]">{scopeText}</span>
        )}
      </div>

      {/* Filter builder */}
      {showFilter ? (
        <div className="grid gap-3 border-b border-[var(--u-line)] bg-[#fafbfb] px-4 py-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1"><span className="block text-xs text-[var(--u-text-2)]">Keywords (every word must match)</span>
            <input className="u-input" value={qDraft} onChange={(e) => setQDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") update({ q: qDraft }); }} placeholder="ticket, name, mobile, branch, issue…" />
          </label>
          <div className="space-y-1"><span className="block text-xs text-[var(--u-text-2)]">Assigned to</span>
            <StaffPicker staff={staff} value={view.assigned} onChange={setAssigned} preferBranchId={me?.branchId}
              special={[{ value: "", label: "Anyone" }, { value: "me", label: "Me" }, { value: "unassigned", label: "(empty) — unassigned" }]}
              placeholder="Anyone" className="!h-8 w-full" ariaLabel="Assigned to" />
          </div>
          <label className="space-y-1"><span className="block text-xs text-[var(--u-text-2)]">Opened on or after</span>
            <input type="date" className="u-input" value={view.from} max={view.to || undefined} onChange={(e) => update({ from: e.target.value })} />
          </label>
          <label className="space-y-1"><span className="block text-xs text-[var(--u-text-2)]">Opened on or before</span>
            <input type="date" className="u-input" value={view.to} min={view.from || undefined} onChange={(e) => update({ to: e.target.value })} />
          </label>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2 xl:col-span-4">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={view.overdue} onChange={(e) => update({ overdue: e.target.checked })} />Overdue (resolution due &lt; now)</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={view.escalated} onChange={(e) => update({ escalated: e.target.checked })} />Escalated</label>
            <span className="text-xs text-[var(--u-text-2)]">State, priority and assignment group: use the search row (magnifier) above the list.</span>
            <div className="ml-auto flex gap-2">
              <button type="button" className="u-btn" onClick={clearAll}>Clear all</button>
              <button type="button" className="u-btn u-btn-primary" onClick={() => { update({ q: qDraft }); setShowFilter(false); }}>Run</button>
            </div>
          </div>
        </div>
      ) : null}

      <datalist id="fc-branch-options">{branches.map((b) => <option key={b.id} value={b.name} />)}</datalist>
      <datalist id="fc-category-options">{categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="u-table min-w-[1380px]">
          <thead>
            <tr>
              <th className="w-[44px] !px-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="u-ghost-icon" aria-label="Personalize list columns" title="Personalize list columns"><Settings className="h-[18px] w-[18px] text-[var(--u-accent)]" aria-hidden /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel>Columns</DropdownMenuLabel>
                    {COLUMNS.filter((c) => c.id !== "number").map((c) => (
                      <DropdownMenuCheckboxItem key={c.id} checked={!hidden.includes(c.id)} onCheckedChange={() => toggleColumn(c.id)} onSelect={(e) => e.preventDefault()}>{c.label}</DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </th>
              <th className="w-[44px] !px-2">
                <button type="button" onClick={() => setShowSearchRow((v) => !v)} className={cn("u-ghost-icon", showSearchRow && "!bg-[#e3effc]")} aria-label="Show column search" aria-pressed={showSearchRow} title="Search columns">
                  <Search className="h-[18px] w-[18px] text-[var(--u-accent)]" aria-hidden />
                </button>
              </th>
              {visible.map((c) => {
                const sorted = !!c.sort && view.sort === c.sort && !!view.order;
                return (
                  <th key={c.id} aria-sort={sorted ? (view.order === "asc" ? "ascending" : "descending") : "none"}>
                    <span className="inline-flex items-center gap-1.5">
                      {c.sort ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="rounded p-0.5 text-[var(--u-text-2)] hover:bg-[#e6e8eb] hover:text-[var(--u-text)]" aria-label={`${c.label} column menu`}><Menu className="h-4 w-4" aria-hidden /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onSelect={() => setSort(c.sort!, "asc")}><ArrowUp className="mr-2 h-4 w-4" aria-hidden />Sort (a to z)</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setSort(c.sort!, "desc")}><ArrowDown className="mr-2 h-4 w-4" aria-hidden />Sort (z to a)</DropdownMenuItem>
                            {sorted ? <DropdownMenuItem onSelect={() => setSort(c.sort!, "")}><X className="mr-2 h-4 w-4" aria-hidden />Remove sort</DropdownMenuItem> : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setShowSearchRow(true)}><Search className="mr-2 h-4 w-4" aria-hidden />Search this column</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => toggleColumn(c.id)} disabled={c.id === "number"}><X className="mr-2 h-4 w-4" aria-hidden />Hide column</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : <Menu className="h-4 w-4 text-[#c4c9cf]" aria-hidden />}
                      {c.sort ? (
                        <button type="button" onClick={() => clickSort(c.sort!)} className={cn("u-col-btn", sorted && "is-sorted")} title={`Sort by ${c.label}`}>
                          {c.label}
                          {sorted ? (view.order === "asc" ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />) : null}
                        </button>
                      ) : <span>{c.label}</span>}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={cn(loading && rows !== null && "opacity-60")}>
            {showSearchRow ? (
              <tr className="u-searchrow">
                <td />
                <td className="text-center">
                  <button type="button" onClick={() => { setColDraft(emptyCols()); setQDraft(""); update({ cols: emptyCols(), q: "", status: "", priority: "", department: "" }); }} className="text-xs text-[var(--u-link)] hover:underline" title="Clear column searches">Clear</button>
                </td>
                {visible.map((c) => <td key={c.id}>{searchCell(c.id)}</td>)}
              </tr>
            ) : null}
            {rows === null ? (
              <tr><td colSpan={visible.length + 2} className="!py-10 text-center text-[var(--u-text-2)]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={visible.length + 2} className="!py-10 text-center text-[#b42318]">{error} <button type="button" className="u-link" onClick={load}>Retry</button></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={visible.length + 2} className="!py-12 text-center text-[var(--u-text-2)]">
                No records to display.
                {crumbs.length ? <> <button type="button" className="u-link" onClick={clearAll}>Clear conditions</button></> : null}
                {isBranchUser && canAllBranches && view.scope !== "all" ? <> · <button type="button" className="u-link" onClick={() => update({ scope: "all" })}>Search all branches</button></> : null}
              </td></tr>
            ) : rows.map((t) => (
              <tr key={t.id} className={cn(selected.has(t.id) && "u-selected")}>
                <td className="!px-2 text-center"><input type="checkbox" className="h-4 w-4 align-middle" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} aria-label={`Select ${t.ticketNumber}`} /></td>
                <td className="!px-2 text-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="u-ghost-icon !h-7 !w-7" aria-label={`Preview ${t.ticketNumber}`} title="Preview record"><Info className="h-5 w-5 text-[var(--u-accent)]" aria-hidden /></button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="ui16 w-[380px] p-0">
                      <div className="u-bar flex !min-h-0 items-center justify-between px-3 py-2">
                        <span className="text-sm font-semibold">Ticket {t.ticketNumber}</span>
                        <Link href={`/staff/tickets/${t.id}`} className="u-btn u-btn-primary !h-7 !text-xs">Open Record</Link>
                      </div>
                      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 p-3 text-[13px]">
                        <dt className="text-right text-[var(--u-text-2)]">State</dt><dd>{STATUS_LABELS[t.status] || t.status}</dd>
                        <dt className="text-right text-[var(--u-text-2)]">Priority</dt><dd>{PRIORITY_TEXT[t.priority]}</dd>
                        <dt className="text-right text-[var(--u-text-2)]">Member</dt><dd>{t.customerName} · {t.customerPhone}</dd>
                        <dt className="text-right text-[var(--u-text-2)]">Branch</dt><dd>{t.branch.name}</dd>
                        <dt className="text-right text-[var(--u-text-2)]">Category</dt><dd>{t.category.name}</dd>
                        <dt className="text-right text-[var(--u-text-2)]">Group</dt><dd>{t.department?.name || "—"}</dd>
                        <dt className="text-right text-[var(--u-text-2)]">Assigned to</dt><dd>{t.assignee?.name || "(empty)"}</dd>
                        <dt className="text-right text-[var(--u-text-2)]">Description</dt><dd className="line-clamp-4">{t.description}</dd>
                      </dl>
                    </PopoverContent>
                  </Popover>
                </td>
                {visible.map((c) => <td key={c.id}>{cell(c.id, t)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer: bulk actions + pager */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-[var(--u-bar-line)] bg-[var(--u-bar)] px-3 py-2">
        <input type="checkbox" className="h-4 w-4" checked={allOnPage} onChange={toggleAll} disabled={!pageIds.length} aria-label="Select all rows on this page" />
        <select
          className="u-select !w-60"
          value=""
          disabled={!selected.size}
          onChange={(e) => { if (e.target.value) setBulkMode(e.target.value as BulkMode); }}
          aria-label="Actions on selected rows"
        >
          <option value="">{selected.size ? `Actions on ${selected.size} selected row${selected.size === 1 ? "" : "s"}…` : "Actions on selected rows…"}</option>
          {bulkOptions.filter((o) => o.show).map((o) => <option key={o.mode} value={o.mode}>{o.label}</option>)}
        </select>
        {selected.size ? <button type="button" className="text-sm text-[var(--u-link)] hover:underline" onClick={() => setSelected(new Set())}>Clear selection</button> : null}
        <div className="ml-auto">{pager(true)}</div>
      </div>

      <BulkBar
        hideBar
        mode={bulkMode}
        onModeChange={setBulkMode}
        selectedIds={[...selected]}
        staff={staff}
        departments={departments}
        preferBranchId={me?.branchId}
        canReassign={canReassign}
        onClear={() => setSelected(new Set())}
        onDone={() => { setSelected(new Set()); setBulkMode(null); load(); }}
      />
    </div>
  );
}

export default function TicketsPage() {
  // The list is fully client-driven (its data loads in the browser), so it is
  // rendered after mount: this keeps the auto-generated ids of its many menus
  // identical between server and client (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount gate
  useEffect(() => { setMounted(true); }, []);
  const loading = <div className="p-6 text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />Loading…</div>;
  if (!mounted) return loading;
  return (
    <Suspense fallback={loading}>
      <ListInner />
    </Suspense>
  );
}
