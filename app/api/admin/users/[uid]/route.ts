import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { deleteUser } from "@/lib/auth/store";

export const runtime = "nodejs";

/**
 * DELETE /api/admin/users/:uid
 * Removes user from Firestore and Firebase Auth. Writes audit log.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const actor = await getServerAuth();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { uid } = await params;
  try {
    await deleteUser({ userKey: uid, actor });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    if (error.message === "CANNOT_DELETE_SELF") {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
    }
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    throw error;
  }
}
