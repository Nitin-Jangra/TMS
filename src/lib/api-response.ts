// Consistent JSON response envelope + correlation IDs + secure error handling.
// Never leaks stack traces, database errors or internal details to clients.

import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  correlationId: string;
}

export function newCorrelationId(): string {
  return randomBytes(8).toString("hex");
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, Idempotency-Key, x-requested-with",
};

export function ok<T>(data: T, init?: { status?: number; headers?: Record<string, string> }): NextResponse<ApiEnvelope<T>> {
  const correlationId = newCorrelationId();
  return NextResponse.json(
    { success: true, data, correlationId } satisfies ApiEnvelope<T>,
    {
      status: init?.status ?? 200,
      headers: {
        "x-correlation-id": correlationId,
        ...CORS_HEADERS,
        ...(init?.headers || {}),
      },
    },
  );
}

export function fail(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<ApiEnvelope<never>> {
  const correlationId = newCorrelationId();
  return NextResponse.json(
    { success: false, error: { code, message, details }, correlationId } satisfies ApiEnvelope<never>,
    {
      status,
      headers: {
        "x-correlation-id": correlationId,
        ...CORS_HEADERS,
      },
    },
  );
}

/** Wrap a route handler: converts thrown AuthError/Zod/TicketError/generic errors to safe envelopes. */
export function handleErrors(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  return handler().catch((err: unknown) => {
    if (err instanceof AuthError) {
      return fail(err.code, err.message, err.status);
    }
    if (err instanceof Error && err.name === "ZodError") {
      return fail("VALIDATION_ERROR", "Invalid request data.", 422);
    }
    if (err && typeof err === "object" && "code" in err && typeof (err as { code: string }).code === "string") {
      const code = (err as { code: string }).code;
      const message = (err as { message?: string }).message || "Request could not be processed.";
      return fail(code, message, 422);
    }
    // Log server-side; return actionable error message to the client.
    console.error("[fcms] unhandled API error:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
    return fail("INTERNAL_ERROR", message, 500);
  });
}

export function paginationParams(url: URL): { page: number; pageSize: number; skip: number; take: number } {
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || "20") || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
