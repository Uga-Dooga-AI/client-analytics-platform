import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { listAnalyticsProjectRuns } from "@/lib/platform/store";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const runs = await listAnalyticsProjectRuns(projectId);
  return NextResponse.json({
    runs: runs.map((run) => ({
      ...run,
      requestedAt: run.requestedAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
    })),
  });
}
