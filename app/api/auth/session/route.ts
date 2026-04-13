import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import {
  clearSessionCookie,
  createSessionToken,
  sanitizeCallbackUrl,
  setSessionCookie,
} from "@/lib/auth/session";
import { getAutoApprovedRole, syncGoogleLoginUser } from "@/lib/auth/store";
import { hasPostgresDatabase } from "@/lib/db/postgres";

export const runtime = "nodejs";

type SessionRequestBody = {
  idToken?: string;
  callbackUrl?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as SessionRequestBody;
  if (!body.idToken || typeof body.idToken !== "string") {
    return NextResponse.json({ error: "idToken is required" }, { status: 400 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(body.idToken);
    const email = typeof decoded.email === "string" ? decoded.email : null;
    if (!email) {
      return NextResponse.json(
        { error: "Google account email is missing from the Firebase token." },
        { status: 400 }
      );
    }
    if (decoded.email_verified !== true) {
      return NextResponse.json(
        { error: "Google account email must be verified." },
        { status: 403 }
      );
    }

    const identity = {
      authUid: decoded.uid,
      email,
      displayName: typeof decoded.name === "string" ? decoded.name : null,
      avatarUrl: typeof decoded.picture === "string" ? decoded.picture : null,
    };

    const user =
      hasPostgresDatabase() || process.env.DEMO_ACCESS_ENABLED === "true"
        ? await syncGoogleLoginUser(identity)
        : (() => {
            const role = getAutoApprovedRole(identity.email);
            if (!role) {
              throw new Error(
                "Auth persistence is not configured. Set DATABASE_URL or enable review-mode auth."
              );
            }
            return {
              uid: identity.authUid,
              email: identity.email,
              displayName: identity.displayName,
              avatarUrl: identity.avatarUrl,
              role,
              approved: true,
            };
          })();

    const sessionToken = await createSessionToken({
      uid: user.uid,
      email: user.email,
      role: user.role,
      approved: user.approved,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    });

    const redirectTo = user.approved
      ? sanitizeCallbackUrl(body.callbackUrl)
      : "/access-request";

    const response = NextResponse.json({
      ok: true,
      redirectTo,
      user: {
        uid: user.uid,
        email: user.email,
        role: user.role,
        approved: user.approved,
      },
    });
    setSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create an app session.",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/session
 * Clears the session cookie (logout).
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
