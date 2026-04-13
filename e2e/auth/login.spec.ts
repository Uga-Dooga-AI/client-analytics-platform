/**
 * AC-1: Google SSO login → callback → session создана
 * AC-2: Новый Google аккаунт → access request экран
 *
 * In emulator mode we bypass the Google OAuth popup:
 * - Create a user directly via the emulator REST API
 * - Exchange the idToken for a session cookie via /api/auth/session
 * - Inject the cookie into the browser context
 */

import { test, expect } from "@playwright/test";
import {
  clearEmulatorData,
  emulatorSignUp,
  emulatorSignIn,
  emulatorRefreshToken,
} from "../helpers/emulator";
import { loginAs, logout } from "../helpers/auth";
import { bootstrapSuperAdmin } from "../helpers/seed";

const PASSWORD = "Test1234!";

test.beforeEach(async () => {
  await clearEmulatorData();
});

test("AC-1: /api/auth/session verifies idToken, returns uid, sets httpOnly __session cookie", async ({
  request,
}) => {
  const { uid, idToken } = await emulatorSignUp("user-ac1@test.example", PASSWORD);

  const res = await request.post("/api/auth/session", {
    data: { idToken },
  });
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.uid).toBe(uid);

  const setCookie = res.headers()["set-cookie"] ?? "";
  expect(setCookie).toContain("__session=");
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie.toLowerCase()).toContain("samesite=strict");
});

test("AC-1: approved user navigates to / → redirected to /overview (session active)", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Create user and bootstrap as super_admin (approved=true, role=super_admin)
  const { uid, refreshToken } = await emulatorSignUp("approved@test.example", PASSWORD);
  await bootstrapSuperAdmin(uid);

  // Refresh token to pick up newly-set custom claims
  const { idToken } = await emulatorRefreshToken(refreshToken);
  const sessionRes = await page.request.post("/api/auth/session", { data: { idToken } });
  expect(sessionRes.status()).toBe(200);

  // Navigate to root → should land on /overview (not /login or /access-request)
  await page.goto("/");
  await expect(page).toHaveURL(/\/overview/);

  await context.close();
});

test("AC-2: new unrecognised Google account → access-request screen", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  // New user with no approval or pre-add
  await loginAs(context, "newuser@test.example", PASSWORD);

  await page.goto("/overview");
  await expect(page).toHaveURL(/\/access-request/);

  // The access-request page should render without 500
  await expect(page.locator("body")).not.toContainText("500");
  await expect(page.locator("body")).not.toContainText("Internal Server Error");

  await context.close();
});

test("AC-1 (session): logout → subsequent visit redirects to /login", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  const { uid } = await emulatorSignUp("logout-test@test.example", PASSWORD);
  await bootstrapSuperAdmin(uid);
  const { idToken } = await emulatorSignIn("logout-test@test.example", PASSWORD);
  await page.request.post("/api/auth/session", { data: { idToken } });

  await logout(page);

  await page.goto("/overview");
  await expect(page).toHaveURL(/\/login/);

  await context.close();
});
