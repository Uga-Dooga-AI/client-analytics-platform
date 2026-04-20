import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectQueryContext } from "@/lib/live-warehouse";
import type { AnalyticsProjectBundle } from "@/lib/platform/store";

const executeBigQueryMock = vi.fn();
const loadBigQueryContextsMock = vi.fn();
const listAnalyticsProjectsMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/live-warehouse", () => ({
  executeBigQuery: executeBigQueryMock,
  loadBigQueryContexts: loadBigQueryContextsMock,
}));

vi.mock("@/lib/platform/store", () => ({
  listAnalyticsProjects: listAnalyticsProjectsMock,
}));

function makeBundle(): AnalyticsProjectBundle {
  const now = new Date("2026-04-18T10:00:00.000Z");

  return {
    project: {
      id: "project-word-catcher",
      slug: "word-catcher",
      displayName: "Word Catcher",
      description: "",
      ownerTeam: "Client Services",
      status: "ready",
      gcpProjectId: "analytics-platform-493522",
      gcsBucket: "analytics-platform-493522-word-catcher",
      rawDataset: "raw",
      stgDataset: "stg",
      martDataset: "mart",
      boundsPath: "gs://analytics-platform-493522-word-catcher/bounds/word-catcher",
      defaultGranularityDays: 7,
      refreshIntervalHours: 6,
      forecastIntervalHours: 12,
      boundsIntervalHours: 720,
      lookbackDays: 1,
      initialBackfillDays: 365,
      forecastHorizonDays: 730,
      settings: {
        autoProvisionInfrastructure: true,
        provisioningRegion: "us-central1",
        autoBootstrapOnCreate: true,
        forecastStrategy: {
          precomputePrimaryForecasts: true,
          enableOnDemandForecasts: true,
          expandPrimaryMatrix: true,
          recentCombinationLimit: 50,
          primaryCountries: ["US"],
          primarySegments: ["all_users"],
          primarySpendSources: ["all_sources"],
          primaryPlatforms: ["all"],
        },
      },
      createdBy: "tester@example.com",
      updatedBy: "tester@example.com",
      createdAt: now,
      updatedAt: now,
    },
    sources: [
      {
        id: "source-bq",
        projectId: "project-word-catcher",
        sourceType: "bigquery_export",
        label: "BigQuery export",
        status: "ready",
        deliveryMode: "Dataset pull",
        frequencyHours: 6,
        lastSyncAt: now,
        nextSyncAt: now,
        secretPresent: true,
        secretHint: "svc@test",
        config: {
          sourceProjectId: "analytics-platform-493522",
          sourceDataset: "mart",
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
    latestRuns: [],
  };
}

function makeContext(bundle: AnalyticsProjectBundle): ProjectQueryContext {
  return {
    bundle,
    serviceAccount: {
      client_email: "svc@test.iam.gserviceaccount.com",
      private_key: "test-key",
    },
    warehouseProjectId: bundle.project.gcpProjectId,
    location: "US",
    rawEventsTable: "word_catcher_appmetrica_events",
    rawInstallsTable: "word_catcher_appmetrica_installs",
    rawSessionsTable: "word_catcher_appmetrica_sessions",
  };
}

describe("forecast live reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers the serving table when published rows are available", async () => {
    const { getForecastTrajectories } = await import("@/lib/data/forecasts");
    const bundle = makeBundle();
    const context = makeContext(bundle);

    listAnalyticsProjectsMock.mockResolvedValue([bundle]);
    loadBigQueryContextsMock.mockResolvedValue(new Map([[bundle.project.id, context]]));
    executeBigQueryMock.mockResolvedValue([
      {
        metric: "revenue",
        forecast_date: "2026-04-18",
        p50: 120.5,
        p10: 100.1,
        p90: 140.9,
        generated_at: "2026-04-18T12:00:00Z",
      },
    ]);

    const trajectories = await getForecastTrajectories({ projectKey: "all" });

    expect(trajectories).toHaveLength(1);
    expect(trajectories[0]?.project).toBe("Word Catcher");
    expect(trajectories[0]?.metric).toBe("Revenue forecast");
    expect(executeBigQueryMock).toHaveBeenCalledTimes(1);
    expect(String(executeBigQueryMock.mock.calls[0]?.[1])).toContain("word_catcher_forecast_points_serving");
  });

  it("hides published metrics that are not supported by the current revenue-only runtime contract", async () => {
    const { getForecastTrajectories } = await import("@/lib/data/forecasts");
    const bundle = makeBundle();
    const context = makeContext(bundle);

    listAnalyticsProjectsMock.mockResolvedValue([bundle]);
    loadBigQueryContextsMock.mockResolvedValue(new Map([[bundle.project.id, context]]));
    executeBigQueryMock.mockResolvedValue([
      {
        metric: "revenue",
        forecast_date: "2026-04-18",
        p50: 120.5,
        p10: 100.1,
        p90: 140.9,
        generated_at: "2026-04-18T12:00:00Z",
      },
      {
        metric: "dau",
        forecast_date: "2026-04-18",
        p50: 900,
        p10: 850,
        p90: 950,
        generated_at: "2026-04-18T12:00:00Z",
      },
    ]);

    const trajectories = await getForecastTrajectories({ projectKey: "all" });

    expect(trajectories).toHaveLength(1);
    expect(trajectories[0]?.metric).toBe("Revenue forecast");
  });

  it("falls back to the raw forecast table when the serving table read fails", async () => {
    const { getForecastTrajectories } = await import("@/lib/data/forecasts");
    const bundle = makeBundle();
    const context = makeContext(bundle);

    listAnalyticsProjectsMock.mockResolvedValue([bundle]);
    loadBigQueryContextsMock.mockResolvedValue(new Map([[bundle.project.id, context]]));
    executeBigQueryMock.mockImplementation(async (_context: ProjectQueryContext, sql: string) => {
      if (sql.includes("word_catcher_forecast_points_serving")) {
        throw new Error("Not found: word_catcher_forecast_points_serving");
      }

      return [
        {
          metric: "revenue",
          forecast_date: "2026-04-18",
          p50: 120.5,
          p10: 100.1,
          p90: 140.9,
          generated_at: "2026-04-18T12:00:00Z",
        },
        {
          metric: "revenue",
          forecast_date: "2026-04-19",
          p50: 125.2,
          p10: 103.4,
          p90: 147.7,
          generated_at: "2026-04-18T12:00:00Z",
        },
      ];
    });

    const trajectories = await getForecastTrajectories({ projectKey: "all" });

    expect(trajectories).toHaveLength(1);
    expect(trajectories[0]?.series).toHaveLength(2);
    expect(executeBigQueryMock).toHaveBeenCalledTimes(2);
    expect(String(executeBigQueryMock.mock.calls[1]?.[1])).toContain("word_catcher_forecast_points`");
  });
});
