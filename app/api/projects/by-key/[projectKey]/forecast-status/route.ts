import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import {
  buildForecastPipelineSnapshot,
  serializeForecastPipelineSnapshot,
} from "@/lib/data/forecast-progress";
import {
  getAnalyticsProjectBySlug,
  listForecastCombinations,
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

  const combinationKey = request.nextUrl.searchParams.get("combinationKey");
  const combinations = await listForecastCombinations(project.project.id, 200, {
    includeSystem: true,
  });
  const combination =
    combinationKey
      ? combinations.find((entry) => entry.combinationKey === combinationKey) ?? null
      : null;

  return NextResponse.json({
    snapshot: serializeForecastPipelineSnapshot(
      buildForecastPipelineSnapshot(project, combination)
    ),
  });
}
