import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { listAnalyticsProjectRunsPage } from "@/lib/platform/store";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const limit = Number(searchParams.get("limit") ?? "") || undefined;
  const offset = Number(searchParams.get("offset") ?? "") || undefined;
  const result = await listAnalyticsProjectRunsPage(projectId, { limit, offset });
  return NextResponse.json({
    runs: result.runs.map((run) => ({
      ...run,
      requestedAt: run.requestedAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
    })),
    hasMore: result.hasMore,
    limit: result.limit,
    offset: result.offset,
  });
}
