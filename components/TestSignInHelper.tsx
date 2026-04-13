"use client";

/**
 * E2E test helper: exposes window.__testSignIn(email, password) in emulator mode.
 *
 * Allows Playwright tests to establish a Firebase client auth session (required
 * for client-side auth guards like AdminLayout) without going through Google OAuth.
 * Only active when NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST is set.
 */

import { useEffect } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

declare global {
  interface Window {
    __testSignIn?: (email: string, password: string) => Promise<string>;
  }
}

export function TestSignInHelper() {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST) return;

    window.__testSignIn = async (email: string, password: string): Promise<string> => {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await cred.user.getIdToken();
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      return idToken;
    };

    return () => {
      delete window.__testSignIn;
    };
  }, []);

  return null;
}
