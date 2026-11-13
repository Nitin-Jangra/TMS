import { getSessionUser } from "@/lib/auth";
import { handleErrors, ok } from "@/lib/api-response";

export async function GET() {
  return handleErrors(async () => {
    const user = await getSessionUser();
    return ok({ user });
  });
}
