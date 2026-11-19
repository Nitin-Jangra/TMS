// Public OTP dispatch endpoint for incident submission.
// Sends a 6-digit verification code to the requester's email.
// Stateless cryptographic verification token returned in response.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isValidEmail, isValidPhone, normalizePhone } from "@/lib/types";
import { generateNumericOtp, createOtpVerificationToken } from "@/lib/otp";
import { sendEmail, renderOtpEmail } from "@/lib/email";

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
    const rawName = String(b.name || b.customerName || "").trim();

    if (!rawEmail || !isValidEmail(rawEmail)) {
      return fail("VALIDATION_ERROR", "A valid email address is required to receive the verification code.", 422, {
        email: "Invalid email address.",
      });
    }

    if (rawPhone && !isValidPhone(rawPhone)) {
      return fail("VALIDATION_ERROR", "Please provide a valid 10-12 digit mobile number.", 422, {
        phone: "Invalid phone number.",
      });
    }

    // Rate limiting: 6 OTP requests per 10 minutes per IP/email
    const normEmail = rawEmail.toLowerCase();
    const ipLimit = rateLimit(`otp-ip:${ip}`, 10, 600);
    if (!ipLimit.allowed) {
      return fail(
        "RATE_LIMITED",
        `Too many OTP requests from this connection. Please wait ${ipLimit.retryAfterSeconds} seconds.`,
        429
      );
    }

    const emailLimit = rateLimit(`otp-email:${normEmail}`, 5, 600);
    if (!emailLimit.allowed) {
      return fail(
        "RATE_LIMITED",
        `Too many OTP requests for this email. Please wait ${emailLimit.retryAfterSeconds} seconds.`,
        429
      );
    }

    const code = generateNumericOtp(6);
    const ttlSeconds = 600; // 10 minutes
    const token = createOtpVerificationToken(rawEmail, rawPhone, code, ttlSeconds);

    const emailContent = renderOtpEmail({
      customerName: rawName,
      otpCode: code,
      expiresInMinutes: 10,
    });

    const emailResult = await sendEmail({
      to: rawEmail,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });

    return ok(
      {
        message: "Verification code sent to your email address.",
        token,
        expiresInSeconds: ttlSeconds,
        simulated: emailResult.simulated,
        devCode:
          process.env.NODE_ENV !== "production" || emailResult.simulated
            ? code
            : undefined,
      },
      { status: 200 }
    );
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
