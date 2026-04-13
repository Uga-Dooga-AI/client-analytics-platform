import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";

const SESSION_COOKIE = "__session";
// ID tokens expire in 1 hour; we refresh via client onIdTokenChanged
const MAX_AGE = 60 * 60; // 1 hour in seconds

/**
 * POST /api/auth/session
 * Body: { idToken: string }
 *
 * Verifies the Firebase ID token and sets an httpOnly session cookie.
 * Returns the decoded claims so the client can redirect appropriately.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const idToken: string | undefined = body?.idToken;

  if (!idToken) {
    return NextResponse.json({ error: "idToken required" }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken, true);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const response = NextResponse.json({
    uid: decoded.uid,
    email: decoded.email ?? null,
    role: (decoded as Record<string, unknown>).role ?? null,
    approved: (decoded as Record<string, unknown>).approved ?? false,
  });

  response.cookies.set(SESSION_COOKIE, idToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: MAX_AGE,
    path: "/",
  });

  return response;
}

/**
 * DELETE /api/auth/session
 * Clears the session cookie (logout).
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return response;
}
