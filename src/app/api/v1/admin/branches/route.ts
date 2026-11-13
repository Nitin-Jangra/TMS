// Branch management (Root Admin): update notification email, active flag.
// Branch notification emails are blank by default until FitClass provides them.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { isValidEmail } from "@/lib/types";
import { retryUnassignedTickets } from "@/lib/assignment";

export async function GET() {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN", "CENTRAL_ADMIN"]);
    const branches = await db.branch.findMany({ orderBy: { code: "asc" } });
    return ok({ branches });
  });
}

export async function PATCH(request: Request) {
  return handleErrors(async () => {
    const user = await requireRole(["ROOT_ADMIN"]);
    const body = await request.json().catch(() => null);
    const id = String((body as { id?: string })?.id || "");
    const notificationEmail = String((body as { notificationEmail?: string })?.notificationEmail || "").trim();
    const isActive = (body as { isActive?: boolean })?.isActive;

    const branch = await db.branch.findUnique({ where: { id } });
    if (!branch) return fail("NOT_FOUND", "Branch not found.", 404);
    if (notificationEmail && !isValidEmail(notificationEmail)) {
      return fail("VALIDATION_ERROR", "Please provide a valid email address or leave it blank.", 422);
    }
    if (typeof isActive !== "boolean" && notificationEmail === branch.notificationEmail) {
      return ok({ branch });
    }

    const data: { notificationEmail?: string; isActive?: boolean } = {};
    if (notificationEmail !== branch.notificationEmail) data.notificationEmail = notificationEmail;
    if (typeof isActive === "boolean") data.isActive = isActive;
    const updated = await db.branch.update({ where: { id }, data });

    await logAudit({
      actor: user,
      action: "CONFIG_CHANGED",
      previousValue: branch.notificationEmail || "(blank)",
      newValue: updated.notificationEmail || "(blank)",
      details: `Branch notification email for ${branch.name}`,
    });

    // A newly configured email unblocks pending branch notifications on next submissions;
    // also retry the unassigned queue if the branch was reactivated.
    if (data.isActive === true) await retryUnassignedTickets(id).catch(() => undefined);

    return ok({ branch: updated });
  });
}
