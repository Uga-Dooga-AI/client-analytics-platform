import { NextRequest, NextResponse } from "next/server";
import { buildForecastCards, getForecastRuns, getForecastTrajectories } from "@/lib/data/forecasts";
import { type DashboardProjectKey } from "@/lib/dashboard-filters";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const projectKey = (searchParams.get("project") ?? "all") as DashboardProjectKey;
  const [runs, trajectories] = await Promise.all([
    getForecastRuns({ projectKey }),
    getForecastTrajectories({ projectKey }),
  ]);
  const cards = buildForecastCards(trajectories);
  return NextResponse.json({ runs, cards, trajectories });
}
