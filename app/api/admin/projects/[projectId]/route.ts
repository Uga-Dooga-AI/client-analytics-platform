import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import {
  getAnalyticsProject,
  serializeProjectBundle,
  updateAnalyticsProject,
} from "@/lib/platform/store";

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
  const project = await getAnalyticsProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ project: serializeProjectBundle(project) });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const payload = await request.json().catch(() => ({}));

  try {
    const project = await updateAnalyticsProject(projectId, payload, auth.email);
    return NextResponse.json({ project: serializeProjectBundle(project) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update project.";
    return NextResponse.json({ error: message }, { status: message === "Project not found." ? 404 : 400 });
  }
}
