// Canned replies (reply templates).
// GET  -> shared templates + the caller's personal ones (?categoryId= puts
//         matching templates first)
// POST { title, body, categoryId?, isShared? } - shared templates can be
//         created by branch managers and central staff; anyone can create
//         personal ones.
// Placeholders filled when inserted: {{customerName}} {{ticketNumber}}
// {{branchName}} {{categoryName}} {{agentName}}

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageSharedTemplates } from "@/lib/types";
import { getUserPermissions } from "@/lib/permissions";

export async function GET(request: Request) {
  return handleErrors(async () => {
    const user = await requireUser();
    const permissions = await getUserPermissions(user);
    if (!permissions.useCannedResponses) {
      return ok({ templates: [], canManageShared: false, disabled: true });
    }
    const categoryId = new URL(request.url).searchParams.get("categoryId") || "";
    const rows = await db.cannedResponse.findMany({
      where: { OR: [{ isShared: true }, ...(user.id ? [{ ownerId: user.id }] : [])] },
      orderBy: [{ title: "asc" }],
      include: { owner: { select: { name: true } } },
    });
    const shared = canManageSharedTemplates(user.role);
    const templates = rows
      .map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        categoryId: r.categoryId,
        isShared: r.isShared,
        ownerName: r.owner?.name || "FitClass",
        canEdit: (!!user.id && r.ownerId === user.id) || (r.isShared && shared),
      }))
      .sort((a, b) => Number(!!categoryId && b.categoryId === categoryId) - Number(!!categoryId && a.categoryId === categoryId));
    return ok({ templates, canManageShared: shared });
  });
}

export async function POST(request: Request) {
  return handleErrors(async () => {
    const user = await requireUser();
    const permissions = await getUserPermissions(user);
    if (!permissions.useCannedResponses) {
      return fail("FORBIDDEN", "Your role or designation does not have permission to manage canned responses.", 403);
    }
    const body = ((await request.json().catch(() => null)) || {}) as Record<string, unknown>;
    const title = String(body.title || "").trim();
    const text = String(body.body || "").trim();
    const isShared = body.isShared === true;
    if (title.length < 2 || title.length > 80) return fail("VALIDATION_ERROR", "Title must be 2-80 characters.", 422);
    if (text.length < 5 || text.length > 4000) return fail("VALIDATION_ERROR", "Template text must be 5-4000 characters.", 422);
    if (isShared && !canManageSharedTemplates(user.role)) return fail("FORBIDDEN", "Only managers and central staff can create shared templates.", 403);
    const template = await db.cannedResponse.create({
      data: { title, body: text, categoryId: body.categoryId ? String(body.categoryId) : null, isShared, ownerId: user.id || null },
    });
    return ok({ template }, { status: 201 });
  });
}
