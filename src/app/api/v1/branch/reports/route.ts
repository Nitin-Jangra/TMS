// Branch reports: category breakdown, employee performance, SLA breaches.

import { handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBranchSummary } from "@/lib/branch-stats";

export async function GET() {
  return handleErrors(async () => {
    const user = await requireUser();
    const tickets = await db.ticket.findMany({
      where: { branchId: user.branchId },
      select: {
        id: true,
        status: true,
        categoryId: true,
        assignedToId: true,
        createdAt: true,
        resolvedAt: true,
        slaResolutionDueAt: true,
        escalatedAt: true,
        category: { select: { name: true } },
        assignee: { select: { name: true } },
        slaTracking: { select: { firstResponseBreached: true, resolutionBreached: true } },
      },
    });

    const byCategory = new Map<string, number>();
    const byEmployee = new Map<string, { name: string; open: number; resolved: number }>();
    let breaches = 0;
    let escalated = 0;
    for (const t of tickets) {
      byCategory.set(t.category.name, (byCategory.get(t.category.name) || 0) + 1);
      if (t.slaTracking?.resolutionBreached) breaches += 1;
      if (t.escalatedAt) escalated += 1;
      if (t.assignee) {
        const entry = byEmployee.get(t.assignee.id) || { name: t.assignee.name, open: 0, resolved: 0 };
        if (t.status === "RESOLVED" || t.status === "CLOSED") entry.resolved += 1;
        else entry.open += 1;
        byEmployee.set(t.assignee.id, entry);
      }
    }

    const summary = await getBranchSummary(user);
    return ok({
      summary,
      total: tickets.length,
      byCategory: Array.from(byCategory, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      byEmployee: Array.from(byEmployee, ([id, v]) => ({ id, ...v })).sort((a, b) => b.resolved - a.resolved),
      slaBreaches: breaches,
      escalatedTickets: escalated,
    });
  });
}
