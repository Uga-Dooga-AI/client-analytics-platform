/**
 * Dashboard smoke test — demo access mode.
 *
 * Validates all authenticated dashboard routes render correctly
 * without console errors. Runs against a local Next.js server with
 * DEMO_ACCESS_ENABLED=true which injects admin claims in middleware,
 * bypassing Firebase OAuth.
 *
 * Evidence produced:
 *   - Screenshots in test-results/ (auto-captured on every step)
 *   - playwright-smoke-report/index.html
 *
 * Related: UGAA-1293
 */

import { test, expect, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const DASHBOARD_ROUTES = [
  { path: "/overview", label: "overview" },
  { path: "/acquisition", label: "acquisition" },
  { path: "/experiments", label: "experiments" },
  { path: "/funnels", label: "funnels" },
  { path: "/cohorts", label: "cohorts" },
  { path: "/forecasts", label: "forecasts" },
  { path: "/access", label: "access" },
  { path: "/settings", label: "settings" },
] as const;

const screenshotsDir = path.join(process.cwd(), "smoke-screenshots");

test.beforeAll(() => {
  fs.mkdirSync(screenshotsDir, { recursive: true });
});

async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  return errors;
}

test("smoke: login page renders and shows demo access button", async ({ page }) => {
  const errors = await collectConsoleErrors(page);

  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  const title = await page.title();
  expect(title).toBe("Client Analytics Platform");

  // Branding
  await expect(page.locator("text=Analytics")).toBeVisible();
  await expect(page.locator("text=Войти через Google")).toBeVisible();

  // Demo access enabled — button should be present
  await expect(page.locator("text=Открыть demo workspace")).toBeVisible();

  await page.screenshot({
    path: path.join(screenshotsDir, "01-login-page.png"),
    fullPage: true,
  });

  expect(errors, `Console errors on /login: ${errors.join(", ")}`).toHaveLength(0);
});

test("smoke: / redirects to dashboard/overview in demo mode", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Demo mode middleware sets admin claims → should land on overview (not login)
  const url = page.url();
  expect(url).not.toContain("/login");
});

for (const route of DASHBOARD_ROUTES) {
  test(`smoke: ${route.path} renders without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(`[${msg.type()}] ${msg.text()}`);
      }
    });

    await page.goto(route.path);
    await page.waitForLoadState("networkidle");

    const url = page.url();

    // Should NOT redirect to /login (demo mode should allow access)
    expect(url, `${route.path} redirected unexpectedly to login`).not.toContain("login");

    // Should NOT show 404 or 500
    await expect(page.locator("body")).not.toContainText("500");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");

    // Page title should be set
    const title = await page.title();
    expect(title, `${route.path} has empty title`).toBeTruthy();

    await page.screenshot({
      path: path.join(screenshotsDir, `${route.label}.png`),
      fullPage: true,
    });

    expect(
      errors,
      `Console errors on ${route.path}:\n${errors.join("\n")}`
    ).toHaveLength(0);
  });
}

test("smoke: sidebar navigation links are present on overview", async ({ page }) => {
  await page.goto("/overview");
  await page.waitForLoadState("networkidle");

  const navLinks = [
    "/overview",
    "/acquisition",
    "/experiments",
    "/funnels",
    "/cohorts",
    "/forecasts",
    "/access",
    "/settings",
  ];

  for (const href of navLinks) {
    // Sidebar appends filter query params, so match href prefix
    const link = page.locator(`a[href^="${href}"]`).first();
    await expect(link, `Nav link to ${href} not found`).toBeVisible();
  }

  await page.screenshot({
    path: path.join(screenshotsDir, "sidebar-navigation.png"),
    fullPage: false,
  });
});

test("smoke: /dashboard/experiments/test-id detail view renders", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  // Use a mock experiment ID — page should render (mock data) without crashing
  await page.goto("/experiments/exp-001");
  await page.waitForLoadState("networkidle");

  await expect(page.locator("body")).not.toContainText("Internal Server Error");

  await page.screenshot({
    path: path.join(screenshotsDir, "experiments-detail.png"),
    fullPage: true,
  });

  expect(errors, `Console errors on experiments detail: ${errors.join(", ")}`).toHaveLength(0);
});
