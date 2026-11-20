// Root Admin permissions & feature flags API.
// Allows Root Admin to turn on/off every single feature for any designation or role.

import { handleErrors, ok, fail } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import {
  getPermissionsMatrix,
  savePermissionsMatrix,
  PERMISSION_DESCRIPTIONS,
  DEFAULT_ROLE_PERMISSIONS,
  type RolePermissions,
} from "@/lib/permissions";

export async function GET() {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN"]);
    const matrix = await getPermissionsMatrix();
    return ok({
      matrix,
      descriptions: PERMISSION_DESCRIPTIONS,
      defaultPresets: DEFAULT_ROLE_PERMISSIONS,
    });
  });
}

export async function PUT(request: Request) {
  return handleErrors(async () => {
    const user = await requireRole(["ROOT_ADMIN"]);
    const body = await request.json().catch(() => null);
    const incomingMatrix = (body as { matrix?: Record<string, RolePermissions>; reason?: string })?.matrix;
    const reason = String((body as { reason?: string })?.reason || "Updated role and designation permissions");

    if (!incomingMatrix || typeof incomingMatrix !== "object") {
      return fail("VALIDATION_ERROR", "A valid permissions matrix object is required.", 422);
    }

    // Ensure ROOT_ADMIN always remains full-access as safety invariant
    incomingMatrix.ROOT_ADMIN = { ...DEFAULT_ROLE_PERMISSIONS.ROOT_ADMIN };

    await savePermissionsMatrix(incomingMatrix, { id: user.id, name: user.name }, reason);
    const updated = await getPermissionsMatrix();
    return ok({ matrix: updated });
  });
}
