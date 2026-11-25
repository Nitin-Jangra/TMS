"use client";

// Ticket list — modern service-desk list view following PulseDesk layout and structure.
// - Sticky Queue Controls: list options, filter builder, search field combo, SLA monitor,
//   personalize columns, "Actions on selected rows" bulk menu, and "+ New" button.
// - Queue Overview KPI Strip: Open Tickets, In Progress, On Hold, and Resolved metric cards.
// - Active filter breadcrumbs with one-click condition removal and record count.
// - Data table: multi-select rows, status badge with dot, priority styling, monospace numbers.
// - Sticky pagination footer with selection count and page controls.
// All filtering and sorting runs on the server; the URL keeps the view state.

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
import { cachedFetch } from "@/lib/client-cache";
import { PRIORITIES, STATUS_LABELS, TICKET_STATUSES } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { RolePermissions } from "@/lib/permissions";
import {
  Activity, ArrowDown, ArrowUp, CheckCircle2, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight,
  Clock, Download, Filter, Inbox, Info, Loader2, Menu, PauseCircle, Plus,
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

const COL_KEYS = ["ticketSearch", "customerSearch", "categorySearch", "assigneeSearch"] as const;
type ColKey = (typeof COL_KEYS)[number];
type ColFilters = Record<ColKey, string>;
const emptyCols = (): ColFilters => ({ ticketSearch: "", customerSearch: "", categorySearch: "", assigneeSearch: "" });

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
  assigned: "me", scope: "", sort: "", order: "", page: 1, pageSize,
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
  if (sp.get("all") === "true" || sp.get("mine") === "false") {
    v.assigned = "";
  } else if (sp.get("mine") === "true") {
    v.assigned = "me";
  } else if (sp.get("unassigned") === "true") {
    v.assigned = "unassigned";
  } else if (sp.has("assignedToId")) {
    v.assigned = sp.get("assignedToId") || "";
  } else {
    v.assigned = "me";
  }
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
  else p.set("all", "true");
  if (v.scope === "all") p.set("scope", "all");
  if (v.sort && v.order) { p.set("sort", v.sort); p.set("order", v.order); }
  if (withPaging) {
    p.set("page", String(v.page));
    p.set("pageSize", String(v.pageSize));
  }
  return p.toString();
}

const PRIORITY_TEXT: Record<string, string> = { CRITICAL: "1 - Critical", HIGH: "2 - High", MEDIUM: "3 - Moderate", LOW: "4 - Low" };

const dt = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const time = d.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return { date, time };
};

// Columns (id → label, sort field). "number" is always visible.
const COLUMNS: { id: string; label: string; sort?: SortField }[] = [
  { id: "number", label: "Number", sort: "ticketNumber" },
  { id: "priority", label: "Priority", sort: "priority" },
  { id: "state", label: "State", sort: "status" },
  { id: "assigned", label: "Assigned to", sort: "assignee" },
  { id: "short", label: "Short description" },
  { id: "member", label: "Requester", sort: "customer" },
  { id: "group", label: "Assignment group", sort: "department" },
  { id: "opened", label: "Opened", sort: "createdAt" },
  { id: "updated", label: "Resolved", sort: "updatedAt" },
  { id: "category", label: "Category", sort: "category" },
  { id: "branch", label: "Branch", sort: "branch" },
];
const COLS_KEY = "fc.list.columns";

