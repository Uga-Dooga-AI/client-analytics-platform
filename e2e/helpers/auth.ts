/**
 * Playwright auth helpers.
 *
 * These functions set up authenticated browser contexts without going through
 * the Google OAuth popup, which cannot be automated with Playwright directly.
 *
 * Strategy:
 *   1. Create a user in the Auth Emulator via REST.
 *   2. Set custom claims via the app's bootstrap / admin API.
 *   3. Exchange the emulator idToken for an httpOnly __session cookie via
 *      POST /api/auth/session.
 *   4. Inject that cookie into the Playwright browser context.
 */

import type { BrowserContext, Page } from "@playwright/test";
import {
  emulatorSignUp,
  emulatorSignIn,
  emulatorRefreshToken,
  createSession,
} from "./emulator";

import { BASE_URL } from "./config";

export interface TestUser {
  uid: string;
  email: string;
  password: string;
  idToken: string;
  refreshToken: string;
}

/**
 * Creates a test user in the emulator and seeds a session cookie in the given
 * Playwright context so subsequent page.goto() calls are already authenticated.
 *
 * @param context - Playwright BrowserContext
 * @param email   - test user email
 * @param password - test user password (arbitrary, only valid in emulator)
 */
export async function loginAs(
  context: BrowserContext,
  email: string,
  password: string
): Promise<TestUser> {
  const { uid, idToken, refreshToken } = await emulatorSignUp(email, password);
  const { cookie } = await createSession(BASE_URL, idToken);
  await injectSessionCookie(context, cookie);
  return { uid, email, password, idToken, refreshToken };
}

/**
 * Refreshes the idToken (to pick up new custom claims) and re-injects the
 * session cookie into the Playwright context.
 */
export async function refreshSession(
  context: BrowserContext,
  refreshToken: string
): Promise<string> {
  const { idToken } = await emulatorRefreshToken(refreshToken);
  const { cookie } = await createSession(BASE_URL, idToken);
  await injectSessionCookie(context, cookie);
  return idToken;
}

/**
 * Signs in an existing emulator user and injects session cookie.
 */
export async function signInAs(
  context: BrowserContext,
  email: string,
  password: string
): Promise<{ uid: string; idToken: string }> {
  const { uid, idToken } = await emulatorSignIn(email, password);
  const { cookie } = await createSession(BASE_URL, idToken);
  await injectSessionCookie(context, cookie);
  return { uid, idToken };
}

/**
 * Parses the Set-Cookie header and injects the __session cookie into
 * the Playwright context so it is sent on all subsequent requests.
 */
async function injectSessionCookie(
  context: BrowserContext,
  setCookieHeader: string
): Promise<void> {
  // Parse value from "Set-Cookie: __session=<value>; ..."
  const match = setCookieHeader.match(/(?:^|,\s*)__session=([^;]+)/);
  if (!match) {
    throw new Error(`Could not parse __session cookie from: ${setCookieHeader}`);
  }
  await context.addCookies([
    {
      name: "__session",
      value: match[1],
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Strict",
    },
  ]);
}

/**
 * Clears the session cookie (logout).
 */
export async function logout(page: Page): Promise<void> {
  await page.request.delete("/api/auth/session");
  await page.context().clearCookies();
}

/**
 * Signs in via the Firebase client SDK in the browser context.
 *
 * This establishes the Firebase client-side auth session (required for
 * client-side auth guards like AdminLayout that use useAuth()) AND sets
 * the httpOnly session cookie via /api/auth/session.
 *
 * Requires the page to have loaded the app (so window.__testSignIn is
 * available from TestSignInHelper). Navigate to a public page first.
 *
 * Only works in emulator mode (NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST set).
 */
export async function signInFirebaseClient(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  // Wait for window.__testSignIn to be available (injected by TestSignInHelper)
  await page.waitForFunction(
    () => typeof window.__testSignIn === "function",
    { timeout: 10000 }
  );
  await page.evaluate(
    ([e, p]) => (window as Window & { __testSignIn: (a: string, b: string) => Promise<string> }).__testSignIn(e, p),
    [email, password] as [string, string]
  );
}
