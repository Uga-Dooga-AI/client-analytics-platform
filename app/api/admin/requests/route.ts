import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import type { Query, CollectionReference } from "firebase-admin/firestore";

/**
 * GET /api/admin/requests
 * Query params:
 *   status   — filter by status (default: "pending"). Use "all" for all statuses.
 *   countOnly — if "true", returns only { count: number }
 */
export async function GET(request: NextRequest) {
  const auth = await getServerAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pending";
  const countOnly = searchParams.get("countOnly") === "true";

  let ref: CollectionReference | Query = adminDb.collection("access_requests");
  if (status !== "all") {
    ref = ref.where("status", "==", status);
  }
  ref = (ref as Query).orderBy("requestedAt", "desc");

  const snap = await ref.get();

  if (countOnly) {
    return NextResponse.json({ count: snap.size });
  }

  const requests = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ requests });
}
