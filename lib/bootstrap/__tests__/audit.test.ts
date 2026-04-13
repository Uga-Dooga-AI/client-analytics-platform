import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Firebase Admin before importing the module under test.
const mockAdd = vi.fn();
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: () => ({
      add: mockAdd,
    }),
  },
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "MOCK_TIMESTAMP",
  },
}));

// Dynamic import AFTER mocks are set up.
const { logBootstrapEvent } = await import("../audit");

describe("logBootstrapEvent", () => {
  beforeEach(() => {
    mockAdd.mockReset();
  });

  it("writes a bootstrap_attempt event to audit_log", async () => {
    mockAdd.mockResolvedValueOnce({});
    await logBootstrapEvent("bootstrap_attempt", "1.2.3.4");
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({ event: "bootstrap_attempt", ip: "1.2.3.4" })
    );
  });

  it("writes a bootstrap_success event with email", async () => {
    mockAdd.mockResolvedValueOnce({});
    await logBootstrapEvent("bootstrap_success", "1.2.3.4", {
      email: "admin@example.com",
    });
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "bootstrap_success",
        email: "admin@example.com",
      })
    );
  });

  it("writes a bootstrap_failure event with reason", async () => {
    mockAdd.mockResolvedValueOnce({});
    await logBootstrapEvent("bootstrap_failure", "1.2.3.4", {
      reason: "invalid_key",
    });
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "bootstrap_failure",
        reason: "invalid_key",
      })
    );
  });

  it("writes a bootstrap_blocked event", async () => {
    mockAdd.mockResolvedValueOnce({});
    await logBootstrapEvent("bootstrap_blocked", "5.6.7.8", {
      reason: "already_bootstrapped",
    });
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "bootstrap_blocked",
        ip: "5.6.7.8",
        reason: "already_bootstrapped",
      })
    );
  });

  it("does not throw when Firestore write fails (best-effort logging)", async () => {
    mockAdd.mockRejectedValueOnce(new Error("Firestore unavailable"));
    await expect(
      logBootstrapEvent("bootstrap_attempt", "1.2.3.4")
    ).resolves.not.toThrow();
  });

  it("includes a server timestamp in every entry", async () => {
    mockAdd.mockResolvedValueOnce({});
    await logBootstrapEvent("bootstrap_attempt", "1.2.3.4");
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({ timestamp: "MOCK_TIMESTAMP" })
    );
  });
});
