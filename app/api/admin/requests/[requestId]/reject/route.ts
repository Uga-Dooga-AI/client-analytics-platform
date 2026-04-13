import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import {
  getAccessRequest,
  updateAccessRequest,
  writeAuditLog,
  Timestamp,
} from "@/lib/firebase/firestore";

/**
 * POST /api/admin/requests/[requestId]/reject
 *
 * Rejects an access request: updates Firestore status, writes audit log.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (auth.role !== "admin" && auth.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestId } = await params;

  const accessRequest = await getAccessRequest(requestId);
  if (!accessRequest) {
    return NextResponse.json({ error: "Access request not found" }, { status: 404 });
  }
  if (accessRequest.status !== "pending") {
    return NextResponse.json(
      { error: `Request is already ${accessRequest.status}` },
      { status: 409 }
    );
  }

  const now = Timestamp.now();

  await updateAccessRequest(requestId, {
    status: "rejected",
    resolvedAt: now,
    resolvedBy: auth.uid,
  });

  await writeAuditLog({
    actorUid: auth.uid,
    actorEmail: auth.email,
    targetUid: accessRequest.uid,
    targetEmail: accessRequest.email,
    action: "access_rejected",
    oldRole: null,
    newRole: null,
  });

  return NextResponse.json({ ok: true, requestId });
}
