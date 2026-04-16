import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isBootstrapComplete: vi.fn(),
  checkRateLimit: vi.fn(),
  logBootstrapEvent: vi.fn(),
  bootstrapSuperAdmin: vi.fn(),
  readSessionFromRequest: vi.fn(),
}));

vi.mock("@/lib/bootstrap/guard", () => ({
  isBootstrapComplete: mocks.isBootstrapComplete,
}));

vi.mock("@/lib/bootstrap/rateLimiter", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/lib/bootstrap/audit", () => ({
  logBootstrapEvent: mocks.logBootstrapEvent,
}));

vi.mock("@/lib/auth/store", () => ({
  bootstrapSuperAdmin: mocks.bootstrapSuperAdmin,
}));

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return {
    ...actual,
    readSessionFromRequest: mocks.readSessionFromRequest,
  };
});

import { POST } from "@/app/api/admin/bootstrap/route";

function makeRequest(body: Record<string, unknown>, ip = "1.2.3.4") {
  return {
    headers: {
      get: (header: string) => {
        if (header === "x-forwarded-for") return ip;
        return null;
      },
    },
    cookies: {
      get: vi.fn().mockReturnValue(undefined),
    },
    json: async () => body,
  } as unknown as import("next/server").NextRequest;
}

describe("bootstrap route", () => {
  beforeEach(() => {
    mocks.isBootstrapComplete.mockReset();
    mocks.checkRateLimit.mockReset();
    mocks.logBootstrapEvent.mockReset();
    mocks.bootstrapSuperAdmin.mockReset();
    mocks.readSessionFromRequest.mockReset();

    mocks.isBootstrapComplete.mockResolvedValue(false);
    mocks.checkRateLimit.mockReturnValue(true);
    mocks.logBootstrapEvent.mockResolvedValue(undefined);

    process.env.SUPERADMIN_BOOTSTRAP_KEY =
      "test-bootstrap-key-that-is-long-enough-1234";
  });

  it("returns 200 and bootstraps the current session user", async () => {
    mocks.readSessionFromRequest.mockResolvedValueOnce({
      uid: "uid-1",
      email: "admin@example.com",
      displayName: "Admin",
      avatarUrl: null,
    });
    mocks.bootstrapSuperAdmin.mockResolvedValueOnce(undefined);

    const response = await POST(
      makeRequest({
        bootstrapKey: process.env.SUPERADMIN_BOOTSTRAP_KEY,
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.bootstrapSuperAdmin).toHaveBeenCalledWith({
      authUid: "uid-1",
      email: "admin@example.com",
      displayName: "Admin",
      avatarUrl: null,
    });
  });

  it("returns 401 when there is no authenticated session", async () => {
    mocks.readSessionFromRequest.mockResolvedValueOnce(null);

    const response = await POST(
      makeRequest({
        bootstrapKey: process.env.SUPERADMIN_BOOTSTRAP_KEY,
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.bootstrapSuperAdmin).not.toHaveBeenCalled();
  });

  it("returns 403 for invalid bootstrap key", async () => {
    const response = await POST(
      makeRequest({
        bootstrapKey: "wrong-key",
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.readSessionFromRequest).not.toHaveBeenCalled();
  });

  it("returns 410 when bootstrap was completed by a race", async () => {
    mocks.readSessionFromRequest.mockResolvedValueOnce({
      uid: "uid-2",
      email: "admin@example.com",
      displayName: null,
      avatarUrl: null,
    });
    mocks.bootstrapSuperAdmin.mockRejectedValueOnce(new Error("BOOTSTRAP_COMPLETE"));

    const response = await POST(
      makeRequest({
        bootstrapKey: process.env.SUPERADMIN_BOOTSTRAP_KEY,
      })
    );

    expect(response.status).toBe(410);
  });
});
