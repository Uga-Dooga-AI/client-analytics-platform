import { NextRequest, NextResponse } from "next/server";

import {
  debugForecastNotebookSpendSelection,
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
  const debug = await debugForecastNotebookSpendSelection({
    bundle,
    projectLabel: bundle.project.displayName,
    filters,
    selection,
    loadData: true,
  });

  return NextResponse.json({ debug });
}
