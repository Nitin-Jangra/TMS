import { clearSessionCookie } from "@/lib/auth";
import { handleErrors, ok } from "@/lib/api-response";

export async function POST() {
  return handleErrors(async () => {
    await clearSessionCookie();
    return ok({ signedOut: true });
  });
}
