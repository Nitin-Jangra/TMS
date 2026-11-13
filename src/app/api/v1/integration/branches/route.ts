// Integration API: active branches (for CRM/LMS branch dropdowns).

import { handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "read");
    const branches = await db.branch.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, city: true, notificationEmail: true },
    });
    return ok({ branches, client: client.name });
  });
}
