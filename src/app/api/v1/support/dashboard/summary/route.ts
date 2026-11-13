// Role-aware dashboard summary (support employee, branch manager, central).

import { handleErrors, ok, fail } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { getCentralSummary, getEmployeeSummary, getBranchSummary } from "@/lib/branch-stats";
import { isCentralRole } from "@/lib/types";

export async function GET() {
  return handleErrors(async () => {
    const user = await requireUser();
    if (user.role === "SUPPORT_AGENT") {
      const summary = await getEmployeeSummary(user.id);
      return ok({ scope: "EMPLOYEE", user, ...summary });
    }
    if (user.role === "BRANCH_MANAGER") {
      const summary = await getBranchSummary(user);
      return ok({ scope: "BRANCH", user, ...summary });
    }
    if (isCentralRole(user.role)) {
      const summary = await getCentralSummary();
      return ok({ scope: "CENTRAL", user, ...summary });
    }
    return fail("FORBIDDEN", "Unsupported role for this dashboard.", 403);
  });
}
