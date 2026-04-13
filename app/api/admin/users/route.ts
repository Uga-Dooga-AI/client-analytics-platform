import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/admin/users
 * Returns the list of all users from Firestore `users` collection.
 * Admin/super_admin only (enforced by middleware RBAC).
 */
export async function GET() {
  const auth = await getServerAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await adminDb.collection("users").orderBy("createdAt", "desc").get();
  const users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  return NextResponse.json({ users });
}
