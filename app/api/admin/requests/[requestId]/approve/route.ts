import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { approveAccessRequest } from "@/lib/auth/store";
import type { UserRole } from "@/lib/auth/types";

const ASSIGNABLE_ROLES: UserRole[] = [
  "admin",
  "analyst",
  "ab_analyst",
  "viewer",
];

export const runtime = "nodejs";

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

  try {
    await approveAccessRequest({
      requestId,
      role,
      actor: { uid: auth.uid, email: auth.email },
    });
    return NextResponse.json({ ok: true, requestId, role });
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Access request not found" }, { status: 404 });
    }
    if (error.message === "ALREADY_RESOLVED") {
      return NextResponse.json({ error: "Request is already resolved" }, { status: 409 });
    }
    throw error;
  }
}
