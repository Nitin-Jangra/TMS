// Integration API: worker trigger for external schedulers (Netlify Scheduled
// Functions, Supabase cron, CRM/LMS jobs). The sweeps are idempotent — overlap
// is harmless. Scope "write" required.

import { handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { runAllSweeps } from "@/lib/sweeps";

export async function POST(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "write");
    const result = await runAllSweeps();
    return ok({ ...result, triggeredBy: client.name });
  });
}
