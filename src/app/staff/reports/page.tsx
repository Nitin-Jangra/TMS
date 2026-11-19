"use client";

// Reports: KPIs, created-vs-resolved trend and breakdowns by branch,
// department, category and employee for a date range. Branch managers see
// their own branch; central staff can pick any branch.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Star, TriangleAlert } from "lucide-react";

interface Summary {
  created: number;
  resolved: number;
  open: number;
  overdue: number;
  unassigned: number;
  escalated: number;
  slaMetPercent: number | null;
  avgResolutionHours: number | null;
  avgFirstResponseMinutes: number | null;
  reopenRatePercent: number | null;
  rating: number | null;
  ratingCount: number;
}
type Row = Summary & { id: string; name: string; code?: string; branch?: string };
interface Report {
  range: { from: string; to: string };
  scopeLabel: string;
  totals: Summary;
  trend: { day: string; created: number; resolved: number }[];
  byBranch: Row[];
  byCategory: Row[];
  byDepartment: Row[];
  byAgent: Row[];
}

// Validated categorical slots 1-2 (dataviz reference palette, light surface).
const SERIES = { created: "#2a78d6", resolved: "#eb6834" };

const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 5.5 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);
const PRESETS = [
  { label: "7 days", days: 6 },
  { label: "30 days", days: 29 },
  { label: "90 days", days: 89 },
];

const fmtHours = (h: number | null) => (h === null ? "—" : h < 48 ? `${h} h` : `${(h / 24).toFixed(1)} days`);
const fmtMinutes = (m: number | null) => (m === null ? "—" : m < 120 ? `${m} min` : `${(m / 60).toFixed(1)} h`);
const fmtPct = (p: number | null) => (p === null ? "—" : `${p}%`);
const shortDay = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-[#0a2350]">{value}</p>
      {sub ? (
        <p className={cn("mt-0.5 flex items-center gap-1 text-xs", warn ? "text-red-600" : "text-slate-500")}>
          {warn ? <TriangleAlert className="h-3 w-3" aria-hidden /> : null}{sub}
        </p>
      ) : null}
    </div>
  );
}

type SortKey = "name" | "created" | "resolved" | "open" | "overdue" | "slaMetPercent" | "avgResolutionHours" | "reopenRatePercent" | "rating";

