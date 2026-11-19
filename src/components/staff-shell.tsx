// ServiceNow Next Experience (Polaris) Unified Shell for Staff & Admin Workspaces.
// Provides global Polaris top navigation bar, contextual search, ITIL presence indicator,
// and dense enterprise sidebar navigation.

import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSessionUser } from "@/lib/auth";
import { ROLE_LABELS, roleHome } from "@/lib/types";
import { LogoutButton } from "@/components/staff-nav";
import {
  LayoutDashboard, TicketCheck, UsersRound, ArrowLeftRight, ShieldAlert,
  Settings2, ScrollText, Mailbox, KeyRound, BarChart3, FileText,
  Search, Bell, HelpCircle, User, CheckCircle2, ChevronDown, Layers,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

export const STAFF_NAV: NavItem[] = [
  { href: "/staff", label: "Operations Dashboard", icon: LayoutDashboard, roles: ["SUPPORT_AGENT", "BRANCH_MANAGER", "CENTRAL_AGENT", "CENTRAL_ADMIN", "ROOT_ADMIN"] },
  { href: "/staff/tickets", label: "Incidents & Tickets", icon: TicketCheck, roles: ["SUPPORT_AGENT", "BRANCH_MANAGER", "CENTRAL_AGENT", "CENTRAL_ADMIN", "ROOT_ADMIN"] },
  { href: "/staff/assignment", label: "Assignment Queue", icon: ArrowLeftRight, roles: ["BRANCH_MANAGER", "CENTRAL_AGENT", "CENTRAL_ADMIN", "ROOT_ADMIN"] },
  { href: "/staff/employees", label: "Support Personnel", icon: UsersRound, roles: ["BRANCH_MANAGER", "CENTRAL_ADMIN", "ROOT_ADMIN"] },
  { href: "/staff/reports", label: "SLA & Analytics", icon: BarChart3, roles: ["BRANCH_MANAGER", "CENTRAL_AGENT", "CENTRAL_ADMIN", "ROOT_ADMIN"] },
  { href: "/staff/templates", label: "Standard Responses", icon: FileText, roles: ["SUPPORT_AGENT", "BRANCH_MANAGER", "CENTRAL_AGENT", "CENTRAL_ADMIN", "ROOT_ADMIN"] },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Master ITSM Console", icon: ShieldAlert, roles: ["ROOT_ADMIN", "CENTRAL_ADMIN"] },
  { href: "/admin/settings", label: "System Configuration", icon: Settings2, roles: ["ROOT_ADMIN"] },
  { href: "/admin/audit", label: "Audit & Transaction Logs", icon: ScrollText, roles: ["ROOT_ADMIN", "CENTRAL_ADMIN"] },
  { href: "/admin/mailbox", label: "Outbox & Notifications", icon: Mailbox, roles: ["ROOT_ADMIN", "CENTRAL_ADMIN"] },
  { href: "/admin/api-keys", label: "Integration Credentials", icon: KeyRound, roles: ["ROOT_ADMIN"] },
];

export default async function StaffShell({
  children,
  area,
}: {
  children: React.ReactNode;
  area: "staff" | "admin";
}) {
  const user = await getSessionUser();
  if (!user) redirect("/staff-login");

  const nav = area === "admin" ? ADMIN_NAV : STAFF_NAV;
  const visible = nav.filter((item) => item.roles.includes(user.role));
  const showAdminExtras = area === "staff" && (user.role === "ROOT_ADMIN" || user.role === "CENTRAL_ADMIN");
  const showStaffExtras = area === "admin" && user.role !== "ROOT_ADMIN" && user.role !== "CENTRAL_ADMIN";

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6f8] text-[#161f28]">
      {/* 1. ServiceNow Polaris Global Top Bar */}
      <header className="sticky top-0 z-50 flex h-13 w-full shrink-0 items-center justify-between border-b border-[#2a374a] bg-[#161f28] px-4 text-white shadow-sm select-none">
        {/* Left: App Navigator + FitClass Logo + Workspace Indicator */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-sm text-slate-300 transition hover:bg-[#223040] hover:text-white"
            title="ServiceNow App Navigator"
            aria-label="App Navigator"
          >
            <Layers className="h-4 w-4" />
          </button>

          <Link href={roleHome(user.role)} className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="FitClass Logo"
              width={26}
              height={26}
              className="rounded-sm object-contain"
              priority
            />
            <span className="text-sm font-bold tracking-tight text-white">FITCLASS</span>
          </Link>

          <span className="hidden h-4 w-[1px] bg-slate-700 sm:block" />

          <div className="hidden items-center gap-2 sm:flex">
            <span className="rounded bg-[#1f70c1]/20 px-2 py-0.5 text-[11px] font-semibold text-[#60a5fa] border border-[#1f70c1]/40">
              {area === "admin" ? "Master Admin Console" : "Agent Workspace"}
            </span>
            <span className="rounded bg-[#223040] px-2 py-0.5 text-[11px] font-medium text-slate-300 border border-slate-700">
              {user.branchName ? `📍 ${user.branchName}` : "🌐 Central Enterprise Queue"}
            </span>
          </div>
        </div>

        {/* Center: Global Contextual Search Bar */}
        <div className="hidden max-w-md flex-1 px-4 md:block">
          <form action="/staff/tickets" method="GET" className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              name="q"
              placeholder="Search incidents, members, phone (Ctrl + /)..."
              className="h-8 w-full rounded-full border border-slate-700 bg-[#0f161e] pl-9 pr-4 text-xs text-slate-200 placeholder-slate-400 transition focus:border-[#1f70c1] focus:bg-[#161f28] focus:outline-none focus:ring-1 focus:ring-[#1f70c1]"
            />
          </form>
        </div>

        {/* Right: Presence Status, Notification Bell, User Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Agent Availability Indicator */}
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-900/50 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-semibold text-[#30c497]">
            <span className="h-2 w-2 rounded-full bg-[#30c497] animate-pulse" />
            <span className="hidden sm:inline">Online / Available</span>
          </div>

          <button
            type="button"
            className="relative flex h-8 w-8 items-center justify-center rounded-sm text-slate-300 transition hover:bg-[#223040] hover:text-white"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#1f70c1]" />
          </button>

          <Link
            href="/docs/api"
            target="_blank"
            className="hidden h-8 w-8 items-center justify-center rounded-sm text-slate-300 transition hover:bg-[#223040] hover:text-white lg:flex"
            title="ServiceNow API Reference & Documentation"
          >
            <HelpCircle className="h-4 w-4" />
          </Link>

          {/* User Profile Pill */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1f70c1] text-xs font-bold text-white uppercase shadow-sm">
              {user.name.charAt(0)}
            </div>
            <div className="hidden flex-col text-left xl:flex">
              <span className="truncate text-xs font-semibold text-slate-100">{user.name}</span>
              <span className="truncate text-[10px] text-slate-400">{ROLE_LABELS[user.role]}</span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Workspace Body: Polaris Sidebar + Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar Navigator */}
        <aside
          className="sticky top-13 hidden h-[calc(100vh-3.25rem)] w-60 shrink-0 flex-col justify-between border-r border-[#d1d7dc] bg-[#0f161e] md:flex select-none"
          aria-label="Agent Workspace Navigator"
        >
          <div className="space-y-4 px-2 py-4">
            <div className="px-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {area === "admin" ? "Administration Suite" : "Workspace Navigator"}
              </p>
            </div>

            <nav className="space-y-0.5" role="navigation">
              {visible.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-xs font-medium text-slate-300 transition hover:bg-[#1a2432] hover:text-white"
                >
                  <item.icon className="h-4 w-4 text-slate-400 transition group-hover:text-[#38bdf8]" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </Link>
              ))}

              {showAdminExtras ? (
                <div className="pt-3 mt-3 border-t border-slate-800">
                  <Link
                    href="/admin"
                    className="flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-xs font-semibold text-[#60a5fa] hover:bg-[#1a2432]"
                  >
                    <ShieldAlert className="h-4 w-4 text-[#60a5fa]" aria-hidden />
                    <span>Master Admin Console</span>
                  </Link>
                </div>
              ) : null}

              {showStaffExtras ? (
                <div className="pt-3 mt-3 border-t border-slate-800">
                  <Link
                    href="/staff"
                    className="flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-xs font-semibold text-[#60a5fa] hover:bg-[#1a2432]"
                  >
                    <LayoutDashboard className="h-4 w-4 text-[#60a5fa]" aria-hidden />
                    <span>Agent Workspace</span>
                  </Link>
                </div>
              ) : null}
            </nav>
          </div>

          {/* Sidebar Footer with Sign Out */}
          <div className="border-t border-slate-800 bg-[#0b1016] p-3">
            <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
              <span className="truncate">{user.email}</span>
            </div>
            <LogoutButton />
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {/* Mobile Navigation bar */}
          <nav className="flex gap-1 overflow-x-auto border-b border-slate-700 bg-[#0f161e] px-3 py-2 md:hidden" aria-label="Mobile navigation">
            {visible.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-sm px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-[#1a2432] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
