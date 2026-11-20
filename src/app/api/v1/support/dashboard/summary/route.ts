// Role & Designation-aware dashboard summary.
// Prioritizes individual user account details:
// - Shows tickets assigned directly to the logged-in user account.
// - Provides branch / central overview when permitted by role/permissions.

import { handleErrors, ok, fail } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { getCentralSummary, getEmployeeSummary, getBranchSummary } from "@/lib/branch-stats";
import { getUserPermissions } from "@/lib/permissions";
import { isCentralRole } from "@/lib/types";

export async function GET() {
  return handleErrors(async () => {
    const user = await requireUser();
    const permissions = await getUserPermissions(user);

    if (user.role === "SUPPORT_AGENT") {
      const summary = await getEmployeeSummary(user, permissions);
      return ok({ scope: "EMPLOYEE", user, permissions, ...summary });
    }
    if (user.role === "BRANCH_MANAGER") {
      const summary = await getBranchSummary(user, permissions);
      return ok({ scope: "BRANCH", user, permissions, ...summary });
    }
    if (isCentralRole(user.role)) {
      const summary = await getCentralSummary(user);
      return ok({ scope: "CENTRAL", user, permissions, ...summary });
    }
    return fail("FORBIDDEN", "Unsupported role for this dashboard.", 403);
  });
}
