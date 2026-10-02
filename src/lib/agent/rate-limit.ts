import { err } from "./envelope";

/**
 * Light in-memory token bucket per client IP for POST routes. Process-local on
 * purpose: this is abuse damping, not a billing meter. Put a real limiter at the
 * edge before exposing the API publicly.
 */
interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimitOptions {
  /** Burst capacity. */
  capacity?: number;
  /** Tokens refilled per second. */
  refillPerSecond?: number;
}

const DEFAULTS: Required<RateLimitOptions> = { capacity: 30, refillPerSecond: 0.5 };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? req.headers.get("cf-connecting-ip") ?? "local";
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function take(key: string, opts: RateLimitOptions = {}, now = Date.now()): RateLimitResult {
  const { capacity, refillPerSecond } = { ...DEFAULTS, ...opts };
  let b = buckets.get(key);
  if (!b) {
    if (buckets.size >= MAX_BUCKETS) buckets.clear();
    b = { tokens: capacity, updatedAt: now };
    buckets.set(key, b);
  }
  const elapsed = Math.max(0, now - b.updatedAt) / 1000;
  b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSecond);
  b.updatedAt = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { allowed: true, remaining: Math.floor(b.tokens), retryAfterSeconds: 0 };
  }
  return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((1 - b.tokens) / refillPerSecond) };
}

/** Returns a 429 Response when the caller is over budget, otherwise null. */
export function rateLimit(req: Request, scope: string, opts?: RateLimitOptions): Response | null {
  const r = take(`${scope}:${clientIp(req)}`, opts);
  if (r.allowed) return null;
  const res = err("RATE_LIMITED", `Too many requests. Retry in ${r.retryAfterSeconds}s.`);
  res.headers.set("Retry-After", String(r.retryAfterSeconds));
  return res;
}

/** Test hook. */
export function resetRateLimits() {
  buckets.clear();
}
