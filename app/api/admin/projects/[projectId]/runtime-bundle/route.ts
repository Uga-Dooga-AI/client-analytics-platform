import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { buildAnalyticsRuntimeBundle } from "@/lib/platform/runtime-bundle";
import { getAnalyticsProject } from "@/lib/platform/store";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const project = await getAnalyticsProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    runtimeBundle: buildAnalyticsRuntimeBundle(project, {
      baseUrl: request.nextUrl.origin,
    }),
  });
}
