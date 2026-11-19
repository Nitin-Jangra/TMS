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

// PATCH { id, isActive?, departmentId? } — departmentId sets the routing rule
// (tickets of this category go to that department); null/"" clears it.
export async function PATCH(request: Request) {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN", "CENTRAL_ADMIN"]);
    const body = ((await request.json().catch(() => null)) || {}) as { id?: string; isActive?: boolean; departmentId?: string | null };
    const id = String(body.id || "");
    if (!id) return fail("VALIDATION_ERROR", "id is required.", 422);
    const data: { isActive?: boolean; departmentId?: string | null } = {};
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if ("departmentId" in body) {
      const departmentId = body.departmentId ? String(body.departmentId) : null;
      if (departmentId && !(await db.department.findUnique({ where: { id: departmentId } }))) {
        return fail("NOT_FOUND", "Department not found.", 404);
      }
      data.departmentId = departmentId;
    }
    if (!Object.keys(data).length) return fail("VALIDATION_ERROR", "Send isActive and/or departmentId.", 422);
    const category = await db.complaintCategory.update({ where: { id }, data, include: { department: { select: { id: true, name: true } } } });
    return ok({ category });
  });
}
