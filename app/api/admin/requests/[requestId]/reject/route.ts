import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { rejectAccessRequest } from "@/lib/auth/store";

export const runtime = "nodejs";

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

  try {
    await rejectAccessRequest({
      requestId,
      actor: { uid: auth.uid, email: auth.email },
    });
    return NextResponse.json({ ok: true, requestId });
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
