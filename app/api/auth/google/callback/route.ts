import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCodeForIdentity } from "@/lib/auth/google";
import {
  clearOAuthStateCookie,
  createSessionToken,
  readOAuthStateCookie,
  setSessionCookie,
  verifyOAuthStateToken,
} from "@/lib/auth/session";
import { syncGoogleLoginUser } from "@/lib/auth/store";
import { buildPublicUrl } from "@/lib/auth/url";

export const runtime = "nodejs";

function redirectToLogin(request: NextRequest, message: string) {
  const loginUrl = buildPublicUrl(request, "/login");
  loginUrl.searchParams.set("error", message);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const stateToken = request.nextUrl.searchParams.get("state");

  if (!code || !stateToken) {
    return redirectToLogin(request, "Google sign-in callback is incomplete.");
  }

  try {
    const state = await verifyOAuthStateToken(stateToken);
    const cookieNonce = readOAuthStateCookie(request);
    if (!cookieNonce || cookieNonce !== state.nonce) {
      return redirectToLogin(request, "Google sign-in session expired. Try again.");
    }

    const identity = await exchangeGoogleCodeForIdentity({ code, request });
    if (!identity.emailVerified) {
      return redirectToLogin(request, "Google account email must be verified.");
    }

    const user = await syncGoogleLoginUser({
      authUid: identity.sub,
      email: identity.email,
      displayName: identity.name,
      avatarUrl: identity.picture,
    });

    const sessionToken = await createSessionToken({
      uid: user.uid,
      email: user.email,
      role: user.role,
      approved: user.approved,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    });

    const destination = buildPublicUrl(
      request,
      user.approved ? state.callbackUrl : "/access-request"
    );
    const response = NextResponse.redirect(destination);
    setSessionCookie(response, sessionToken);
    clearOAuthStateCookie(response);
    return response;
  } catch (error) {
    return redirectToLogin(
      request,
      error instanceof Error ? error.message : "Google sign-in failed."
    );
  }
}
