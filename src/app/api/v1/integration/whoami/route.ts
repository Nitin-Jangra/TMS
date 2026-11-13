// Integration API: credential self-check. Lets integrators verify a key.

import { handleErrors, ok } from "@/lib/api-response";
import { requireApiKey } from "@/lib/auth";

export async function GET(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    return ok({ client: client.name, scopes: client.scopes, status: "active" });
  });
}
