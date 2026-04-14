import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  createSavedSegment,
  deleteSavedSegment,
  parseSavedSegmentsCookie,
  SAVED_SEGMENTS_COOKIE,
  serializeSavedSegmentsCookie,
} from "@/lib/segments";

export async function GET() {
  const cookieStore = await cookies();
  const savedSegments = parseSavedSegmentsCookie(cookieStore.get(SAVED_SEGMENTS_COOKIE)?.value);
  return NextResponse.json({ segments: savedSegments });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const savedSegments = parseSavedSegmentsCookie(cookieStore.get(SAVED_SEGMENTS_COOKIE)?.value);
  const payload = await request.json().catch(() => ({}));
  const result = createSavedSegment(payload, savedSegments);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const nextSegments = [...savedSegments, result.segment];
  cookieStore.set(SAVED_SEGMENTS_COOKIE, serializeSavedSegmentsCookie(nextSegments), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 180,
  });

  return NextResponse.json({ segment: result.segment, segments: nextSegments }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Segment id is required." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const savedSegments = parseSavedSegmentsCookie(cookieStore.get(SAVED_SEGMENTS_COOKIE)?.value);
  const nextSegments = deleteSavedSegment(savedSegments, id);

  cookieStore.set(SAVED_SEGMENTS_COOKIE, serializeSavedSegmentsCookie(nextSegments), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 180,
  });

  return NextResponse.json({ segments: nextSegments });
}
