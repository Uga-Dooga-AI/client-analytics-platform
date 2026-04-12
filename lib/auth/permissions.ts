import type { UserRole } from "./types";

/**
 * Maps protected route prefixes to the roles that can access them.
 * Matching is prefix-based: a route matches if its pathname starts with the key.
 */
export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/overview": ["viewer", "analyst", "ab_analyst", "admin", "super_admin"],
  "/cohorts": ["viewer", "analyst", "admin", "super_admin"],
  "/funnels": ["viewer", "analyst", "admin", "super_admin"],
  "/experiments": ["analyst", "ab_analyst", "admin", "super_admin"],
  "/forecasts": ["analyst", "admin", "super_admin"],
  "/settings": ["admin", "super_admin"],
  "/access": ["admin", "super_admin"],
  "/api/data/refresh": ["analyst", "admin", "super_admin"],
  "/api/admin": ["admin", "super_admin"],
};

/**
 * Routes that are always publicly accessible — no auth required.
 */
export const PUBLIC_ROUTES: string[] = [
  "/sign-in",
  "/invite",
  "/access-request",
  "/api/auth",
  "/_next",
  "/favicon.ico",
];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((pub) => pathname.startsWith(pub));
}

export function getAllowedRoles(pathname: string): UserRole[] | null {
  for (const [prefix, roles] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname.startsWith(prefix)) return roles;
  }
  return null;
}
