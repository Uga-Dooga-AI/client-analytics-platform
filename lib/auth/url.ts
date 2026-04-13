import type { NextRequest } from "next/server";

function getConfiguredAppOrigin(): string | null {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return null;

  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function getPublicAppOrigin(request: NextRequest): string {
  const configuredOrigin = getConfiguredAppOrigin();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto =
    request.headers.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "production" ? "https" : "http");

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

export function buildPublicUrl(request: NextRequest, pathname: string): URL {
  return new URL(pathname, `${getPublicAppOrigin(request)}/`);
}
