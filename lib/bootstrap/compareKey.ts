import { timingSafeEqual } from "crypto";

/**
 * Constant-time comparison of two bootstrap key strings.
 *
 * Returns `true` when `provided` exactly matches `expected`.
 * Uses `crypto.timingSafeEqual` to prevent timing-based key enumeration.
 *
 * Length mismatch is checked first (fast-path). Note: this fast-path does
 * leak length information, but NIST 800-132 / OWASP accept this trade-off
 * for pre-shared keys where length is fixed and public (>= 32 chars, startup
 * validated).
 */
export function compareBootstrapKey(
  provided: string,
  expected: string
): boolean {
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
