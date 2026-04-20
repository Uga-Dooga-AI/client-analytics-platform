import { NextRequest } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { parseAcquisitionSearchParams } from "@/lib/data/acquisition";
import {
  type ForecastHistoryChartSnapshot,
  getForecastHistoryCutoffDays,
  streamForecastNotebookHistorySnapshots,
} from "@/lib/data/forecast-notebook";
import { parseDashboardSearchParams } from "@/lib/dashboard-filters";
import { getAnalyticsProjectBySlug } from "@/lib/platform/store";

export const runtime = "nodejs";

type HistoryStreamEvent =
  | { type: "start"; cutoffs: number[]; total: number }
  | {
      type: "progress";
      cutoffs: number[];
      completed: number;
      total: number;
      cutoffDay: number;
      snapshot: ReturnType<typeof collectSnapshot>;
    }
  | { type: "complete"; cutoffs: number[]; total: number }
  | { type: "error"; message: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectKey: string }> }
) {
  const auth = await getServerAuth();
  if (!auth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { projectKey } = await params;
  const project = await getAnalyticsProjectBySlug(projectKey);
  if (!project) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const horizonDay = Number(request.nextUrl.searchParams.get("horizonDay"));
  if (!Number.isFinite(horizonDay) || horizonDay <= 0) {
    return new Response(JSON.stringify({ error: "Invalid horizonDay." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const searchParams = new URLSearchParams(request.nextUrl.searchParams);
  searchParams.set("project", projectKey);
  const filters = parseDashboardSearchParams(searchParams, "/forecasts");
  const localFilters = parseAcquisitionSearchParams(searchParams);
  const selection = {
    revenueMode: localFilters.revenueMode,
    country: localFilters.country,
    source: localFilters.source,
    company: localFilters.company,
    campaign: localFilters.campaign,
    creative: localFilters.creative,
  };
  const cutoffs = getForecastHistoryCutoffDays(horizonDay);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        emit(controller, encoder, {
          type: "start",
          cutoffs,
          total: cutoffs.length,
        } satisfies HistoryStreamEvent);

        let completed = 0;
        for await (const snapshot of streamForecastNotebookHistorySnapshots({
          bundle: project,
          filters,
          selection,
          horizonDay,
        })) {
          completed += 1;
          emit(controller, encoder, {
            type: "progress",
            cutoffs,
            completed,
            total: cutoffs.length,
            cutoffDay: snapshot.cutoffDay,
            snapshot: collectSnapshot(snapshot),
          } satisfies HistoryStreamEvent);
        }

        emit(controller, encoder, {
          type: "complete",
          cutoffs,
          total: cutoffs.length,
        } satisfies HistoryStreamEvent);
        controller.close();
      } catch (error) {
        emit(controller, encoder, {
          type: "error",
          message:
            error instanceof Error ? error.message : "Unknown historical forecast runtime error",
        } satisfies HistoryStreamEvent);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function emit(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: HistoryStreamEvent
) {
  controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
}

function collectSnapshot(
  snapshot: ForecastHistoryChartSnapshot
) {
  return {
    cutoffDay: snapshot.cutoffDay,
    visiblePointCount: snapshot.visiblePointCount,
    groups: snapshot.groups,
  };
}
