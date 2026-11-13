// Integration API: list tickets with filters (CRM/LMS consumption).
// Auth: x-api-key header with scope "read".

import { fail, handleErrors, ok, paginationParams } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { listTickets, parseFilters } from "@/lib/ticket-query";

export async function GET(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "read");
    const url = new URL(request.url);
    const filters = parseFilters(url.searchParams);
    const page = paginationParams(url);
    const { rows, total } = await listTickets(filters, {}, page);
    return ok({ tickets: rows, total, page: page.page, pageSize: page.pageSize, totalPages: Math.max(1, Math.ceil(total / page.pageSize)), client: client.name });
  });
}
