// Shared server shell for staff/admin dashboards: guards the session,
// redirects to /login when missing, and renders the navy sidebar layout.

import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSessionUser } from "@/lib/auth";
import { ROLE_LABELS, roleHome } from "@/lib/types";
import { LogoutButton } from "@/components/staff-nav";
import {
  LayoutDashboard, TicketCheck, UsersRound, ArrowLeftRight, ShieldAlert,
  Settings2, ScrollText, Mailbox, KeyRound, Home, BarChart3,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

export const STAFF_NAV: NavItem[] = [
  { href: "/staff", label: "Dashboard", icon: LayoutDashboard, roles: ["SUPPORT_AGENT", "BRANCH_MANAGER", "CENTRAL_AGENT", "CENTRAL_ADMIN", "ROOT_ADMIN"] },
  { href: "/staff/tickets", label: "Tickets", icon: TicketCheck, roles: ["SUPPORT_AGENT", "BRANCH_MANAGER", "CENTRAL_AGENT", "CENTRAL_ADMIN", "ROOT_ADMIN"] },
  { href: "/staff/assignment", label: "Assignment Queue", icon: ArrowLeftRight, roles: ["BRANCH_MANAGER", "CENTRAL_AGENT", "CENTRAL_ADMIN", "ROOT_ADMIN"] },
  { href: "/staff/employees", label: "Employees", icon: UsersRound, roles: ["BRANCH_MANAGER", "CENTRAL_ADMIN", "ROOT_ADMIN"] },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Master Complaint Panel", icon: ShieldAlert, roles: ["ROOT_ADMIN", "CENTRAL_ADMIN"] },
  { href: "/admin/settings", label: "System Settings", icon: Settings2, roles: ["ROOT_ADMIN"] },
  { href: "/admin/audit", label: "Audit Logs", icon: ScrollText, roles: ["ROOT_ADMIN", "CENTRAL_ADMIN"] },
  { href: "/admin/mailbox", label: "Notification Mailbox", icon: Mailbox, roles: ["ROOT_ADMIN", "CENTRAL_ADMIN"] },
  { href: "/admin/api-keys", label: "Integration API Keys", icon: KeyRound, roles: ["ROOT_ADMIN"] },
];

export default async function StaffShell({
  children,
  area,
}: {
  children: React.ReactNode;
  area: "staff" | "admin";
}) {
  const user = await getSessionUser();
  if (!user) redirect("/staff/login");

  const nav = area === "admin" ? ADMIN_NAV : STAFF_NAV;
  const visible = nav.filter((item) => item.roles.includes(user.role));
  const showAdminExtras = area === "staff" && (user.role === "ROOT_ADMIN" || user.role === "CENTRAL_ADMIN");
  const showStaffExtras = area === "admin" && user.role !== "ROOT_ADMIN" && user.role !== "CENTRAL_ADMIN";

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-[#0a2350] md:flex" aria-label="Dashboard navigation">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <Image src="/logo.svg" alt="Msquare logo" width={30} height={30} className="rounded-md" />
          <div>
            <p className="text-sm font-semibold text-white">Msquare CMS</p>
            <p className="text-[11px] text-blue-200">{area === "admin" ? "Administration" : "Operations Workspace"}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 pb-4" role="navigation">
          <Link href="/" className="mb-2 flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-blue-200 hover:bg-white/10 hover:text-white">
            <Home className="h-4 w-4" aria-hidden /> Customer Portal
          </Link>
          {visible.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium text-blue-100 transition hover:bg-[#12306b] hover:text-white"
            >
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          ))}
          {showAdminExtras ? (
            <Link href="/admin" className="mt-2 flex items-center gap-2.5 rounded-md border-t border-white/10 px-3 py-2 pt-4 text-[13px] font-medium text-blue-200 hover:bg-white/10 hover:text-white">
              <ShieldAlert className="h-4 w-4" aria-hidden /> Master Admin Panel
            </Link>
          ) : null}
          {showStaffExtras ? (
            <Link href="/staff" className="mt-2 flex items-center gap-2.5 rounded-md border-t border-white/10 px-3 py-2 pt-4 text-[13px] font-medium text-blue-200 hover:bg-white/10 hover:text-white">
              <LayoutDashboard className="h-4 w-4" aria-hidden /> Support Workspace
            </Link>
          ) : null}
          {user.role === "ROOT_ADMIN" || user.role === "CENTRAL_ADMIN" ? (
            <Link href="/admin/settings" className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-blue-200 hover:bg-white/10 hover:text-white">
              <BarChart3 className="h-4 w-4" aria-hidden /> Reports & Analytics
            </Link>
          ) : null}
        </nav>
        <div className="border-t border-white/10 px-4 py-4">
          <p className="truncate text-[13px] font-medium text-white">{user.name}</p>
          <p className="truncate text-[11px] text-blue-200">
            {ROLE_LABELS[user.role]} {user.branchName ? `· ${user.branchName}` : ""}
          </p>
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex items-center justify-between bg-[#0a2350] px-4 py-3 md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.svg" alt="FitClass logo" width={26} height={26} className="rounded-md" />
            <span className="text-sm font-semibold text-white">FitClass CMS</span>
          </Link>
          <span className="text-[11px] text-blue-200">{ROLE_LABELS[user.role]}</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden" aria-label="Mobile dashboard navigation">
          {visible.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
