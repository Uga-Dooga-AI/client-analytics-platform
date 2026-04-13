import { NextRequest, NextResponse } from "next/server";
import { createAccessRequest } from "@/lib/auth/store";
import { readSessionFromRequest } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * POST /api/access-requests
 * Authenticated (any valid token). Creates a pending access request for the caller.
 */
export async function POST(request: NextRequest) {
  const auth = await readSessionFromRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const created = await createAccessRequest({
      authUid: auth.uid,
      email: auth.email,
      displayName: auth.displayName,
    });
    return NextResponse.json({ requestId: created.requestId }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_EXISTS") {
      return NextResponse.json({ error: "Request already pending" }, { status: 409 });
    }
    throw error;
  }
}
