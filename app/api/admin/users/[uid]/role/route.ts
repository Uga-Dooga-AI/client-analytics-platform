import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import type { UserRole } from "@/lib/auth/types";

const VALID_ROLES: UserRole[] = ["super_admin", "admin", "analyst", "ab_analyst", "viewer"];

/**
 * PATCH /api/admin/users/:uid/role
 * Body: { role: UserRole }
 * Updates user role in Firestore and sets Firebase Custom Claims.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const actor = await getServerAuth();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { uid } = await params;
  const body = await request.json().catch(() => ({}));
  const newRole: UserRole = body.role;

  if (!VALID_ROLES.includes(newRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Only super_admin can assign super_admin role
  if (newRole === "super_admin" && actor.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userRef = adminDb.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const oldRole = userSnap.data()?.role ?? null;

  const batch = adminDb.batch();

  batch.update(userRef, { role: newRole, updatedAt: FieldValue.serverTimestamp() });

  const auditRef = adminDb.collection("audit_log").doc();
  batch.set(auditRef, {
    logId: auditRef.id,
    timestamp: FieldValue.serverTimestamp(),
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetUid: uid,
    targetEmail: userSnap.data()?.email ?? null,
    action: oldRole ? "role_changed" : "role_assigned",
    oldRole,
    newRole,
  });

  await batch.commit();

  // Update Firebase custom claims so the next token refresh reflects the new role
  await adminAuth.setCustomUserClaims(uid, {
    role: newRole,
    approved: true,
  });

  return NextResponse.json({ ok: true, role: newRole });
}
