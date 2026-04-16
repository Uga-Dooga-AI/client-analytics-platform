import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import {
  getAnalyticsProjectBySlug,
  listForecastCombinations,
  recordForecastCombinationView,
  serializeForecastCombination,
} from "@/lib/platform/store";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectKey: string }> }
) {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectKey } = await params;
  const project = await getAnalyticsProjectBySlug(projectKey);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const limit = Math.max(
    1,
    Math.min(100, Number(request.nextUrl.searchParams.get("limit") ?? 20) || 20)
  );
  const combinations = await listForecastCombinations(project.project.id, limit);

  return NextResponse.json({
    combinations: combinations.map(serializeForecastCombination),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectKey: string }> }
) {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectKey } = await params;
  const project = await getAnalyticsProjectBySlug(projectKey);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const payload = await request.json().catch(() => ({}));
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    const result = await recordForecastCombinationView(
      project.project.id,
      {
        key:
          typeof payload.key === "string" ? payload.key : undefined,
        label:
          typeof payload.label === "string" ? payload.label : `${project.project.displayName} forecast`,
        sourcePage:
          typeof payload.sourcePage === "string" ? payload.sourcePage : null,
        filters:
          payload.filters && typeof payload.filters === "object"
            ? (payload.filters as Record<string, unknown>)
            : {},
      },
      auth.email
    );

    return NextResponse.json({
      combination: serializeForecastCombination(result.combination),
      queuedRun: result.queuedRun
        ? {
            ...result.queuedRun,
            requestedAt: result.queuedRun.requestedAt.toISOString(),
            startedAt: result.queuedRun.startedAt?.toISOString() ?? null,
            finishedAt: result.queuedRun.finishedAt?.toISOString() ?? null,
          }
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not register forecast combination.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
