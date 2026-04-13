/**
 * Create QA test user via Firebase Admin SDK
 * Usage: node scripts/create-qa-test-user.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const FIREBASE_PROJECT_ID = "analytics-platform-53335";
const FIREBASE_CLIENT_EMAIL =
  "firebase-adminsdk-fbsvc@analytics-platform-53335.iam.gserviceaccount.com";
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;

if (!FIREBASE_PRIVATE_KEY) {
  console.error("FIREBASE_PRIVATE_KEY env var required");
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const auth = getAuth();

const QA_EMAIL = "qa-test@analytics-platform.test";
const QA_PASSWORD = "qatest-staging-2026";
const QA_DISPLAY_NAME = "QA Test User";

async function main() {
  // Delete existing user if present
  try {
    const existing = await auth.getUserByEmail(QA_EMAIL);
    await auth.deleteUser(existing.uid);
    console.log(`Deleted existing user: ${existing.uid}`);
  } catch {
    // User doesn't exist, continue
  }

  // Create user
  const user = await auth.createUser({
    email: QA_EMAIL,
    password: QA_PASSWORD,
    displayName: QA_DISPLAY_NAME,
    emailVerified: true,
  });

  console.log(`Created user: ${user.uid}`);

  // Create custom token (valid 1 hour, used by Playwright signInWithCustomToken)
  const customToken = await auth.createCustomToken(user.uid);

  console.log("\n=== QA TEST USER CREDENTIALS ===");
  console.log(`Email:        ${QA_EMAIL}`);
  console.log(`Password:     ${QA_PASSWORD}`);
  console.log(`UID:          ${user.uid}`);
  console.log(`CustomToken:  ${customToken}`);
  console.log("================================\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
