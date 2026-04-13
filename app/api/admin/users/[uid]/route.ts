import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * DELETE /api/admin/users/:uid
 * Removes user from Firestore and Firebase Auth. Writes audit log.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const actor = await getServerAuth();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { uid } = await params;

  if (uid === actor.uid) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  // Prevent non-super_admin from deleting super_admin
  const targetSnap = await adminDb.collection("users").doc(uid).get();
  if (targetSnap.exists) {
    const targetData = targetSnap.data()!;
    if (targetData.role === "super_admin" && actor.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const batch = adminDb.batch();

  // Remove Firestore user doc
  batch.delete(adminDb.collection("users").doc(uid));

  // Audit log
  const auditRef = adminDb.collection("audit_log").doc();
  batch.set(auditRef, {
    logId: auditRef.id,
    timestamp: FieldValue.serverTimestamp(),
    actorUid: actor.uid,
    actorEmail: actor.email,
    targetUid: uid,
    targetEmail: targetSnap.data()?.email ?? null,
    action: "user_removed",
    oldRole: targetSnap.data()?.role ?? null,
    newRole: null,
  });

  await batch.commit();

  // Delete from Firebase Auth (best-effort, may not exist)
  await adminAuth.deleteUser(uid).catch(() => null);

  return NextResponse.json({ ok: true });
}
