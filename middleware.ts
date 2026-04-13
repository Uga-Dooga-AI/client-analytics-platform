import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify, decodeJwt } from "jose";
import { isPublicRoute, getAllowedRoles } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/auth/types";

/**
 * Firebase ID tokens are signed with RS256.
 * In emulator mode (FIREBASE_AUTH_EMULATOR_HOST set), the Firebase Auth Emulator
 * issues unsigned JWTs (alg: none) that cannot be verified with JWKS.
 * For emulator mode we skip signature verification and decode claims directly.
 * This is safe because emulator traffic is local only.
 */
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
const IS_EMULATOR = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
const DEMO_ACCESS_ENABLED = process.env.DEMO_ACCESS_ENABLED === "true";

const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const getJWKS = IS_EMULATOR ? null : createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));

interface FirebaseClaims {
  uid?: string;
  sub: string;
  email?: string;
  role?: UserRole;
  approved?: boolean;
  aud: string;
  iss: string;
}

async function verifyFirebaseToken(
  token: string
): Promise<FirebaseClaims | null> {
  try {
    if (IS_EMULATOR) {
      // In emulator mode, tokens are unsigned (alg: none).
      // Decode without signature verification — local dev only.
      const payload = decodeJwt(token);
      if (
        payload.aud !== FIREBASE_PROJECT_ID ||
        payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`
      ) {
        return null;
      }
      return payload as unknown as FirebaseClaims;
    }

    const { payload } = await jwtVerify(token, getJWKS!, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    });
    return payload as unknown as FirebaseClaims;
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

  if (DEMO_ACCESS_ENABLED) {
    return allowDemoAccess(request);
  }

  // Token resolution: httpOnly session cookie (page navigation) OR
  // Authorization Bearer header (client-side API calls)
  const cookieToken = request.cookies.get("__session")?.value ?? null;
  const authHeader = request.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const token = cookieToken ?? bearerToken;

  if (!token) {
    return unauthorizedResponse(request, pathname);
  }

  const claims = await verifyFirebaseToken(token);
  if (!claims) {
    return unauthorizedResponse(request, pathname);
  }

  // Unapproved users land on /access-request
  if (!claims.approved) {
    if (pathname !== "/access-request") {
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
  requestHeaders.set("x-auth-uid", claims.sub);
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
