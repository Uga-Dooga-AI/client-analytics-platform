import { defineConfig, devices } from "@playwright/test";

/**
 * E2E test configuration for Client Analytics Platform.
 *
 * Prerequisites:
 *   1. Firebase Emulators running: `firebase emulators:start --only auth,firestore`
 *   2. Emulators on default ports: Auth=9099, Firestore=8080
 *
 * Run: npm run test:e2e
 */

const PORT = 3200;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // auth tests share emulator state — run serially by default
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command:
      `NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-test ` +
      `NEXT_PUBLIC_FIREBASE_API_KEY=demo-key ` +
      `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 ` +
      `FIREBASE_PROJECT_ID=demo-test ` +
      `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 ` +
      `FIRESTORE_EMULATOR_HOST=localhost:8080 ` +
      `SUPERADMIN_BOOTSTRAP_KEY=test-bootstrap-key-1234 ` +
      `PORT=${PORT} npm run dev`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