const GOTO_FIELDS: { id: "q" | ColKey; label: string }[] = [
  { id: "ticketSearch", label: "Number" },
  { id: "q", label: "Keywords" },
  { id: "customerSearch", label: "Requester" },
  { id: "assigneeSearch", label: "Assigned to" },
  { id: "categorySearch", label: "Category" },
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
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [canReassign, setCanReassign] = useState(false);
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [bulkMode, setBulkMode] = useState<BulkMode | null>(null);

  // Summary counts for KPI metrics strip
  const [summaryCounts, setSummaryCounts] = useState<{
    open: number;
    inProgress: number;
    onHold: number;
    resolved: number;
  }>({ open: 0, inProgress: 0, onHold: 0, resolved: 0 });

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
        const allowCross = !!body.data.canSearchAllBranches;
        setCanAllBranches(allowCross);
        if (!allowCross) {
          setView((cur) => (cur.scope === "all" ? { ...cur, scope: "" } : cur));
        }
        if (body.data.permissions) setPermissions(body.data.permissions);
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

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { setRowInput(String(total ? (view.page - 1) * view.pageSize + 1 : 0)); }, [view.page, view.pageSize, total]);

  // Load supporting options & KPI summary
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLS_KEY);
      if (saved) setHidden(JSON.parse(saved));
    } catch { /* ignore */ }
    cachedFetch<any>("/api/v1/auth/me", { ttlMs: 60000 }).then((d) => {
      const u = d?.data?.user;
      if (u) setMe({ id: u.id, role: u.role, branchId: u.branchId ?? null, branchName: u.branchName ?? null });
      if (d?.data?.permissions) setPermissions(d.data.permissions);
    });
    cachedFetch<any>("/api/v1/support/staff-directory", { ttlMs: 60000 }).then((d) => {
      setStaff(d?.data?.staff ?? []);
      const role = d?.data?.me?.role as string | undefined;
      setCanReassign(!!role && (role !== "SUPPORT_AGENT" || !!d?.data?.policy?.agentsReassign));
    });
    cachedFetch<any>("/api/v1/public/categories", { ttlMs: 300000 }).then((d) => setCategories(d?.data?.categories ?? []));
    cachedFetch<any>("/api/v1/support/departments", { ttlMs: 300000 }).then((d) => setDepartments(d?.data?.departments ?? []));

    // Dashboard summary counts for KPI strip
    cachedFetch<any>("/api/v1/support/dashboard/summary", { ttlMs: 20000 }).then((res) => {
      if (res?.success && res.data) {
        const c = res.data.counts || res.data.myCounts || {};
        const openTotal = (c.NEW_COMPLAINT || 0) + (c.IN_PROGRESS || 0) + (c.ON_HOLD || 0);
        setSummaryCounts({
          open: openTotal || c.open || 0,
          inProgress: (c.NEW_COMPLAINT || 0) + (c.IN_PROGRESS || 0),
          onHold: c.ON_HOLD || 0,
          resolved: c.RESOLVED || 0,
        });
      }
    });
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

  const canViewBranch = isCentral || !permissions || permissions.viewAllBranchTickets;

  const setAssigned = (value: string) => {
    const person = staffById.get(value);
    const otherBranch = canAllBranches && !!person && isBranchUser && person.branchId !== me?.branchId;
    update({ assigned: value, ...(otherBranch ? { scope: "all" as const } : {}) });
  };

  const setSort = (field: SortField, order: SortOrder | "") => update({ sort: order ? field : "", order });
  const clickSort = (field: SortField) => {
    if (view.sort !== field) setSort(field, "asc");
    else setSort(field, view.order === "asc" ? "desc" : "asc");
  };

  // Paging calculations
  const totalPages = Math.max(1, Math.ceil(total / view.pageSize));
  const firstRow = total ? (view.page - 1) * view.pageSize + 1 : 0;
  const lastRow = Math.min(total, view.page * view.pageSize);
  const goPage = (p: number) => update({ page: Math.min(totalPages, Math.max(1, p)) });

  // Quick field search
  const runGoto = (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = gotoValue.trim();
    if (gotoField === "q") { setQDraft(value); update({ q: value }); }
    else { const cols = { ...view.cols, [gotoField]: value }; setColDraft(cols); update({ cols }); }
  };

  // Breadcrumb conditions
  const crumbs = useMemo(() => {
    const list: { key: string; label: string; clear: Partial<View> }[] = [];
    if (view.scope === "all" && !isCentral && canAllBranches) list.push({ key: "scope", label: "Branch = any", clear: { scope: "" } });
    if (view.status) list.push({ key: "status", label: `State is ${view.status === "OPEN" ? "Open" : STATUS_LABELS[view.status] || view.status}`, clear: { status: "" } });
    if (view.assigned) {
      const label = view.assigned === "me" ? "Assigned to me" : view.assigned === "unassigned" ? "Unassigned" : `Assigned to ${staffById.get(view.assigned)?.name || "Agent"}`;
      list.push({ key: "assigned", label, clear: { assigned: canViewBranch ? "" : "me" } });
    }
    if (view.priority) list.push({ key: "priority", label: `Priority is ${PRIORITY_TEXT[view.priority] || view.priority}`, clear: { priority: "" } });
    if (view.department) list.push({ key: "department", label: `Group is ${view.department === "none" ? "None" : deptName.get(view.department) || "Department"}`, clear: { department: "" } });
    if (view.overdue) list.push({ key: "overdue", label: "Resolution overdue", clear: { overdue: false } });
    if (view.escalated) list.push({ key: "escalated", label: "Escalated", clear: { escalated: false } });
    if (view.from) list.push({ key: "from", label: `Opened ≥ ${view.from}`, clear: { from: "" } });
    if (view.to) list.push({ key: "to", label: `Opened ≤ ${view.to}`, clear: { to: "" } });
    if (view.q.trim()) list.push({ key: "q", label: `"${view.q.trim()}"`, clear: { q: "" } });
    const colLabel: Record<ColKey, string> = { ticketSearch: "Number", customerSearch: "Requester", categorySearch: "Category", assigneeSearch: "Assigned" };
    for (const k of COL_KEYS) {
      if (view.cols[k].trim()) list.push({ key: k, label: `${colLabel[k]}: ${view.cols[k].trim()}`, clear: { cols: { ...view.cols, [k]: "" } } });
    }
    return list;
  }, [view, staffById, deptName, isCentral, canAllBranches, canViewBranch]);

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
    setView((v) => ({
      ...emptyView(v.pageSize),
      assigned: canViewBranch ? "" : "me",
      scope: canAllBranches ? v.scope : "",
      sort: v.sort,
      order: v.order,
    }));
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

  const scopeText =
    isCentral || (canAllBranches && view.scope === "all")
      ? "All branches"
      : !canViewBranch
      ? `My assigned queue${me?.branchName ? ` (${me.branchName})` : ""}`
      : `Your branch${me?.branchName ? ` (${me.branchName})` : ""}`;

  const colSearch = (k: ColKey, placeholder: string, list?: string) => (
    <input
      className="h-7 w-full rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
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
      case "number": return colSearch("ticketSearch", "Filter ID…");
      case "short": return (
        <input className="h-7 w-full rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          placeholder="Filter description…" value={qDraft} onChange={(e) => setQDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") update({ q: qDraft }); }} onBlur={() => qDraft !== view.q && update({ q: qDraft })} aria-label="Search short description" />
      );
      case "member": return colSearch("customerSearch", "Filter requester…");
      case "branch": return null;
      case "category": return colSearch("categorySearch", "Filter category…", "fc-category-options");
      case "assigned": return colSearch("assigneeSearch", "Filter assignee…");
      case "state": return (
        <select className="h-7 w-full rounded border border-border bg-background px-1 text-xs outline-none focus:border-primary" value={view.status} onChange={(e) => update({ status: e.target.value })} aria-label="Filter state">
          <option value="">All States</option>
          <option value="OPEN">Open (Active)</option>
          {TICKET_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>)}
        </select>
      );
      case "priority": return (
        <select className="h-7 w-full rounded border border-border bg-background px-1 text-xs outline-none focus:border-primary" value={view.priority} onChange={(e) => update({ priority: e.target.value })} aria-label="Filter priority">
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_TEXT[p]}</option>)}
        </select>
      );
      case "group": return (
        <select className="h-7 w-full rounded border border-border bg-background px-1 text-xs outline-none focus:border-primary" value={view.department} onChange={(e) => update({ department: e.target.value })} aria-label="Filter assignment group">
          <option value="">All Groups</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          <option value="none">(empty)</option>
        </select>
      );
      default: return null;
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
      case "NEW_COMPLAINT":
      case "IN_PROGRESS":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800 border border-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" aria-hidden />
            In Progress
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

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      CRITICAL: "text-red-700 font-semibold",
      HIGH: "text-orange-700 font-medium",
      MEDIUM: "text-slate-800",
      LOW: "text-slate-600",
    };
    return (
      <span className={cn("text-xs whitespace-nowrap", colors[priority] || "text-slate-700")}>
        {PRIORITY_TEXT[priority] || priority}
      </span>
    );
  };

  const cell = (id: string, t: TicketRow) => {
    switch (id) {
      case "number": {
        const overdue = t.slaResolutionDueAt && !["RESOLVED", "CLOSED"].includes(t.status) && new Date(t.slaResolutionDueAt) < new Date();
        return (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-primary">
            <Link href={`/staff/tickets/${t.id}`} className="hover:underline">{t.ticketNumber}</Link>
            {overdue ? <span title="Overdue SLA"><TriangleAlert className="h-3.5 w-3.5 text-red-600" aria-label="Overdue" /></span> : null}
            {t.escalatedAt ? <span title="Escalated"><ShieldAlert className="h-3.5 w-3.5 text-purple-600" aria-label="Escalated" /></span> : null}
          </span>
        );
      }
      case "priority": return getPriorityBadge(t.priority);
      case "state": return (
        <span className="inline-flex items-center gap-1.5">
          {getStatusBadge(t.status)}
          {t.feedback ? (
            <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold", t.feedback.rating <= 2 ? "text-red-600" : "text-amber-600")} title={`Member rating ${t.feedback.rating}/5`}>
              <Star className="h-3 w-3 fill-current" aria-hidden />{t.feedback.rating}
            </span>
          ) : null}
        </span>
      );
      case "assigned": {
        if (!t.assignee) return <span className="text-xs text-muted-foreground">(empty)</span>;
        const away = staffById.get(t.assignee.id)?.availabilityEnabled === false;
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-primary">
            <button type="button" className="hover:underline text-left font-medium" onClick={() => setAssigned(t.assignee!.id)} title="Filter by this assignee">{t.assignee.name}</button>
            {away ? <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800" title="Away / on leave">away</span> : null}
          </span>
        );
      }
      case "short": return <span className="line-clamp-1 max-w-[320px] text-xs text-foreground" title={t.description}>{t.description}</span>;
      case "member": return (
        <button type="button" className="text-left text-xs font-medium text-primary hover:underline" onClick={() => { const cols = { ...view.cols, customerSearch: t.customerPhone || t.customerName }; setColDraft(cols); update({ cols }); }} title="Filter by this requester">
          {t.customerName}
        </button>
      );
      case "group": return t.department ? (
        <button type="button" className="text-left text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={() => update({ department: t.department!.id })} title="Filter by this group">{t.department.name}</button>
      ) : <span className="text-xs text-muted-foreground">—</span>;
      case "opened": { const d = dt(t.createdAt); return <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">{d.date} {d.time.slice(0, 5)}</span>; }
      case "updated": {
        const isResolved = ["RESOLVED", "CLOSED"].includes(t.status);
        if (!isResolved) return <span className="font-mono text-xs text-muted-foreground">(empty)</span>;
        const d = dt(t.updatedAt);
        return <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">{d.date} {d.time.slice(0, 5)}</span>;
      }
      case "category": return <span className="text-xs text-muted-foreground">{t.category.name}</span>;
      case "branch": return <span className="text-xs text-muted-foreground">{t.branch.name}</span>;
      default: return null;
    }
  };

  const canBulk = !permissions || permissions.bulkOperations;
  const canExport = !permissions || permissions.exportTickets;
  const canReassignPerm = permissions ? permissions.reassignTickets : canReassign;
  const canDeptPerm = permissions ? permissions.changeDepartment : canReassign;
  const canStatusPerm = permissions ? permissions.updateStatus : true;
  const canEscalatePerm = permissions ? permissions.escalateTickets : true;

  const bulkOptions: { mode: BulkMode; label: string; show: boolean }[] = [
    { mode: "assign", label: "Reassign selected…", show: canBulk && canReassignPerm },
    { mode: "department", label: "Change assignment group…", show: canBulk && canDeptPerm },
    { mode: "status", label: "Update ticket state…", show: canBulk && canStatusPerm },
    { mode: "escalate", label: "Escalate selected…", show: canBulk && canEscalatePerm },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background pb-12">
      {/* Sticky Queue Controls & Bulk Actions Bar */}
      <div className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur px-4 py-2.5 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          {/* Left: List Controls, Title & Quick Search */}
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Queue list options" title="List menu">
                  <Menu className="h-4 w-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Preset Views</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    {BUILT_IN_VIEWS.map((v) => <DropdownMenuItem key={v.name} onSelect={() => applyView(v.query)}>{v.name}</DropdownMenuItem>)}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Page Size</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {PAGE_SIZES.map((n) => (
                      <DropdownMenuCheckboxItem key={n} checked={view.pageSize === n} onCheckedChange={() => update({ pageSize: n })}>{n} rows per page</DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                {canExport && (
                  <DropdownMenuItem asChild><a href={exportHref} download><Download className="mr-2 h-4 w-4" aria-hidden />Export to CSV</a></DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => load()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden />Refresh Queue</DropdownMenuItem>
                <DropdownMenuItem onSelect={clearAll}><X className="mr-2 h-4 w-4" aria-hidden />Reset All Filters</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              onClick={() => setShowFilter((v) => !v)}
              className={cn("inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors", showFilter && "bg-primary/10 text-primary border-primary/30")}
              aria-label="Toggle filter builder"
              title="Filter Builder"
            >
              <Filter className="h-4 w-4" aria-hidden />
            </button>

            <h1 className="ml-1 text-lg font-semibold tracking-tight text-foreground">Tickets</h1>

            <div className="flex items-center gap-1.5 ml-2">
              <select
                aria-label="Search field"
                className="h-8 rounded border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none"
                value={gotoField}
                onChange={(e) => setGotoField(e.target.value as "q" | ColKey)}
              >
                {GOTO_FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>

              <form className="relative flex items-center" onSubmit={runGoto}>
                <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <input
                  type="search"
                  placeholder="Filter queue..."
                  aria-label="Filter queue rows"
                  className="h-8 w-44 sm:w-52 rounded border border-border bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  value={gotoValue}
                  onChange={(e) => setGotoValue(e.target.value)}
                />
              </form>
            </div>
          </div>

          {/* Right: Bulk Actions Dropdown & New Ticket */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => update({ overdue: !view.overdue })}
              className={cn("inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors", view.overdue && "border-red-400 bg-red-50 text-red-600")}
              aria-label="Live SLA breach monitor"
              title={view.overdue ? "Showing overdue tickets only" : "Filter overdue SLA tickets"}
            >
              <Activity className="h-4 w-4" aria-hidden />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Personalize list columns" title="Customize columns">
                  <Settings className="h-4 w-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Visible Columns</DropdownMenuLabel>
                {COLUMNS.filter((c) => c.id !== "number").map((c) => (
                  <DropdownMenuCheckboxItem key={c.id} checked={!hidden.includes(c.id)} onCheckedChange={() => toggleColumn(c.id)} onSelect={(e) => e.preventDefault()}>{c.label}</DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {canBulk && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                    disabled={!selected.size}
                  >
                    <span>{selected.size ? `Actions on ${selected.size} row${selected.size === 1 ? "" : "s"}` : "Actions on selected rows"}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {bulkOptions.filter((o) => o.show).map((o) => (
                    <DropdownMenuItem key={o.mode} onSelect={() => setBulkMode(o.mode)}>{o.label}</DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setSelected(new Set())} className="text-red-600">Clear selection</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Link
              href="/complaint"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              <span>New</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4">
        {/* Queue Overview KPI Strip */}
        <section aria-label="Queue overview metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => update({ status: view.status === "OPEN" ? "" : "OPEN", assigned: canViewBranch ? "" : "me" })}
            className={cn("flex items-center justify-between rounded-lg border border-border bg-card p-3.5 text-left transition hover:border-primary/50 shadow-sm", view.status === "OPEN" && "border-primary ring-1 ring-primary")}
          >
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground">Open Tickets</span>
              <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{summaryCounts.open || total}</span>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700">
              <Inbox className="h-5 w-5" aria-hidden />
            </span>
          </button>

          <button
            type="button"
            onClick={() => update({ status: view.status === "IN_PROGRESS" ? "" : "IN_PROGRESS" })}
            className={cn("flex items-center justify-between rounded-lg border border-border bg-card p-3.5 text-left transition hover:border-primary/50 shadow-sm", view.status === "IN_PROGRESS" && "border-blue-500 ring-1 ring-blue-500")}
          >
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground">In Progress</span>
              <span className="text-2xl font-bold tracking-tight text-blue-700 tabular-nums">{summaryCounts.inProgress}</span>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-700">
              <Clock className="h-5 w-5" aria-hidden />
            </span>
          </button>

          <button
            type="button"
            onClick={() => update({ status: view.status === "ON_HOLD" ? "" : "ON_HOLD" })}
            className={cn("flex items-center justify-between rounded-lg border border-border bg-card p-3.5 text-left transition hover:border-primary/50 shadow-sm", view.status === "ON_HOLD" && "border-amber-500 ring-1 ring-amber-500")}
          >
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground">On Hold</span>
              <span className="text-2xl font-bold tracking-tight text-amber-700 tabular-nums">{summaryCounts.onHold}</span>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-700">
              <PauseCircle className="h-5 w-5" aria-hidden />
            </span>
          </button>

          <button
            type="button"
            onClick={() => update({ status: view.status === "RESOLVED" ? "" : "RESOLVED" })}
            className={cn("flex items-center justify-between rounded-lg border border-border bg-card p-3.5 text-left transition hover:border-primary/50 shadow-sm", view.status === "RESOLVED" && "border-emerald-500 ring-1 ring-emerald-500")}
          >
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground">Resolved</span>
              <span className="text-2xl font-bold tracking-tight text-emerald-700 tabular-nums">{summaryCounts.resolved}</span>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </span>
          </button>
        </section>

        {/* Active Filter Breadcrumb Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-xs shadow-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-muted-foreground">Active filter:</span>
            <button type="button" onClick={() => keepCrumbs(-1)} className="font-medium text-primary hover:underline">All</button>
            {crumbs.map((c, i) => (
              <span key={c.key} className="inline-flex items-center gap-1">
                <span className="text-muted-foreground">&gt;</span>
                <span className="inline-flex items-center gap-1 rounded bg-muted/70 px-2 py-0.5 text-foreground font-medium border border-border">
                  <button type="button" onClick={() => keepCrumbs(i)} className="hover:underline">{c.label}</button>
                  <button type="button" onClick={() => removeCrumb(i)} className="ml-0.5 text-muted-foreground hover:text-red-600" aria-label={`Remove filter ${c.label}`}>
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </span>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3 font-mono text-muted-foreground">
            {isBranchUser && canAllBranches ? (
              <select className="h-6 rounded border border-border bg-background px-1 text-[11px] outline-none" value={view.scope} onChange={(e) => update({ scope: e.target.value as "" | "all" })} aria-label="Branch scope">
                <option value="">My branch</option>
                <option value="all">All branches</option>
              </select>
            ) : <span className="text-[11px]">{scopeText}</span>}
            <span className="tabular-nums">Showing {firstRow}–{lastRow} of {total}</span>
          </div>
        </div>

        {/* Filter Builder Panel */}
        {showFilter ? (
          <div className="grid gap-3 rounded-lg border border-border bg-card p-4 text-xs sm:grid-cols-2 xl:grid-cols-4 shadow-sm">
            <label className="space-y-1">
              <span className="block font-medium text-muted-foreground">Keywords</span>
              <input className="h-8 w-full rounded border border-border bg-background px-2.5 text-xs text-foreground focus:border-primary focus:outline-none" value={qDraft} onChange={(e) => setQDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") update({ q: qDraft }); }} placeholder="ticket, name, mobile, issue…" />
            </label>
            <div className="space-y-1">
              <span className="block font-medium text-muted-foreground">Assigned to</span>
              <StaffPicker
                staff={canViewBranch ? staff : staff.filter((s) => s.id === me?.id)}
                value={view.assigned}
                onChange={setAssigned}
                preferBranchId={me?.branchId}
                special={
                  canViewBranch
                    ? [{ value: "", label: "Anyone" }, { value: "me", label: "Me (My tickets)" }, { value: "unassigned", label: "(empty) — Unassigned" }]
                    : [{ value: "me", label: "Me (My tickets)" }]
                }
                placeholder={canViewBranch ? "Anyone" : "Me (My tickets)"}
                className="!h-8 w-full text-xs"
                ariaLabel="Assigned to"
              />
            </div>
            <label className="space-y-1">
              <span className="block font-medium text-muted-foreground">Opened on or after</span>
              <input type="date" className="h-8 w-full rounded border border-border bg-background px-2.5 text-xs text-foreground focus:border-primary focus:outline-none" value={view.from} max={view.to || undefined} onChange={(e) => update({ from: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="block font-medium text-muted-foreground">Opened on or before</span>
              <input type="date" className="h-8 w-full rounded border border-border bg-background px-2.5 text-xs text-foreground focus:border-primary focus:outline-none" value={view.to} min={view.from || undefined} onChange={(e) => update({ to: e.target.value })} />
            </label>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2 xl:col-span-4 pt-1">
              <label className="inline-flex items-center gap-2 font-medium"><input type="checkbox" className="rounded border-border text-primary focus:ring-primary" checked={view.overdue} onChange={(e) => update({ overdue: e.target.checked })} />Overdue SLA</label>
              <label className="inline-flex items-center gap-2 font-medium"><input type="checkbox" className="rounded border-border text-primary focus:ring-primary" checked={view.escalated} onChange={(e) => update({ escalated: e.target.checked })} />Escalated</label>
              <div className="ml-auto flex gap-2">
                <button type="button" className="rounded border border-border bg-background px-3 py-1 font-medium hover:bg-muted" onClick={clearAll}>Clear all</button>
                <button type="button" className="rounded bg-primary px-3 py-1 font-semibold text-primary-foreground hover:bg-primary/90" onClick={() => { update({ q: qDraft }); setShowFilter(false); }}>Apply Filter</button>
              </div>
            </div>
          </div>
        ) : null}

        <datalist id="fc-category-options">{categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>

        {/* Selectable Ticket Queue Table */}
        <section aria-label="Ticket queue list" className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="border-b border-border bg-muted/50 font-semibold text-muted-foreground">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2.5 text-center">
                    {canBulk ? (
                      <input
                        type="checkbox"
                        aria-label="Select all tickets on this page"
                        className="rounded border-border text-primary focus:ring-primary"
                        checked={allOnPage}
                        onChange={toggleAll}
                        disabled={!pageIds.length}
                      />
                    ) : null}
                  </th>
                  <th scope="col" className="w-8 px-1 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => setShowSearchRow((v) => !v)}
                      className={cn("rounded p-0.5 text-muted-foreground hover:text-foreground", showSearchRow && "text-primary")}
                      aria-label="Toggle column search inputs"
                      title="Toggle per-column search"
                    >
                      <Search className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </th>
                  {visible.map((c) => {
                    const sorted = !!c.sort && view.sort === c.sort && !!view.order;
                    return (
                      <th key={c.id} scope="col" className="px-3 py-2.5 whitespace-nowrap" aria-sort={sorted ? (view.order === "asc" ? "ascending" : "descending") : "none"}>
                        <div className="flex items-center gap-1.5">
                          {c.sort ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`${c.label} options`}><Menu className="h-3 w-3" aria-hidden /></button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                <DropdownMenuItem onSelect={() => setSort(c.sort!, "asc")}><ArrowUp className="mr-2 h-3.5 w-3.5" aria-hidden />Sort A to Z</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setSort(c.sort!, "desc")}><ArrowDown className="mr-2 h-3.5 w-3.5" aria-hidden />Sort Z to A</DropdownMenuItem>
                                {sorted ? <DropdownMenuItem onSelect={() => setSort(c.sort!, "")}><X className="mr-2 h-3.5 w-3.5" aria-hidden />Remove sort</DropdownMenuItem> : null}
                                <DropdownMenuSeparator />
                                {c.id !== "branch" ? (
                                  <DropdownMenuItem onSelect={() => setShowSearchRow(true)}><Search className="mr-2 h-3.5 w-3.5" aria-hidden />Search this column</DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem onSelect={() => toggleColumn(c.id)} disabled={c.id === "number"}><X className="mr-2 h-3.5 w-3.5" aria-hidden />Hide column</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                          {c.sort ? (
                            <button type="button" onClick={() => clickSort(c.sort!)} className="inline-flex items-center gap-1 hover:text-foreground">
                              <span>{c.label}</span>
                              {sorted ? (view.order === "asc" ? <ArrowUp className="h-3 w-3 text-primary" aria-hidden /> : <ArrowDown className="h-3 w-3 text-primary" aria-hidden />) : null}
                            </button>
                          ) : <span>{c.label}</span>}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className={cn("divide-y divide-border", loading && rows !== null && "opacity-60")}>
                {showSearchRow ? (
                  <tr className="bg-muted/30">
                    <td />
                    <td className="text-center">
                      <button type="button" onClick={() => { setColDraft(emptyCols()); setQDraft(""); update({ cols: emptyCols(), q: "", status: "", priority: "", department: "" }); }} className="text-[11px] text-primary hover:underline" title="Clear column searches">Clear</button>
                    </td>
                    {visible.map((c) => <td key={c.id} className="p-1">{searchCell(c.id)}</td>)}
                  </tr>
                ) : null}

                {rows === null ? (
                  <tr><td colSpan={visible.length + 2} className="py-12 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />Loading tickets queue…</td></tr>
                ) : error ? (
                  <tr><td colSpan={visible.length + 2} className="py-12 text-center text-red-600 font-medium">{error} <button type="button" className="ml-2 underline text-primary" onClick={load}>Retry</button></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={visible.length + 2} className="py-12 text-center text-muted-foreground">
                    No tickets found in this queue.
                    {crumbs.length ? <> <button type="button" className="text-primary underline ml-1" onClick={clearAll}>Clear filters</button></> : null}
                  </td></tr>
                ) : rows.map((t) => (
                  <tr key={t.id} className={cn("transition-colors hover:bg-muted/40", selected.has(t.id) && "bg-muted/60")}>
                    <td className="px-3 py-2.5 text-center">
                      {canBulk ? (
                        <input
                          type="checkbox"
                          aria-label={`Select ${t.ticketNumber}`}
                          className="rounded border-border text-primary focus:ring-primary"
                          checked={selected.has(t.id)}
                          onChange={() => toggleOne(t.id)}
                        />
                      ) : null}
                    </td>
                    <td className="px-1 py-2.5 text-center">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button" className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label={`Preview ${t.ticketNumber}`} title="Preview record">
                            <Info className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[360px] p-0 shadow-lg">
                          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-2">
                            <span className="font-mono text-xs font-semibold">{t.ticketNumber}</span>
                            <Link href={`/staff/tickets/${t.id}`} className="rounded bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90">Open Ticket</Link>
                          </div>
                          <dl className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-1.5 p-3 text-xs">
                            <dt className="text-right text-muted-foreground">State</dt><dd>{STATUS_LABELS[t.status] || t.status}</dd>
                            <dt className="text-right text-muted-foreground">Priority</dt><dd>{PRIORITY_TEXT[t.priority]}</dd>
                            <dt className="text-right text-muted-foreground">Requester</dt><dd>{t.customerName} ({t.customerPhone})</dd>
                            <dt className="text-right text-muted-foreground">Branch</dt><dd>{t.branch.name}</dd>
                            <dt className="text-right text-muted-foreground">Group</dt><dd>{t.department?.name || "—"}</dd>
                            <dt className="text-right text-muted-foreground">Assigned</dt><dd>{t.assignee?.name || "(empty)"}</dd>
                            <dt className="text-right text-muted-foreground">Description</dt><dd className="line-clamp-3 text-muted-foreground">{t.description}</dd>
                          </dl>
                        </PopoverContent>
                      </Popover>
                    </td>
                    {visible.map((c) => <td key={c.id} className="px-3 py-2.5">{cell(c.id, t)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span>{selected.size} selected</span>
              {selected.size ? (
                <button type="button" className="text-primary hover:underline font-medium" onClick={() => setSelected(new Set())}>Clear selection</button>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => goPage(1)}
                disabled={view.page <= 1}
                aria-label="First page"
                title="First page"
              >
                <ChevronFirst className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => goPage(view.page - 1)}
                disabled={view.page <= 1}
                aria-label="Previous page"
                title="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </button>

              <span className="font-mono text-xs text-foreground px-1 tabular-nums">Page {view.page} of {totalPages}</span>

              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => goPage(view.page + 1)}
                disabled={view.page >= totalPages}
                aria-label="Next page"
                title="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => goPage(totalPages)}
                disabled={view.page >= totalPages}
                aria-label="Last page"
                title="Last page"
              >
                <ChevronLast className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>
        </section>
      </main>

      {canBulk && (
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
      )}
    </div>
  );
}

export default function TicketsPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const loading = <div className="p-6 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />Loading…</div>;
  if (!mounted) return loading;
  return (
    <Suspense fallback={loading}>
      <ListInner />
    </Suspense>
  );
}
