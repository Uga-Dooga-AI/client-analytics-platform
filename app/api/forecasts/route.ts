import { NextRequest, NextResponse } from "next/server";
import { getForecastRuns, getForecastCards, getForecastTrajectories } from "@/lib/data/forecasts";
import { type DashboardProjectKey } from "@/lib/dashboard-filters";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const projectKey = (searchParams.get("project") ?? "all") as DashboardProjectKey;
  const [runs, cards, trajectories] = await Promise.all([
    getForecastRuns({ projectKey }),
    getForecastCards({ projectKey }),
    getForecastTrajectories({ projectKey }),
  ]);
  return NextResponse.json({ runs, cards, trajectories });
}
