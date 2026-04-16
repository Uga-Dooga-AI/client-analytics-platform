import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function getWorkerControlSecret() {
  const value = process.env.WORKER_CONTROL_SECRET?.trim();
  return value && value.length >= 24 ? value : null;
}

function extractPresentedSecret(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return request.headers.get("x-worker-secret")?.trim() ?? null;
}

function safeCompare(expected: string, presented: string) {
  const expectedBuffer = Buffer.from(expected);
  const presentedBuffer = Buffer.from(presented);
  if (expectedBuffer.length !== presentedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, presentedBuffer);
}

export function hasWorkerControlSecret() {
  return Boolean(getWorkerControlSecret());
}

export function authorizeInternalWorker(request: NextRequest) {
  const expected = getWorkerControlSecret();
  if (!expected) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "WORKER_CONTROL_SECRET is not configured." },
        { status: 503 }
      ),
    };
  }

  const presented = extractPresentedSecret(request);
  if (!presented || !safeCompare(expected, presented)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true as const };
}
