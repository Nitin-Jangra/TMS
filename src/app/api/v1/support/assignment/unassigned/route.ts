// Unassigned queue: open tickets awaiting assignment.

import { handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { roleScope } from "@/lib/ticket-query";
import { getUserPermissions } from "@/lib/permissions";
import { getAccessPolicy } from "@/lib/tickets";

export async function GET() {
  return handleErrors(async () => {
    const user = await requireUser();
    const [permissions, policy] = await Promise.all([getUserPermissions(user), getAccessPolicy()]);
    const scope = roleScope(user, { permissions, policy });
    const tickets = await db.ticket.findMany({
      where: { ...scope, assignedToId: null, status: { in: ["IN_PROGRESS", "NEW_COMPLAINT"] } },
      include: { branch: { select: { id: true, name: true } }, category: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    const normalized = tickets.map((t) => ({
      ...t,
      status: t.status === "NEW_COMPLAINT" ? "IN_PROGRESS" : t.status,
    }));
    return ok({ tickets: normalized, count: normalized.length });
  });
}
