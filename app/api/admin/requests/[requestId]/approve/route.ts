import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { setCustomClaims } from "@/lib/auth/claims";
import {
  getAccessRequest,
  updateAccessRequest,
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
 * POST /api/admin/requests/[requestId]/approve
 *
 * Approves an access request: sets custom claims, updates Firestore, writes audit log.
 * Body: { role: UserRole }
 */
export async function POST(
  request: NextRequest,
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

  let body: { role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const role = body.role as UserRole | undefined;
  if (!role || !ASSIGNABLE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${ASSIGNABLE_ROLES.join(", ")}` },
      { status: 400 }
    );
  }

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

  await setCustomClaims(accessRequest.uid, { role, approved: true });

  await upsertUserDoc(accessRequest.uid, {
    role,
    approved: true,
    lastLoginAt: now,
  });

  await updateAccessRequest(requestId, {
    status: "approved",
    assignedRole: role,
    resolvedAt: now,
    resolvedBy: auth.uid,
  });

  await writeAuditLog({
    actorUid: auth.uid,
    actorEmail: auth.email,
    targetUid: accessRequest.uid,
    targetEmail: accessRequest.email,
    action: "access_approved",
    oldRole: null,
    newRole: role,
  });

  return NextResponse.json({ ok: true, requestId, role });
}
