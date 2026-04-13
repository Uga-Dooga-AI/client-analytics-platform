import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { listAuditEntries, toTimestampValue } from "@/lib/auth/store";

export const runtime = "nodejs";

/**
 * GET /api/admin/audit
 * Query params:
 *   action — filter by action type
 *   from   — ISO date string (inclusive start)
 *   to     — ISO date string (inclusive end)
 *   limit  — page size (default: 50, max: 200)
 *   after  — last document id for cursor-based pagination
 */
export async function GET(request: NextRequest) {
  const auth = await getServerAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limitParam = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const after = searchParams.get("after");
  const { entries, nextAfter } = await listAuditEntries({
    action,
    from,
    to,
    limit: limitParam,
    after,
  });

  return NextResponse.json({
    entries: entries.map((entry) => ({
      id: entry.logId,
      timestamp: toTimestampValue(entry.timestamp),
      actorEmail: entry.actorEmail,
      targetEmail: entry.targetEmail,
      action: entry.action,
      oldRole: entry.oldRole,
      newRole: entry.newRole,
    })),
    nextAfter,
  });
}
