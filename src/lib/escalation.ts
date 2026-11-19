// SLA escalation ladder + daily manager digest (both run from the background
// sweep, see src/lib/sweeps.ts).
//
// Ladder (per open ticket, based on how much of its resolution time is used):
//   level 1  ≥ escalation_warn_percent (default 75%)  → reminder to the assignee
//   level 2  ≥ 100% (deadline missed)                 → branch manager + assignee,
//                                                        ticket marked escalated
//   level 3  ≥ escalation_critical_percent (150%)     → central support + department mailbox
// Each level fires once (Ticket.slaAlertLevel). On-hold tickets are skipped
// (waiting for the member), as are resolved/closed ones.
//
// Digest: once a day after digest_hour (India time) every branch manager gets
// their branch summary and central support gets the all-branch summary.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { queueNotification } from "@/lib/notifications";
import { getSettings } from "@/lib/settings";
import { emitWebhook } from "@/lib/webhooks";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/types";

const IST_OFFSET_MS = 5.5 * 3600_000;
const istString = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function humanize(ms: number): string {
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60000);
  const text = mins < 60 ? `${mins} min` : mins < 48 * 60 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} days`;
  return ms >= 0 ? `in ${text}` : `${text} ago`;
}

export async function runEscalationSweep(now = new Date()): Promise<{ checked: number; warned: number; breached: number; critical: number }> {
  const result = { checked: 0, warned: 0, breached: 0, critical: 0 };
  const settings = await getSettings();
  if (settings.escalation_enabled === "false") return result;
  const warnPct = Math.min(99, Math.max(10, Number(settings.escalation_warn_percent) || 75));
  const critPct = Math.max(101, Number(settings.escalation_critical_percent) || 150);

  const tickets = await db.ticket.findMany({
    where: {
      status: { in: ["NEW_COMPLAINT", "IN_PROGRESS"] },
      slaResolutionDueAt: { not: null },
      slaAlertLevel: { lt: 3 },
    },
    include: {
      branch: true,
      category: true,
      department: true,
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: { slaResolutionDueAt: "asc" },
    take: 300,
  });

  const managerCache = new Map<string, string>();
  const managerEmail = async (branchId: string) => {
    if (!managerCache.has(branchId)) {
      const m = await db.staffUser.findFirst({ where: { branchId, role: "BRANCH_MANAGER", isActive: true }, select: { email: true } });
      managerCache.set(branchId, m?.email || "");
    }
    return managerCache.get(branchId) || "";
  };

  for (const t of tickets) {
    result.checked += 1;
    const due = t.slaResolutionDueAt!.getTime();
    const total = Math.max(60_000, due - t.createdAt.getTime());
    const usedPct = ((now.getTime() - t.createdAt.getTime()) / total) * 100;
    const level = usedPct >= critPct ? 3 : usedPct >= 100 ? 2 : usedPct >= warnPct ? 1 : 0;
    if (level <= t.slaAlertLevel) continue;

    // Claim the level atomically so overlapping sweeps never double-send.
    const claimed = await db.ticket.updateMany({
      where: { id: t.id, slaAlertLevel: t.slaAlertLevel },
      data: { slaAlertLevel: level, ...(level >= 2 && !t.escalatedAt ? { escalatedAt: now } : {}) },
    });
    if (claimed.count === 0) continue;

    const v: Record<string, string> = {
      ticketNumber: t.ticketNumber,
      customerName: t.customerName,
      customerPhone: t.customerPhone,
      customerEmail: t.customerEmail,
      description: t.description.slice(0, 500),
      priority: t.priority,
      status: t.status,
      branchName: t.branch.name,
      categoryName: t.category.name,
      departmentName: t.department?.name || "",
      departmentEmail: t.department?.email || "",
      assigneeName: t.assignee?.name || "",
      assigneeEmail: t.assignee?.email || "",
      branchManagerEmail: await managerEmail(t.branchId),
      percentUsed: String(Math.round(usedPct)),
      dueAt: istString(t.slaResolutionDueAt!),
      dueIn: humanize(due - now.getTime()),
    };
    const base = { ticketId: t.id, ticketNumber: t.ticketNumber, variables: v };

    if (level === 1) {
      result.warned += 1;
      await queueNotification({ ...base, event: "SLA_WARNING", recipientKind: t.assignee ? "ASSIGNEE" : "BRANCH_MANAGER" });
      await logAudit({ ticketId: t.id, action: "SLA_WARNING", newValue: `${Math.round(usedPct)}%`, details: `Due ${v.dueIn}` });
      await emitWebhook("ticket.sla_warning", t.id, { percentUsed: Math.round(usedPct) });
    } else if (level === 2) {
      result.breached += 1;
      await queueNotification({ ...base, event: "SLA_BREACHED", recipientKind: "BRANCH_MANAGER" });
      if (t.assignee) await queueNotification({ ...base, event: "SLA_BREACHED", recipientKind: "ASSIGNEE" });
      await logAudit({ ticketId: t.id, action: "SLA_BREACHED", newValue: `${Math.round(usedPct)}%`, details: `Deadline ${v.dueAt} missed — escalated to branch manager` });
      await emitWebhook("ticket.sla_breached", t.id, { percentUsed: Math.round(usedPct), level: 2 });
    } else {
      result.critical += 1;
      await queueNotification({ ...base, event: "SLA_CRITICAL", recipientKind: "CENTRAL_SUPPORT" });
      if (v.departmentEmail) await queueNotification({ ...base, event: "SLA_CRITICAL", recipientKind: "DEPARTMENT" });
      if (t.slaAlertLevel < 2) await queueNotification({ ...base, event: "SLA_BREACHED", recipientKind: "BRANCH_MANAGER" });
      await logAudit({ ticketId: t.id, action: "SLA_CRITICAL", newValue: `${Math.round(usedPct)}%`, details: "Escalated to central support" });
      await emitWebhook("ticket.sla_breached", t.id, { percentUsed: Math.round(usedPct), level: 3 });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Daily digest
// ---------------------------------------------------------------------------

const OPEN = ["NEW_COMPLAINT", "IN_PROGRESS", "ON_HOLD"];

interface BranchStats {
  branchId: string;
  branchName: string;
  open: number;
  unassigned: number;
  overdue: number;
  escalated: number;
  createdToday: number;
  resolvedToday: number;
  overdueList: { ticketNumber: string; customerName: string; assignee: string; priority: string; status: string; due: Date }[];
  ratings: number[];
}

export async function runDigestSweep(now = new Date(), opts: { force?: boolean } = {}): Promise<{ sent: number; skipped?: string; date?: string }> {
  const settings = await getSettings();
  if (settings.digest_enabled === "false" && !opts.force) return { sent: 0, skipped: "Digest disabled" };
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const today = ist.toISOString().slice(0, 10);
  const hour = Math.min(23, Math.max(0, Number(settings.digest_hour) || 9));
  if (!opts.force) {
    if (ist.getUTCHours() < hour) return { sent: 0, skipped: `Before ${hour}:00 IST` };
    if (settings.digest_last_sent === today) return { sent: 0, skipped: "Already sent today", date: today };
  }
  // Mark first so overlapping sweeps do not send twice.
  await db.systemSetting.upsert({
    where: { key: "digest_last_sent" },
    create: { key: "digest_last_sent", value: today },
    update: { value: today },
  });

  const since = new Date(now.getTime() - 24 * 3600_000);
  const [branches, open, createdToday, resolvedToday, ratings] = await Promise.all([
    db.branch.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    db.ticket.findMany({
      where: { status: { in: OPEN } },
      select: {
        ticketNumber: true, customerName: true, branchId: true, assignedToId: true, priority: true, status: true,
        slaResolutionDueAt: true, escalatedAt: true, assignee: { select: { name: true } },
      },
    }),
    db.ticket.groupBy({ by: ["branchId"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.ticket.groupBy({ by: ["branchId"], where: { resolvedAt: { gte: since } }, _count: { _all: true } }),
    db.ticketFeedback.findMany({ where: { createdAt: { gte: since } }, select: { rating: true, ticket: { select: { branchId: true } } } }),
  ]);

  const stats = new Map<string, BranchStats>();
  for (const b of branches) {
    stats.set(b.id, { branchId: b.id, branchName: b.name, open: 0, unassigned: 0, overdue: 0, escalated: 0, createdToday: 0, resolvedToday: 0, overdueList: [], ratings: [] });
  }
  for (const t of open) {
    const s = stats.get(t.branchId);
    if (!s) continue;
    s.open += 1;
    if (!t.assignedToId) s.unassigned += 1;
    if (t.escalatedAt) s.escalated += 1;
    if (t.slaResolutionDueAt && t.slaResolutionDueAt < now && t.status !== "ON_HOLD") {
      s.overdue += 1;
      s.overdueList.push({ ticketNumber: t.ticketNumber, customerName: t.customerName, assignee: t.assignee?.name || "Unassigned", priority: t.priority, status: t.status, due: t.slaResolutionDueAt });
    }
  }
  for (const r of createdToday) { const s = stats.get(r.branchId); if (s) s.createdToday = r._count._all; }
  for (const r of resolvedToday) { const s = stats.get(r.branchId); if (s) s.resolvedToday = r._count._all; }
  for (const r of ratings) { const s = stats.get(r.ticket.branchId); if (s) s.ratings.push(r.rating); }

  const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "—");
  const dateLabel = now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const branchBody = (s: BranchStats) => {
    const list = s.overdueList
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, 10)
      .map((o) => `  • ${o.ticketNumber} — ${o.customerName} — ${o.assignee} — ${PRIORITY_LABELS[o.priority] || o.priority} — ${STATUS_LABELS[o.status] || o.status} — due ${istString(o.due)}`)
      .join("\n");
    return `Open tickets:        ${s.open}
  Unassigned:        ${s.unassigned}
  Overdue:           ${s.overdue}
  Escalated:         ${s.escalated}
