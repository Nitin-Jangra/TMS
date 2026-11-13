// In-memory rate limiter (development). Production swaps the store for Redis
// behind the same interface (RATE_LIMIT_WINDOW / RATE_LIMIT_MAX env config).

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, max: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: max - 1, retryAfterSeconds: 0 };
  }
  if (bucket.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  bucket.count += 1;
  return { allowed: true, remaining: max - bucket.count, retryAfterSeconds: 0 };
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "local";
}

/** Progressive throttling for failed public tracking attempts. */
export function trackingThrottle(ip: string): { blocked: boolean; retryAfterSeconds: number } {
  const fails = buckets.get(`track-fail:${ip}`);
  if (fails && fails.resetAt > Date.now()) {
    // After 6 consecutive failures the IP is throttled for the remaining window.
    if (fails.count >= 6) {
      return { blocked: true, retryAfterSeconds: Math.ceil((fails.resetAt - Date.now()) / 1000) };
    }
  }
  return { blocked: false, retryAfterSeconds: 0 };
}

export function recordTrackingFailure(ip: string): void {
  const key = `track-fail:${ip}`;
  const existing = buckets.get(key);
  const windowMs = 15 * 60 * 1000;
  if (existing && existing.resetAt > Date.now()) {
    existing.count += 1;
  } else {
    buckets.set(key, { count: 1, resetAt: Date.now() + windowMs });
  }
}

export function clearTrackingFailures(ip: string): void {
  buckets.delete(`track-fail:${ip}`);
}
