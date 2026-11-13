// Integration API: worker trigger for external schedulers (Netlify Scheduled
// Functions, Supabase cron, CRM/LMS jobs). The sweeps are idempotent — overlap
// is harmless. Scope "write" required.

import { handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { runClosureSweep, runAssignmentRetrySweep } from "@/lib/closure";

export async function POST(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "write");
    const closure = await runClosureSweep();
    const assignment = await runAssignmentRetrySweep();
    return ok({ closure, assignment, triggeredBy: client.name });
  });
}
