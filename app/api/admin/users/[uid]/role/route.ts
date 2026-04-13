import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import type { UserRole } from "@/lib/auth/types";
import { updateUserRole } from "@/lib/auth/store";

const VALID_ROLES: UserRole[] = ["super_admin", "admin", "analyst", "ab_analyst", "viewer"];

export const runtime = "nodejs";

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

  try {
    await updateUserRole({ userKey: uid, role: newRole, actor });
    return NextResponse.json({ ok: true, role: newRole });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
}
