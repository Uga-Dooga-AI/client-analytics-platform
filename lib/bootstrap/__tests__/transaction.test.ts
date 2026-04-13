/**
 * Unit tests for the atomicity mechanism:
 * Verifies that the bootstrap Firestore transaction sets both
 * `users/{uid}` and `config/bootstrap.bootstrapComplete` together,
 * and re-checks inside the transaction to prevent race conditions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (all factories must be self-contained — no top-level variable refs) ─

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    runTransaction: vi.fn(),
    collection: vi.fn((col: string) => ({
      doc: vi.fn((id: string) => ({ path: `${col}/${id}` })),
    })),
  },
  adminAuth: {
    getUser: vi.fn(),
  },
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "MOCK_TIMESTAMP" },
  Timestamp: { now: () => "MOCK_NOW" },
}));

vi.mock("@/lib/auth/claims", () => ({
  setCustomClaims: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/bootstrap/guard", () => ({
  isBootstrapComplete: vi.fn().mockResolvedValue(false),
  _resetBootstrapCache: vi.fn(),
}));

vi.mock("@/lib/bootstrap/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockReturnValue(true),
  _resetStore: vi.fn(),
}));

vi.mock("@/lib/bootstrap/audit", () => ({
  logBootstrapEvent: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isBootstrapComplete } from "@/lib/bootstrap/guard";
import { checkRateLimit } from "@/lib/bootstrap/rateLimiter";
import { logBootstrapEvent } from "@/lib/bootstrap/audit";
import { POST } from "@/app/api/admin/bootstrap/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>, ip = "1.2.3.4") {
  return {
    headers: { get: (h: string) => (h === "x-forwarded-for" ? ip : null) },
    json: async () => body,
  } as unknown as import("next/server").NextRequest;
}

type TxFn = (tx: {
  get: (ref: { path: string }) => Promise<{ exists: boolean; data: () => Record<string, unknown> }>;
  set: (ref: { path: string }, data: Record<string, unknown>) => void;
}) => Promise<void>;

function setupTransaction(
  bootstrapDoc: { exists: boolean; data: () => Record<string, unknown> }
) {
  const txSetCalls: Array<{ path: string; data: Record<string, unknown> }> = [];

  vi.mocked(adminDb.runTransaction).mockImplementation(async (fn: TxFn) => {
    const tx = {
      get: vi.fn().mockResolvedValue(bootstrapDoc),
      set: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
        txSetCalls.push({ path: ref.path, data });
      }),
    };
    await fn(tx);
  });

  return txSetCalls;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Bootstrap atomicity — Firestore transaction", () => {
  beforeEach(() => {
    vi.mocked(adminAuth.getUser).mockReset();
    vi.mocked(adminDb.runTransaction).mockReset();
    vi.mocked(isBootstrapComplete).mockResolvedValue(false);
    vi.mocked(checkRateLimit).mockReturnValue(true);
    vi.mocked(logBootstrapEvent).mockResolvedValue(undefined);

    process.env.SUPERADMIN_BOOTSTRAP_KEY =
      "test-bootstrap-key-that-is-long-enough-1234";
  });

  it("runs a Firestore transaction on a valid request", async () => {
    setupTransaction({ exists: false, data: () => ({}) });
    vi.mocked(adminAuth.getUser).mockResolvedValueOnce({
      uid: "uid-1",
      email: "admin@example.com",
      displayName: "Admin",
    } as never);

    const req = makeRequest({
      uid: "uid-1",
      bootstrapKey: process.env.SUPERADMIN_BOOTSTRAP_KEY,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(adminDb.runTransaction).toHaveBeenCalledTimes(1);
  });

  it("transaction sets users/{uid} and config/bootstrap atomically", async () => {
    const txSetCalls = setupTransaction({ exists: false, data: () => ({}) });
    vi.mocked(adminAuth.getUser).mockResolvedValueOnce({
      uid: "uid-2",
      email: "admin@test.com",
      displayName: null,
    } as never);

    const req = makeRequest({
      uid: "uid-2",
      bootstrapKey: process.env.SUPERADMIN_BOOTSTRAP_KEY,
    });
    await POST(req);

    const paths = txSetCalls.map((c) => c.path);
    expect(paths).toContain("users/uid-2");
    expect(paths).toContain("config/bootstrap");
  });

  it("config/bootstrap document has bootstrapComplete: true", async () => {
    const txSetCalls = setupTransaction({ exists: false, data: () => ({}) });
    vi.mocked(adminAuth.getUser).mockResolvedValueOnce({
      uid: "uid-3",
      email: "a@b.com",
      displayName: null,
    } as never);

    const req = makeRequest({
      uid: "uid-3",
      bootstrapKey: process.env.SUPERADMIN_BOOTSTRAP_KEY,
    });
    await POST(req);

    const bootstrapSet = txSetCalls.find((c) => c.path === "config/bootstrap");
    expect(bootstrapSet?.data.bootstrapComplete).toBe(true);
  });

  it("transaction re-checks bootstrapComplete and returns 410 on race", async () => {
    // Guard passes (race), but inside the transaction flag is already true.
    setupTransaction({
      exists: true,
      data: () => ({ bootstrapComplete: true }),
    });

    vi.mocked(adminAuth.getUser).mockResolvedValueOnce({
      uid: "uid-4",
      email: "admin@race.com",
      displayName: null,
    } as never);

    const req = makeRequest({
      uid: "uid-4",
      bootstrapKey: process.env.SUPERADMIN_BOOTSTRAP_KEY,
    });
    const res = await POST(req);
    expect(res.status).toBe(410);
  });
});
