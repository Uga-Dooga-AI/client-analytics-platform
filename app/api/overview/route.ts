import { NextResponse } from "next/server";
import { getOverviewKPIs, getOverviewFreshness } from "@/lib/data/overview";

export async function GET() {
  const [kpis, freshness] = await Promise.all([getOverviewKPIs(), getOverviewFreshness()]);
  return NextResponse.json({ kpis, freshness });
}
