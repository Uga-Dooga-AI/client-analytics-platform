import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { setCustomClaims } from "@/lib/auth/claims";
import { adminAuth } from "@/lib/firebase/admin";
import {
  getUserDocByEmail,
  upsertUserDoc,
  writeAuditLog,
  Timestamp,
} from "@/lib/firebase/firestore";
import type { UserRole } from "@/lib/auth/types";

const ASSIGNABLE_ROLES: UserRole[] = [
  "admin",
  "analyst",
  "ab_analyst",
  "viewer",
];

/**
 * POST /api/admin/users/pre-add
 *
 * Pre-adds a user by email with a role. If the Firebase user already exists,
 * custom claims are set immediately. Otherwise, the record is created with
 * preAdded=true so onUserLogin Cloud Function can apply claims on first login.
 *
 * Body: { email: string, role: UserRole }
 */
export async function POST(request: NextRequest) {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (auth.role !== "admin" && auth.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { email?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, role } = body as { email?: string; role?: UserRole };

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (!role || !ASSIGNABLE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${ASSIGNABLE_ROLES.join(", ")}` },
      { status: 400 }
    );
  }

  const now = Timestamp.now();

  // Check if a Firebase Auth user with this email already exists
  const firebaseUser = await adminAuth.getUserByEmail(email).catch(() => null);

  if (firebaseUser) {
    // User exists — set claims immediately
    await setCustomClaims(firebaseUser.uid, { role, approved: true });

    await upsertUserDoc(firebaseUser.uid, {
      uid: firebaseUser.uid,
      email,
      displayName: firebaseUser.displayName ?? null,
      role,
      approved: true,
      preAdded: true,
      addedBy: auth.uid,
      createdAt: now,
      lastLoginAt: null,
    });

    await writeAuditLog({
      actorUid: auth.uid,
      actorEmail: auth.email,
      targetUid: firebaseUser.uid,
      targetEmail: email,
      action: "user_pre_added",
      oldRole: null,
      newRole: role,
    });

    return NextResponse.json({ ok: true, email, role, immediate: true });
  }

  // User does not exist yet — create a pending pre-approved record keyed by email
  // The onUserLogin Cloud Function will pick this up on first sign-in.
  const existingDoc = await getUserDocByEmail(email);
  if (existingDoc) {
    // Update existing pre-add record
    await upsertUserDoc(existingDoc.uid, { role, addedBy: auth.uid });
  } else {
    // Store as a sentinel doc keyed by a stable email-based id
    // Using email as uid placeholder (will be updated by onUserLogin)
    const pendingUid = `pre:${email}`;
    await upsertUserDoc(pendingUid, {
      uid: pendingUid,
      email,
      displayName: null,
      role,
      approved: false,
      preAdded: true,
      addedBy: auth.uid,
      createdAt: now,
      lastLoginAt: null,
    });
  }

  await writeAuditLog({
    actorUid: auth.uid,
    actorEmail: auth.email,
    targetUid: null,
    targetEmail: email,
    action: "user_pre_added",
    oldRole: null,
    newRole: role,
  });

  return NextResponse.json({ ok: true, email, role, immediate: false });
}
