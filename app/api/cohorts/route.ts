import { NextRequest, NextResponse } from "next/server";
import { getCohortDefinitions, getCohortGrid, getCohortTrends } from "@/lib/data/cohorts";
import { type DashboardProjectKey } from "@/lib/dashboard-filters";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const projectKey = (searchParams.get("project") ?? "all") as DashboardProjectKey;
  const [definitions, grid, trends] = await Promise.all([
    getCohortDefinitions({ projectKey }),
    getCohortGrid(),
    getCohortTrends(),
  ]);
  return NextResponse.json({ definitions, grid, trends });
}
