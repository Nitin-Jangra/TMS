// Saved ticket-list views ("My views").
// GET  -> the caller's views + views shared by others
// POST { name, query, isShared? } - query is the ticket list URL query string.
//      Sharing a view with everyone needs a manager / central role.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageSharedTemplates } from "@/lib/types";

const ALLOWED_PARAMS = new Set([
  "q", "ticketSearch", "customerSearch", "branchSearch", "categorySearch", "status", "priority", "from", "to", "overdue",
  "escalated", "mine", "unassigned", "assignedToId", "scope", "sort", "order", "departmentId",
]);

function cleanQuery(raw: string): string {
  const input = new URLSearchParams(raw.replace(/^\?/, ""));
  const out = new URLSearchParams();
  for (const [k, v] of input) if (ALLOWED_PARAMS.has(k) && v) out.set(k, v.slice(0, 200));
  return out.toString();
}

export async function GET() {
  return handleErrors(async () => {
    const user = await requireUser();
    const views = await db.savedView.findMany({
      where: { OR: [{ isShared: true }, ...(user.id ? [{ ownerId: user.id }] : [])] },
      orderBy: [{ name: "asc" }],
      include: { owner: { select: { name: true } } },
    });
    return ok({
      views: views.map((v) => ({ id: v.id, name: v.name, query: v.query, isShared: v.isShared, ownerName: v.owner.name, mine: v.ownerId === user.id })),
      canShare: canManageSharedTemplates(user.role),
    });
  });
}

export async function POST(request: Request) {
  return handleErrors(async () => {
    const user = await requireUser();
    if (!user.id) return fail("FORBIDDEN", "Only staff accounts can save views.", 403);
    const body = ((await request.json().catch(() => null)) || {}) as Record<string, unknown>;
    const name = String(body.name || "").trim();
    if (name.length < 2 || name.length > 60) return fail("VALIDATION_ERROR", "View name must be 2-60 characters.", 422);
    const isShared = body.isShared === true;
    if (isShared && !canManageSharedTemplates(user.role)) return fail("FORBIDDEN", "Only managers and central staff can share views.", 403);
    const count = await db.savedView.count({ where: { ownerId: user.id } });
    if (count >= 30) return fail("LIMIT_REACHED", "You can keep up to 30 saved views. Delete one first.", 409);
    const view = await db.savedView.create({ data: { ownerId: user.id, name, query: cleanQuery(String(body.query || "")), isShared } });
    return ok({ view }, { status: 201 });
  });
}
