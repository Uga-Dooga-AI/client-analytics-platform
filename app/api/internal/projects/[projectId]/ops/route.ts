import { NextRequest, NextResponse } from "next/server";
import { authorizeInternalWorker } from "@/lib/platform/internal-auth";
import {
  getAnalyticsProject,
  requestAnalyticsSync,
  serializeProjectBundle,
  updateAnalyticsProject,
} from "@/lib/platform/store";

export const runtime = "nodejs";

type AllowedRunType = "bootstrap" | "backfill" | "ingestion" | "bounds_refresh" | "forecast";

const ALLOWED_RUN_TYPES = new Set<AllowedRunType>([
  "bootstrap",
  "backfill",
  "ingestion",
  "bounds_refresh",
  "forecast",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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
  const auth = authorizeInternalWorker(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { projectId } = await params;
  const payload = await request.json().catch(() => ({}));
  const body = isRecord(payload) ? payload : {};

  const projectPatch = isRecord(body.project) ? body.project : null;
  const runRequest = isRecord(body.run) ? body.run : null;
  const runType = runRequest
    ? (String(runRequest.runType ?? "").trim() as AllowedRunType)
    : null;

  if (runType && !ALLOWED_RUN_TYPES.has(runType)) {
    return NextResponse.json({ error: "Invalid run type." }, { status: 400 });
  }

  let updatedProject = projectPatch
    ? await updateAnalyticsProject(
        projectId,
        {
          initialBackfillDays:
            typeof projectPatch.initialBackfillDays === "number"
              ? projectPatch.initialBackfillDays
              : undefined,
          forecastHorizonDays:
            typeof projectPatch.forecastHorizonDays === "number"
              ? projectPatch.forecastHorizonDays
              : undefined,
        },
        "internal-worker@system"
      )
    : await getAnalyticsProject(projectId);

  if (!updatedProject) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let queuedRun: Awaited<ReturnType<typeof requestAnalyticsSync>> | null = null;
  if (runRequest && runType) {
    queuedRun = await requestAnalyticsSync(projectId, {
      runType,
      requestedBy: "internal-worker@system",
      triggerKind: "manual",
      windowFrom:
        typeof runRequest.windowFrom === "string" ? runRequest.windowFrom : null,
      windowTo: typeof runRequest.windowTo === "string" ? runRequest.windowTo : null,
      payload:
        runRequest.forceReload === true
          ? { forceReload: true }
          : undefined,
    });
  }

  updatedProject = await getAnalyticsProject(projectId);
  if (!updatedProject) {
    return NextResponse.json({ error: "Project not found after update." }, { status: 404 });
  }

  return NextResponse.json({
    project: serializeProjectBundle(updatedProject),
    run: queuedRun ? serializeRun(queuedRun) : null,
  });
}
