// Integration API: active complaint categories.

import { handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "read");
    const categories = await db.complaintCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    });
    return ok({ categories, client: client.name });
  });
}
