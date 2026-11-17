// Integration API: branch master data.
// GET  (read)  — branches (active only unless ?includeInactive=true).
// POST (write) — create or update a branch from the LMS. The branch is matched
//                by "code" (or by "externalId" when no code is sent); unknown
//                branches are created. Only the fields sent are changed.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { pick, readBody } from "@/lib/integration";
import { isValidEmail } from "@/lib/types";

const SELECT = {
  id: true, code: true, name: true, city: true, address: true,
  notificationEmail: true, isActive: true, crmExternalId: true, updatedAt: true,
} as const;

export async function GET(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "read");
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    const branches = await db.branch.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { code: "asc" },
      select: SELECT,
    });
    return ok({ branches, total: branches.length, client: client.name });
  });
}

export async function POST(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "write");
    const body = await readBody(request);

    const code = pick(body, "code", "branchCode").toUpperCase();
    const externalId = pick(body, "externalId", "crmExternalId", "lmsId");
    if (!code && !externalId) return fail("VALIDATION_ERROR", "code or externalId is required to identify the branch.", 422);
    if (code && !/^[A-Z0-9_-]{2,20}$/.test(code)) return fail("VALIDATION_ERROR", "code must be 2-20 letters, digits, - or _.", 422);

    const email = "notificationEmail" in body ? String(body.notificationEmail ?? "").trim() : undefined;
    if (email && !isValidEmail(email)) return fail("VALIDATION_ERROR", "notificationEmail is not a valid email address.", 422);

    const fields: Record<string, unknown> = {};
    if (pick(body, "name")) fields.name = pick(body, "name");
    if ("city" in body) fields.city = String(body.city ?? "").trim();
    if ("address" in body) fields.address = String(body.address ?? "").trim();
    if (email !== undefined) fields.notificationEmail = email;
    if ("isActive" in body) fields.isActive = body.isActive === true || body.isActive === "true" || body.isActive === 1;
    if (externalId) fields.crmExternalId = externalId;

    const existing = code
      ? await db.branch.findUnique({ where: { code } })
      : await db.branch.findFirst({ where: { crmExternalId: externalId } });

    let branch;
    if (existing) {
      branch = await db.branch.update({ where: { id: existing.id }, data: fields, select: SELECT });
    } else {
      if (!code) return fail("VALIDATION_ERROR", "code is required when creating a new branch.", 422);
      if (!fields.name) return fail("VALIDATION_ERROR", "name is required when creating a new branch.", 422);
      branch = await db.branch.create({ data: { code, name: String(fields.name), ...fields }, select: SELECT });
    }

    await logAudit({
      actorName: `API:${client.name}`,
      actorRole: "API_CLIENT",
      action: "MASTER_DATA_SYNC",
      newValue: branch.code,
      details: `Branch ${existing ? "updated" : "created"}: ${branch.name}`,
    });
    return ok({ branch, created: !existing }, { status: existing ? 200 : 201 });
  });
}
