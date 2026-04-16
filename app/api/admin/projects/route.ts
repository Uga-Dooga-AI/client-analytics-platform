import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import {
  createAnalyticsProject,
  listAnalyticsProjects,
  serializeProjectBundle,
} from "@/lib/platform/store";

export const runtime = "nodejs";

export async function GET() {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await listAnalyticsProjects();
  return NextResponse.json({ projects: projects.map(serializeProjectBundle) });
}

export async function POST(request: NextRequest) {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));

  try {
    const project = await createAnalyticsProject(payload, auth.email);
    return NextResponse.json({ project: serializeProjectBundle(project) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create project." },
      { status: 400 }
    );
  }
}
