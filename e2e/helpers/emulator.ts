/**
 * Firebase Auth Emulator REST helpers for E2E test seeding.
 *
 * All functions communicate directly with the Firebase Auth Emulator REST API
 * (port 9099) to create, configure, and clean up test users without the
 * browser UI.
 */

const AUTH_EMULATOR = "http://localhost:9099";
const FIRESTORE_EMULATOR = "http://localhost:8080";
const PROJECT_ID = "demo-test";
const API_KEY = "demo-key";

// ─── Auth Emulator REST helpers ───────────────────────────────────────────────

/**
 * Creates a new email/password user in the emulator and returns their uid + idToken.
 */
export async function emulatorSignUp(
  email: string,
  password: string
): Promise<{ uid: string; idToken: string; refreshToken: string }> {
  const res = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`emulatorSignUp failed: ${err}`);
  }
  const data = await res.json();
  return { uid: data.localId, idToken: data.idToken, refreshToken: data.refreshToken };
}

/**
 * Signs in an existing emulator user and returns a fresh idToken.
 */
export async function emulatorSignIn(
  email: string,
  password: string
): Promise<{ uid: string; idToken: string }> {
  const res = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`emulatorSignIn failed: ${err}`);
  }
  const data = await res.json();
  return { uid: data.localId, idToken: data.idToken };
}

/**
 * Forces a token refresh so freshly-set custom claims are included.
 */
export async function emulatorRefreshToken(
  refreshToken: string
): Promise<{ idToken: string }> {
  const res = await fetch(
    `${AUTH_EMULATOR}/securetoken.googleapis.com/v1/token?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`emulatorRefreshToken failed: ${err}`);
  }
  const data = await res.json();
  return { idToken: data.id_token };
}

/**
 * Clears all users and Firestore data in the emulators.
 * Call in beforeEach / afterEach to isolate tests.
 */
export async function clearEmulatorData(): Promise<void> {
  await Promise.all([
    fetch(
      `${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts`,
      { method: "DELETE" }
    ),
    fetch(
      `${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
      { method: "DELETE" }
    ),
  ]);
}

// ─── Session helpers (via Next.js /api/auth/session) ────────────────────────

/**
 * Creates an httpOnly session cookie by calling the app's session endpoint.
 * Returns the raw Set-Cookie header value so Playwright can inject it.
 */
export async function createSession(
  baseUrl: string,
  idToken: string
): Promise<{ cookie: string; claims: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`createSession failed (${res.status}): ${err}`);
  }
  const setCookie = res.headers.get("set-cookie") ?? "";
  const claims = await res.json();
  return { cookie: setCookie, claims };
}
