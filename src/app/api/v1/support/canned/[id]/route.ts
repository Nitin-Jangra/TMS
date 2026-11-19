// Edit / delete a canned reply. Personal: owner only. Shared: managers and
// central staff.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageSharedTemplates, type SessionUser } from "@/lib/types";

async function load(id: string, user: SessionUser) {
  const row = await db.cannedResponse.findUnique({ where: { id } });
  if (!row) return { error: fail("NOT_FOUND", "Template not found.", 404) };
  const allowed = (!!user.id && row.ownerId === user.id) || (row.isShared && canManageSharedTemplates(user.role));
  if (!allowed) return { error: fail("FORBIDDEN", "You cannot change this template.", 403) };
  return { row };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleErrors(async () => {
    const { id } = await params;
    const user = await requireUser();
    const found = await load(id, user);
    if (found.error) return found.error;
    const body = ((await request.json().catch(() => null)) || {}) as Record<string, unknown>;
    const data: { title?: string; body?: string; categoryId?: string | null; isShared?: boolean } = {};
    if ("title" in body) {
      const title = String(body.title || "").trim();
      if (title.length < 2 || title.length > 80) return fail("VALIDATION_ERROR", "Title must be 2-80 characters.", 422);
      data.title = title;
    }
    if ("body" in body) {
      const text = String(body.body || "").trim();
      if (text.length < 5 || text.length > 4000) return fail("VALIDATION_ERROR", "Template text must be 5-4000 characters.", 422);
      data.body = text;
    }
    if ("categoryId" in body) data.categoryId = body.categoryId ? String(body.categoryId) : null;
    if (typeof body.isShared === "boolean") {
      if (body.isShared && !canManageSharedTemplates(user.role)) return fail("FORBIDDEN", "Only managers and central staff can share templates.", 403);
      data.isShared = body.isShared;
    }
    const template = await db.cannedResponse.update({ where: { id }, data });
    return ok({ template });
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleErrors(async () => {
    const { id } = await params;
    const user = await requireUser();
    const found = await load(id, user);
    if (found.error) return found.error;
    await db.cannedResponse.delete({ where: { id } });
    return ok({ deleted: true });
  });
}
