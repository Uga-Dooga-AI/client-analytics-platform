/**
 * AC-3: Admin одобряет запрос → пользователь получает доступ
 *
 * Flow:
 *   1. New user signs up.
 *   2. Access request seeded directly in Firestore emulator (bypasses Cloud
 *      Functions emulator — tests need only auth + firestore emulators).
 *   3. Admin approves via /api/admin/requests/[id]/approve.
 *   4. User refreshes token → receives approved=true + role claims.
 *   5. User can now access /overview.
 */

import { test, expect } from "@playwright/test";
import {
  clearEmulatorData,
  emulatorSignUp,
  emulatorSignIn,
  emulatorRefreshToken,
} from "../helpers/emulator";
import { bootstrapSuperAdmin, approveRequest, rejectRequest } from "../helpers/seed";
import { seedUserDoc, seedAccessRequest } from "../helpers/firestore";
import { BASE_URL } from "../helpers/config";

const PASSWORD = "Test1234!";

test.beforeEach(async () => {
  await clearEmulatorData();
});

async function setupAdmin(): Promise<{ uid: string; cookie: string }> {
  const { uid } = await emulatorSignUp("admin@test.example", PASSWORD);
  await bootstrapSuperAdmin(uid);
  const { idToken } = await emulatorSignIn("admin@test.example", PASSWORD);
  const res = await fetch(`${BASE_URL}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const cookie = res.headers.get("set-cookie")?.match(/__session=([^;]+)/)?.[1] ?? "";
  return { uid, cookie };
}

test("AC-3: admin approves request → user gets role and can access /overview", async ({
  browser,
}) => {
  const { cookie: adminCookie } = await setupAdmin();

  // Create pending user + seed access request directly in Firestore
  const { uid: userUid, refreshToken } = await emulatorSignUp("pending@test.example", PASSWORD);
  const requestId = `req-${userUid}`;
  await seedUserDoc({ uid: userUid, email: "pending@test.example", role: "viewer", approved: false });
  await seedAccessRequest({ requestId, uid: userUid, email: "pending@test.example" });

  // Admin approves
  await approveRequest(requestId, "analyst", adminCookie);

  // User refreshes token to pick up claims
  const { idToken: freshToken } = await emulatorRefreshToken(refreshToken);

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.request.post("/api/auth/session", { data: { idToken: freshToken } });

  await page.goto("/overview");
  await expect(page).toHaveURL(/\/overview/);
  await expect(page.locator("body")).not.toContainText("Unauthorized");

  await context.close();
});

test("AC-3 negative: rejected user stays on /access-request", async ({
  browser,
}) => {
  const { cookie: adminCookie } = await setupAdmin();

  const { uid: userUid } = await emulatorSignUp("rejected@test.example", PASSWORD);
  const { idToken: userToken } = await emulatorSignIn("rejected@test.example", PASSWORD);
  const requestId = `req-${userUid}`;
  await seedUserDoc({ uid: userUid, email: "rejected@test.example", role: "viewer", approved: false });
  await seedAccessRequest({ requestId, uid: userUid, email: "rejected@test.example" });

  await rejectRequest(requestId, adminCookie);

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.request.post("/api/auth/session", { data: { idToken: userToken } });

  await page.goto("/overview");
  await expect(page).toHaveURL(/\/access-request/);

  await context.close();
});

test("AC-3: approve endpoint returns 401 for unauthenticated caller", async ({ request }) => {
  const res = await request.post("/api/admin/requests/any-id/approve", {
    data: { role: "analyst" },
  });
  expect(res.status()).toBe(401);
});

test("AC-3: approve endpoint returns 403 for viewer role", async ({ browser }) => {
  // Create viewer user with approved=true
  const { uid } = await emulatorSignUp("viewer-try@test.example", PASSWORD);
  const { idToken } = await emulatorSignIn("viewer-try@test.example", PASSWORD);
  await seedUserDoc({ uid, email: "viewer-try@test.example", role: "viewer", approved: true });

  // Set custom claims via emulator
  const { setEmulatorCustomClaims } = await import("../helpers/firestore");
  await setEmulatorCustomClaims(uid, { role: "viewer", approved: true });

  const freshSignIn = await emulatorSignIn("viewer-try@test.example", PASSWORD);

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.request.post("/api/auth/session", { data: { idToken: freshSignIn.idToken } });

  const res = await page.request.post("/api/admin/requests/fake-id/approve", {
    data: { role: "analyst" },
  });
  expect([403, 404]).toContain(res.status());

  await context.close();
});
