// Outbound webhooks — pushes ticket events to the FitClass LMS (or any other
// system) so it does not have to poll the API.
//
// Configuration lives in system settings (Root Admin → Settings, or
// PUT /api/v1/integration/webhook):
//   webhook_url     HTTPS endpoint that receives the events (blank = disabled)
//   webhook_secret  shared secret used to sign every delivery
//
// Every delivery is a JSON POST with these headers:
//   X-FitClass-Event      e.g. ticket.created
//   X-FitClass-Delivery   unique id of this delivery
//   X-FitClass-Signature  sha256=<hex HMAC-SHA256 of the raw body, keyed with webhook_secret>
//
// Delivery never throws and never blocks or fails the ticket operation that
// triggered it. A failed delivery is retried once and then recorded in the
// audit log (action WEBHOOK_FAILED).

import { createHmac, randomBytes } from "crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { db, onCloudflare } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const WEBHOOK_EVENTS = [
  "ticket.created",
  "ticket.assigned",
  "ticket.status_changed",
  "ticket.resolved",
  "ticket.reopened",
  "ticket.closed",
  "ticket.escalated",
  "ticket.transferred",
  "ticket.message_added",
  "webhook.test",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const TIMEOUT_MS = 8_000;

export function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && process.env.NODE_ENV !== "production");
  } catch {
    return false;
  }
}

/** Ticket snapshot sent with every event (same shape as the integration API). */
export async function ticketSnapshot(ticketId: string) {
  const t = await db.ticket.findUnique({
    where: { id: ticketId },
    include: {
      branch: { select: { id: true, code: true, name: true, city: true, crmExternalId: true } },
      category: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true, crmExternalId: true } },
    },
  });
  if (!t) return null;
  return {
    ticketNumber: t.ticketNumber,
    status: t.status,
    priority: t.priority,
    source: t.source,
    customerName: t.customerName,
    customerPhone: t.customerPhone,
    customerEmail: t.customerEmail,
    description: t.description,
    branch: t.branch,
    category: t.category,
    assignee: t.assignee,
    escalated: !!t.escalatedAt,
    reopenCount: t.reopenCount,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    assignedAt: t.assignedAt,
    resolvedAt: t.resolvedAt,
    autoCloseAt: t.autoCloseAt,
    closedAt: t.closedAt,
    slaResponseDueAt: t.slaResponseDueAt,
    slaResolutionDueAt: t.slaResolutionDueAt,
  };
}

async function post(url: string, secret: string, event: WebhookEvent, body: string, deliveryId: string): Promise<void> {
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "FitClass-CMS-Webhook/1.0",
      "x-fitclass-event": event,
      "x-fitclass-delivery": deliveryId,
      "x-fitclass-signature": `sha256=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Receiver answered HTTP ${res.status}`);
}

/** Sends one event now. Returns the outcome instead of throwing. */
export async function deliverWebhook(
  event: WebhookEvent,
  ticketId: string | null,
  data: Record<string, unknown> = {},
): Promise<{ delivered: boolean; skipped?: string; error?: string }> {
  try {
    const settings = await getSettings();
    const url = (settings.webhook_url || "").trim();
    if (!url) return { delivered: false, skipped: "No webhook_url configured." };
    if (!isValidWebhookUrl(url)) return { delivered: false, error: "webhook_url must be an https:// URL." };

    const deliveryId = randomBytes(12).toString("hex");
    const body = JSON.stringify({
      id: deliveryId,
      event,
      occurredAt: new Date().toISOString(),
      ticket: ticketId ? await ticketSnapshot(ticketId) : null,
      data,
    });

    let lastError = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await post(url, settings.webhook_secret || "", event, body, deliveryId);
        return { delivered: true };
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Unknown error";
      }
    }
    console.error(`[fcms] webhook ${event} failed:`, lastError);
    await db.auditLog
      .create({
        data: {
          ticketId,
          actorRole: "SYSTEM",
          actorName: "Webhook",
          action: "WEBHOOK_FAILED",
          newValue: event,
          details: lastError.slice(0, 300),
        },
      })
      .catch(() => undefined);
    return { delivered: false, error: lastError };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    console.error(`[fcms] webhook ${event} failed:`, error);
    return { delivered: false, error };
  }
}

/** Fire-and-forget: queues an event without delaying the caller. */
export async function emitWebhook(event: WebhookEvent, ticketId: string, data: Record<string, unknown> = {}): Promise<void> {
  // deliverWebhook never rejects, so this promise is safe to leave un-awaited.
  const delivery = deliverWebhook(event, ticketId, data).then(() => undefined);
  if (!onCloudflare) return; // Node.js: finishes in the background
  try {
    getCloudflareContext().ctx.waitUntil(delivery);
  } catch {
    await delivery; // no request context — wait inline
  }
}
