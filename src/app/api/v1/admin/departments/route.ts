// Department management (Root Admin / Central Admin).
// POST  { name, description?, email? }                 → create
// PATCH { id, name?, description?, email?, isActive?, sortOrder? } → update
// Routing rules (category → department) are set on categories:
// PATCH /api/v1/admin/categories { id, departmentId }.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  return handleErrors(async () => {
    const user = await requireRole(["ROOT_ADMIN", "CENTRAL_ADMIN"]);
    const body = ((await request.json().catch(() => null)) || {}) as Record<string, unknown>;
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    if (name.length < 2 || name.length > 60) return fail("VALIDATION_ERROR", "Department name must be 2-60 characters.", 422);
    if (email && !EMAIL_RE.test(email)) return fail("VALIDATION_ERROR", "Department email is not valid.", 422);
    if (await db.department.findUnique({ where: { name } })) return fail("ALREADY_EXISTS", "A department with this name already exists.", 409);
    const count = await db.department.count();
    const department = await db.department.create({
      data: { name, description: String(body.description || "").trim().slice(0, 200), email, sortOrder: count },
    });
    await logAudit({ actor: user, action: "CONFIG_CHANGED", newValue: `Department created: ${name}` });
    return ok({ department }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return handleErrors(async () => {
    const user = await requireRole(["ROOT_ADMIN", "CENTRAL_ADMIN"]);
    const body = ((await request.json().catch(() => null)) || {}) as Record<string, unknown>;
    const id = String(body.id || "");
    const existing = id ? await db.department.findUnique({ where: { id } }) : null;
    if (!existing) return fail("NOT_FOUND", "Department not found.", 404);

    const data: { name?: string; description?: string; email?: string; isActive?: boolean; sortOrder?: number } = {};
    if ("name" in body) {
      const name = String(body.name || "").trim();
      if (name.length < 2 || name.length > 60) return fail("VALIDATION_ERROR", "Department name must be 2-60 characters.", 422);
      const clash = await db.department.findUnique({ where: { name } });
      if (clash && clash.id !== id) return fail("ALREADY_EXISTS", "A department with this name already exists.", 409);
      data.name = name;
    }
    if ("description" in body) data.description = String(body.description || "").trim().slice(0, 200);
    if ("email" in body) {
      const email = String(body.email || "").trim().toLowerCase();
      if (email && !EMAIL_RE.test(email)) return fail("VALIDATION_ERROR", "Department email is not valid.", 422);
      data.email = email;
    }
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

    const department = await db.department.update({ where: { id }, data });
    await logAudit({ actor: user, action: "CONFIG_CHANGED", previousValue: existing.name, newValue: `Department updated: ${department.name}`, details: JSON.stringify(data) });
    return ok({ department });
  });
}
