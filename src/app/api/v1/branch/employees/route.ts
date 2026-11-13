// Branch employees (manager view).

import { handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  return handleErrors(async () => {
    const user = await requireUser();
    const employees = await db.staffUser.findMany({
      where: { branchId: user.branchId, role: "SUPPORT_AGENT" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, phone: true, designation: true, isActive: true, availabilityEnabled: true, createdAt: true },
    });
    return ok({ employees });
  });
}
