// Manual worker trigger (Root Admin): run the closure sweep + assignment
// retry immediately. Useful for testing automatic closure with a short window.

import { handleErrors, ok } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { runClosureSweep, runAssignmentRetrySweep } from "@/lib/closure";

export async function POST() {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN"]);
    const closure = await runClosureSweep();
    const assignment = await runAssignmentRetrySweep();
    return ok({ closure, assignment });
  });
}
