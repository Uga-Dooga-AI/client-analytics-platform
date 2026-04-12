import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { isPublicRoute, getAllowedRoles } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/auth/types";

/**
 * Firebase issues ID tokens signed with RS256.
 * Public keys are available as a JWK Set at this URL.
 */
const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";

const getJWKS = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));

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
    const { payload } = await jwtVerify(token, getJWKS, {
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

  // Extract Bearer token from Authorization header
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return unauthorizedResponse(request, pathname);
  }

  const claims = await verifyFirebaseToken(token);
  if (!claims) {
    return unauthorizedResponse(request, pathname);
  }

  // Check approved status — unapproved users land on /access-request
  if (!claims.approved) {
    return NextResponse.redirect(new URL("/access-request", request.url));
  }

  // Check RBAC permissions
  const allowedRoles = getAllowedRoles(pathname);
  if (allowedRoles !== null) {
    if (!claims.role || !allowedRoles.includes(claims.role)) {
      return forbiddenResponse(request, pathname);
    }
  }

  // Forward auth claims as request headers for server components
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-auth-uid", claims.sub);
  requestHeaders.set("x-auth-email", claims.email ?? "");
  requestHeaders.set("x-auth-role", claims.role ?? "");
  requestHeaders.set("x-auth-approved", String(claims.approved ?? false));

  return NextResponse.next({ request: { headers: requestHeaders } });
}

function unauthorizedResponse(request: NextRequest, pathname: string) {
  // API routes → 401 JSON; pages → redirect to sign-in
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(signIn);
}

function forbiddenResponse(request: NextRequest, pathname: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.redirect(new URL("/overview", request.url));
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (Next.js static assets)
     * - _next/image  (Next.js image optimisation)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
