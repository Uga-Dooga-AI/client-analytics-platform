import { headers } from "next/headers";
import type { AuthClaims, UserRole } from "./types";

/**
 * Server-side auth helper for Server Components and Route Handlers.
 *
 * Reads the x-auth-* headers forwarded by middleware after token verification.
 * Returns null when the request is unauthenticated or missing claims.
 *
 * Usage:
 *   const auth = await getServerAuth();
 *   if (!auth) redirect("/sign-in");
 */
export async function getServerAuth(): Promise<AuthClaims | null> {
  const headerStore = await headers();
  const uid = headerStore.get("x-auth-uid");
  const email = headerStore.get("x-auth-email");
  const role = headerStore.get("x-auth-role") as UserRole | null;
  const approvedRaw = headerStore.get("x-auth-approved");

  if (!uid || !email || !role) return null;

  return {
    uid,
    email,
    role,
    approved: approvedRaw === "true",
  };
}
