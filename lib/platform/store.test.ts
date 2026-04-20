import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function shiftIsoDays(value: string, days: number) {
  const parsed = new Date(`${value}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

describe("analytics run orchestration", () => {
  const previousDemoFlag = process.env.DEMO_ACCESS_ENABLED;
  const globalStore = globalThis as typeof globalThis & {
    __analyticsPlatformDemoDataStore?: unknown;
  };

  beforeEach(() => {
    process.env.DEMO_ACCESS_ENABLED = "true";
    vi.resetModules();
    globalStore.__analyticsPlatformDemoDataStore = undefined;
  });

  afterEach(() => {
    if (previousDemoFlag === undefined) {
      delete process.env.DEMO_ACCESS_ENABLED;
    } else {
      process.env.DEMO_ACCESS_ENABLED = previousDemoFlag;
    }
    globalStore.__analyticsPlatformDemoDataStore = undefined;
  });

  it("unblocks bounds refresh after a successful bootstrap backfill even before any incremental ingestion run exists", async () => {
    const {
      createAnalyticsProject,
      listAnalyticsProjectRuns,
      requestAnalyticsSync,
      updateAnalyticsSyncRun,
    } = await import("./store");

    const bundle = await createAnalyticsProject(
      {
        slug: "bootstrap-check",
        displayName: "Bootstrap Check",
        autoBootstrapOnCreate: false,
        initialBackfillDays: 1,
        appmetricaAppIds: ["3927166"],
        appmetricaToken: "test-token",
        bigquerySourceProjectId: "analytics-platform-493522",
        bigquerySourceDataset: "raw",
        bigqueryServiceAccountJson:
          '{"client_email":"railway-bq@analytics-platform-493522.iam.gserviceaccount.com","private_key":"test"}',
      },
      "tester@example.com"
    );

    await requestAnalyticsSync(bundle.project.id, {
      runType: "bootstrap",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
    });

    const queuedRuns = await listAnalyticsProjectRuns(bundle.project.id);
    const backfillRun = queuedRuns.find((run) => run.runType === "backfill");
    const boundsRun = queuedRuns.find((run) => run.runType === "bounds_refresh");

    expect(backfillRun?.status).toBe("queued");
    expect(boundsRun?.status).toBe("blocked");

    await updateAnalyticsSyncRun(backfillRun!.id, {
      status: "succeeded",
      sourceType: "appmetrica_logs",
      message: "Backfill completed in test.",
    });

    const promotedRuns = await listAnalyticsProjectRuns(bundle.project.id);
    const promotedBoundsRun = promotedRuns.find(
      (run) => run.runType === "bounds_refresh" && run.status === "queued"
    );

    expect(promotedBoundsRun?.status).toBe("queued");
  });

  it("keeps forecast blocked until a fresh bounds refresh succeeds after the latest ingestion while allowing ingestion to run in parallel", async () => {
    const {
      createAnalyticsProject,
      listAnalyticsProjectRuns,
      requestAnalyticsSync,
      updateAnalyticsSyncRun,
    } = await import("./store");

    const bundle = await createAnalyticsProject(
      {
        slug: "stale-bounds-check",
        displayName: "Stale Bounds Check",
        autoBootstrapOnCreate: false,
        initialBackfillDays: 1,
        precomputePrimaryForecasts: false,
        appmetricaAppIds: ["3927166"],
        appmetricaToken: "test-token",
        bigquerySourceProjectId: "analytics-platform-493522",
        bigquerySourceDataset: "raw",
        bigqueryServiceAccountJson:
          '{"client_email":"railway-bq@analytics-platform-493522.iam.gserviceaccount.com","private_key":"test"}',
      },
      "tester@example.com"
    );

    const firstBootstrapRun = await requestAnalyticsSync(bundle.project.id, {
      runType: "bootstrap",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
    });

    let runs = await listAnalyticsProjectRuns(bundle.project.id);
    const firstBackfill = runs.find(
      (run) => run.runType === "backfill" && run.id === firstBootstrapRun.id
    );
    expect(firstBackfill?.status).toBe("queued");

    await updateAnalyticsSyncRun(firstBackfill!.id, {
      status: "succeeded",
      sourceType: "appmetrica_logs",
      message: "First backfill completed in test.",
    });

    runs = await listAnalyticsProjectRuns(bundle.project.id);
    const firstBounds = runs.find(
      (run) => run.runType === "bounds_refresh" && run.status === "queued"
    );
    expect(firstBounds?.status).toBe("queued");

    await updateAnalyticsSyncRun(firstBounds!.id, {
      status: "succeeded",
      sourceType: "bounds_artifacts",
      message: "First bounds refresh completed in test.",
    });

    runs = await listAnalyticsProjectRuns(bundle.project.id);
    const bootstrapForecast = runs.find(
      (run) => run.runType === "forecast" && run.status === "queued"
    );
    expect(bootstrapForecast?.status).toBe("queued");

    await updateAnalyticsSyncRun(bootstrapForecast!.id, {
      status: "succeeded",
      sourceType: "bounds_artifacts",
      message: "Bootstrap forecast completed in test.",
    });

    runs = await listAnalyticsProjectRuns(bundle.project.id);
    let incrementalIngestion = runs.find(
      (run) =>
        run.runType === "ingestion" &&
        run.status === "queued" &&
        run.payload?.sequence !== "initial-bootstrap"
    );

    if (!incrementalIngestion) {
      await requestAnalyticsSync(bundle.project.id, {
        runType: "ingestion",
        requestedBy: "tester@example.com",
        triggerKind: "manual",
      });

      runs = await listAnalyticsProjectRuns(bundle.project.id);
      incrementalIngestion = runs.find(
        (run) =>
          run.runType === "ingestion" &&
          run.status === "queued" &&
          run.payload?.sequence !== "initial-bootstrap"
      );
    }

    expect(incrementalIngestion?.status).toBe("queued");

    await updateAnalyticsSyncRun(incrementalIngestion!.id, {
      status: "succeeded",
      sourceType: "appmetrica_logs",
      message: "Incremental ingestion completed in test.",
    });

    const forecastRun = await requestAnalyticsSync(bundle.project.id, {
      runType: "forecast",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
    });

    expect(forecastRun.status).toBe("blocked");
    expect(forecastRun.message).toContain("bounds refresh");
  });

  it("does not auto-queue bounds refresh for manual-only projects and still allows forecast reuse", async () => {
    const {
      createAnalyticsProject,
      listAnalyticsProjectRuns,
      requestAnalyticsSync,
      updateAnalyticsSyncRun,
    } = await import("./store");

    const bundle = await createAnalyticsProject(
      {
        slug: "manual-only-bounds",
        displayName: "Manual Only Bounds",
        autoBootstrapOnCreate: false,
        precomputePrimaryForecasts: false,
        appmetricaAppIds: ["3927166"],
        appmetricaToken: "test-token",
        bigquerySourceProjectId: "analytics-platform-493522",
        bigquerySourceDataset: "raw",
        bigqueryServiceAccountJson:
          '{"client_email":"railway-bq@analytics-platform-493522.iam.gserviceaccount.com","private_key":"test"}',
      },
      "tester@example.com"
    );

    const demoStore = globalStore.__analyticsPlatformDemoDataStore as {
      projects: Array<{ id: string; boundsIntervalHours: number }>;
      sources: Array<{
        projectId: string;
        sourceType: string;
        status: string;
        lastSyncAt: Date | null;
      }>;
    };
    const demoProject = demoStore.projects.find((project) => project.id === bundle.project.id);
    const boundsSource = demoStore.sources.find(
      (source) => source.projectId === bundle.project.id && source.sourceType === "bounds_artifacts"
    );

    demoProject!.boundsIntervalHours = 0;
    boundsSource!.status = "ready";
    boundsSource!.lastSyncAt = new Date("2026-04-19T00:00:00.000Z");

    const ingestionRun = await requestAnalyticsSync(bundle.project.id, {
      runType: "ingestion",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
    });

    expect(ingestionRun.status).toBe("queued");

    await updateAnalyticsSyncRun(ingestionRun.id, {
      status: "succeeded",
      sourceType: "appmetrica_logs",
      message: "Manual-only ingestion completed in test.",
    });

    const runsAfterIngestion = await listAnalyticsProjectRuns(bundle.project.id);

    expect(runsAfterIngestion.filter((run) => run.runType === "bounds_refresh")).toHaveLength(0);
    expect(runsAfterIngestion.filter((run) => run.runType === "forecast")).toHaveLength(0);

    const forecastRun = await requestAnalyticsSync(bundle.project.id, {
      runType: "forecast",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
    });

    expect(forecastRun.status).toBe("queued");
  });

  it("allows appmetrica backfill with warehouse credentials even when source dataset mapping is absent", async () => {
    const {
      createAnalyticsProject,
      requestAnalyticsSync,
    } = await import("./store");

    const bundle = await createAnalyticsProject(
      {
        slug: "warehouse-only-backfill",
        displayName: "Warehouse Only Backfill",
        autoBootstrapOnCreate: false,
        appmetricaAppIds: ["3927166"],
        appmetricaToken: "test-token",
        bigqueryServiceAccountJson:
          '{"client_email":"railway-bq@analytics-platform-493522.iam.gserviceaccount.com","private_key":"test"}',
      },
      "tester@example.com"
    );

    const backfillRun = await requestAnalyticsSync(bundle.project.id, {
      runType: "backfill",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
    });

    expect(backfillRun.status).toBe("queued");
  });

  it("allows retrying bounds refresh after bounds artifacts were marked error by a failed run", async () => {
    const {
      createAnalyticsProject,
      requestAnalyticsSync,
      updateAnalyticsSyncRun,
    } = await import("./store");

    const bundle = await createAnalyticsProject(
      {
        slug: "bounds-retry",
        displayName: "Bounds Retry",
        autoBootstrapOnCreate: false,
        initialBackfillDays: 1,
        appmetricaAppIds: ["3927166"],
        appmetricaToken: "test-token",
        bigqueryServiceAccountJson:
          '{"client_email":"railway-bq@analytics-platform-493522.iam.gserviceaccount.com","private_key":"test"}',
      },
      "tester@example.com"
    );

    const backfillRun = await requestAnalyticsSync(bundle.project.id, {
      runType: "backfill",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
    });

    await updateAnalyticsSyncRun(backfillRun.id, {
      status: "succeeded",
      sourceType: "appmetrica_logs",
      message: "Backfill completed in test.",
    });

    const failedBoundsRun = await requestAnalyticsSync(bundle.project.id, {
      runType: "bounds_refresh",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
    });

    expect(failedBoundsRun.status).toBe("queued");

    await updateAnalyticsSyncRun(failedBoundsRun.id, {
      status: "failed",
      sourceType: "bounds_artifacts",
      message: "Bounds refresh failed in test.",
    });

    const retriedBoundsRun = await requestAnalyticsSync(bundle.project.id, {
      runType: "bounds_refresh",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
    });

    expect(retriedBoundsRun.status).toBe("queued");
  });

  it("returns an existing equivalent queued run instead of creating a duplicate", async () => {
    const {
      createAnalyticsProject,
      listAnalyticsProjectRuns,
      requestAnalyticsSync,
    } = await import("./store");

    const bundle = await createAnalyticsProject(
      {
        slug: "duplicate-queued-run",
        displayName: "Duplicate Queued Run",
        autoBootstrapOnCreate: false,
        appmetricaAppIds: ["3927166"],
        appmetricaToken: "test-token",
        bigquerySourceProjectId: "analytics-platform-493522",
        bigquerySourceDataset: "raw",
        bigqueryServiceAccountJson:
          '{"client_email":"railway-bq@analytics-platform-493522.iam.gserviceaccount.com","private_key":"test"}',
      },
      "tester@example.com"
    );

    const firstRun = await requestAnalyticsSync(bundle.project.id, {
      runType: "ingestion",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
      windowFrom: "2026-03-20",
      windowTo: "2026-04-18",
      payload: {
        sequence: "post-backfill-refresh",
        windowKind: "recent-tail",
      },
    });

    const duplicateRun = await requestAnalyticsSync(bundle.project.id, {
      runType: "ingestion",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
      windowFrom: "2026-03-20",
      windowTo: "2026-04-18",
      payload: {
        sequence: "post-backfill-refresh",
        windowKind: "recent-tail",
      },
    });

    const runs = await listAnalyticsProjectRuns(bundle.project.id);
    const queuedRecentTailRuns = runs.filter(
      (run) =>
        run.runType === "ingestion" &&
        run.windowFrom === "2026-03-20" &&
        run.windowTo === "2026-03-22"
    );

    expect(duplicateRun.id).toBe(firstRun.id);
    expect(firstRun.payload.ingestionRequestedWindowTo).toBe("2026-04-18");
    expect(queuedRecentTailRuns).toHaveLength(1);
  });

  it("chunks long backfills while allowing bounds and forecast runs to start from the latest successful source slice", async () => {
    const {
      createAnalyticsProject,
      listAnalyticsProjectRuns,
      requestAnalyticsSync,
      updateAnalyticsSyncRun,
    } = await import("./store");

    const bundle = await createAnalyticsProject(
      {
        slug: "chunked-backfill",
        displayName: "Chunked Backfill",
        autoBootstrapOnCreate: false,
        initialBackfillDays: 5,
        appmetricaAppIds: ["3927166"],
        appmetricaToken: "test-token",
        bigqueryServiceAccountJson:
          '{"client_email":"railway-bq@analytics-platform-493522.iam.gserviceaccount.com","private_key":"test"}',
      },
      "tester@example.com"
    );

    await requestAnalyticsSync(bundle.project.id, {
      runType: "bootstrap",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
    });

    let runs = await listAnalyticsProjectRuns(bundle.project.id);
    const firstBackfill = runs.find((run) => run.runType === "backfill");
    const firstBounds = runs.find((run) => run.runType === "bounds_refresh");

    expect(firstBackfill?.windowFrom).toBeTruthy();
    expect(firstBackfill?.windowTo).toBeTruthy();
    expect(firstBackfill?.windowFrom).not.toBe(firstBackfill?.windowTo);
    expect(firstBounds?.status).toBe("blocked");

    await updateAnalyticsSyncRun(firstBackfill!.id, {
      status: "succeeded",
      sourceType: "appmetrica_logs",
      message: "Chunk 1 complete.",
    });

    runs = await listAnalyticsProjectRuns(bundle.project.id);
    const secondBackfill = runs.find(
      (run) => run.runType === "backfill" && run.id !== firstBackfill!.id
    );
    const promotedBounds = runs.find(
      (run) => run.runType === "bounds_refresh" && run.status === "queued"
    );
    const postBackfillIngestion = runs.find(
      (run) =>
        run.runType === "ingestion" &&
        run.payload?.sequence === "post-backfill-refresh"
    );
    const expectedRecentWindowTo = shiftIsoDays(
      new Date().toISOString().slice(0, 10),
      -bundle.project.lookbackDays
    );
    const expectedRecentWindowFrom = shiftIsoDays(expectedRecentWindowTo, -29);
    const expectedRecentChunkWindowTo = shiftIsoDays(expectedRecentWindowFrom, 2);

    expect(secondBackfill?.status).toBe("queued");
    expect(secondBackfill?.payload.backfillContinuation).toBe(true);
    expect(promotedBounds?.status).toBe("queued");
    expect(postBackfillIngestion?.status).toBe("queued");
    expect(postBackfillIngestion?.windowFrom).toBe(expectedRecentWindowFrom);
    expect(postBackfillIngestion?.windowTo).toBe(expectedRecentChunkWindowTo);
    expect(postBackfillIngestion?.payload.ingestionRequestedWindowTo).toBe(expectedRecentWindowTo);
    expect(postBackfillIngestion?.payload.windowKind).toBe("recent-tail");

    await updateAnalyticsSyncRun(promotedBounds!.id, {
      status: "succeeded",
      sourceType: "bounds_artifacts",
      message: "Bounds rebuilt after chunk 1.",
    });

    runs = await listAnalyticsProjectRuns(bundle.project.id);
    const firstForecast = runs.find(
      (run) => run.runType === "forecast" && run.status === "queued"
    );

    expect(firstForecast?.status).toBe("queued");

    await updateAnalyticsSyncRun(firstForecast!.id, {
      status: "succeeded",
      sourceType: "bounds_artifacts",
      message: "Forecast rebuilt after chunk 1.",
    });

    await updateAnalyticsSyncRun(secondBackfill!.id, {
      status: "succeeded",
      sourceType: "appmetrica_logs",
      message: "Chunk 2 complete.",
    });

    runs = await listAnalyticsProjectRuns(bundle.project.id);
    const secondBounds = runs.find(
      (run) => run.runType === "bounds_refresh" && run.id !== promotedBounds!.id
    );

    expect(secondBounds?.status).toBe("queued");

    await updateAnalyticsSyncRun(secondBounds!.id, {
      status: "succeeded",
      sourceType: "bounds_artifacts",
      message: "Bounds rebuilt after chunk 2.",
    });

    runs = await listAnalyticsProjectRuns(bundle.project.id);
    const promotedForecastRun = runs.find((run) => run.runType === "forecast");

    expect(promotedForecastRun?.status).toBe("queued");
  });

  it("continues recent-tail ingestion in 3-day chunks until the requested window is exhausted", async () => {
    const {
      createAnalyticsProject,
      listAnalyticsProjectRuns,
      requestAnalyticsSync,
      updateAnalyticsSyncRun,
    } = await import("./store");

    const bundle = await createAnalyticsProject(
      {
        slug: "recent-tail-chunking",
        displayName: "Recent Tail Chunking",
        autoBootstrapOnCreate: false,
        appmetricaAppIds: ["3927166"],
        appmetricaToken: "test-token",
        bigquerySourceProjectId: "analytics-platform-493522",
        bigquerySourceDataset: "raw",
        bigqueryServiceAccountJson:
          '{"client_email":"railway-bq@analytics-platform-493522.iam.gserviceaccount.com","private_key":"test"}',
      },
      "tester@example.com"
    );

    const firstRun = await requestAnalyticsSync(bundle.project.id, {
      runType: "ingestion",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
      windowFrom: "2026-03-20",
      windowTo: "2026-03-26",
      payload: {
        sequence: "post-backfill-refresh",
        windowKind: "recent-tail",
      },
    });

    expect(firstRun.windowFrom).toBe("2026-03-20");
    expect(firstRun.windowTo).toBe("2026-03-22");

    await updateAnalyticsSyncRun(firstRun.id, {
      status: "succeeded",
      sourceType: "appmetrica_logs",
      message: "Recent-tail chunk 1 complete.",
    });

    let runs = await listAnalyticsProjectRuns(bundle.project.id);
    const secondRun = runs.find(
      (run) =>
        run.runType === "ingestion" &&
        run.id !== firstRun.id &&
        run.payload?.recentTailContinuation === true
    );

    expect(secondRun?.windowFrom).toBe("2026-03-23");
    expect(secondRun?.windowTo).toBe("2026-03-25");

    await updateAnalyticsSyncRun(secondRun!.id, {
      status: "succeeded",
      sourceType: "appmetrica_logs",
      message: "Recent-tail chunk 2 complete.",
    });

    runs = await listAnalyticsProjectRuns(bundle.project.id);
    const thirdRun = runs.find(
      (run) =>
        run.runType === "ingestion" &&
        run.id !== firstRun.id &&
        run.id !== secondRun!.id &&
        run.payload?.recentTailContinuation === true
    );

    expect(thirdRun?.windowFrom).toBe("2026-03-26");
    expect(thirdRun?.windowTo).toBe("2026-03-26");
  });

  it("queues a blocked recent-tail ingestion after backfill even when another ingestion run is already pending", async () => {
    const {
      createAnalyticsProject,
      listAnalyticsProjectRuns,
      requestAnalyticsSync,
      updateAnalyticsSyncRun,
    } = await import("./store");

    const bundle = await createAnalyticsProject(
      {
        slug: "recent-tail-priority",
        displayName: "Recent Tail Priority",
        autoBootstrapOnCreate: false,
        initialBackfillDays: 3,
        appmetricaAppIds: ["3927166"],
        appmetricaToken: "test-token",
        bigquerySourceProjectId: "analytics-platform-493522",
        bigquerySourceDataset: "raw",
        bigqueryServiceAccountJson:
          '{"client_email":"railway-bq@analytics-platform-493522.iam.gserviceaccount.com","private_key":"test"}',
      },
      "tester@example.com"
    );

    const ingestionRun = await requestAnalyticsSync(bundle.project.id, {
      runType: "ingestion",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
    });
    const backfillRun = await requestAnalyticsSync(bundle.project.id, {
      runType: "backfill",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
    });

    expect(ingestionRun.status).toBe("queued");
    expect(backfillRun.status).toBe("queued");

    await updateAnalyticsSyncRun(backfillRun.id, {
      status: "succeeded",
      sourceType: "appmetrica_logs",
      message: "Backfill completed while daily ingestion is still pending.",
    });

    const runs = await listAnalyticsProjectRuns(bundle.project.id);
    const blockedRecentTailRun = runs.find(
      (run) =>
        run.runType === "ingestion" &&
        run.id !== ingestionRun.id &&
        run.payload?.sequence === "post-backfill-refresh"
    );

    expect(blockedRecentTailRun?.status).toBe("blocked");
    expect(blockedRecentTailRun?.payload.windowKind).toBe("recent-tail");
  });

  it("does not claim a deferred blocked ingestion before its retry window", async () => {
    const {
      claimNextAnalyticsRun,
      createAnalyticsProject,
      requestAnalyticsSync,
      updateAnalyticsSyncRun,
    } = await import("./store");

    const bundle = await createAnalyticsProject(
      {
        slug: "deferred-ingestion-future",
        displayName: "Deferred Ingestion Future",
        autoBootstrapOnCreate: false,
        appmetricaAppIds: ["3927166"],
        appmetricaToken: "test-token",
        bigquerySourceProjectId: "analytics-platform-493522",
        bigquerySourceDataset: "raw",
        bigqueryServiceAccountJson:
          '{"client_email":"railway-bq@analytics-platform-493522.iam.gserviceaccount.com","private_key":"test"}',
      },
      "tester@example.com"
    );

    const run = await requestAnalyticsSync(bundle.project.id, {
      runType: "ingestion",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
    });

    await updateAnalyticsSyncRun(run.id, {
      status: "blocked",
      sourceType: "appmetrica_logs",
      message: "Waiting for AppMetrica export to become available.",
      payload: {
        deferUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        deferReason: "appmetrica_export_pending",
      },
    });

    const claimedRun = await claimNextAnalyticsRun(bundle.project.id, {
      runTypes: ["ingestion"],
      message: "retry claim",
    });

    expect(claimedRun).toBeNull();
  });

  it("promotes a deferred blocked ingestion after its retry window elapses", async () => {
    const {
      claimNextAnalyticsRun,
      createAnalyticsProject,
      requestAnalyticsSync,
      updateAnalyticsSyncRun,
    } = await import("./store");

    const bundle = await createAnalyticsProject(
      {
        slug: "deferred-ingestion-due",
        displayName: "Deferred Ingestion Due",
        autoBootstrapOnCreate: false,
        appmetricaAppIds: ["3927166"],
        appmetricaToken: "test-token",
        bigquerySourceProjectId: "analytics-platform-493522",
        bigquerySourceDataset: "raw",
        bigqueryServiceAccountJson:
          '{"client_email":"railway-bq@analytics-platform-493522.iam.gserviceaccount.com","private_key":"test"}',
      },
      "tester@example.com"
    );

    const run = await requestAnalyticsSync(bundle.project.id, {
      runType: "ingestion",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
    });

    await updateAnalyticsSyncRun(run.id, {
      status: "blocked",
      sourceType: "appmetrica_logs",
      message: "Waiting for AppMetrica export to become available.",
      payload: {
        deferUntil: new Date(Date.now() - 60 * 1000).toISOString(),
        deferReason: "appmetrica_export_pending",
      },
    });

    const claimedRun = await claimNextAnalyticsRun(bundle.project.id, {
      runTypes: ["ingestion"],
      message: "retry claim",
    });

    expect(claimedRun?.id).toBe(run.id);
    expect(claimedRun?.status).toBe("running");
    expect(claimedRun?.finishedAt).toBeNull();
  });
});
