import { jwtVerify, SignJWT } from "jose";
import type { JWTPayload } from "jose";
import { NextRequest, NextResponse } from "next/server";
import type { AuthClaims } from "./types";

export const SESSION_COOKIE = "__session";
const OAUTH_STATE_COOKIE = "__oauth_state";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;

interface SessionTokenPayload extends AuthClaims, JWTPayload {
  displayName: string | null;
  avatarUrl: string | null;
}

interface OAuthStatePayload extends JWTPayload {
  nonce: string;
  callbackUrl: string;
}

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be configured and at least 32 characters long.");
  }

  return new TextEncoder().encode(secret);
}

function isSecureCookie() {
  return process.env.NODE_ENV === "production";
}

export function sanitizeCallbackUrl(input: string | null | undefined) {
  if (!input || !input.startsWith("/")) {
    return "/overview";
  }

  if (input.startsWith("//")) {
    return "/overview";
  }

  return input;
}

export async function createSessionToken(payload: SessionTokenPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getAuthSecret());
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, getAuthSecret(), {
    algorithms: ["HS256"],
  });

  return payload as unknown as SessionTokenPayload;
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

export function readSessionCookie(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

export async function readSessionFromRequest(request: NextRequest) {
  const token = readSessionCookie(request);
  if (!token) {
    return null;
  }

  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export async function createOAuthStateToken(payload: OAuthStatePayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${OAUTH_STATE_MAX_AGE_SECONDS}s`)
    .sign(getAuthSecret());
}

export async function verifyOAuthStateToken(token: string) {
  const { payload } = await jwtVerify(token, getAuthSecret(), {
    algorithms: ["HS256"],
  });

  return payload as unknown as OAuthStatePayload;
}

export function setOAuthStateCookie(response: NextResponse, nonce: string) {
  response.cookies.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    path: "/",
  });
}

export function readOAuthStateCookie(request: NextRequest) {
  return request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? null;
}

export function clearOAuthStateCookie(response: NextResponse) {
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
