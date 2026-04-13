import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/access-requests
 * Authenticated (any valid token). Creates a pending access request for the caller.
 */
export async function POST() {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existingSnap = await adminDb
    .collection("access_requests")
    .where("uid", "==", auth.uid)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    return NextResponse.json({ error: "Request already pending" }, { status: 409 });
  }

  const docRef = adminDb.collection("access_requests").doc();
  await docRef.set({
    requestId: docRef.id,
    uid: auth.uid,
    email: auth.email,
    displayName: null,
    status: "pending",
    requestedAt: FieldValue.serverTimestamp(),
    resolvedAt: null,
    resolvedBy: null,
    assignedRole: null,
  });

  return NextResponse.json({ requestId: docRef.id }, { status: 201 });
}
