import { describe, it, expect, vi, beforeEach } from "vitest";

const mockWriteBootstrapAuditEvent = vi.fn();

vi.mock("@/lib/auth/store", () => ({
  writeBootstrapAuditEvent: mockWriteBootstrapAuditEvent,
}));

const { logBootstrapEvent } = await import("../audit");

describe("logBootstrapEvent", () => {
  beforeEach(() => {
    mockWriteBootstrapAuditEvent.mockReset();
  });

  it("forwards bootstrap_attempt to the store writer", async () => {
    mockWriteBootstrapAuditEvent.mockResolvedValueOnce(undefined);

    await logBootstrapEvent("bootstrap_attempt", "1.2.3.4");

    expect(mockWriteBootstrapAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "bootstrap_attempt", ip: "1.2.3.4" })
    );
  });

  it("forwards optional email and reason", async () => {
    mockWriteBootstrapAuditEvent.mockResolvedValueOnce(undefined);

    await logBootstrapEvent("bootstrap_failure", "1.2.3.4", {
      email: "admin@example.com",
      reason: "invalid_key",
    });

    expect(mockWriteBootstrapAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "bootstrap_failure",
        email: "admin@example.com",
        reason: "invalid_key",
      })
    );
  });

  it("swallows audit failures", async () => {
    mockWriteBootstrapAuditEvent.mockRejectedValueOnce(new Error("db unavailable"));

    await expect(
      logBootstrapEvent("bootstrap_blocked", "5.6.7.8", {
        reason: "already_bootstrapped",
      })
    ).resolves.toBeUndefined();
  });
});
