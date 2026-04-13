import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { preAddUser } from "@/lib/auth/store";
import type { UserRole } from "@/lib/auth/types";

const ASSIGNABLE_ROLES: UserRole[] = [
  "admin",
  "analyst",
  "ab_analyst",
  "viewer",
];

export const runtime = "nodejs";

/**
 * POST /api/admin/users/pre-add
 *
 * Pre-adds a user by email with a role. If the Firebase user already exists,
 * custom claims are set immediately. Otherwise, the record is created with
 * preAdded=true so onUserLogin Cloud Function can apply claims on first login.
 *
 * Body: { email: string, role: UserRole }
 */
export async function POST(request: NextRequest) {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (auth.role !== "admin" && auth.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { email?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, role } = body as { email?: string; role?: UserRole };

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (!role || !ASSIGNABLE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${ASSIGNABLE_ROLES.join(", ")}` },
      { status: 400 }
    );
  }

  const result = await preAddUser({
    email,
    role,
    actor: { uid: auth.uid, email: auth.email },
  });

  return NextResponse.json({ ok: true, email, role, immediate: result.immediate });
}
