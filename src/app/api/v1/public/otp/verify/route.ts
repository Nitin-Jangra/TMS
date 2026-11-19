// Public OTP verification endpoint.
// Validates 6-digit code against HMAC token and issues a signed submission proof token.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isValidEmail } from "@/lib/types";
import { verifyOtpCode, createSubmissionProofToken } from "@/lib/otp";

export async function POST(request: Request) {
  return handleErrors(async () => {
    const ip = clientIp(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return fail("VALIDATION_ERROR", "Invalid request body.", 422);
    }

    const b = body as Record<string, unknown>;
    const rawEmail = String(b.email || b.customerEmail || "").trim();
    const rawPhone = String(b.phone || b.customerPhone || "").trim();
    const rawCode = String(b.code || b.otp || "").trim();
    const rawToken = String(b.token || b.otpToken || "").trim();

    if (!rawEmail || !isValidEmail(rawEmail)) {
      return fail("VALIDATION_ERROR", "Please provide a valid email address.", 422);
    }

    if (!rawCode || rawCode.length !== 6 || !/^\d{6}$/.test(rawCode)) {
      return fail("VALIDATION_ERROR", "Please enter the complete 6-digit verification code.", 422, {
        code: "Invalid 6-digit code.",
      });
    }

    if (!rawToken) {
      return fail("VALIDATION_ERROR", "Missing verification token. Please request a new code.", 422);
    }

    // Rate limiting: 10 attempts per IP per 5 minutes to prevent brute forcing
    const limit = rateLimit(`otp-verify:${ip}`, 10, 300);
    if (!limit.allowed) {
      return fail(
        "RATE_LIMITED",
        `Too many verification attempts. Please wait ${limit.retryAfterSeconds} seconds.`,
        429
      );
    }

    const verification = verifyOtpCode(rawEmail, rawPhone, rawCode, rawToken);
    if (!verification.valid) {
      return fail("INVALID_OTP", verification.error || "Invalid or expired verification code.", 400);
    }

    // Generate submission proof token valid for 15 minutes
    const submissionToken = createSubmissionProofToken(rawEmail, rawPhone, 900);

    return ok({
      verified: true,
      submissionToken,
      message: "Identity verified successfully. You may now submit your incident request.",
    });
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
