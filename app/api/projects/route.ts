import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { listAnalyticsProjectOptions } from "@/lib/platform/store";

export const runtime = "nodejs";

export async function GET() {
  const auth = await getServerAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await listAnalyticsProjectOptions();
  return NextResponse.json({ projects });
}
