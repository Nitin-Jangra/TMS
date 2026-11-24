// Shared server shell for the staff and admin workspaces: guards the session
// and renders the classic service-desk frame (banner header, application
// navigator with Favorites / History, content area). Modules are filtered by
// role and dynamic designation feature flags here; the interactive parts live in components/sn/*.

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/types";
import { NAV_MODULES } from "@/components/sn/modules";
import { Workspace } from "@/components/sn/workspace";
import { getUserPermissions } from "@/lib/permissions";

export default async function StaffShell({
  children,
}: {
  children: React.ReactNode;
  area?: "staff" | "admin";
}) {
  const user = await getSessionUser();
  if (!user) redirect("/staff-login");

  const permissions = await getUserPermissions(user);

  const modules = NAV_MODULES.filter((m) => {
    // 1. Dynamic permission restrictions
    if (m.id === "employees" && !permissions.viewEmployees && !permissions.manageStaffAvailability) return false;
    if (m.id === "templates" && !permissions.useCannedResponses) return false;
    if (m.id === "reports" && !permissions.viewReports) return false;
    if (m.id === "audit" && !permissions.viewAuditLogs) return false;

    // 2. Dynamic permission allowances (e.g. Senior Support Agent granted Reports or Employees)
    if (m.id === "reports" && permissions.viewReports) return true;
    if (m.id === "employees" && (permissions.viewEmployees || permissions.manageStaffAvailability)) return true;
    if (m.id === "templates" && permissions.useCannedResponses) return true;

    return m.roles.includes(user.role);
  });

  return (
    <Workspace
      user={{ name: user.name, email: user.email, role: user.role, roleLabel: ROLE_LABELS[user.role] || user.role, branchName: user.branchName ?? null }}
      modules={modules}
    >
      {children}
    </Workspace>
  );
}
