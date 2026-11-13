// Complaint category management (Root Admin).

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN"]);
    const body = await request.json().catch(() => null);
    const name = String((body as { name?: string })?.name || "").trim();
    if (name.length < 2 || name.length > 60) return fail("VALIDATION_ERROR", "Category name must be 2-60 characters.", 422);
    const existing = await db.complaintCategory.findUnique({ where: { name } });
    if (existing) return fail("ALREADY_EXISTS", "A category with this name already exists.", 409);
    const count = await db.complaintCategory.count();
    const category = await db.complaintCategory.create({ data: { name, sortOrder: count } });
    return ok({ category }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN"]);
    const body = await request.json().catch(() => null);
    const id = String((body as { id?: string })?.id || "");
    const isActive = (body as { isActive?: boolean })?.isActive;
    if (!id || typeof isActive !== "boolean") return fail("VALIDATION_ERROR", "id and isActive are required.", 422);
    const category = await db.complaintCategory.update({ where: { id }, data: { isActive } });
    return ok({ category });
  });
}
