import { NextRequest, NextResponse } from "next/server";

import {
  debugForecastNotebookSpendSelection,
  getForecastNotebookSurface,
  type ForecastNotebookSelection,
} from "@/lib/data/forecast-notebook";
import { parseDashboardSearchParams } from "@/lib/dashboard-filters";
import { getAnalyticsProject } from "@/lib/platform/store";
import { getServerAuth } from "@/lib/auth/server";

export const runtime = "nodejs";

function readSelection(searchParams: URLSearchParams): ForecastNotebookSelection {
  return {
    revenueMode: (searchParams.get("revenueMode") ?? "total") as ForecastNotebookSelection["revenueMode"],
    country: searchParams.get("country") ?? "all",
    source: searchParams.get("source") ?? "all",
    company: searchParams.get("company") ?? "all",
    campaign: searchParams.get("campaign") ?? "all",
    creative: searchParams.get("creative") ?? "all",
  };
}

function readBooleanFlag(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  if (!value) {
    return false;
  }
  return value === "1" || value.toLowerCase() === "true";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const bundle = await getAnalyticsProject(projectId);
  if (!bundle) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filters = parseDashboardSearchParams(request.nextUrl.searchParams, "/forecasts");
  const selection = readSelection(request.nextUrl.searchParams);
  const includeSurface = readBooleanFlag(request.nextUrl.searchParams, "includeSurface");
  const debug = await debugForecastNotebookSpendSelection({
    bundle,
    projectLabel: bundle.project.displayName,
    filters,
    selection,
    loadData: true,
  });

  if (!includeSurface) {
    return NextResponse.json({ debug });
  }

  const surface = await getForecastNotebookSurface({
    bundle,
    projectLabel: bundle.project.displayName,
    filters,
    selection,
    loadData: true,
  });
  const horizonSummaries = surface.data.horizonCharts.map((chart) => {
    const points = chart.groups.flatMap((group) => group.series);
    const intervalPoints = points.filter((point) => point.lower != null || point.upper != null);
    return {
      chartId: chart.id,
      title: chart.title,
      totalPointCount: points.length,
      intervalPointCount: intervalPoints.length,
      intervalPointLabels: intervalPoints.map((point) => point.label),
    };
  });

  return NextResponse.json({
    debug,
    surface: {
      summary: surface.data.summary,
      diagnostics: surface.diagnostics,
      horizonSummaries,
      cohortMatrix: surface.data.cohortMatrix.map((row) => ({
        cohortDate: row.cohortDate,
        installs: row.installs,
        spend: row.spend,
        cells: row.cells.map((cell) => ({
          label: cell.label,
          value: cell.value,
          lower: cell.lower,
          upper: cell.upper,
          actual: cell.actual,
        })),
      })),
    },
  });
}
