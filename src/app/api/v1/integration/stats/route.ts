// Integration API: aggregate stats (branch x status matrix + SLA averages).

import { handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { getMasterOverview } from "@/lib/branch-stats";

export async function GET(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "read");
    const overview = await getMasterOverview();
    return ok({ ...overview, client: client.name });
  });
}
