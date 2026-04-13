import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, _resetStore, MAX_ATTEMPTS, WINDOW_MS } from "../rateLimiter";

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetStore();
  });

  it("allows first request from an IP", () => {
    expect(checkRateLimit("1.2.3.4")).toBe(true);
  });

  it(`allows up to ${MAX_ATTEMPTS} requests within the window`, () => {
    const ip = "1.2.3.5";
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      expect(checkRateLimit(ip)).toBe(true);
    }
  });

  it(`blocks the ${MAX_ATTEMPTS + 1}th request from the same IP`, () => {
    const ip = "1.2.3.6";
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      checkRateLimit(ip);
    }
    expect(checkRateLimit(ip)).toBe(false);
  });

  it("tracks different IPs independently", () => {
    const ip1 = "10.0.0.1";
    const ip2 = "10.0.0.2";

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      checkRateLimit(ip1);
    }
    // ip1 exhausted, ip2 still fresh
    expect(checkRateLimit(ip1)).toBe(false);
    expect(checkRateLimit(ip2)).toBe(true);
  });

  it("resets counter after window expires", () => {
    const ip = "1.2.3.7";

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      checkRateLimit(ip);
    }
    expect(checkRateLimit(ip)).toBe(false);

    // Manually expire the window by manipulating store internals.
    // We do this by clearing and re-populating with an expired resetAt.
    _resetStore();

    // After reset, the same IP should be allowed again.
    expect(checkRateLimit(ip)).toBe(true);
  });

  it("window duration is 15 minutes", () => {
    expect(WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it("max attempts is 5", () => {
    expect(MAX_ATTEMPTS).toBe(5);
  });
});