function Breakdown({ title, rows, nameLabel, extra }: { title: string; rows: Row[]; nameLabel: string; extra?: (r: Row) => string }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const val = (r: Row) => (sort.key === "name" ? r.name.toLowerCase() : (r[sort.key] as number | null) ?? -Infinity);
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * (sort.dir === "asc" ? 1 : -1);
    });
  }, [rows, sort]);
  const cycle = (key: SortKey) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: key === "name" ? "asc" : "desc" } : s.dir === (key === "name" ? "asc" : "desc") ? { key, dir: key === "name" ? "desc" : "asc" } : null));
  const head = (key: SortKey, label: string, right = true) => {
    const active = sort?.key === key;
    const Icon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={cn("text-xs", right && "text-right")}>
        <button type="button" onClick={() => cycle(key)} className={cn("inline-flex items-center gap-1 font-medium hover:text-slate-900", active ? "text-[#22618b]" : "text-slate-600")}>
          {label}<Icon className={cn("h-3 w-3", active ? "" : "opacity-40")} aria-hidden />
        </button>
      </TableHead>
    );
  };
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-[#0a2350]">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {head("name", nameLabel, false)}
              {head("created", "Created")}
              {head("resolved", "Resolved")}
              {head("open", "Open now")}
              {head("overdue", "Overdue")}
              {head("slaMetPercent", "SLA met")}
              {head("avgResolutionHours", "Avg resolution")}
              {head("reopenRatePercent", "Reopened")}
              {head("rating", "Rating")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs font-medium text-slate-700">
                  {r.name}{extra ? <span className="block text-[11px] font-normal text-slate-400">{extra(r)}</span> : null}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">{r.created}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{r.resolved}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{r.open}</TableCell>
                <TableCell className={cn("text-right text-xs tabular-nums", r.overdue ? "font-semibold text-red-600" : "")}>{r.overdue}</TableCell>
                <TableCell className={cn("text-right text-xs tabular-nums", r.slaMetPercent !== null && r.slaMetPercent < 80 ? "text-red-600" : "")}>{fmtPct(r.slaMetPercent)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{fmtHours(r.avgResolutionHours)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{fmtPct(r.reopenRatePercent)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {r.rating === null ? "—" : <span className={r.rating <= 2.5 ? "font-semibold text-red-600" : ""}>{r.rating.toFixed(1)} <span className="text-slate-400">({r.ratingCount})</span></span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-slate-700">{shortDay(label)}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: SERIES[p.dataKey as keyof typeof SERIES] }} aria-hidden />
          <span className="w-16">{p.dataKey === "created" ? "Created" : "Resolved"}</span>
          <span className="font-semibold tabular-nums text-slate-800">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(istToday());
  const [branchId, setBranchId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [isCentral, setIsCentral] = useState(false);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [showTable, setShowTable] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams({ from, to });
    if (branchId) p.set("branchId", branchId);
    if (departmentId) p.set("departmentId", departmentId);
    return p.toString();
  }, [from, to, branchId, departmentId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/support/reports?${query}`);
      const body = await res.json();
      if (body.success) setReport(body.data);
      else setError(body.error?.message || "Could not load the report.");
    } catch {
      setError("Network error — please try again.");
    }
    setLoading(false);
  }, [query]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- data loading
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/v1/auth/me").then((r) => r.json()).then((d) => setIsCentral(["ROOT_ADMIN", "CENTRAL_ADMIN", "CENTRAL_AGENT"].includes(d.data?.user?.role))).catch(() => undefined);
    fetch("/api/v1/public/branches").then((r) => r.json()).then((d) => setBranches(d.data?.branches ?? [])).catch(() => undefined);
    fetch("/api/v1/support/departments").then((r) => r.json()).then((d) => setDepartments(d.data?.departments ?? [])).catch(() => undefined);
  }, []);

  const exportHref = (() => {
    const p = new URLSearchParams({ from, to, sort: "createdAt", order: "asc" });
    if (isCentral) p.set("scope", "all"); // branch managers export their own branch, like the report
    if (branchId) p.set("branchId", branchId);
    if (departmentId) p.set("departmentId", departmentId);
    return `/api/v1/support/tickets/export?${p.toString()}`;
  })();

  const t = report?.totals;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0a2350]">Reports</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {report ? `${report.scopeLabel} · ${shortDay(report.range.from)} – ${shortDay(report.range.to)}` : "Ticket performance"}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
          <a href={exportHref} download><Download className="h-3.5 w-3.5" aria-hidden /> Export tickets (CSV)</a>
        </Button>
      </div>

      {/* Filters — one row above the charts */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="inline-flex rounded-md border border-slate-200 p-0.5" role="group" aria-label="Date range presets">
          {PRESETS.map((p) => {
            const active = from === daysAgo(p.days) && to === istToday();
            return (
              <button key={p.label} type="button" onClick={() => { setFrom(daysAgo(p.days)); setTo(istToday()); }}
                className={cn("rounded px-2.5 py-1 text-xs", active ? "bg-[#22618b] text-white" : "text-slate-600 hover:bg-slate-100")}>
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Input type="date" className="h-8 w-[140px] px-2 text-xs" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From date" />
          <span>to</span>
          <Input type="date" className="h-8 w-[140px] px-2 text-xs" value={to} min={from} max={istToday()} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To date" />
        </div>
        {isCentral ? (
          <Select value={branchId || "all"} onValueChange={(v) => setBranchId(v === "all" ? "" : v)}>
            <SelectTrigger size="sm" className="h-8 w-[180px] text-xs" aria-label="Branch"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : null}
        <Select value={departmentId || "all"} onValueChange={(v) => setDepartmentId(v === "all" ? "" : v)}>
          <SelectTrigger size="sm" className="h-8 w-[190px] text-xs" aria-label="Department"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            <SelectItem value="none">No department</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <Card><CardContent className="p-6 text-sm text-red-600">{error} <Button variant="link" size="sm" onClick={load}>Retry</Button></CardContent></Card>
      ) : !report || !t ? (
        <Skeleton className="h-96" />
      ) : (
        <div className={cn("space-y-4", loading && "opacity-60 transition-opacity")}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Created" value={String(t.created)} sub={`${t.escalated} escalated`} />
            <Tile label="Resolved" value={String(t.resolved)} sub={`Reopened: ${fmtPct(t.reopenRatePercent)}`} />
            <Tile label="Open now" value={String(t.open)} sub={`${t.overdue} overdue · ${t.unassigned} unassigned`} warn={t.overdue > 0} />
            <Tile label="SLA met" value={fmtPct(t.slaMetPercent)} sub="of tickets resolved in range" warn={t.slaMetPercent !== null && t.slaMetPercent < 80} />
            <Tile label="Avg resolution" value={fmtHours(t.avgResolutionHours)} sub="creation → resolved" />
            <Tile label="Avg first response" value={fmtMinutes(t.avgFirstResponseMinutes)} sub="creation → first action" />
            <Tile label="Member rating" value={t.rating === null ? "—" : `${t.rating.toFixed(1)} / 5`} sub={`${t.ratingCount} rating${t.ratingCount === 1 ? "" : "s"}`} warn={t.rating !== null && t.rating <= 2.5} />
            <Tile label="Resolved vs created" value={t.created ? `${Math.round((t.resolved / t.created) * 100)}%` : "—"} sub={t.resolved >= t.created ? "backlog shrinking" : "backlog growing"} warn={t.resolved < t.created} />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold text-[#0a2350]">Tickets created vs resolved per day</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowTable((v) => !v)}>{showTable ? "Show chart" : "Show as table"}</Button>
            </CardHeader>
            <CardContent>
              {showTable ? (
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-xs">Day</TableHead><TableHead className="text-right text-xs">Created</TableHead><TableHead className="text-right text-xs">Resolved</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {report.trend.map((d) => (
                        <TableRow key={d.day}><TableCell className="text-xs">{shortDay(d.day)}</TableCell><TableCell className="text-right text-xs tabular-nums">{d.created}</TableCell><TableCell className="text-right text-xs tabular-nums">{d.resolved}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="h-72" role="img" aria-label={`Bar chart of tickets created and resolved per day. ${t.created} created and ${t.resolved} resolved in total.`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.trend} margin={{ top: 8, right: 16, bottom: 0, left: -12 }} barGap={2} barCategoryGap="20%">
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="0" vertical={false} />
                      <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} minTickGap={24} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={40} />
                      <Tooltip content={<TrendTooltip />} cursor={{ fill: "#f1f5f9" }} />
                      <Legend verticalAlign="top" align="right" height={28} iconType="square"
                        formatter={(v: string) => <span className="text-xs text-slate-600">{v === "created" ? "Created" : "Resolved"}</span>} />
                      <Bar dataKey="created" fill={SERIES.created} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
                      <Bar dataKey="resolved" fill={SERIES.resolved} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {report.byBranch.length ? <Breakdown title="By branch" rows={report.byBranch} nameLabel="Branch" extra={(r) => r.code || ""} /> : null}
          <Breakdown title="By department" rows={report.byDepartment} nameLabel="Department" />
          <Breakdown title="By employee" rows={report.byAgent} nameLabel="Employee" extra={(r) => r.branch || ""} />
          <Breakdown title="By category" rows={report.byCategory} nameLabel="Category" />

          <p className="flex items-center gap-1 text-xs text-slate-400">
            <Star className="h-3 w-3" aria-hidden />
            Created / resolved / rating count activity inside the date range; “Open now”, “Overdue” and “Unassigned” are live numbers. SLA met = resolved before the resolution deadline.
          </p>
        </div>
      )}
    </div>
  );
}
