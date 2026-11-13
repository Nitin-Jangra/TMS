// Unassigned queue: NEW_COMPLAINT tickets awaiting assignment.

import { handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { roleScope } from "@/lib/ticket-query";

export async function GET() {
  return handleErrors(async () => {
    const user = await requireUser();
    const scope = roleScope(user);
    const tickets = await db.ticket.findMany({
      where: { ...scope, assignedToId: null, status: "NEW_COMPLAINT" },
      include: { branch: { select: { name: true } }, category: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return ok({ tickets, count: tickets.length });
  });
}
