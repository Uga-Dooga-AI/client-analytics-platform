import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { listUsers, toTimestampValue } from "@/lib/auth/store";

export const runtime = "nodejs";

/**
 * GET /api/admin/users
 * Returns the list of all users from the access store.
 * Admin/super_admin only (enforced by middleware RBAC).
 */
export async function GET() {
  const auth = await getServerAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = (await listUsers()).map((user) => ({
    id: user.id,
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    approved: user.approved,
    preAdded: user.preAdded,
    createdAt: toTimestampValue(user.createdAt),
  }));

  return NextResponse.json({ users });
}
