// Staff login (development credential store; production uses the CRM auth
// adapter with MFA for privileged accounts). Login rate limiting included.

import { db } from "@/lib/db";
import { AuthError, setSessionCookie, verifyPassword } from "@/lib/auth";
import { handleErrors, ok, fail } from "@/lib/api-response";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { roleHome, type Role } from "@/lib/types";

export async function POST(request: Request) {
  return handleErrors(async () => {
    const ip = clientIp(request);
    const limit = rateLimit(`login:${ip}`, 10, 300);
    if (!limit.allowed) {
      return fail("RATE_LIMITED", `Too many login attempts. Try again in ${limit.retryAfterSeconds} seconds.`, 429);
    }

    const body = await request.json().catch(() => null);
    const email = String((body as { email?: string })?.email || "").trim().toLowerCase();
    const password = String((body as { password?: string })?.password || "");
    if (!email || !password) {
      return fail("VALIDATION_ERROR", "Email and password are required.", 422);
    }

    const user = await db.staffUser.findUnique({ where: { email }, include: { branch: { select: { name: true } } } });
    const valid = user && user.isActive && verifyPassword(password, user.passwordHash);
    if (!valid) {
      await logAudit({ actorName: email || "unknown", actorRole: "UNKNOWN", action: "AUTH_FAILURE", details: "Invalid credentials", ip });
      // Generic message — no user-existence leaks.
      throw new AuthError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
    }

    await setSessionCookie(user.id);
    await logAudit({ actor: { id: user.id, name: user.name, email: user.email, role: user.role as Role, branchId: user.branchId }, action: "AUTH_SUCCESS", ip });

    return ok({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roleHome: roleHome(user.role as Role),
        branchId: user.branchId,
        branchName: user.branch?.name ?? null,
        designation: user.designation,
      },
    });
  });
}
