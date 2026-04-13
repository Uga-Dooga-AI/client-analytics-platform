import { adminDb } from "@/lib/firebase/admin";

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

  const doc = await adminDb.collection("config").doc("bootstrap").get();
  const complete = doc.exists && doc.data()?.bootstrapComplete === true;

  if (complete) bootstrapCompleteCache = true;
  return complete;
}

/** Exposed only for testing — resets the cache between test cases. */
export function _resetBootstrapCache(): void {
  bootstrapCompleteCache = null;
}
