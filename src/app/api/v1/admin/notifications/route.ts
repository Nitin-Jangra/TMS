// Notification outbox / development mailbox viewer.

import { handleErrors, ok } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { paginationParams } from "@/lib/api-response";

export async function GET(request: Request) {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN", "CENTRAL_ADMIN"]);
    const url = new URL(request.url);
    const page = paginationParams(url);
    const status = url.searchParams.get("status") || undefined;

    const where = status ? { status } : {};
    const [notifications, total] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
        include: { ticket: { select: { ticketNumber: true } } },
      }),
      db.notification.count({ where }),
    ]);
    return ok({ notifications, total, page: page.page, pageSize: page.pageSize, totalPages: Math.max(1, Math.ceil(total / page.pageSize)) });
  });
}
