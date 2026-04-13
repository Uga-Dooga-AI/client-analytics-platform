/**
 * Firestore + Auth seed helpers for E2E tests.
 *
 * Routes all seed operations through POST /api/test/seed which uses the
 * Firebase Admin SDK server-side (bypasses Firestore security rules).
 * Only available when FIREBASE_AUTH_EMULATOR_HOST is set.
 */

import { BASE_URL } from "./config";

type UserRole = "super_admin" | "admin" | "analyst" | "ab_analyst" | "viewer";

async function seedRequest(body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/test/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`seed API failed (${res.status}): ${err}`);
  }
}

/** Sets custom claims on a Firebase Auth user (via Admin SDK → bypasses rules). */
export async function setEmulatorCustomClaims(
  uid: string,
  claims: { role: UserRole; approved: boolean }
): Promise<void> {
  await seedRequest({ action: "setCustomClaims", uid, claims });
}

/** Writes a user document directly to Firestore (Admin SDK → bypasses rules). */
export async function seedUserDoc(params: {
  uid: string;
  email: string;
  role: UserRole;
  approved: boolean;
  preAdded?: boolean;
  addedBy?: string | null;
}): Promise<void> {
  await seedRequest({ action: "seedUserDoc", ...params });
}

/** Writes a pre-approved sentinel document (pre:email) to Firestore. */
export async function seedPreAddSentinel(params: {
  email: string;
  role: UserRole;
  addedBy: string;
}): Promise<void> {
  const { email, role, addedBy } = params;
  const sentinelId = `pre:${email}`;
  await seedRequest({
    action: "seedUserDoc",
    uid: sentinelId,
    email,
    role,
    approved: true,
    preAdded: true,
    addedBy,
  });
}

/** Creates a pending access request document (Admin SDK → bypasses rules). */
export async function seedAccessRequest(params: {
  requestId: string;
  uid: string;
  email: string;
}): Promise<void> {
  await seedRequest({ action: "seedAccessRequest", ...params });
}
