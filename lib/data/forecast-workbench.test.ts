import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectQueryContext } from "@/lib/live-warehouse";
import type { AnalyticsProjectBundle } from "@/lib/platform/store";

const executeBigQueryMock = vi.fn();
const loadBigQueryContextsMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/live-warehouse", () => ({
  executeBigQuery: executeBigQueryMock,
  loadBigQueryContexts: loadBigQueryContextsMock,
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
    sources: [],
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

describe("forecast workbench actual chart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders grouped revenue actuals from live raw tables", async () => {
    const { getForecastWorkbenchData } = await import("@/lib/data/forecast-workbench");
    const bundle = makeBundle();
    const context = makeContext(bundle);

    loadBigQueryContextsMock.mockResolvedValue(new Map([[bundle.project.id, context]]));
    executeBigQueryMock.mockResolvedValue([
      { day: "2026-04-16", group_value: "US", value: 80.5 },
      { day: "2026-04-17", group_value: "US", value: 100.25 },
      { day: "2026-04-16", group_value: "CA", value: 50.0 },
      { day: "2026-04-17", group_value: "CA", value: 25.75 },
    ]);

    const data = await getForecastWorkbenchData([bundle], {
      from: "2026-04-16",
      to: "2026-04-17",
      platform: "all",
      groupBy: "country",
      metric: "revenue",
      country: "all",
      source: "all",
      company: "all",
      campaign: "all",
      creative: "all",
    });

    expect(data.actualChart?.title).toBe("Actual revenue by day");
    expect(data.actualChart?.groups).toHaveLength(2);
    expect(data.actualChart?.groups[0]?.label).toBe("US");
    expect(data.actualChart?.groups[0]?.points[0]?.value).toBeCloseTo(80.5, 5);
  });

  it("notes unsupported source filters for revenue actuals", async () => {
    const { getForecastWorkbenchData } = await import("@/lib/data/forecast-workbench");
    const bundle = makeBundle();
    const context = makeContext(bundle);

    loadBigQueryContextsMock.mockResolvedValue(new Map([[bundle.project.id, context]]));
    executeBigQueryMock.mockResolvedValue([{ day: "2026-04-17", group_value: "Selected scope", value: 120.5 }]);

    const data = await getForecastWorkbenchData([bundle], {
      from: "2026-04-17",
      to: "2026-04-17",
      platform: "all",
      groupBy: "source",
      metric: "revenue",
      country: "all",
      source: "google ads",
      company: "all",
      campaign: "all",
      creative: "all",
    });

    expect(data.actualChart?.groups).toHaveLength(1);
    expect(data.notes.some((note) => note.includes("traffic-source filter is ignored"))).toBe(true);
    expect(data.notes.some((note) => note.includes('Grouping "source" is not available'))).toBe(true);
  });
});
