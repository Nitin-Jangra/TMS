// Branch ticket list (manager view, branch-scoped).

import { handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { listTickets, parseFilters } from "@/lib/ticket-query";
import { paginationParams } from "@/lib/api-response";

export async function GET(request: Request) {
  return handleErrors(async () => {
    const user = await requireUser();
    const url = new URL(request.url);
    const filters = { ...parseFilters(url.searchParams), branchId: user.branchId || undefined };
    const page = paginationParams(url);
    const { rows, total } = await listTickets(filters, {}, page);
    return ok({ tickets: rows, total, page: page.page, pageSize: page.pageSize, totalPages: Math.max(1, Math.ceil(total / page.pageSize)) });
  });
}
