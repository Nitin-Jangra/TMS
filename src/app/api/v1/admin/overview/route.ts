// Master Admin complaint panel: branch-wise complaint matrix, status
// distribution, assignment overview (who is assigned to whom), SLA averages.

import { handleErrors, ok } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { getMasterOverview } from "@/lib/branch-stats";
import { runClosureSweep, runAssignmentRetrySweep } from "@/lib/closure";

export async function GET() {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN", "CENTRAL_ADMIN"]);
    // Keep workers ticking even between interval runs (idempotent).
    await runClosureSweep().catch(() => undefined);
    await runAssignmentRetrySweep().catch(() => undefined);
    const overview = await getMasterOverview();
    return ok(overview);
  });
}
