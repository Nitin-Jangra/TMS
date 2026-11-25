// Shared domain types, roles, statuses and permission helpers for FC-CMS.

export const TICKET_STATUSES = [
  "IN_PROGRESS",
  "ON_HOLD",
  "RESOLVED",
  "CLOSED",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ROLES = [
  "ROOT_ADMIN",
  "CENTRAL_ADMIN",
  "CENTRAL_AGENT",
  "BRANCH_MANAGER",
  "SUPPORT_AGENT",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  ROOT_ADMIN: "Root Admin",
  CENTRAL_ADMIN: "Central Support Admin",
  CENTRAL_AGENT: "Central Support Agent",
  BRANCH_MANAGER: "Branch Manager",
  SUPPORT_AGENT: "Support Employee",
};

/** Allowed status transitions (spec section 7). Any transition not listed here is rejected. */
export const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  IN_PROGRESS: ["ON_HOLD", "RESOLVED"],
  ON_HOLD: ["IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"], // IN_PROGRESS = customer reopening, CLOSED = automatic closure
  CLOSED: [], // permanent read-only — enforced at every layer
};

export function canTransition(from: string, to: string): boolean {
  const normalized = from === "NEW_COMPLAINT" ? "IN_PROGRESS" : from;
  const allowed = ALLOWED_TRANSITIONS[normalized as TicketStatus];
  return !!allowed && allowed.includes(to as TicketStatus);
}

export const STATUS_LABELS: Record<string, string> = {
  NEW_COMPLAINT: "In Progress",
  IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

/** Tailwind classes for status badges (ServiceNow Polaris ITIL theme). */
export const STATUS_BADGE_CLASSES: Record<string, string> = {
  NEW_COMPLAINT: "bg-[#FEF3C7] text-[#92400E] ring-[#FDE68A]",
  IN_PROGRESS: "bg-[#FEF3C7] text-[#92400E] ring-[#FDE68A]",
  ON_HOLD: "bg-[#EDE9FE] text-[#5B21B6] ring-[#DDD6FE]",
  RESOLVED: "bg-[#D1FAE5] text-[#065F46] ring-[#A7F3D0]",
  CLOSED: "bg-[#F1F5F9] text-[#334155] ring-[#E2E8F0]",
};

export const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  branchId: string | null;
  branchName?: string | null;
  designation?: string;
}

/** Roles that can view/manage tickets centrally (cross-branch). */
export const CENTRAL_ROLES: Role[] = ["ROOT_ADMIN", "CENTRAL_ADMIN", "CENTRAL_AGENT"];

export function isCentralRole(role: string): boolean {
  return CENTRAL_ROLES.includes(role as Role);
}

export function isStaffRole(role: string): boolean {
  return ROLES.includes(role as Role);
}

/** Which dashboard routes each role can access. */
export function roleHome(role: Role): string {
  switch (role) {
    case "ROOT_ADMIN":
      return "/admin";
    case "CENTRAL_ADMIN":
    case "CENTRAL_AGENT":
      return "/staff";
    case "BRANCH_MANAGER":
      return "/staff";
    case "SUPPORT_AGENT":
      return "/staff";
    default:
      return "/login";
  }
}

export function canManageSettings(role: Role): boolean {
  return role === "ROOT_ADMIN";
}

export function canViewAuditLogs(role: Role): boolean {
  return role === "ROOT_ADMIN" || role === "CENTRAL_ADMIN";
}

export function canAssignTickets(role: Role): boolean {
  return role === "ROOT_ADMIN" || role === "CENTRAL_ADMIN" || role === "CENTRAL_AGENT" || role === "BRANCH_MANAGER";
}

/** Shared reply templates, shared saved views, reports. */
export function canManageSharedTemplates(role: string): boolean {
  return role === "ROOT_ADMIN" || role === "CENTRAL_ADMIN" || role === "CENTRAL_AGENT" || role === "BRANCH_MANAGER";
}

export function canViewReports(role: string): boolean {
  return role === "ROOT_ADMIN" || role === "CENTRAL_ADMIN" || role === "CENTRAL_AGENT" || role === "BRANCH_MANAGER";
}

export function canManageAvailability(role: Role): boolean {
  return role === "ROOT_ADMIN" || role === "CENTRAL_ADMIN" || role === "BRANCH_MANAGER";
}

export function canUpdateTicketStatus(role: Role): boolean {
  // Root Admin can view everything but cannot modify closed tickets;
  // open-ticket status updates are allowed for operational roles.
  return (
    role === "SUPPORT_AGENT" ||
    role === "BRANCH_MANAGER" ||
    role === "CENTRAL_AGENT" ||
    role === "CENTRAL_ADMIN" ||
    role === "ROOT_ADMIN"
  );
}

export function isTicketReadOnlyForStaff(ticketStatus: string, role: Role): boolean {
  // CLOSED tickets are read-only for every role, including Root Admin.
  return ticketStatus === "CLOSED";
}

export const OPEN_STATUSES: TicketStatus[] = ["IN_PROGRESS", "ON_HOLD"];
export const DB_OPEN_STATUSES = ["NEW_COMPLAINT", "IN_PROGRESS", "ON_HOLD"] as const;

export function normalizePhone(raw: string): string {
  return (raw || "").replace(/[^\d]/g, "").replace(/^0+/, (m, off) => (off === 0 ? "" : m)).slice(-12);
}

export function isValidPhone(raw: string): boolean {
  const digits = normalizePhone(raw);
  return digits.length >= 10 && digits.length <= 12;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

export function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return "****";
  return `${"•".repeat(Math.max(phone.length - 4, 0))}${phone.slice(-4)}`;
}
