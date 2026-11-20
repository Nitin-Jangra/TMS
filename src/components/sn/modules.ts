// Navigator modules (classic service-desk style "application → module" list).
// Shared by the server shell (role filtering) and the client navigator.

export type ModuleIcon = "home" | "list" | "queue" | "people" | "template" | "chart" | "admin" | "settings" | "audit" | "mail" | "key" | "new";

export interface NavModule {
  id: string;
  app: string;
  label: string;
  href: string;
  icon: ModuleIcon;
  roles: string[];
  newTab?: boolean;
}

const ALL = ["SUPPORT_AGENT", "BRANCH_MANAGER", "CENTRAL_AGENT", "CENTRAL_ADMIN", "ROOT_ADMIN"];
const MANAGERS = ["BRANCH_MANAGER", "CENTRAL_AGENT", "CENTRAL_ADMIN", "ROOT_ADMIN"];
const ADMINS = ["CENTRAL_ADMIN", "ROOT_ADMIN"];
const ROOT = ["ROOT_ADMIN"];

export const NAV_MODULES: NavModule[] = [
  { id: "home", app: "Service Desk", label: "Dashboard", href: "/staff", icon: "home", roles: ALL },
  { id: "t-open", app: "Service Desk", label: "Tickets - Open", href: "/staff/tickets?status=OPEN", icon: "list", roles: ALL },
  { id: "t-mine", app: "Service Desk", label: "Tickets - Assigned to me", href: "/staff/tickets?mine=true&status=OPEN", icon: "list", roles: ALL },
  { id: "t-unassigned", app: "Service Desk", label: "Tickets - Unassigned", href: "/staff/tickets?unassigned=true&status=OPEN", icon: "list", roles: ALL },
  { id: "t-overdue", app: "Service Desk", label: "Tickets - Overdue", href: "/staff/tickets?overdue=true", icon: "list", roles: ALL },
  { id: "t-escalated", app: "Service Desk", label: "Tickets - Escalated", href: "/staff/tickets?escalated=true&status=OPEN", icon: "list", roles: ALL },
  { id: "t-resolved", app: "Service Desk", label: "Tickets - Resolved", href: "/staff/tickets?status=RESOLVED", icon: "list", roles: ALL },
  { id: "t-all", app: "Service Desk", label: "Tickets - All", href: "/staff/tickets", icon: "list", roles: ALL },
  { id: "queue", app: "Service Desk", label: "Assignment Queue", href: "/staff/assignment", icon: "queue", roles: MANAGERS },
  { id: "new", app: "Service Desk", label: "Create New Ticket", href: "/complaint", icon: "new", roles: ALL, newTab: true },
  { id: "employees", app: "Team", label: "Employees", href: "/staff/employees", icon: "people", roles: ["BRANCH_MANAGER", "CENTRAL_ADMIN", "ROOT_ADMIN"] },
  { id: "templates", app: "Team", label: "Reply Templates", href: "/staff/templates", icon: "template", roles: ALL },
  { id: "reports", app: "Reports", label: "Ticket Reports", href: "/staff/reports", icon: "chart", roles: MANAGERS },
  { id: "admin", app: "System Administration", label: "Master Complaint Panel", href: "/admin", icon: "admin", roles: ADMINS },
  { id: "settings", app: "System Administration", label: "System Settings", href: "/admin/settings", icon: "settings", roles: ROOT },
  { id: "audit", app: "System Administration", label: "Audit Logs", href: "/admin/audit", icon: "audit", roles: ADMINS },
  { id: "mailbox", app: "System Administration", label: "Notification Mailbox", href: "/admin/mailbox", icon: "mail", roles: ADMINS },
  { id: "apikeys", app: "System Administration", label: "Integration API Keys", href: "/admin/api-keys", icon: "key", roles: ROOT },
];

export const DEFAULT_FAVORITES = ["home", "t-mine", "t-open", "t-overdue", "t-all"];

export interface HistoryEntry {
  id: string;
  number: string;
  title: string;
  at: number;
}

const HISTORY_KEY = "fc.nav.history";

/** Record a visited ticket in the navigator's History tab (client only). */
export function pushHistory(entry: Omit<HistoryEntry, "at">) {
  try {
    const list: HistoryEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    const next = [{ ...entry, at: Date.now() }, ...list.filter((h) => h.id !== entry.id)].slice(0, 25);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("fc-history"));
  } catch {
    // storage unavailable — history is a convenience only
  }
}

export function readHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}
