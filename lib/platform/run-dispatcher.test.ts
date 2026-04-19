import { generateKeyPairSync } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsProjectBundle, AnalyticsSyncRunRecord } from "./store";

const queryMock = vi.fn();
const decryptSecretMock = vi.fn((ciphertext: string) => ciphertext);

vi.mock("@/lib/db/postgres", () => ({
  getPostgresPool: () => ({
    query: queryMock,
  }),
}));

vi.mock("@/lib/platform/secrets", () => ({
  decryptSecret: decryptSecretMock,
}));

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });

function buildBundle(projectId = "project-1"): AnalyticsProjectBundle {
  return {
    project: {
      id: projectId,
      slug: "hidden-objects-1",
      gcpProjectId: "analytics-platform-493522",
      settings: {
        provisioningRegion: "europe-west1",
      },
    },
  } as AnalyticsProjectBundle;
}

function buildRun(runId = "run-1"): AnalyticsSyncRunRecord {
  return {
    id: runId,
    projectId: "project-1",
    runType: "ingestion",
    triggerKind: "manual",
    sourceType: "appmetrica_logs",
    status: "queued",
    requestedBy: "tester@example.com",
    requestedAt: new Date("2026-04-19T00:00:00Z"),
    startedAt: null,
    finishedAt: null,
    windowFrom: "2026-03-23",
    windowTo: "2026-03-25",
    message: "ingestion queued from the admin control plane.",
    payload: {},
  } as AnalyticsSyncRunRecord;
}

describe("dispatchAnalyticsRun", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    queryMock.mockReset();
    decryptSecretMock.mockClear();
  });

  it("claims a queued run before Cloud Run dispatch", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "token", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: "operations/run-1" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            secret_ciphertext: JSON.stringify({
              client_email: "dispatcher-1@example.com",
              private_key: privateKey.export({ format: "pem", type: "pkcs1" }),
            }),
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "run-1" }] });

    const { dispatchAnalyticsRun } = await import("./run-dispatcher");
    const result = await dispatchAnalyticsRun(buildRun(), buildBundle());

    expect(result).toEqual({ ok: true, operationName: "operations/run-1" });
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("UPDATE analytics_sync_runs"),
      ["run-1", "Worker execution dispatched from control plane."]
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips Cloud Run dispatch when the run was already claimed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "token", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            secret_ciphertext: JSON.stringify({
              client_email: "dispatcher-2@example.com",
              private_key: privateKey.export({ format: "pem", type: "pkcs1" }),
            }),
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const { dispatchAnalyticsRun } = await import("./run-dispatcher");
    const result = await dispatchAnalyticsRun(buildRun("run-2"), buildBundle("project-2"));

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("already claimed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reverts a claimed run back to queued when Cloud Run dispatch fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "token", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () => "duplicate execution",
      });
    vi.stubGlobal("fetch", fetchMock);

    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            secret_ciphertext: JSON.stringify({
              client_email: "dispatcher-3@example.com",
              private_key: privateKey.export({ format: "pem", type: "pkcs1" }),
            }),
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "run-3" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "run-3" }] });

    const { dispatchAnalyticsRun } = await import("./run-dispatcher");

    await expect(
      dispatchAnalyticsRun(buildRun("run-3"), buildBundle("project-3"))
    ).rejects.toThrow("Cloud Run job dispatch failed: 409 duplicate execution");

    expect(queryMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("SET\n        status = 'queued'"),
      ["run-3", "ingestion queued from the admin control plane."]
    );
  });
});
