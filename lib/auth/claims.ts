import { adminAuth } from "@/lib/firebase/admin";
import type { UserRole } from "./types";

export interface CustomClaims {
  role: UserRole;
  approved: boolean;
}

/**
 * Sets Firebase custom claims for a user.
 * After calling this, the user must refresh their ID token to receive the new claims.
 */
export async function setCustomClaims(
  uid: string,
  claims: CustomClaims
): Promise<void> {
  await adminAuth.setCustomUserClaims(uid, claims);
}

/**
 * Reads current custom claims for a user directly from Firebase Auth.
 */
export async function getCustomClaims(
  uid: string
): Promise<CustomClaims | null> {
  const user = await adminAuth.getUser(uid);
  const claims = user.customClaims as CustomClaims | undefined;
  return claims ?? null;
}
