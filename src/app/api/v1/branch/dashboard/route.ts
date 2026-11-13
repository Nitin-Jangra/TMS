// Branch manager dashboard (scoped to the manager's own branch).

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { getBranchSummary } from "@/lib/branch-stats";
import { runAssignmentRetrySweep } from "@/lib/closure";

export async function GET() {
  return handleErrors(async () => {
    const user = await requireUser();
    if (user.role !== "BRANCH_MANAGER") return fail("FORBIDDEN", "Branch manager access only.", 403);
    // Opportunistic retry keeps the unassigned queue moving.
    await runAssignmentRetrySweep().catch(() => undefined);
    const summary = await getBranchSummary(user);
    return ok({ scope: "BRANCH", user, ...summary });
  });
}
