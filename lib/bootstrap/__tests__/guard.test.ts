import { describe, it, expect, vi, beforeEach } from "vitest";

const mockReadBootstrapComplete = vi.fn();

vi.mock("@/lib/auth/store", () => ({
  isBootstrapComplete: mockReadBootstrapComplete,
}));

const { isBootstrapComplete, _resetBootstrapCache } = await import("../guard");

describe("isBootstrapComplete", () => {
  beforeEach(() => {
    _resetBootstrapCache();
    mockReadBootstrapComplete.mockReset();
  });

  it("returns false when the store says bootstrap is incomplete", async () => {
    mockReadBootstrapComplete.mockResolvedValueOnce(false);
    await expect(isBootstrapComplete()).resolves.toBe(false);
  });

  it("returns true when the store says bootstrap is complete", async () => {
    mockReadBootstrapComplete.mockResolvedValueOnce(true);
    await expect(isBootstrapComplete()).resolves.toBe(true);
  });

  it("caches only confirmed true results", async () => {
    mockReadBootstrapComplete.mockResolvedValueOnce(true);
    await isBootstrapComplete();
    await isBootstrapComplete();
    expect(mockReadBootstrapComplete).toHaveBeenCalledTimes(1);
  });

  it("does not cache false results", async () => {
    mockReadBootstrapComplete.mockResolvedValue(false);
    await isBootstrapComplete();
    await isBootstrapComplete();
    expect(mockReadBootstrapComplete).toHaveBeenCalledTimes(2);
  });

  it("cache resets after _resetBootstrapCache()", async () => {
    mockReadBootstrapComplete.mockResolvedValueOnce(true);
    await isBootstrapComplete();

    _resetBootstrapCache();

    mockReadBootstrapComplete.mockResolvedValueOnce(false);
    await expect(isBootstrapComplete()).resolves.toBe(false);
    expect(mockReadBootstrapComplete).toHaveBeenCalledTimes(2);
  });
});
