// Customer ticket tracking (Ticket ID + registered mobile).
// Rate-limited, progressive throttling on failures, generic error messages,
// customer-access logging. Phone numbers never travel in URL query strings —
// this endpoint is POST-only.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { clientIp, rateLimit, recordTrackingFailure, clearTrackingFailures, trackingThrottle } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { trackTicket, TicketError } from "@/lib/tickets";

export async function POST(request: Request) {
  return handleErrors(async () => {
    const ip = clientIp(request);

    const throttle = trackingThrottle(ip);
    if (throttle.blocked) {
      return fail("TEMPORARILY_BLOCKED", `Too many unsuccessful tracking attempts. Try again in ${throttle.retryAfterSeconds} seconds.`, 429);
    }
    const limit = rateLimit(`track:${ip}`, 20, 600);
    if (!limit.allowed) {
      return fail("RATE_LIMITED", `Too many tracking requests. Try again in ${limit.retryAfterSeconds} seconds.`, 429);
    }

    const body = await request.json().catch(() => null);
    const ticketNumber = String((body as { ticketNumber?: string })?.ticketNumber || "").trim();
    const phone = String((body as { mobileNumber?: string })?.mobileNumber || "").trim();
    if (!ticketNumber || !phone) {
      return fail("VALIDATION_ERROR", "Ticket ID and registered mobile number are required.", 422);
    }

    try {
      const ticket = await trackTicket(ticketNumber, phone);
      await db.customerAccessLog.create({ data: { ip, action: "TRACK", success: true } });
      clearTrackingFailures(ip);
      return ok({ ticket });
    } catch (err) {
      if (err instanceof TicketError && err.code === "TRACK_NOT_FOUND") {
        await db.customerAccessLog.create({ data: { ip, action: "TRACK", success: false, detail: "Ticket/mobile mismatch" } });
        recordTrackingFailure(ip);
        return fail("TRACK_NOT_FOUND", err.message, 404);
      }
      throw err;
    }
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-requested-with",
    },
  });
}
