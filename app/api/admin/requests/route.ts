import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { listAccessRequests, toTimestampValue } from "@/lib/auth/store";

export const runtime = "nodejs";

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
  const requests = await listAccessRequests({
    status: status === "all" ? "all" : (status as "pending" | "approved" | "rejected"),
  });

  if (countOnly) {
    return NextResponse.json({ count: requests.length });
  }

  return NextResponse.json({
    requests: requests.map((entry) => ({
      id: entry.requestId,
      requestId: entry.requestId,
      uid: entry.authUid,
      email: entry.email,
      displayName: entry.displayName,
      status: entry.status,
      requestedAt: toTimestampValue(entry.requestedAt),
      resolvedAt: toTimestampValue(entry.resolvedAt),
      resolvedBy: entry.resolvedBy,
      assignedRole: entry.assignedRole,
    })),
  });
}
