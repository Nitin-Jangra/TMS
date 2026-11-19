// One-Time Password (OTP) verification engine.
// Stateless cryptographic token architecture (HMAC-SHA256).
// No DB table migration required; runs seamlessly in Node.js and Cloudflare Workers (nodejs_compat).

import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { normalizePhone } from "@/lib/types";

function otpSecret(): string {
  return (
    process.env.OTP_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.DATABASE_URL ||
    "fitclass-otp-signature-secret-key-2026"
  );
}

/**
 * Generates a 6-digit numeric OTP (e.g. 100000 - 999999).
 */
export function generateNumericOtp(length = 6): string {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return randomInt(min, max + 1).toString();
}

/**
 * Creates an HMAC-signed token binding email + normalized phone + code + expiry.
 * Structure: Base64Url({ email, phone, expiresAt }).HMAC_Signature
 */
export function createOtpVerificationToken(
  email: string,
  phone: string,
  code: string,
  ttlSeconds = 600
): string {
  const normEmail = email.trim().toLowerCase();
  const normPhone = normalizePhone(phone);
  const expiresAt = Date.now() + ttlSeconds * 1000;

  const dataPayload = JSON.stringify({ email: normEmail, phone: normPhone, expiresAt });
  const payloadB64 = Buffer.from(dataPayload, "utf-8").toString("base64url");
  const signature = createHmac("sha256", otpSecret())
    .update(`${normEmail}|${normPhone}|${code.trim()}|${expiresAt}`)
    .digest("base64url");

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a 6-digit code against a signed OTP verification token.
 */
export function verifyOtpCode(
  email: string,
  phone: string,
  code: string,
  token: string
): { valid: boolean; error?: string } {
  try {
    if (!token || typeof token !== "string" || !token.includes(".")) {
      return { valid: false, error: "Invalid verification token format." };
    }

    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) {
      return { valid: false, error: "Malformed verification token." };
    }

    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadJson) as { email: string; phone: string; expiresAt: number };

    const normEmail = email.trim().toLowerCase();
    const normPhone = normalizePhone(phone);

    if (payload.email !== normEmail) {
      return { valid: false, error: "Email does not match this verification request." };
    }

    if (normPhone && payload.phone && payload.phone !== normPhone) {
      return { valid: false, error: "Mobile number does not match this verification request." };
    }

    if (Date.now() > payload.expiresAt) {
      return { valid: false, error: "Verification code has expired. Please request a new one." };
    }

    const expectedSignature = createHmac("sha256", otpSecret())
      .update(`${normEmail}|${payload.phone}|${code.trim()}|${payload.expiresAt}`)
      .digest("base64url");

    const bufA = Buffer.from(signature);
    const bufB = Buffer.from(expectedSignature);

    if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
      return { valid: false, error: "Invalid 6-digit verification code. Please check and try again." };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Verification failed. Please request a new code." };
  }
}

/**
 * Creates a signed submission proof token after successful OTP verification.
 * The client attaches this to the complaint payload to prove identity verification.
 */
export function createSubmissionProofToken(
  email: string,
  phone: string,
  ttlSeconds = 900
): string {
  const normEmail = email.trim().toLowerCase();
  const normPhone = normalizePhone(phone);
  const expiresAt = Date.now() + ttlSeconds * 1000;

  const dataPayload = JSON.stringify({ email: normEmail, phone: normPhone, expiresAt });
  const payloadB64 = Buffer.from(dataPayload, "utf-8").toString("base64url");
  const signature = createHmac("sha256", otpSecret())
    .update(`submission-proof|${normEmail}|${normPhone}|${expiresAt}`)
    .digest("base64url");

  return `${payloadB64}.${signature}`;
}

/**
 * Validates the submission proof token sent during ticket creation.
 */
export function verifySubmissionProofToken(
  email: string,
  phone: string,
  submissionToken: string
): { valid: boolean; error?: string } {
  try {
    if (!submissionToken || typeof submissionToken !== "string" || !submissionToken.includes(".")) {
      return { valid: false, error: "Missing or invalid identity verification token." };
    }

    const [payloadB64, signature] = submissionToken.split(".");
    if (!payloadB64 || !signature) {
      return { valid: false, error: "Malformed verification token." };
    }

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8")) as {
      email: string;
      phone: string;
      expiresAt: number;
    };

    const normEmail = email.trim().toLowerCase();
    const normPhone = normalizePhone(phone);

    if (payload.email !== normEmail) {
      return { valid: false, error: "Submission email does not match verified identity." };
    }

    if (normPhone && payload.phone && payload.phone !== normPhone) {
      return { valid: false, error: "Submission phone does not match verified identity." };
    }

    if (Date.now() > payload.expiresAt) {
      return { valid: false, error: "Verification session has expired. Please verify identity again." };
    }

    const expectedSignature = createHmac("sha256", otpSecret())
      .update(`submission-proof|${normEmail}|${normPhone}|${payload.expiresAt}`)
      .digest("base64url");

    const bufA = Buffer.from(signature);
    const bufB = Buffer.from(expectedSignature);

    if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
      return { valid: false, error: "Invalid verification proof signature." };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Identity verification check failed." };
  }
}
