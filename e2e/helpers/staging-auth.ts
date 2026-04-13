/**
 * Staging auth helpers.
 *
 * Used when running Playwright against the real Railway staging environment
 * (not Firebase emulator). Authenticates using email/password sign-in via
 * the Firebase REST Identity Toolkit API, then injects the __session cookie.
 *
 * QA test user credentials: see qa/test-cases/fixtures/firebase-test-user.md
 */

import type { BrowserContext } from "@playwright/test";

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";
const STAGING_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  "https://acceptable-benevolence-production-5a19.up.railway.app";

export const QA_USER = {
  email: "qa-test@analytics-platform.test",
  password: "qatest-staging-2026",
  uid: "8HjaxnraSSMdhYPMi8ZaoMNqe9h2",
} as const;

/**
 * Signs in via Firebase REST API and injects the __session cookie into
 * the Playwright context so subsequent page navigations are authenticated.
 */
export async function stagingLoginAs(
  context: BrowserContext,
  email: string,
  password: string
): Promise<{ uid: string; idToken: string }> {
  if (!FIREBASE_API_KEY) {
    throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is required for staging auth");
  }

  // Sign in via Firebase Identity Toolkit REST API
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firebase signIn failed: ${err}`);
  }

  const { localId: uid, idToken } = (await res.json()) as {
    localId: string;
    idToken: string;
  };

  // Exchange idToken for httpOnly __session cookie via app's session endpoint
  const sessionRes = await fetch(`${STAGING_BASE_URL}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  if (!sessionRes.ok) {
    throw new Error(`Session exchange failed: ${await sessionRes.text()}`);
  }

  const setCookie = sessionRes.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/(?:^|,\s*)__session=([^;]+)/);
  if (!match) {
    throw new Error(`Could not parse __session cookie from: ${setCookie}`);
  }

  const stagingHost = new URL(STAGING_BASE_URL).hostname;
  await context.addCookies([
    {
      name: "__session",
      value: match[1],
      domain: stagingHost,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
    },
  ]);

  return { uid, idToken };
}
