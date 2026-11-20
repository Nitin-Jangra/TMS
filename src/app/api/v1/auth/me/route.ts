import { getSessionUser } from "@/lib/auth";
import { handleErrors, ok } from "@/lib/api-response";
import { getUserPermissions } from "@/lib/permissions";

export async function GET() {
  return handleErrors(async () => {
    const user = await getSessionUser();
    const permissions = user ? await getUserPermissions(user) : null;
    return ok({ user, permissions });
  });
}
