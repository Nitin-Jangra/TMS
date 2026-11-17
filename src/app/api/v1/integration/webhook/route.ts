// Integration API: outbound webhook configuration (see src/lib/webhooks.ts).
// GET (read)  — current endpoint, whether a signing secret is set, event list.
// PUT (write) — set { "url": "https://lms.example/hooks/fitclass", "secret": "..." }.
//               Send "url": "" to switch webhooks off.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { readBody } from "@/lib/integration";
import { getSettings, updateSettings } from "@/lib/settings";
import { isValidWebhookUrl, WEBHOOK_EVENTS } from "@/lib/webhooks";

async function current() {
  const settings = await getSettings();
  const url = (settings.webhook_url || "").trim();
  return {
    url,
    enabled: !!url,
    secretConfigured: !!settings.webhook_secret,
    events: WEBHOOK_EVENTS,
    signatureHeader: "X-FitClass-Signature",
    signatureFormat: "sha256=<hex HMAC-SHA256 of the raw request body, keyed with the secret>",
  };
}

export async function GET(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "read");
    return ok(await current());
  });
}

export async function PUT(request: Request) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "write");
    const body = await readBody(request);

    const changes: { key: string; value: string; reason: string }[] = [];
    const reason = `Changed via integration API by ${client.name}`;
    if ("url" in body) {
      const url = String(body.url ?? "").trim();
      if (url && !isValidWebhookUrl(url)) return fail("VALIDATION_ERROR", "url must be an https:// URL (or empty to disable).", 422);
      changes.push({ key: "webhook_url", value: url, reason });
    }
    if ("secret" in body) {
      const secret = String(body.secret ?? "");
      if (secret && secret.length < 16) return fail("VALIDATION_ERROR", "secret must be at least 16 characters.", 422);
      changes.push({ key: "webhook_secret", value: secret, reason });
    }
    if (!changes.length) return fail("VALIDATION_ERROR", 'Send "url" and/or "secret".', 422);

    await updateSettings(changes, { name: `API:${client.name}` });
    return ok(await current());
  });
}
