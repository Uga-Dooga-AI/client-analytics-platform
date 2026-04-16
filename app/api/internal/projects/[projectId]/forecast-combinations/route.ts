import { NextRequest, NextResponse } from "next/server";
import { authorizeInternalWorker } from "@/lib/platform/internal-auth";
import {
  listForecastPrewarmCombinations,
  serializeForecastCombination,
} from "@/lib/platform/store";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = authorizeInternalWorker(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { projectId } = await params;
  const limit = Math.max(
    1,
    Math.min(100, Number(request.nextUrl.searchParams.get("limit") ?? 50) || 50)
  );

  try {
    const prewarm = await listForecastPrewarmCombinations(projectId, limit);
    return NextResponse.json({
      combinations: prewarm.combinations.map(serializeForecastCombination),
      meta: {
        primaryCount: prewarm.primaryCount,
        recentCount: prewarm.recentCount,
        totalCount: prewarm.totalCount,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load forecast combinations.";
    return NextResponse.json(
      { error: message },
      { status: message === "Project not found." ? 404 : 400 }
    );
  }
}
