#!/usr/bin/env node
/**
 * Creates a Firebase test user for QA staging browser pass.
 * Requires env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 * Run via: railway run --service 538dbb46-1761-41ab-8a83-6f8b146acbb8 node scripts/create-firebase-test-user.mjs
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  console.error("Missing required env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY");
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const auth = getAuth();
const QA_EMAIL = "qa-test@analytics-platform.test";
const QA_PASSWORD = "qatest-staging-2026";

async function run() {
  // Check if user already exists
  let user;
  try {
    user = await auth.getUserByEmail(QA_EMAIL);
    console.log("Test user already exists:", user.uid);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      user = await auth.createUser({
        email: QA_EMAIL,
        password: QA_PASSWORD,
        displayName: "QA Test User",
        emailVerified: true,
      });
      console.log("Test user created:", user.uid);
    } else {
      throw err;
    }
  }

  const customToken = await auth.createCustomToken(user.uid);
  console.log("\n=== QA TEST USER CREDENTIALS ===");
  console.log("UID:    ", user.uid);
  console.log("Email:  ", QA_EMAIL);
  console.log("Password:", QA_PASSWORD);
  console.log("\nCustom Token (valid 1 hour):");
  console.log(customToken);
  console.log("\nUse in Playwright:");
  console.log(`  await signInWithCustomToken(getAuth(), "<TOKEN_ABOVE>")`);
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
