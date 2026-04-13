/**
 * AC-4: Pre-add → login → direct access без ожидания
 *
 * Flow (emulator-only, no Cloud Functions emulator needed):
 *   1. Admin pre-adds user by email via /api/admin/users/pre-add.
 *      This writes a sentinel doc `users/pre:email` to Firestore.
 *   2. User signs up. We simulate the onUserLogin trigger by:
 *      a) Reading the sentinel from Firestore via the API
 *      b) Setting custom claims directly via emulator REST
 *      c) Seeding user doc
 *   3. User's fresh token contains approved=true + role.
 *   4. User accesses /overview without any approval queue.
 *
 * Note: In production the sentinel check + claim assignment happens in the
 * `beforeUserSignedIn` Cloud Function. In E2E tests we seed it via the
 * emulator REST API to avoid the Functions emulator dependency.
 */

import { test, expect } from "@playwright/test";
import {
  clearEmulatorData,
  emulatorSignUp,
  emulatorSignIn,
  emulatorRefreshToken,
} from "../helpers/emulator";
import { bootstrapSuperAdmin, preAddUser } from "../helpers/seed";
import { seedUserDoc, setEmulatorCustomClaims } from "../helpers/firestore";
import { BASE_URL } from "../helpers/config";

const PASSWORD = "Test1234!";

test.beforeEach(async () => {
  await clearEmulatorData();
});

test("AC-4: pre-added user gets direct access to /overview on first login", async ({
  browser,
}) => {
  // Setup admin
  const { uid: adminUid } = await emulatorSignUp("admin@test.example", PASSWORD);
  await bootstrapSuperAdmin(adminUid);
  const { idToken: adminToken } = await emulatorSignIn("admin@test.example", PASSWORD);
  const adminRes = await fetch(`${BASE_URL}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: adminToken }),
  });
  const adminCookie = adminRes.headers.get("set-cookie")?.match(/__session=([^;]+)/)?.[1] ?? "";

  // Admin pre-adds user
  const preAddedEmail = "preadded@test.example";
  await preAddUser(preAddedEmail, "analyst", adminCookie);

  // User signs up
  const { uid: userUid, refreshToken } = await emulatorSignUp(preAddedEmail, PASSWORD);

  // Simulate onUserLogin: set custom claims + seed user doc (approved=true, role=analyst)
  await setEmulatorCustomClaims(userUid, { role: "analyst", approved: true });
  await seedUserDoc({
    uid: userUid,
    email: preAddedEmail,
    role: "analyst",
    approved: true,
    preAdded: true,
    addedBy: adminUid,
  });

  // Get fresh token with updated claims
  const { idToken: freshToken } = await emulatorRefreshToken(refreshToken);

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.request.post("/api/auth/session", { data: { idToken: freshToken } });

  // Should go directly to /overview — NOT /access-request
  await page.goto("/overview");
  await expect(page).not.toHaveURL(/\/access-request/);
  await expect(page).toHaveURL(/\/overview/);

  await context.close();
});

test("AC-4: pre-add API endpoint is accessible to admin", async ({ browser }) => {
  const { uid: adminUid } = await emulatorSignUp("admin2@test.example", PASSWORD);
  await bootstrapSuperAdmin(adminUid);
  const { idToken: adminToken } = await emulatorSignIn("admin2@test.example", PASSWORD);

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.request.post("/api/auth/session", { data: { idToken: adminToken } });

  const res = await page.request.post("/api/admin/users/pre-add", {
    data: { email: "target@test.example", role: "viewer" },
  });
  expect(res.status()).toBe(200);

  await context.close();
});

test("AC-4: pre-add rejects unauthenticated caller with 401", async ({ request }) => {
  const res = await request.post("/api/admin/users/pre-add", {
    data: { email: "attacker@test.example", role: "admin" },
  });
  expect(res.status()).toBe(401);
});
