import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import type { Query, CollectionReference } from "firebase-admin/firestore";

/**
 * GET /api/admin/audit
 * Query params:
 *   action — filter by action type
 *   from   — ISO date string (inclusive start)
 *   to     — ISO date string (inclusive end)
 *   limit  — page size (default: 50, max: 200)
 *   after  — last document id for cursor-based pagination
 */
export async function GET(request: NextRequest) {
  const auth = await getServerAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limitParam = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const afterId = searchParams.get("after");

  let ref: CollectionReference | Query = adminDb.collection("audit_log");

  if (action) {
    ref = ref.where("action", "==", action);
  }
  if (from) {
    ref = (ref as Query).where("timestamp", ">=", new Date(from));
  }
  if (to) {
    ref = (ref as Query).where("timestamp", "<=", new Date(to));
  }

  ref = (ref as Query).orderBy("timestamp", "desc").limit(limitParam);

  if (afterId) {
    const cursorDoc = await adminDb.collection("audit_log").doc(afterId).get();
    if (cursorDoc.exists) {
      ref = (ref as Query).startAfter(cursorDoc);
    }
  }

  const snap = await ref.get();
  const entries = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const lastId = snap.docs[snap.docs.length - 1]?.id ?? null;

  return NextResponse.json({ entries, nextAfter: entries.length === limitParam ? lastId : null });
}
