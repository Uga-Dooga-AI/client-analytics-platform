/**
 * POST /api/test/seed
 *
 * Test-only seeding endpoint.
 * ONLY available when FIREBASE_AUTH_EMULATOR_HOST is set (emulator mode).
 * Uses Firebase Admin SDK to bypass Firestore security rules.
 *
 * Actions:
 *   - setCustomClaims: Set custom claims on a user
 *   - seedUserDoc:     Write a user document to Firestore
 *   - seedAccessRequest: Write an access request document
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import type { UserRole } from "@/lib/auth/types";

type SeedAction =
  | { action: "setCustomClaims"; uid: string; claims: { role: UserRole; approved: boolean } }
  | {
      action: "seedUserDoc";
      uid: string;
      email: string;
      role: UserRole;
      approved: boolean;
      preAdded?: boolean;
      addedBy?: string | null;
    }
  | {
      action: "seedAccessRequest";
      requestId: string;
      uid: string;
      email: string;
    };

export async function POST(request: NextRequest) {
  // Guard: only available in emulator mode
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return NextResponse.json({ error: "Not available outside emulator mode" }, { status: 403 });
  }

  let body: SeedAction;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.action === "setCustomClaims") {
      await adminAuth.setCustomUserClaims(body.uid, body.claims);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "seedUserDoc") {
      const now = Timestamp.now();
      await adminDb.collection("users").doc(body.uid).set({
        uid: body.uid,
        email: body.email,
        displayName: null,
        role: body.role,
        approved: body.approved,
        preAdded: body.preAdded ?? false,
        addedBy: body.addedBy ?? null,
        createdAt: now,
        lastLoginAt: now,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "seedAccessRequest") {
      const now = Timestamp.now();
      await adminDb.collection("access_requests").doc(body.requestId).set({
        requestId: body.requestId,
        uid: body.uid,
        email: body.email,
        displayName: null,
        status: "pending",
        requestedAt: now,
        resolvedAt: null,
        resolvedBy: null,
        assignedRole: null,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
