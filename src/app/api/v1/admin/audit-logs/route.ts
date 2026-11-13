// Audit log viewer (Root Admin + Central Support Admin). Read-only — no
// application API can create, edit or delete audit rows.

import { handleErrors, ok } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { paginationParams } from "@/lib/api-response";

export async function GET(request: Request) {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN", "CENTRAL_ADMIN"]);
    const url = new URL(request.url);
    const page = paginationParams(url);
    const action = url.searchParams.get("action") || undefined;
    const q = url.searchParams.get("q") || undefined;

    const where: Record<string, unknown> = {
      ...(action ? { action } : {}),
      ...(q ? { OR: [{ ticketNumberContains: undefined }, {}] } : {}),
    };
    if (q) {
      delete where.OR;
      const tickets = await db.ticket.findMany({
        where: { ticketNumber: { contains: q.toUpperCase() } },
        select: { id: true },
      });
      where.OR = [
        { actorName: { contains: q } },
        { ticketId: { in: tickets.map((t) => t.id) } },
        { details: { contains: q } },
      ];
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
        include: { ticket: { select: { ticketNumber: true } } },
      }),
      db.auditLog.count({ where }),
    ]);
    return ok({ logs, total, page: page.page, pageSize: page.pageSize, totalPages: Math.max(1, Math.ceil(total / page.pageSize)) });
  });
}
