// Closure / reopening policy (Root Admin). Changing the window affects NEW
// resolutions only; existing resolved tickets keep their stored deadlines
// unless the admin explicitly re-applies the policy below.

import { handleErrors, ok, fail } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { getReopenWindowHours, isAutoClosureEnabled, updateSettings } from "@/lib/settings";
import { db } from "@/lib/db";

export async function GET() {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN"]);
    const [reopenWindowHours, autoClosureEnabled] = await Promise.all([getReopenWindowHours(), isAutoClosureEnabled()]);
    const scheduled = await db.ticketClosureJob.count({ where: { status: "SCHEDULED" } });
    return ok({ reopenWindowHours, autoClosureEnabled, scheduledJobs: scheduled });
  });
}

export async function PUT(request: Request) {
  return handleErrors(async () => {
    const user = await requireRole(["ROOT_ADMIN"]);
    const body = await request.json().catch(() => null);
    const reopenWindowHours = Number((body as { reopenWindowHours?: number })?.reopenWindowHours);
    const autoClosureEnabled = Boolean((body as { autoClosureEnabled?: boolean })?.autoClosureEnabled);
    const applyToExisting = Boolean((body as { applyToExisting?: boolean })?.applyToExisting);

    if (!Number.isFinite(reopenWindowHours) || reopenWindowHours <= 0 || reopenWindowHours > 24 * 30) {
      return fail("VALIDATION_ERROR", "Reopening window must be between 1 and 720 hours.", 422);
    }

    await updateSettings(
      [
        { key: "reopen_window_hours", value: String(Math.round(reopenWindowHours)), reason: "Closure policy update" },
        { key: "auto_closure_enabled", value: String(autoClosureEnabled), reason: "Closure policy update" },
      ],
      { id: user.id, name: user.name },
    );

    let reApplied = 0;
    if (applyToExisting) {
      // Explicit Root Admin action: recompute deadlines for currently resolved tickets.
      const resolved = await db.ticket.findMany({
        where: { status: "RESOLVED" },
        select: { id: true, resolvedAt: true },
      });
      const now = Date.now();
      for (const t of resolved) {
        const base = t.resolvedAt || new Date();
        const autoCloseAt = new Date(base.getTime() + reopenWindowHours * 3600000);
        await db.ticket.update({ where: { id: t.id }, data: { autoCloseAt } });
        await db.ticketClosureJob.updateMany({
          where: { ticketId: t.id, status: "SCHEDULED" },
          data: { runAt: autoCloseAt },
        });
        // If the new deadline already passed, the next sweep closes it safely.
        reApplied += 1;
      }
    }

    return ok({ reopenWindowHours, autoClosureEnabled, applyToExisting, reApplied });
  });
}
