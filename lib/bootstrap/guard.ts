import { isBootstrapComplete as readBootstrapComplete } from "@/lib/auth/store";

/**
 * One-way in-process cache for bootstrapComplete flag.
 * Once set to true it never reverts — safe to cache indefinitely.
 */
let bootstrapCompleteCache: boolean | null = null;

/**
 * Returns true if the system has already been bootstrapped.
 * Uses a one-way in-process cache to avoid redundant Firestore reads
 * after the first confirmed `true`.
 */
export async function isBootstrapComplete(): Promise<boolean> {
  if (bootstrapCompleteCache === true) return true;

  const complete = await readBootstrapComplete();

  if (complete) bootstrapCompleteCache = true;
  return complete;
}

/** Exposed only for testing — resets the cache between test cases. */
export function _resetBootstrapCache(): void {
  bootstrapCompleteCache = null;
}
