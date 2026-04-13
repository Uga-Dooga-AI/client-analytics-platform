import { NextRequest, NextResponse } from "next/server";
import { buildGoogleAuthorizationUrl, createOAuthNonce } from "@/lib/auth/google";
import {
  createOAuthStateToken,
  sanitizeCallbackUrl,
  setOAuthStateCookie,
} from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const callbackUrl = sanitizeCallbackUrl(
      request.nextUrl.searchParams.get("callbackUrl")
    );
    const nonce = createOAuthNonce();
    const state = await createOAuthStateToken({ nonce, callbackUrl });
    const url = buildGoogleAuthorizationUrl({ request, state, callbackUrl });
    const response = NextResponse.redirect(url);
    setOAuthStateCookie(response, nonce);
    return response;
  } catch (error) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "error",
      error instanceof Error ? error.message : "Google sign-in is unavailable."
    );
    return NextResponse.redirect(loginUrl);
  }
}
