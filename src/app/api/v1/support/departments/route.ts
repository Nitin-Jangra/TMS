// Departments (assignment groups) for any signed-in staff member: used by
// filters, the reassign panel and the ticket "Move to department" action.

import { handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  return handleErrors(async () => {
    await requireUser();
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    const departments = await db.department.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        categories: { select: { id: true, name: true } },
        _count: { select: { staff: true } },
      },
    });
    return ok({
      departments: departments.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        email: d.email,
        isActive: d.isActive,
        sortOrder: d.sortOrder,
        categories: d.categories,
        staffCount: d._count.staff,
      })),
    });
  });
}
