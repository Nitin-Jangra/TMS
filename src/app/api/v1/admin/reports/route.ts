// Admin reports: totals, category mix, daily trend, SLA breaches.

import { handleErrors, ok } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMasterOverview } from "@/lib/branch-stats";

export async function GET() {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN", "CENTRAL_ADMIN"]);
    const overview = await getMasterOverview();
    const tickets = await db.ticket.findMany({
      select: { createdAt: true, status: true, priority: true, categoryId: true, slaTracking: { select: { resolutionBreached: true, firstResponseBreached: true } } },
    });
    const categoryRows = await db.complaintCategory.findMany({ orderBy: { sortOrder: "asc" } });

    const byCategory = new Map(categoryRows.map((c) => [c.name, 0]));
    const byDay = new Map<string, number>();
    const byPriority = new Map<string, number>();
    let firstResponseBreaches = 0;
    let resolutionBreaches = 0;

    for (const t of tickets) {
      const day = t.createdAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
      byPriority.set(t.priority, (byPriority.get(t.priority) || 0) + 1);
      if (t.slaTracking?.resolutionBreached) resolutionBreaches += 1;
      if (t.slaTracking?.firstResponseBreached) firstResponseBreaches += 1;
    }
    const catTickets = await db.ticket.findMany({ select: { categoryId: true } });
    const catName = new Map(categoryRows.map((c) => [c.id, c.name]));
    for (const t of catTickets) {
      const name = catName.get(t.categoryId) || "Other";
      byCategory.set(name, (byCategory.get(name) || 0) + 1);
    }

    return ok({
      totals: overview.totals,
      byCategory: Array.from(byCategory, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      byDay: Array.from(byDay, ([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day)).slice(-30),
      byPriority: Array.from(byPriority, ([priority, count]) => ({ priority, count })),
      slaBreaches: { firstResponse: firstResponseBreaches, resolution: resolutionBreaches },
      avgFirstResponseMinutes: overview.avgFirstResponseMinutes,
      avgResolutionHours: overview.avgResolutionHours,
    });
  });
}