New (last 24 h):     ${s.createdToday}
Resolved (last 24 h): ${s.resolvedToday}
Member rating (24 h): ${avg(s.ratings)}${s.ratings.length ? ` from ${s.ratings.length} rating(s)` : ""}
${list ? `\nOverdue — oldest first:\n${list}\n` : ""}`;
  };

  let sent = 0;
  // Branch managers: only branches with something to report.
  const managers = await db.staffUser.findMany({
    where: { role: "BRANCH_MANAGER", isActive: true, branchId: { not: null } },
    select: { name: true, email: true, branchId: true },
  });
  for (const m of managers) {
    const s = stats.get(m.branchId!);
    if (!s || (s.open === 0 && s.createdToday === 0 && s.resolvedToday === 0)) continue;
    await queueNotification({
      event: "DAILY_DIGEST",
      recipientKind: "BRANCH_MANAGER",
      recipientEmail: m.email,
      subject: `FitClass ${s.branchName} — daily ticket summary (${s.overdue} overdue, ${s.unassigned} unassigned)`,
      body: `Good morning ${m.name},

Here is the ticket summary for FitClass ${s.branchName} — ${dateLabel}.

${branchBody(s)}
Open the operations dashboard to act on these tickets.

— FitClass CMS`,
    });
    sent += 1;
  }

  // Central support: all branches.
  const all = [...stats.values()];
  const totals = all.reduce(
    (acc, s) => ({
      open: acc.open + s.open, unassigned: acc.unassigned + s.unassigned, overdue: acc.overdue + s.overdue,
      escalated: acc.escalated + s.escalated, created: acc.created + s.createdToday, resolved: acc.resolved + s.resolvedToday,
    }),
    { open: 0, unassigned: 0, overdue: 0, escalated: 0, created: 0, resolved: 0 },
  );
  const active = all.filter((s) => s.open || s.createdToday || s.resolvedToday).sort((a, b) => b.overdue - a.overdue || b.open - a.open);
  const table = active
    .map((s) => `  ${s.branchName.padEnd(22)} open ${String(s.open).padStart(3)} · overdue ${String(s.overdue).padStart(3)} · unassigned ${String(s.unassigned).padStart(3)} · new ${String(s.createdToday).padStart(3)} · resolved ${String(s.resolvedToday).padStart(3)} · rating ${avg(s.ratings)}`)
    .join("\n");
  await queueNotification({
    event: "DAILY_DIGEST",
    recipientKind: "CENTRAL_SUPPORT",
    subject: `FitClass daily ticket summary — ${totals.overdue} overdue across ${active.length} branch(es)`,
    body: `FitClass — all branches — ${dateLabel}

Open tickets:          ${totals.open}
  Unassigned:          ${totals.unassigned}
  Overdue:             ${totals.overdue}
  Escalated:           ${totals.escalated}
New (last 24 h):       ${totals.created}
Resolved (last 24 h):  ${totals.resolved}
Member rating (24 h):  ${avg(all.flatMap((s) => s.ratings))}

By branch (most overdue first):
${table || "  No activity."}

— FitClass CMS`,
  });
  sent += 1;
  return { sent, date: today };
}
