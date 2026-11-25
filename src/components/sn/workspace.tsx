"use client";

// Classic service-desk frame: dark banner header (logo, product name, user
// menu, global search, help, settings) + collapsible left navigator + content.

import { Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, CircleHelp, LogOut, Menu, Search, Settings, ShieldAlert, LayoutDashboard, X } from "lucide-react";
import { Navigator } from "@/components/sn/navigator";
import type { NavModule } from "@/components/sn/modules";

interface WorkspaceUser {
  name: string;
  email: string;
  roleLabel: string;
  role: string;
  branchName: string | null;
}

const NAV_KEY = "fc.nav.collapsed";

export function Workspace({ user, modules, children }: { user: WorkspaceUser; modules: NavModule[]; children: React.ReactNode }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [mounted, setMounted] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage
    try { setCollapsed(localStorage.getItem(NAV_KEY) === "1"); } catch { /* ignore */ }
    setMounted(true);
  }, []);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

  const setNav = (value: boolean) => {
    setCollapsed(value);
    try { localStorage.setItem(NAV_KEY, value ? "1" : "0"); } catch { /* ignore */ }
  };

  const signOut = async () => {
    await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/staff-login");
    router.refresh();
  };

  const isAdmin = user.role === "ROOT_ADMIN" || user.role === "CENTRAL_ADMIN";
  const initials = user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="ui16 flex h-screen flex-col overflow-hidden bg-white">
      {/* Banner */}
      <header className="flex h-[52px] shrink-0 items-center justify-between gap-3 bg-[var(--u-header)] px-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded text-[#c5ccd3] hover:bg-white/10 hover:text-white"
            onClick={() => (window.matchMedia("(min-width: 768px)").matches ? setNav(!collapsed) : setMobileNav((v) => !v))}
            aria-label="Toggle navigator"
            title="Toggle navigator"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <Link href="/staff" className="flex min-w-0 items-center gap-3">
            <Image src="/fitclass-logo.webp" alt="FitClass" width={118} height={31} className="h-7 w-auto object-contain" priority />
            <span className="hidden truncate text-[17px] font-semibold tracking-tight text-white sm:inline">Service Management</span>
          </Link>
        </div>

        <div className="flex items-center gap-1">
          {searchOpen ? (
            <form
              className="mr-1 flex items-center"
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim()) router.push(`/staff/tickets?q=${encodeURIComponent(q.trim())}`);
                setSearchOpen(false);
                setQ("");
              }}
            >
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }}
                placeholder="Search tickets, members, mobile…"
                className="h-8 w-56 rounded border border-[#5d6874] bg-[#20282f] px-3 text-sm text-white placeholder-[#a3acb6] outline-none focus:border-[#278efc] sm:w-72"
                aria-label="Global search"
              />
              <button type="button" onClick={() => setSearchOpen(false)} className="ml-1 rounded p-1.5 text-[#c5ccd3] hover:text-white" aria-label="Close search">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </form>
          ) : null}

          {/* Rendered after mount: Radix generates ids that differ between server and client here. */}
          {!mounted ? <button type="button" className="flex items-center gap-2 rounded px-2 py-1 text-sm text-white hover:bg-white/10">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4f6475] text-xs font-bold ring-2 ring-white/20">{initials}</span>
                <span className="hidden max-w-[160px] truncate font-medium md:inline">{user.name}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-80" aria-hidden />
              </button> : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex items-center gap-2 rounded px-2 py-1 text-sm text-white hover:bg-white/10">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4f6475] text-xs font-bold ring-2 ring-white/20">{initials}</span>
                <span className="hidden max-w-[160px] truncate font-medium md:inline">{user.name}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-80" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="space-y-0.5">
                <p className="text-sm font-semibold">{user.name}</p>
                <p className="text-xs font-normal text-slate-500">{user.roleLabel}{user.branchName ? ` · ${user.branchName}` : ""}</p>
                <p className="truncate text-xs font-normal text-slate-400">{user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link href="/staff"><LayoutDashboard className="mr-2 h-4 w-4" aria-hidden />Service desk home</Link></DropdownMenuItem>
              {isAdmin ? <DropdownMenuItem asChild><Link href="/admin"><ShieldAlert className="mr-2 h-4 w-4" aria-hidden />Master complaint panel</Link></DropdownMenuItem> : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut} className="text-red-600"><LogOut className="mr-2 h-4 w-4" aria-hidden />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}

          <button type="button" onClick={() => setSearchOpen((v) => !v)} className="flex h-9 w-9 items-center justify-center rounded text-[#c5ccd3] hover:bg-white/10 hover:text-white" aria-label="Search" title="Search">
            <Search className="h-5 w-5" aria-hidden />
          </button>
          <Link href="/docs/api" target="_blank" className="hidden h-9 w-9 items-center justify-center rounded text-[#c5ccd3] hover:bg-white/10 hover:text-white sm:flex" aria-label="Help and API documentation" title="Help">
            <CircleHelp className="h-5 w-5" aria-hidden />
          </Link>
          {user.role === "ROOT_ADMIN" ? (
            <Link href="/admin/settings" className="flex h-9 w-9 items-center justify-center rounded text-[#c5ccd3] hover:bg-white/10 hover:text-white" aria-label="System settings" title="System settings">
              <Settings className="h-5 w-5" aria-hidden />
            </Link>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Desktop navigator */}
        {!collapsed ? (
          <aside className="hidden w-[280px] shrink-0 border-r border-black/20 md:block">
            <Suspense fallback={<div className="h-full bg-[var(--u-nav)]" />}>
              <Navigator modules={modules} onCollapse={() => setNav(true)} />
            </Suspense>
          </aside>
        ) : null}

        {/* Mobile navigator (overlay) */}
        {mobileNav ? (
          <div className="fixed inset-0 top-[52px] z-40 flex md:hidden">
            <aside className="w-[280px] shadow-xl">
              <Suspense fallback={null}>
                <Navigator modules={modules} onCollapse={() => setMobileNav(false)} />
              </Suspense>
            </aside>
            <button type="button" className="flex-1 bg-black/40" aria-label="Close navigator" onClick={() => setMobileNav(false)} />
          </div>
        ) : null}

        <main className="min-w-0 flex-1 overflow-y-auto bg-white p-5" onClick={() => mobileNav && setMobileNav(false)}>
          {children}
        </main>
      </div>
    </div>
  );
}
