// Set an employee's department (assignment group). Branch managers: own
// branch only; central admins + root: anyone. { departmentId: "..." | null }

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { canManageAvailability } from "@/lib/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  return handleErrors(async () => {
    const { employeeId } = await params;
    const user = await requireUser();
    if (!canManageAvailability(user.role)) return fail("FORBIDDEN", "Your role cannot change departments.", 403);

    const body = ((await request.json().catch(() => null)) || {}) as { departmentId?: string | null };
    const departmentId = body.departmentId ? String(body.departmentId) : null;

    const employee = await db.staffUser.findUnique({ where: { id: employeeId }, include: { department: true } });
    if (!employee || !["SUPPORT_AGENT", "BRANCH_MANAGER"].includes(employee.role)) return fail("NOT_FOUND", "Employee not found.", 404);
    if (user.role === "BRANCH_MANAGER" && user.branchId !== employee.branchId) {
      return fail("FORBIDDEN", "Branch managers can only manage their own branch employees.", 403);
    }
    const department = departmentId ? await db.department.findUnique({ where: { id: departmentId } }) : null;
    if (departmentId && !department) return fail("NOT_FOUND", "Department not found.", 404);

    await db.staffUser.update({ where: { id: employeeId }, data: { departmentId } });
    await logAudit({
      actor: user,
      action: "DEPARTMENT_CHANGED",
      previousValue: employee.department?.name || "(generalist)",
      newValue: department?.name || "(generalist)",
      details: `Department of ${employee.name}`,
    });
    return ok({ employeeId, department: department ? { id: department.id, name: department.name } : null });
  });
}
