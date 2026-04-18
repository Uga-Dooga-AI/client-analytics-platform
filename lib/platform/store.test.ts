import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    const promotedBoundsRun = promotedRuns.find((run) => run.runType === "bounds_refresh");

    expect(promotedBoundsRun?.status).toBe("queued");
  });

  it("keeps forecast blocked until a fresh bounds refresh succeeds after the latest ingestion", async () => {
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
      (run) =>
        run.runType === "bounds_refresh" &&
        run.payload?.sequence === "initial-bootstrap"
    );
    expect(firstBounds?.status).toBe("queued");

    await updateAnalyticsSyncRun(firstBounds!.id, {
      status: "succeeded",
      sourceType: "bounds_artifacts",
      message: "First bounds refresh completed in test.",
    });

    runs = await listAnalyticsProjectRuns(bundle.project.id);
    const bootstrapForecast = runs.find(
      (run) =>
        run.runType === "forecast" &&
        run.payload?.sequence === "initial-bootstrap"
    );
    expect(bootstrapForecast?.status).toBe("queued");

    await updateAnalyticsSyncRun(bootstrapForecast!.id, {
      status: "succeeded",
      sourceType: "bounds_artifacts",
      message: "Bootstrap forecast completed in test.",
    });

    await requestAnalyticsSync(bundle.project.id, {
      runType: "ingestion",
      requestedBy: "tester@example.com",
      triggerKind: "manual",
    });

    runs = await listAnalyticsProjectRuns(bundle.project.id);
    const incrementalIngestion = runs.find(
      (run) =>
        run.runType === "ingestion" &&
        run.payload?.sequence !== "initial-bootstrap"
    );
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
    expect(forecastRun.message).toContain("Waiting for bounds refresh");
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
    const promotedBounds = runs.find((run) => run.runType === "bounds_refresh");

    expect(secondBackfill?.status).toBe("queued");
    expect(secondBackfill?.payload.backfillContinuation).toBe(true);
    expect(promotedBounds?.status).toBe("queued");

    await updateAnalyticsSyncRun(promotedBounds!.id, {
      status: "succeeded",
      sourceType: "bounds_artifacts",
      message: "Bounds rebuilt after chunk 1.",
    });

    await updateAnalyticsSyncRun(secondBackfill!.id, {
      status: "succeeded",
      sourceType: "appmetrica_logs",
      message: "Chunk 2 complete.",
    });

    runs = await listAnalyticsProjectRuns(bundle.project.id);
    const promotedForecastRun = runs.find((run) => run.runType === "forecast");

    expect(promotedForecastRun?.status).toBe("queued");
  });
});
