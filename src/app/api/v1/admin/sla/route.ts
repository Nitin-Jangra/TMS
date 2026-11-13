// SLA policy management (Root Admin). Priorities are fixed; targets are editable.

import { handleErrors, ok, fail } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { PRIORITIES } from "@/lib/types";

export async function GET() {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN", "CENTRAL_ADMIN"]);
    const policies = await db.slaPolicy.findMany({ orderBy: { priority: "asc" } });
    return ok({ policies });
  });
}

export async function PUT(request: Request) {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN"]);
    const body = await request.json().catch(() => null);
    const policies = (body as { policies?: { priority: string; responseTargetMinutes: number; resolutionTargetMinutes: number }[] })?.policies || [];
    for (const p of policies) {
      if (!PRIORITIES.includes(p.priority as (typeof PRIORITIES)[number])) {
        return fail("VALIDATION_ERROR", `Unknown priority ${p.priority}.`, 422);
      }
      if (!Number.isFinite(p.responseTargetMinutes) || p.responseTargetMinutes <= 0 || !Number.isFinite(p.resolutionTargetMinutes) || p.resolutionTargetMinutes <= 0) {
        return fail("VALIDATION_ERROR", "SLA targets must be positive numbers (minutes).", 422);
      }
    }
    for (const p of policies) {
      await db.slaPolicy.upsert({
        where: { priority: p.priority },
        create: { priority: p.priority, responseTargetMinutes: Math.round(p.responseTargetMinutes), resolutionTargetMinutes: Math.round(p.resolutionTargetMinutes) },
        update: { responseTargetMinutes: Math.round(p.responseTargetMinutes), resolutionTargetMinutes: Math.round(p.resolutionTargetMinutes), isActive: true },
      });
    }
    const updated = await db.slaPolicy.findMany({ orderBy: { priority: "asc" } });
    return ok({ policies: updated });
  });
}
