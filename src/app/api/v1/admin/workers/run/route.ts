// Manual worker trigger (Root Admin): run the closure sweep + assignment
// retry immediately. Useful for testing automatic closure with a short window.

import { handleErrors, ok } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { runAllSweeps } from "@/lib/sweeps";
import { runDigestSweep } from "@/lib/escalation";

export async function POST(request: Request) {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN"]);
    const result = await runAllSweeps();
    // ?digest=now sends today's digest immediately (testing / on demand).
    const digestNow = new URL(request.url).searchParams.get("digest") === "now";
    return ok({ ...result, ...(digestNow ? { digest: await runDigestSweep(new Date(), { force: true }) } : {}) });
  });
}
