// Integration API: branch staff master data.
// GET  (read)  — support employees + branch managers and the round-robin
//                cursor state ("who gets the next ticket"). Filter: ?branch=
// POST (write) — create or update a branch staff member from the LMS, matched
//                by email. Only branch roles can be managed with an API key
//                (SUPPORT_AGENT, BRANCH_MANAGER); admin accounts cannot.

import { randomBytes } from "crypto";
import { fail, handleErrors, ok } from "@/lib/api-response";
import { assertScope, hashPassword, requireApiKey } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { pick, readBody, resolveBranch } from "@/lib/integration";
import { isValidEmail } from "@/lib/types";

const BRANCH_ROLES = ["SUPPORT_AGENT", "BRANCH_MANAGER"];
const SELECT = {
  id: true, name: true, email: true, phone: true, role: true, designation: true, branchId: true,
  isActive: true, availabilityEnabled: true, crmExternalId: true,
  branch: { select: { code: true, name: true } },
} as const;

export async function GET(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "read");
    const url = new URL(request.url);
    let branchId = url.searchParams.get("branchId") || undefined;
    const branchRef = url.searchParams.get("branch") || url.searchParams.get("branchCode") || "";
    if (branchRef) {
      const branch = await resolveBranch(branchRef, { activeOnly: false });
      if (!branch) return fail("BRANCH_NOT_FOUND", `No branch matches "${branchRef}".`, 422);
      branchId = branch.id;
    }

    const employees = await db.staffUser.findMany({
      where: { role: { in: BRANCH_ROLES }, ...(branchId ? { branchId } : {}) },
      orderBy: [{ branchId: "asc" }, { createdAt: "asc" }],
      select: SELECT,
    });
    const cursors = await db.branchCursor.findMany({
      where: branchId ? { branchId } : {},
      include: { branch: { select: { code: true, name: true } } },
    });
    return ok({ employees, cursors, client: client.name });
  });
}

export async function POST(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "write");
    const body = await readBody(request);

    const email = pick(body, "email").toLowerCase();
    if (!isValidEmail(email)) return fail("VALIDATION_ERROR", "A valid email is required to identify the employee.", 422);

    const role = pick(body, "role").toUpperCase();
    if (role && !BRANCH_ROLES.includes(role)) return fail("VALIDATION_ERROR", `role must be one of ${BRANCH_ROLES.join(", ")}.`, 422);

    const branchRef = pick(body, "branch", "branchId", "branchCode", "branchExternalId");
    const branch = branchRef ? await resolveBranch(branchRef, { activeOnly: false }) : null;
    if (branchRef && !branch) return fail("BRANCH_NOT_FOUND", `No branch matches "${branchRef}".`, 422);

    const password = pick(body, "password");
    if (password && password.length < 8) return fail("VALIDATION_ERROR", "password must be at least 8 characters.", 422);

    const existing = await db.staffUser.findUnique({ where: { email } });
    if (existing && !BRANCH_ROLES.includes(existing.role)) {
      return fail("FORBIDDEN", "This account is an administrative user and cannot be changed through the API.", 403);
    }

    const flag = (key: string) => body[key] === true || body[key] === "true" || body[key] === 1;
    const fields: Record<string, unknown> = {};
    if (pick(body, "name")) fields.name = pick(body, "name");
    if ("phone" in body) fields.phone = String(body.phone ?? "").trim();
    if ("designation" in body) fields.designation = String(body.designation ?? "").trim();
    if (role) fields.role = role;
    if (branch) fields.branchId = branch.id;
    if ("isActive" in body) fields.isActive = flag("isActive");
    if ("availabilityEnabled" in body) fields.availabilityEnabled = flag("availabilityEnabled");
    if (pick(body, "externalId", "crmExternalId", "lmsId")) fields.crmExternalId = pick(body, "externalId", "crmExternalId", "lmsId");
    if (password) fields.passwordHash = hashPassword(password);

    let employee;
    let temporaryPassword: string | undefined;
    if (existing) {
      employee = await db.staffUser.update({ where: { id: existing.id }, data: fields, select: SELECT });
    } else {
      if (!fields.name) return fail("VALIDATION_ERROR", "name is required when creating an employee.", 422);
      if (!branch) return fail("VALIDATION_ERROR", "branch is required when creating an employee.", 422);
      if (!password) {
        // Returned once in this response so the LMS can hand it to the employee.
        temporaryPassword = `Fc-${randomBytes(9).toString("base64url")}`;
        fields.passwordHash = hashPassword(temporaryPassword);
      }
      employee = await db.staffUser.create({
        data: {
          name: String(fields.name),
          email,
          passwordHash: String(fields.passwordHash),
          role: role || "SUPPORT_AGENT",
          ...fields,
        },
        select: SELECT,
      });
    }

    await logAudit({
      actorName: `API:${client.name}`,
      actorRole: "API_CLIENT",
      action: "MASTER_DATA_SYNC",
      newValue: employee.email,
      details: `Employee ${existing ? "updated" : "created"}: ${employee.name} (${employee.role})`,
    });
    return ok({ employee, created: !existing, ...(temporaryPassword ? { temporaryPassword } : {}) }, { status: existing ? 200 : 201 });
  });
}
