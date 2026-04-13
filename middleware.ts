import { NextRequest, NextResponse } from "next/server";
import { isPublicRoute, getAllowedRoles } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/auth/types";
import { readSessionCookie, verifySessionToken } from "@/lib/auth/session";

const DEMO_ACCESS_ENABLED = process.env.DEMO_ACCESS_ENABLED === "true";

interface SessionClaims {
  uid: string;
  email?: string;
  role?: UserRole;
  approved?: boolean;
  displayName?: string | null;
  avatarUrl?: string | null;
}

async function verifyAppSession(token: string): Promise<SessionClaims | null> {
  try {
    return (await verifySessionToken(token)) as SessionClaims;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  if (DEMO_ACCESS_ENABLED && process.env.NODE_ENV !== "production") {
    return allowDemoAccess(request);
  }

  const token = readSessionCookie(request);
  if (!token) {
    return unauthorizedResponse(request, pathname);
  }

  const claims = await verifyAppSession(token);
  if (!claims) {
    return unauthorizedResponse(request, pathname);
  }

  // Unapproved users land on /access-request
  if (!claims.approved) {
    const isAccessRequestFlow =
      pathname === "/access-request" || pathname === "/api/access-requests";
    if (!isAccessRequestFlow) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Access approval required" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/access-request", request.url));
    }
    return NextResponse.next();
  }

  // RBAC check
  const allowedRoles = getAllowedRoles(pathname);
  if (allowedRoles !== null) {
    if (!claims.role || !allowedRoles.includes(claims.role)) {
      return forbiddenResponse(request, pathname);
    }
  }

  // Forward decoded claims as headers so Server Components can read them
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-auth-uid", claims.uid);
  requestHeaders.set("x-auth-email", claims.email ?? "");
  requestHeaders.set("x-auth-role", claims.role ?? "");
  requestHeaders.set("x-auth-approved", String(claims.approved ?? false));

  return NextResponse.next({ request: { headers: requestHeaders } });
}

function allowDemoAccess(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-auth-uid", "demo-admin");
  requestHeaders.set("x-auth-email", "demo@client-analytics.local");
  requestHeaders.set("x-auth-role", "admin");
  requestHeaders.set("x-auth-approved", "true");
  requestHeaders.set("x-demo-access", "true");

  return NextResponse.next({ request: { headers: requestHeaders } });
}

function unauthorizedResponse(request: NextRequest, pathname: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}

function forbiddenResponse(request: NextRequest, pathname: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.redirect(new URL("/overview", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
