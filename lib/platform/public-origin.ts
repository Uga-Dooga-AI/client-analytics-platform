import { NextRequest } from "next/server";

function normalizeBaseUrl(value: string | null | undefined) {
  return value?.trim().replace(/\/+$/, "") || "";
}

export function resolvePublicBaseUrl(request: NextRequest) {
  const explicit = normalizeBaseUrl(process.env.WORKER_CONTROL_BASE_URL);
  if (explicit) {
    return explicit;
  }

  const forwardedProto = normalizeBaseUrl(request.headers.get("x-forwarded-proto"));
  const forwardedHost = normalizeBaseUrl(request.headers.get("x-forwarded-host"));
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = normalizeBaseUrl(request.headers.get("host"));
  if (host) {
    const protocol = forwardedProto || "https";
    return `${protocol}://${host}`;
  }

  return normalizeBaseUrl(request.nextUrl.origin);
}
