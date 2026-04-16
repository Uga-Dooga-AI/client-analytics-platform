import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { requestAnalyticsSync } from "@/lib/platform/store";

export const runtime = "nodejs";

function serializeRun(run: Awaited<ReturnType<typeof requestAnalyticsSync>>) {
  return {
    ...run,
    requestedAt: run.requestedAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const payload = await request.json().catch(() => ({}));

  try {
    const run = await requestAnalyticsSync(projectId, {
      runType: payload.runType,
      requestedBy: auth.email,
      triggerKind: "manual",
      windowFrom: payload.windowFrom ?? null,
      windowTo: payload.windowTo ?? null,
    });
    return NextResponse.json({ run: serializeRun(run) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not queue refresh.";
    return NextResponse.json({ error: message }, { status: message === "Project not found." ? 404 : 400 });
  }
}
