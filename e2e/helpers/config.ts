/** Base URL of the Next.js app under test. Matches playwright.config.ts webServer PORT. */
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3200";
