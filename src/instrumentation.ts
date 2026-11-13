// Next.js instrumentation hook — starts durable background workers exactly
// once per server process. Timers only TRIGGER idempotent sweeps; all state
// lives in the database (ticket_closure_jobs, unassigned tickets), so restarts
// are safe and nothing is lost.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as unknown as { __fcmsWorker?: boolean };
  if (g.__fcmsWorker) return;
  g.__fcmsWorker = true;

  const { runClosureSweep, runAssignmentRetrySweep } = await import("@/lib/closure");

  const sweep = async () => {
    try {
      await runClosureSweep();
    } catch (err) {
      console.error("[fcms] closure sweep error:", err);
    }
    try {
      await runAssignmentRetrySweep();
    } catch (err) {
      console.error("[fcms] assignment retry sweep error:", err);
    }
  };

  // Initial sweep shortly after boot, then every 60 seconds.
  setTimeout(sweep, 5000).unref?.();
  const timer = setInterval(sweep, 60000);
  if (typeof timer.unref === "function") timer.unref();
  console.log("[fcms] background workers registered (closure + assignment retry, 60s interval)");
}
