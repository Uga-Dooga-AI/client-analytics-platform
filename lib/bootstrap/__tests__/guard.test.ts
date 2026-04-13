import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock adminDb before importing guard.
const mockGet = vi.fn();
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        get: mockGet,
      }),
    }),
  },
}));

// Dynamic import AFTER mocks are set up.
const { isBootstrapComplete, _resetBootstrapCache } = await import("../guard");

function mockDoc(exists: boolean, data?: Record<string, unknown>) {
  return { exists, data: () => data };
}

describe("isBootstrapComplete", () => {
  beforeEach(() => {
    _resetBootstrapCache();
    mockGet.mockReset();
  });

  it("returns false when config/bootstrap does not exist", async () => {
    mockGet.mockResolvedValueOnce(mockDoc(false));
    expect(await isBootstrapComplete()).toBe(false);
  });

  it("returns false when bootstrapComplete is false", async () => {
    mockGet.mockResolvedValueOnce(
      mockDoc(true, { bootstrapComplete: false })
    );
    expect(await isBootstrapComplete()).toBe(false);
  });

  it("returns true when bootstrapComplete is true", async () => {
    mockGet.mockResolvedValueOnce(
      mockDoc(true, { bootstrapComplete: true })
    );
    expect(await isBootstrapComplete()).toBe(true);
  });

  it("caches true result — does not call Firestore again", async () => {
    mockGet.mockResolvedValueOnce(
      mockDoc(true, { bootstrapComplete: true })
    );
    await isBootstrapComplete(); // first call — hits Firestore
    await isBootstrapComplete(); // second call — should use cache
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("does not cache false result — calls Firestore each time", async () => {
    mockGet.mockResolvedValue(mockDoc(true, { bootstrapComplete: false }));
    await isBootstrapComplete();
    await isBootstrapComplete();
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("cache resets after _resetBootstrapCache()", async () => {
    mockGet.mockResolvedValue(mockDoc(true, { bootstrapComplete: true }));
    await isBootstrapComplete(); // populates cache

    _resetBootstrapCache();

    mockGet.mockResolvedValue(mockDoc(false)); // now returns false
    const result = await isBootstrapComplete();
    expect(result).toBe(false);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
