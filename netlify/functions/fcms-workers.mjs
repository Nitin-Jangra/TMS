// Netlify Scheduled Function: triggers the FC-CMS closure + assignment sweeps
// on a cron schedule. Serverless functions cannot run in-process timers, so
// this replaces the Node instrumentation interval used in local/long-running
// deployments.
//
// Required environment variables (Netlify UI → Site settings → Environment):
//   FCMS_BASE_URL  e.g. https://<your-site>.netlify.app
//   FCMS_API_KEY   an integration key with "write" scope (Root Admin → Integration API Keys)

export default async function handler() {
  const base = process.env.FCMS_BASE_URL;
  const key = process.env.FCMS_API_KEY;

  if (!base || !key) {
    return new Response(JSON.stringify({ ok: false, reason: "FCMS_BASE_URL / FCMS_API_KEY not set" }), { status: 500 });
  }

  try {
    const res = await fetch(`${base}/api/v1/integration/workers/run`, {
      method: "POST",
      headers: { "x-api-key": key, "content-type": "application/json" },
      body: "{}",
    });
    const body = await res.json().catch(() => ({}));
    return new Response(JSON.stringify({ ok: res.ok, status: res.status, body }), {
      status: res.ok ? 200 : 502,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 502 });
  }
};
