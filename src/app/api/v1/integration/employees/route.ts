// Integration API: support employees + round-robin cursor state
// (lets the CRM sync "which lead is assigned to whom").

import { handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "read");
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId") || undefined;

    const employees = await db.staffUser.findMany({
      where: { role: "SUPPORT_AGENT", ...(branchId ? { branchId } : {}) },
      orderBy: [{ branchId: "asc" }, { createdAt: "asc" }],
      select: {
        id: true, name: true, email: true, branchId: true, isActive: true, availabilityEnabled: true, crmExternalId: true,
        branch: { select: { code: true, name: true } },
      },
    });
    const cursors = await db.branchCursor.findMany({
      include: { branch: { select: { code: true, name: true } } },
    });
    return ok({ employees, cursors, client: client.name });
  });
}
