// Customer reopening of a RESOLVED ticket within the configured window.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { clientIp, rateLimit, recordTrackingFailure } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { reopenTicket, TicketError } from "@/lib/tickets";

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  return handleErrors(async () => {
    const { ticketId } = await params;
    const ip = clientIp(request);
    const limit = rateLimit(`reopen:${ip}`, 6, 900);
    if (!limit.allowed) {
      return fail("RATE_LIMITED", `Too many requests. Try again in ${limit.retryAfterSeconds} seconds.`, 429);
    }

    const body = await request.json().catch(() => null);
    const mobileNumber = String((body as { mobileNumber?: string })?.mobileNumber || "").trim();
    const reason = String((body as { reason?: string })?.reason || "").trim();
    if (!mobileNumber) return fail("VALIDATION_ERROR", "Registered mobile number is required.", 422);
    if (reason.length < 10 || reason.length > 1000) {
      return fail("VALIDATION_ERROR", "Please provide a reopening reason (minimum 10 characters).", 422, { reason: "Reason must be 10-1000 characters." });
    }

    try {
      const result = await reopenTicket(ticketId, mobileNumber, reason, { ip });
      await db.customerAccessLog.create({ data: { ip, action: "REOPEN", success: true } });
      return ok({
        ticketNumber: result.ticketNumber,
        status: result.status,
        message: "Your ticket has been reopened. Our support team will continue working on it.",
      });
    } catch (err) {
      if (err instanceof TicketError && err.code === "TRACK_NOT_FOUND") {
        recordTrackingFailure(ip);
        return fail("TRACK_NOT_FOUND", err.message, 404);
      }
      if (err instanceof TicketError) {
        return fail(err.code, err.message, 409);
      }
      throw err;
    }
  });
}
