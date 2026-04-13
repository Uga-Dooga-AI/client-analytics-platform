import { NextRequest, NextResponse } from "next/server";
import { getFunnels } from "@/lib/data/funnels";
import { type DashboardProjectKey } from "@/lib/dashboard-filters";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const projectKey = (searchParams.get("project") ?? "all") as DashboardProjectKey;
  const funnels = await getFunnels({ projectKey });
  return NextResponse.json(funnels);
}
