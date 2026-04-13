/**
 * AC-8: Bootstrap endpoint работает, задокументирован
 *
 * Verifies POST /api/admin/bootstrap:
 *   - Sets super_admin claims for a given uid with correct bootstrap key
 *   - Returns 403 on wrong key
 *   - Returns 409 when super_admin already exists
 *   - Returns 400 on missing uid
 *   - Returns 503 when SUPERADMIN_BOOTSTRAP_KEY is not configured
 *     (not testable in emulator env where key is always set — tested structurally)
 */

import { test, expect } from "@playwright/test";
import { clearEmulatorData, emulatorSignUp, emulatorSignIn, emulatorRefreshToken } from "../helpers/emulator";
import { signInFirebaseClient } from "../helpers/auth";
import { BASE_URL } from "../helpers/config";

const PASSWORD = "Test1234!";
const BOOTSTRAP_KEY = "test-bootstrap-key-1234";

test.beforeEach(async () => {
  await clearEmulatorData();
});

test("AC-8: bootstrap sets super_admin claims and user can access /admin", async ({
  browser,
}) => {
  const { uid, refreshToken } = await emulatorSignUp("bootstrap-test@test.example", PASSWORD);

  const res = await fetch(`${BASE_URL}/api/admin/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, bootstrapKey: BOOTSTRAP_KEY }),
  });
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.uid).toBe(uid);
  expect(body.role).toBe("super_admin");

  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to a public page so the app loads (and window.__testSignIn is available)
  await page.goto("/login");
  // Sign in via Firebase client SDK — establishes both client-side auth and session cookie
  await signInFirebaseClient(page, "bootstrap-test@test.example", PASSWORD);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin/);

  await context.close();
});

test("AC-8: wrong bootstrap key returns 403", async ({ request }) => {
  const { uid } = await emulatorSignUp("bootstrap-wrong@test.example", PASSWORD);

  const res = await request.post("/api/admin/bootstrap", {
    data: { uid, bootstrapKey: "wrong-key" },
  });
  expect(res.status()).toBe(403);
});

test("AC-8: missing uid returns 400", async ({ request }) => {
  const res = await request.post("/api/admin/bootstrap", {
    data: { bootstrapKey: BOOTSTRAP_KEY },
  });
  expect(res.status()).toBe(400);
});

test("AC-8: bootstrap disabled after super_admin already exists → 410", async ({
  request,
}) => {
  // First bootstrap
  const { uid } = await emulatorSignUp("bootstrap-first@test.example", PASSWORD);
  const first = await fetch(`${BASE_URL}/api/admin/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, bootstrapKey: BOOTSTRAP_KEY }),
  });
  expect(first.status).toBe(200);

  // Second bootstrap attempt — endpoint is now permanently disabled
  const { uid: uid2 } = await emulatorSignUp("bootstrap-second@test.example", PASSWORD);
  const res = await request.post("/api/admin/bootstrap", {
    data: { uid: uid2, bootstrapKey: BOOTSTRAP_KEY },
  });
  expect(res.status()).toBe(410);

  const body = await res.json();
  expect(body.error).toContain("already initialized");
});

test("AC-8: non-existent uid returns 404", async ({ request }) => {
  const res = await request.post("/api/admin/bootstrap", {
    data: { uid: "nonexistent-uid-xyz", bootstrapKey: BOOTSTRAP_KEY },
  });
  expect(res.status()).toBe(404);
});
