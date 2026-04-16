import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { getAnalyticsProjectConfig } from "@/lib/platform/store";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;

  try {
    const config = await getAnalyticsProjectConfig(projectId);
    return NextResponse.json({ config });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load config.";
    return NextResponse.json({ error: message }, { status: message === "Project not found." ? 404 : 400 });
  }
}
