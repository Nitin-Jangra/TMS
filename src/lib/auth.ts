// Authentication: local credential store (development) + HMAC-signed session cookie.
// Production swaps password verification for the CRM auth adapter; the session
// layer stays identical. Secrets come from environment variables, never hardcoded
// business data. A stable dev fallback secret is derived if env is missing.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { Role, SessionUser } from "@/lib/types";

export const SESSION_COOKIE = "fcms_session";
const SESSION_TTL_HOURS = 12;

function sessionSecret(): string {
  return process.env.SESSION_SECRET || process.env.DATABASE_URL || "fcms-dev-secret-fallback";
}

// ---------------------------------------------------------------------------
// Passwords (scrypt; no plaintext storage)
//
// Stored format (self-describing cost):
//   scrypt$<N>$<r>:<salt>:<hash>      e.g. scrypt$16384$8:a1b2…:9f3e…
// Legacy format still verified:
//   scrypt:<salt>:<hash>              defaults to N=16384, r=8
//
// Cost is embedded because deployments differ: Cloudflare Workers free plan
// enforces a 10 ms CPU budget per request, so the hosted seed uses lower
// parameters (N=1024) than local development. Every hash carries its own
// cost, so old and new hashes verify side by side with zero configuration.
// ---------------------------------------------------------------------------

const SCRYPT_KEYLEN = 64;
const DEFAULT_SCRYPT_N = 16384;
const DEFAULT_SCRYPT_R = 8;

function parseScryptParams(stored: string): { n: number; r: number } {
  const scheme = stored.split(":")[0] || "";
  const match = /^scrypt\$(\d+)\$(\d+)$/.exec(scheme);
  if (match) {
    const n = Math.max(1024, Number(match[1]));
    const r = Math.max(1, Number(match[2]));
    return { n, r };
  }
  return { n: DEFAULT_SCRYPT_N, r: DEFAULT_SCRYPT_R };
}

export function hashPassword(password: string): string {
  const n = Math.max(1024, Number(process.env.FCMS_SCRYPT_N || DEFAULT_SCRYPT_N));
  const r = Math.max(1, Number(process.env.FCMS_SCRYPT_R || DEFAULT_SCRYPT_R));
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: n, r, p: 1 }).toString("hex");
  return `scrypt$${n}$${r}:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = (stored || ":").split(":");
    if (!scheme.startsWith("scrypt") || !salt || !hash) return false;
    const { n, r } = parseScryptParams(stored);
    const candidate = scryptSync(password, salt, SCRYPT_KEYLEN, { N: n, r, p: 1 });
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sessions (signed cookie: base64(payload).hmac)
// ---------------------------------------------------------------------------

interface SessionPayload {
  userId: string;
  issuedAt: number;
  expiresAt: number;
}

function sign(data: string): string {
  return createHmac("sha256", sessionSecret()).update(data).digest("base64url");
}

export function serializeSession(userId: string): string {
  const payload: SessionPayload = {
    userId,
    issuedAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_HOURS * 3600 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function parseSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!payload.userId || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, serializeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_HOURS * 3600,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** Resolve the current staff user from the session cookie (server-side only). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const payload = parseSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const user = await db.staffUser.findUnique({
    where: { id: payload.userId },
    include: { branch: { select: { name: true } } },
  });
  if (!user || !user.isActive) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    branchId: user.branchId,
    branchName: user.branch?.name ?? null,
    designation: user.designation,
  };
}

export class AuthError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 401, code = "UNAUTHORIZED") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Require an authenticated staff session. Throws AuthError when absent. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Authentication required. Please sign in.", 401);
  return user;
}

/** Require one of the given roles. */
export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AuthError("You do not have permission to perform this action.", 403, "FORBIDDEN");
  }
  return user;
}

// ---------------------------------------------------------------------------
// API-key authentication for CRM / LMS integration clients
// ---------------------------------------------------------------------------

export interface ApiClientPrincipal {
  kind: "api_client";
  clientId: string;
  name: string;
  scopes: string[];
}

function sha256(value: string): string {
  return createHmac("sha256", "fcms-api-key").update(value).digest("hex");
}

export function hashApiKey(key: string): string {
  return sha256(key);
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `fc_dev_${randomBytes(24).toString("hex")}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

/** Resolve the current principal: staff session or API key (x-api-key header). */
export async function requireApiKey(request: Request): Promise<ApiClientPrincipal> {
  const key = request.headers.get("x-api-key") || "";
  if (!key) throw new AuthError("Missing x-api-key header.", 401, "API_KEY_REQUIRED");
  const client = await db.apiClient.findUnique({ where: { apiKeyHash: hashApiKey(key) } });
  if (!client || !client.isActive) throw new AuthError("Invalid or inactive API key.", 401, "API_KEY_INVALID");
  return { kind: "api_client", clientId: client.id, name: client.name, scopes: client.scopes.split(",").map((s) => s.trim()) };
}

export function assertScope(principal: ApiClientPrincipal, scope: string): void {
  if (!principal.scopes.includes(scope)) {
    throw new AuthError(`API key lacks required scope "${scope}".`, 403, "SCOPE_DENIED");
  }
}
