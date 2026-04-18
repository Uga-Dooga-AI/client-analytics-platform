import { NextRequest, NextResponse } from "next/server";
import { authorizeInternalWorker } from "@/lib/platform/internal-auth";
import { buildAnalyticsRuntimeBundle } from "@/lib/platform/runtime-bundle";
import {
  getAnalyticsRunContext,
  updateAnalyticsSyncRun,
  type AnalyticsRunStatus,
  type AnalyticsSourceStatus,
  type AnalyticsSourceType,
} from "@/lib/platform/store";

export const runtime = "nodejs";

const RUN_STATUSES: AnalyticsRunStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "waiting_credentials",
];

const SOURCE_STATUSES: AnalyticsSourceStatus[] = [
  "missing_credentials",
  "configured",
  "ready",
  "syncing",
  "error",
];

const SOURCE_TYPES: AnalyticsSourceType[] = [
  "appmetrica_logs",
  "bigquery_export",
  "bounds_artifacts",
  "unity_ads_spend",
  "google_ads_spend",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseStatus(value: unknown) {
  return typeof value === "string" && RUN_STATUSES.includes(value as AnalyticsRunStatus)
    ? (value as AnalyticsRunStatus)
    : undefined;
}

function parseSourceStatus(value: unknown) {
  return typeof value === "string" && SOURCE_STATUSES.includes(value as AnalyticsSourceStatus)
    ? (value as AnalyticsSourceStatus)
    : undefined;
}

function parseSourceType(value: unknown) {
  if (value === null) {
    return null;
  }

  return typeof value === "string" && SOURCE_TYPES.includes(value as AnalyticsSourceType)
    ? (value as AnalyticsSourceType)
    : undefined;
}

function serializeRunContext(
  context: NonNullable<Awaited<ReturnType<typeof getAnalyticsRunContext>>>,
  baseUrl: string
) {
  return {
    run: {
      ...context.run,
      requestedAt: context.run.requestedAt.toISOString(),
      startedAt: context.run.startedAt?.toISOString() ?? null,
      finishedAt: context.run.finishedAt?.toISOString() ?? null,
    },
    runtimeBundle: buildAnalyticsRuntimeBundle(context.bundle, {
      baseUrl,
    }),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = authorizeInternalWorker(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { runId } = await params;
  const context = await getAnalyticsRunContext(runId);
  if (!context) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(serializeRunContext(context, request.nextUrl.origin));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = authorizeInternalWorker(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { runId } = await params;
  const payload = await request.json().catch(() => ({}));
  const body = isRecord(payload) ? payload : {};
  const status = parseStatus(body.status);
  const sourceStatus = parseSourceStatus(body.sourceStatus);
  const sourceType = parseSourceType(body.sourceType);

  if (body.status !== undefined && !status) {
    return NextResponse.json({ error: "Invalid run status." }, { status: 400 });
  }

  if (body.sourceStatus !== undefined && !sourceStatus) {
    return NextResponse.json({ error: "Invalid source status." }, { status: 400 });
  }

  if (body.sourceType !== undefined && sourceType === undefined) {
    return NextResponse.json({ error: "Invalid source type." }, { status: 400 });
  }

  try {
    const run = await updateAnalyticsSyncRun(runId, {
      status,
      sourceStatus,
      sourceType,
      message: typeof body.message === "string" ? body.message.slice(0, 500) : null,
      startedAt: typeof body.startedAt === "string" ? body.startedAt : null,
      finishedAt: typeof body.finishedAt === "string" ? body.finishedAt : null,
      lastSyncAt: typeof body.lastSyncAt === "string" ? body.lastSyncAt : null,
      nextSyncAt: typeof body.nextSyncAt === "string" ? body.nextSyncAt : null,
      payload: isRecord(body.payload) ? body.payload : undefined,
    });

    return NextResponse.json({
      run: {
        ...run,
        requestedAt: run.requestedAt.toISOString(),
        startedAt: run.startedAt?.toISOString() ?? null,
        finishedAt: run.finishedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update run.";
    return NextResponse.json({ error: message }, { status: message === "Run not found." ? 404 : 400 });
  }
}
