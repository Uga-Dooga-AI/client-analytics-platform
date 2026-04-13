import { NextRequest, NextResponse } from "next/server";
import { readSessionFromRequest } from "@/lib/auth/session";

export const runtime = "nodejs";

const DEMO_ACCESS_ENABLED = process.env.DEMO_ACCESS_ENABLED === "true";

export async function GET(request: NextRequest) {
  if (DEMO_ACCESS_ENABLED) {
    return NextResponse.json({
      user: {
        uid: "demo-admin",
        email: "demo@client-analytics.local",
        displayName: "Demo Admin",
        avatarUrl: null,
        role: "admin",
        approved: true,
      },
      demo: true,
    });
  }

  const session = await readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      uid: session.uid,
      email: session.email,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,
      role: session.role,
      approved: session.approved,
    },
    demo: false,
  });
}
