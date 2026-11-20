"use client";

// Left application navigator: "Filter navigator" search, All / Favorites /
// History tabs, collapsible applications with their modules.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Archive, BarChart3, ChevronDown, ChevronLeft, ChevronRight, Clock, FileText, Filter, Home, KeyRound, List, Mailbox,
  PlusSquare, ScrollText, Settings2, ShieldAlert, Star, Ticket, Users, Workflow, X,
} from "lucide-react";
import { DEFAULT_FAVORITES, readHistory, type HistoryEntry, type ModuleIcon, type NavModule } from "@/components/sn/modules";

const ICONS: Record<ModuleIcon, React.ComponentType<{ className?: string }>> = {
  home: Home, list: List, queue: Workflow, people: Users, template: FileText, chart: BarChart3,
  admin: ShieldAlert, settings: Settings2, audit: ScrollText, mail: Mailbox, key: KeyRound, new: PlusSquare,
};

const FAV_KEY = "fc.nav.favorites";
type Tab = "all" | "favorites" | "history";

function normalize(href: string) {
  const [path, query = ""] = href.split("?");
  const p = new URLSearchParams(query);
  p.delete("page");
  p.delete("pageSize");
  const entries = [...p.entries()].sort(([a], [b]) => a.localeCompare(b));
  return `${path}?${new URLSearchParams(entries).toString()}`;
}

export function Navigator({ modules, onCollapse }: { modules: NavModule[]; onCollapse: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [tab, setTab] = useState<Tab>("all");
  const [filter, setFilter] = useState("");
  const [favorites, setFavorites] = useState<string[]>(DEFAULT_FAVORITES);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [closedApps, setClosedApps] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FAV_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate favorites from localStorage after mount
      if (saved) setFavorites(JSON.parse(saved));
    } catch { /* ignore */ }
    const sync = () => setHistory(readHistory());
    sync();
    window.addEventListener("fc-history", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("fc-history", sync); window.removeEventListener("storage", sync); };
  }, []);

  const toggleFav = (id: string) => {
    setFavorites((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const current = normalize(`${pathname}?${search.toString()}`);
  const exact = modules.find((m) => normalize(m.href) === current);
  const isActive = (m: NavModule) => (exact ? exact.id === m.id : !m.href.includes("?") && m.href === pathname);

  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (text: string) => words.every((w) => text.toLowerCase().includes(w));

  const apps = (() => {
    const out = new Map<string, NavModule[]>();
    for (const m of modules) {
      if (words.length && !matches(`${m.app} ${m.label}`)) continue;
      out.set(m.app, [...(out.get(m.app) || []), m]);
    }
    return [...out.entries()];
  })();

  const moduleRow = (m: NavModule) => {
    const Icon = ICONS[m.icon];
    const fav = favorites.includes(m.id);
    return (
      <div key={m.id} className={`group u-nav-module ${isActive(m) ? "is-active" : ""}`}>
        <Icon className={`h-4 w-4 shrink-0 ${m.icon === "home" ? "text-[#81b5a1]" : "text-[#6fa8e8]"}`} aria-hidden />
        <Link href={m.href} target={m.newTab ? "_blank" : undefined} className="min-w-0 flex-1 truncate" title={m.label}>
          {m.label}
        </Link>
        <button
          type="button"
          onClick={() => toggleFav(m.id)}
          className={`shrink-0 rounded p-0.5 transition ${fav ? "text-[#f4c542]" : "text-[#7d8792] opacity-0 group-hover:opacity-100"} hover:text-[#f4c542]`}
          aria-label={fav ? `Remove ${m.label} from favorites` : `Add ${m.label} to favorites`}
          title={fav ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={`h-3.5 w-3.5 ${fav ? "fill-current" : ""}`} aria-hidden />
        </button>
      </div>
    );
  };

  const favModules = modules.filter((m) => favorites.includes(m.id) && (!words.length || matches(m.label)));
  const historyRows = history.filter((h) => !words.length || matches(`${h.number} ${h.title}`));

  const tabBtn = (id: Tab, Icon: React.ComponentType<{ className?: string }>, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`flex h-11 flex-1 items-center justify-center border-b-[3px] transition ${tab === id ? "border-[#278efc] bg-[#3c4652] text-white" : "border-transparent text-[#a3acb6] hover:bg-[#2f3842] hover:text-white"}`}
      aria-label={label}
      aria-pressed={tab === id}
      title={label}
    >
      <Icon className={`h-5 w-5 ${id === "favorites" && tab === id ? "fill-current" : ""}`} aria-hidden />
    </button>
  );

  return (
    <div className="flex h-full flex-col bg-[var(--u-nav)] text-[var(--u-nav-text)]">
      <div className="p-3">
        <label className="flex h-9 items-center gap-2 rounded-full border border-[#5d6874] bg-[#283039] px-3 focus-within:border-[#278efc]">
          <Filter className="h-4 w-4 shrink-0 text-[#a3acb6]" aria-hidden />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter navigator"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-[#a3acb6] outline-none"
            aria-label="Filter navigator"
          />
          {filter ? (
            <button type="button" onClick={() => setFilter("")} aria-label="Clear filter" className="text-[#a3acb6] hover:text-white">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </label>
      </div>

      <div className="flex border-b border-[var(--u-nav-line)] bg-[var(--u-nav-dark)]" role="tablist">
        {tabBtn("all", Archive, "All applications")}
        {tabBtn("favorites", Star, "Favorites")}
        {tabBtn("history", Clock, "History")}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto thin-scroll" aria-label="Application navigator">
        {tab === "all" ? (
          apps.length ? apps.map(([app, mods]) => {
            const open = words.length > 0 || !closedApps.includes(app);
            return (
              <div key={app}>
                <button type="button" className="u-nav-app" aria-expanded={open}
                  onClick={() => setClosedApps((c) => (c.includes(app) ? c.filter((x) => x !== app) : [...c, app]))}>
                  {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
                  {app}
                </button>
                {open ? mods.map(moduleRow) : null}
              </div>
            );
          }) : <p className="px-4 py-6 text-sm text-[var(--u-nav-muted)]">No modules match “{filter}”.</p>
        ) : null}

        {tab === "favorites" ? (
          favModules.length ? favModules.map(moduleRow) : (
            <p className="px-4 py-6 text-sm text-[var(--u-nav-muted)]">No favorites yet. Hover a module in the All tab and click the star.</p>
          )
        ) : null}

        {tab === "history" ? (
          historyRows.length ? historyRows.map((h) => (
            <Link key={h.id} href={`/staff/tickets/${h.id}`} className="u-nav-module flex-col !items-start !gap-0.5">
              <span className="flex items-center gap-2 text-sm">
                <Ticket className="h-3.5 w-3.5 text-[#6fa8e8]" aria-hidden />
                <span className="font-medium">{h.number}</span>
              </span>
              <span className="w-full truncate pl-5 text-xs text-[var(--u-nav-muted)]">{h.title}</span>
            </Link>
          )) : <p className="px-4 py-6 text-sm text-[var(--u-nav-muted)]">Tickets you open will appear here.</p>
        ) : null}
      </nav>

      <div className="flex h-11 items-center justify-between border-t border-[var(--u-nav-line)] bg-[var(--u-nav-dark)] px-3">
        <button type="button" onClick={onCollapse} className="flex h-8 w-8 items-center justify-center rounded-full border border-[#5d6874] text-[#a3acb6] hover:text-white"
          aria-label="Collapse navigator" title="Collapse navigator">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="text-[11px] text-[var(--u-nav-muted)]">{modules.length} modules</span>
      </div>
    </div>
  );
}
