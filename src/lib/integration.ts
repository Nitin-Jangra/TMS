// Shared helpers for the integration API (/api/v1/integration/*) used by the
// FitClass LMS and other external systems.

import { db } from "@/lib/db";
import type { ApiClientPrincipal } from "@/lib/auth";
import type { SessionUser } from "@/lib/types";

/**
 * The staff-shaped actor recorded for actions performed with an API key.
 * `id` is deliberately empty: API clients are not StaffUser rows, so nothing
 * may be stored in a column that references StaffUser.
 */
export function apiActor(client: ApiClientPrincipal, actingAs = ""): SessionUser {
  const who = actingAs.trim().slice(0, 80);
  return {
    id: "",
    name: who ? `${who} (via ${client.name})` : `API:${client.name}`,
    email: "",
    role: "CENTRAL_AGENT",
    branchId: null,
  };
}

/** Source recorded on tickets created through the API. */
export function apiSource(client: ApiClientPrincipal, requested?: unknown): string {
  const wanted = String(requested || "").toUpperCase();
  if (wanted === "API_LMS" || wanted === "LMS") return "API_LMS";
  if (wanted === "API_CRM" || wanted === "CRM") return "API_CRM";
  return client.name.toLowerCase().includes("crm") ? "API_CRM" : "API_LMS";
}

/** JSON body of a request as a plain object ({} when missing or invalid). */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

/** First non-empty string among the given keys of a JSON body. */
export function pick(body: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = body[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

/**
 * Finds a branch by id, code (BR001), LMS/CRM external id, exact name
 * ("Sector 48"), "name, city" or — last — a unique partial name.
 */
export async function resolveBranch(raw: string, opts: { activeOnly?: boolean } = {}) {
  const value = raw.trim();
  if (!value) return null;
  const branches = await db.branch.findMany({ where: opts.activeOnly === false ? {} : { isActive: true } });
  const lower = value.toLowerCase();
  const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
  const partial = branches.filter((b) => norm(b.name).includes(lower));
  return (
    branches.find((b) => b.id === value) ||
    branches.find((b) => norm(b.code) === lower) ||
    branches.find((b) => !!b.crmExternalId && norm(b.crmExternalId) === lower) ||
    branches.find((b) => norm(b.name) === lower) ||
    branches.find((b) => `${norm(b.name)}, ${norm(b.city)}` === lower || `${norm(b.name)} ${norm(b.city)}` === lower) ||
    (partial.length === 1 ? partial[0] : null)
  );
}

/** Finds an active complaint category by id or name (exact, then unique partial). */
export async function resolveCategory(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  const categories = await db.complaintCategory.findMany({ where: { isActive: true } });
  const lower = value.toLowerCase();
  const exact = categories.find((c) => c.id === value) || categories.find((c) => c.name.toLowerCase() === lower);
  if (exact) return exact;
  const partial = categories.filter((c) => c.name.toLowerCase().includes(lower));
  return partial.length === 1 ? partial[0] : null;
}

/** Finds a staff member by id, email or LMS/CRM external id. */
export async function resolveEmployee(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  return db.staffUser.findFirst({
    where: { OR: [{ id: value }, { email: value.toLowerCase() }, { crmExternalId: value }] },
  });
}

export async function findTicketByNumber(ticketNumber: string) {
  return db.ticket.findUnique({ where: { ticketNumber: ticketNumber.trim().toUpperCase() } });
}
