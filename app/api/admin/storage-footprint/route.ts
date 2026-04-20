import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server";
import { getStorageFootprintSnapshot } from "@/lib/admin/storage-footprint";

export const runtime = "nodejs";

function parseMonthsParam(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("months");
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const auth = await getServerAuth();
  if (!auth || (auth.role !== "admin" && auth.role !== "super_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await getStorageFootprintSnapshot({
      months: parseMonthsParam(request),
    });
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not build storage footprint snapshot.",
      },
      { status: 500 }
    );
  }
}
