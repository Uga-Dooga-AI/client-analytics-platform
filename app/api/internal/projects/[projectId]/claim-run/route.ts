import { NextRequest, NextResponse } from "next/server";
import { authorizeInternalWorker } from "@/lib/platform/internal-auth";
import { buildAnalyticsRuntimeBundle } from "@/lib/platform/runtime-bundle";
import {
  claimNextAnalyticsRun,
  getAnalyticsRunContext,
  type AnalyticsRunType,
} from "@/lib/platform/store";

export const runtime = "nodejs";

const RUN_TYPES: AnalyticsRunType[] = [
  "bootstrap",
  "ingestion",
  "backfill",
  "forecast",
  "bounds_refresh",
  "serving_refresh",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRunTypes(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = value.filter(
    (entry): entry is AnalyticsRunType =>
      typeof entry === "string" && RUN_TYPES.includes(entry as AnalyticsRunType)
  );

  return parsed.length === value.length ? parsed : null;
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
  const parsedRunTypes = parseRunTypes(body.runTypes);

  if (body.runTypes !== undefined && parsedRunTypes === null) {
    return NextResponse.json({ error: "Invalid run types." }, { status: 400 });
  }

  try {
    const claimedRun = await claimNextAnalyticsRun(projectId, {
      runTypes: parsedRunTypes ?? undefined,
      message:
        typeof body.message === "string"
          ? body.message.slice(0, 500)
          : "Worker claimed this run for execution.",
    });

    if (!claimedRun) {
      return NextResponse.json({ claimed: false });
    }

    const context = await getAnalyticsRunContext(claimedRun.id);
    if (!context) {
      return NextResponse.json({ error: "Run was claimed but could not be reloaded." }, { status: 500 });
    }

    return NextResponse.json({
      claimed: true,
      run: {
        ...context.run,
        requestedAt: context.run.requestedAt.toISOString(),
        startedAt: context.run.startedAt?.toISOString() ?? null,
        finishedAt: context.run.finishedAt?.toISOString() ?? null,
      },
      runtimeBundle: buildAnalyticsRuntimeBundle(context.bundle, {
        baseUrl: request.nextUrl.origin,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not claim run.";
    return NextResponse.json({ error: message }, { status: message === "Project not found." ? 404 : 400 });
  }
}
