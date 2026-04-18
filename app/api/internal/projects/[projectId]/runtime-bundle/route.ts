import { NextRequest, NextResponse } from "next/server";
import { authorizeInternalWorker } from "@/lib/platform/internal-auth";
import { resolvePublicBaseUrl } from "@/lib/platform/public-origin";
import { buildAnalyticsRuntimeBundle } from "@/lib/platform/runtime-bundle";
import { getAnalyticsProject } from "@/lib/platform/store";

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
  const project = await getAnalyticsProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    runtimeBundle: buildAnalyticsRuntimeBundle(project, {
      baseUrl: resolvePublicBaseUrl(request),
    }),
  });
}
