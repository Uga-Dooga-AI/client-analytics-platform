import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { sanitizeCallbackUrl } from "./session";
import { buildPublicUrl } from "./url";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  hd?: string;
}

function requireGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }

  return { clientId, clientSecret };
}

export function getGoogleCallbackUrl(request: NextRequest) {
  return buildPublicUrl(request, "/api/auth/google/callback").toString();
}

export function buildGoogleAuthorizationUrl(params: {
  request: NextRequest;
  state: string;
  callbackUrl: string;
}) {
  const { clientId } = requireGoogleConfig();
  const url = new URL(GOOGLE_AUTH_URL);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getGoogleCallbackUrl(params.request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("prompt", "select_account");

  const hostedDomain = process.env.GOOGLE_HOSTED_DOMAIN;
  if (hostedDomain) {
    url.searchParams.set("hd", hostedDomain);
  }

  const callbackUrl = sanitizeCallbackUrl(params.callbackUrl);
  if (callbackUrl !== "/overview") {
    url.searchParams.set("login_hint", "");
  }

  return url.toString();
}

export function createOAuthNonce() {
  return randomBytes(24).toString("hex");
}

export async function exchangeGoogleCodeForIdentity(params: {
  code: string;
  request: NextRequest;
}) {
  const { clientId, clientSecret } = requireGoogleConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleCallbackUrl(params.request),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to exchange Google authorization code.");
  }

  const payload = (await response.json()) as { id_token?: string };
  if (!payload.id_token) {
    throw new Error("Google response did not include an id_token.");
  }

  return verifyGoogleIdToken(payload.id_token);
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const { clientId } = requireGoogleConfig();
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });

  const email = typeof payload.email === "string" ? payload.email : null;
  const sub = typeof payload.sub === "string" ? payload.sub : null;

  if (!email || !sub) {
    throw new Error("Google identity payload is missing email or subject.");
  }

  const hostedDomain = process.env.GOOGLE_HOSTED_DOMAIN;
  const claimedHostedDomain = typeof payload.hd === "string" ? payload.hd : undefined;
  if (hostedDomain && claimedHostedDomain !== hostedDomain && !email.endsWith(`@${hostedDomain}`)) {
    throw new Error("Google account is not allowed for this workspace.");
  }

  return {
    sub,
    email,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
    hd: claimedHostedDomain,
  };
}
