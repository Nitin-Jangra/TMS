// Shared server shell for the staff and admin workspaces: guards the session
// and renders the classic service-desk frame (banner header, application
// navigator with Favorites / History, content area). Modules are filtered by
// role here; the interactive parts live in components/sn/*.

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/types";
import { NAV_MODULES } from "@/components/sn/modules";
import { Workspace } from "@/components/sn/workspace";

export default async function StaffShell({
  children,
}: {
  children: React.ReactNode;
  area?: "staff" | "admin";
}) {
  const user = await getSessionUser();
  if (!user) redirect("/staff-login");

  const modules = NAV_MODULES.filter((m) => m.roles.includes(user.role));

  return (
    <Workspace
      user={{ name: user.name, email: user.email, role: user.role, roleLabel: ROLE_LABELS[user.role] || user.role, branchName: user.branchName ?? null }}
      modules={modules}
    >
      {children}
    </Workspace>
  );
}
