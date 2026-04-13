/**
 * Firebase Firestore + Auth seeding helpers for E2E tests.
 *
 * Uses the app's own API endpoints to seed data (which exercises the real
 * code paths) rather than writing to Firestore directly.
 */

import { BASE_URL } from "./config";

const BOOTSTRAP_KEY = "test-bootstrap-key-1234";

export type UserRole = "super_admin" | "admin" | "analyst" | "ab_analyst" | "viewer";

/**
 * Bootstraps a super_admin for the given uid.
 * Only works when no super_admin exists yet (emulator is clean).
 */
export async function bootstrapSuperAdmin(uid: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, bootstrapKey: BOOTSTRAP_KEY }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`bootstrapSuperAdmin failed (${res.status}): ${err}`);
  }
}

/**
 * Approves an access request as the given admin session.
 */
export async function approveRequest(
  requestId: string,
  role: UserRole,
  adminSessionCookie: string
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/api/admin/requests/${requestId}/approve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `__session=${adminSessionCookie}`,
      },
      body: JSON.stringify({ role }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`approveRequest failed (${res.status}): ${err}`);
  }
}

/**
 * Rejects an access request.
 */
export async function rejectRequest(
  requestId: string,
  adminSessionCookie: string
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/api/admin/requests/${requestId}/reject`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `__session=${adminSessionCookie}`,
      },
      body: JSON.stringify({}),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`rejectRequest failed (${res.status}): ${err}`);
  }
}

/**
 * Pre-adds a user by email with a given role.
 */
export async function preAddUser(
  email: string,
  role: UserRole,
  adminSessionCookie: string
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/users/pre-add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `__session=${adminSessionCookie}`,
    },
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`preAddUser failed (${res.status}): ${err}`);
  }
}

/**
 * Reads the pending access requests list (requires admin session).
 */
export async function listAccessRequests(
  adminSessionCookie: string
): Promise<Array<{ requestId: string; uid: string; email: string; status: string }>> {
  const res = await fetch(`${BASE_URL}/api/admin/requests`, {
    headers: { Cookie: `__session=${adminSessionCookie}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`listAccessRequests failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.requests ?? data;
}
