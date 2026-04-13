/**
 * AC-5: viewer: нет /experiments, нет /forecasts; ab_analyst: нет /retention
 * AC-6: /admin доступен только admin/super_admin
 *
 * Uses direct Firestore + Auth emulator seeding (no Cloud Functions emulator).
 */

import { test, expect } from "@playwright/test";
import { clearEmulatorData, emulatorSignUp, emulatorSignIn, emulatorRefreshToken } from "../helpers/emulator";
import { bootstrapSuperAdmin } from "../helpers/seed";
import { seedUserDoc, setEmulatorCustomClaims } from "../helpers/firestore";
import { signInFirebaseClient } from "../helpers/auth";
import { BASE_URL } from "../helpers/config";

const PASSWORD = "Test1234!";

type UserRole = "super_admin" | "admin" | "analyst" | "ab_analyst" | "viewer";

/** Create an approved user with a given role, return fresh idToken. */
async function createApprovedUser(email: string, role: UserRole): Promise<string> {
  if (role === "super_admin") {
    const { uid } = await emulatorSignUp(email, PASSWORD);
    await bootstrapSuperAdmin(uid);
    const { idToken } = await emulatorSignIn(email, PASSWORD);
    return idToken;
  }
  const { uid, refreshToken } = await emulatorSignUp(email, PASSWORD);
  await setEmulatorCustomClaims(uid, { role, approved: true });
  await seedUserDoc({ uid, email, role, approved: true });
  const { idToken } = await emulatorRefreshToken(refreshToken);
  return idToken;
}

async function sessionCookieFor(idToken: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  return res.headers.get("set-cookie")?.match(/__session=([^;]+)/)?.[1] ?? "";
}

test.describe("AC-5: role-based route access", () => {
  test.beforeEach(async () => {
    await clearEmulatorData();
  });

  test("viewer: can access /overview and /cohorts, blocked from /experiments and /forecasts", async ({
    browser,
  }) => {
    const idToken = await createApprovedUser("viewer@test.example", "viewer");

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.request.post("/api/auth/session", { data: { idToken } });

    await page.goto("/overview");
    await expect(page).toHaveURL(/\/overview/);

    await page.goto("/cohorts");
    await expect(page).toHaveURL(/\/cohorts/);

    // Middleware redirects forbidden page requests to /overview for browser
    await page.goto("/experiments");
    await expect(page).not.toHaveURL(/\/experiments/);

    await page.goto("/forecasts");
    await expect(page).not.toHaveURL(/\/forecasts/);

    await context.close();
  });

  test("ab_analyst: can access /experiments, blocked from /forecasts and /settings", async ({
    browser,
  }) => {
    const idToken = await createApprovedUser("ab@test.example", "ab_analyst");

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.request.post("/api/auth/session", { data: { idToken } });

    await page.goto("/experiments");
    await expect(page).toHaveURL(/\/experiments/);

    await page.goto("/forecasts");
    await expect(page).not.toHaveURL(/\/forecasts/);

    await page.goto("/settings");
    await expect(page).not.toHaveURL(/\/settings/);

    await context.close();
  });

  test("analyst: can access /forecasts and /experiments, blocked from /settings", async ({
    browser,
  }) => {
    const idToken = await createApprovedUser("analyst@test.example", "analyst");

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.request.post("/api/auth/session", { data: { idToken } });

    await page.goto("/forecasts");
    await expect(page).toHaveURL(/\/forecasts/);

    await page.goto("/experiments");
    await expect(page).toHaveURL(/\/experiments/);

    await page.goto("/settings");
    await expect(page).not.toHaveURL(/\/settings/);

    await context.close();
  });

  test("API routes: viewer gets 403 on /api/admin/users", async ({ browser }) => {
    const idToken = await createApprovedUser("viewer2@test.example", "viewer");

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.request.post("/api/auth/session", { data: { idToken } });

    const res = await page.request.get("/api/admin/users");
    expect([401, 403]).toContain(res.status());

    await context.close();
  });
});

test.describe("AC-6: /admin route — admin and super_admin only", () => {
  test.beforeEach(async () => {
    await clearEmulatorData();
  });

  test("super_admin can access /admin panel", async ({ browser }) => {
    const { uid } = await emulatorSignUp("superadmin@test.example", PASSWORD);
    await bootstrapSuperAdmin(uid);

    const context = await browser.newContext();
    const page = await context.newPage();
    // Load app so window.__testSignIn is available, then sign in via Firebase client
    await page.goto("/login");
    await signInFirebaseClient(page, "superadmin@test.example", PASSWORD);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator("body")).not.toContainText("500");

    await context.close();
  });

  test("admin role can access /admin panel", async ({ browser }) => {
    await createApprovedUser("admin2@test.example", "admin");

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await signInFirebaseClient(page, "admin2@test.example", PASSWORD);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);

    await context.close();
  });

  test("viewer cannot access /admin panel → redirected", async ({ browser }) => {
    const idToken = await createApprovedUser("viewer3@test.example", "viewer");

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.request.post("/api/auth/session", { data: { idToken } });

    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin$/);  // should have been redirected away

    await context.close();
  });

  test("analyst cannot access /admin panel → redirected", async ({ browser }) => {
    const idToken = await createApprovedUser("analyst2@test.example", "analyst");

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.request.post("/api/auth/session", { data: { idToken } });

    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin$/);  // should have been redirected away

    await context.close();
  });
});
