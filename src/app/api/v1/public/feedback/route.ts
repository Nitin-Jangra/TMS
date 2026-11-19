// Member satisfaction rating (public, no login).
// GET  ?ticketNumber=FC-2026-000123&t=<token from the email link>  → rating page state
// POST { ticketNumber, rating: 1-5, comment?, token? | mobileNumber? } → save rating
// Either the signed token from the "resolved" email or the registered mobile
// number (as on the tracking page) proves the member owns the ticket.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { FeedbackError, getFeedbackState, submitFeedback } from "@/lib/feedback";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  return handleErrors(async () => {
    const url = new URL(request.url);
    const limit = rateLimit(`feedback-get:${clientIp(request)}`, 60, 600);
    if (!limit.allowed) return fail("RATE_LIMITED", `Too many requests. Try again in ${limit.retryAfterSeconds} seconds.`, 429);
    try {
      const state = await getFeedbackState(url.searchParams.get("ticketNumber") || "", { token: url.searchParams.get("t") || "" });
      return ok(state);
    } catch (err) {
      if (err instanceof FeedbackError) return fail(err.code, err.message, err.status);
      throw err;
    }
  });
}

export async function POST(request: Request) {
  return handleErrors(async () => {
    const limit = rateLimit(`feedback:${clientIp(request)}`, 10, 600);
    if (!limit.allowed) return fail("RATE_LIMITED", `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.`, 429);
    const body = ((await request.json().catch(() => null)) || {}) as Record<string, unknown>;
    try {
      const feedback = await submitFeedback({
        ticketNumber: String(body.ticketNumber || ""),
        rating: Number(body.rating),
        comment: String(body.comment || ""),
        token: String(body.token || ""),
        phone: String(body.mobileNumber || ""),
      });
      return ok({ feedback }, { status: 201 });
    } catch (err) {
      if (err instanceof FeedbackError) return fail(err.code, err.message, err.status);
      throw err;
    }
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
