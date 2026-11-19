// All background sweeps in one place. Every sweep is idempotent, so running
// them often (every minute in-process, or from an external cron on
// Cloudflare: POST /api/v1/integration/workers/run) is safe.

import { runAssignmentRetrySweep, runClosureSweep } from "@/lib/closure";
import { runDigestSweep, runEscalationSweep } from "@/lib/escalation";

async function safe<T>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[fcms] ${name} sweep error:`, err);
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function runAllSweeps() {
  return {
    closure: await safe("closure", runClosureSweep),
    assignment: await safe("assignment retry", runAssignmentRetrySweep),
    escalation: await safe("escalation", () => runEscalationSweep()),
    digest: await safe("digest", () => runDigestSweep()),
  };
}
