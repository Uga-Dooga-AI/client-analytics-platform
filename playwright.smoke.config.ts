import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke test configuration — demo access mode.
 *
 * Runs against a local Next.js dev server with DEMO_ACCESS_ENABLED=true,
 * which bypasses Firebase auth in middleware (x-auth-role=admin injected).
 * Used for authenticated dashboard route coverage when staging Firebase
 * password login is unavailable.
 *
 * Run: npx playwright test --config=playwright.smoke.config.ts
 */

const PORT = 3201;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e/smoke",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-smoke-report" }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "on",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command:
      `DEMO_ACCESS_ENABLED=true ` +
      `NEXT_PUBLIC_DEMO_ACCESS_ENABLED=true ` +
      `NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-test ` +
      `NEXT_PUBLIC_FIREBASE_API_KEY=demo-key ` +
      `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-test.firebaseapp.com ` +
      `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-test.appspot.com ` +
      `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000 ` +
      `NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:demo ` +
      `FIREBASE_PROJECT_ID=demo-test ` +
      `FIREBASE_CLIENT_EMAIL=demo@demo-test.iam.gserviceaccount.com ` +
      `FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4PAtEsHAaiMcMf2tFDMzKdDNKRO\nzVi38X2WN+HWTH0r1ABkNGqAM1jmgxRlvV7xHWfSaGBGlJUo4R2HtCGa9NtWRfFO\ndemo-only-not-a-real-key\n-----END RSA PRIVATE KEY-----\n" ` +
      `AUTH_SECRET=demo-auth-secret-for-local-smoke-testing-only ` +
      `PORT=${PORT} npm run dev`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
