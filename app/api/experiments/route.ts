import { NextRequest, NextResponse } from "next/server";
import { getExperiments } from "@/lib/data/experiments";
import { type DashboardProjectKey } from "@/lib/dashboard-filters";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const projectKey = (searchParams.get("project") ?? "all") as DashboardProjectKey;
  const experiments = await getExperiments({ projectKey });
  return NextResponse.json(experiments);
}
