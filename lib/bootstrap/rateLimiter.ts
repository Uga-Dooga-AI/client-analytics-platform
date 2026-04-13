/**
 * In-memory rate limiter for the bootstrap endpoint.
 * 5 attempts per 15 minutes per IP.
 * For multi-instance deployments, replace with Upstash Redis store.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Module-level Map — persists across requests in a single Node.js process.
const store = new Map<string, RateLimitEntry>();

/**
 * Returns true if the request is allowed, false if rate-limited.
 * Mutates internal state on every call.
 */
export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return false;
  }

  entry.count++;
  return true;
}

/** Exposed only for testing — resets the store between test cases. */
export function _resetStore(): void {
  store.clear();
}

export { MAX_ATTEMPTS, WINDOW_MS };
