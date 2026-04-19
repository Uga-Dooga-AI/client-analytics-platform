import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardFilters } from "@/lib/dashboard-filters";
import type { ProjectQueryContext } from "@/lib/live-warehouse";
import type {
  AnalyticsProjectBundle,
  AnalyticsSourceRecord,
} from "@/lib/platform/store";

const executeBigQueryMock = vi.fn();
const loadBigQueryContextsMock = vi.fn();
const getAccessTokenMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/live-warehouse", () => ({
  executeBigQuery: executeBigQueryMock,
  getAccessToken: getAccessTokenMock,
  loadBigQueryContexts: loadBigQueryContextsMock,
}));

function makeSpendSource(): AnalyticsSourceRecord {
  const now = new Date("2026-04-18T10:00:00.000Z");

  return {
    id: "source-google-spend",
    projectId: "project-word-catcher",
    sourceType: "google_ads_spend",
    label: "Google Ads Spend",
    status: "ready",
    deliveryMode: "pull",
    frequencyHours: 24,
    lastSyncAt: now,
    nextSyncAt: now,
    secretPresent: true,
    secretHint: null,
    config: {
      enabled: true,
      mode: "bigquery",
      sourceProjectId: "analytics-platform-493522",
      sourceDataset: "raw",
      tablePattern: "google_ads_campaign_*",
    },
    createdAt: now,
    updatedAt: now,
  };
}

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
    sources: [makeSpendSource()],
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

function makeFilters(overrides: Partial<DashboardFilters> = {}): DashboardFilters {
  return {
    projectKey: "word-catcher",
    rangeKey: "30d",
    granularityKey: "custom",
    granularityDays: 12,
    from: "2026-03-20",
    to: "2026-04-18",
    platform: "ios",
    segment: "all",
    groupBy: "none",
    tag: "all",
    ...overrides,
  };
}

describe("forecast notebook live surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-19T00:00:00.000Z"));
  });

  it("loads live cohorts, spend mirrors, and keeps zero buckets before campaign start", async () => {
    const { getForecastNotebookSurface } = await import("@/lib/data/forecast-notebook");
    const bundle = makeBundle();
    const context = makeContext(bundle);

    loadBigQueryContextsMock.mockResolvedValue(new Map([[bundle.project.id, context]]));
    executeBigQueryMock.mockImplementation(async (_context: ProjectQueryContext, sql: string) => {
      if (sql.includes("INFORMATION_SCHEMA.COLUMNS") && sql.includes("table_name = @table_name")) {
        return [
          { column_name: "install_datetime" },
          { column_name: "appmetrica_device_id" },
          { column_name: "profile_id" },
          { column_name: "tracker_name" },
          { column_name: "tracking_id" },
          { column_name: "click_url_parameters" },
          { column_name: "country_iso_code" },
          { column_name: "os_name" },
        ];
      }

      if (sql.includes("COUNT(*) AS count")) {
        return [
          {
            platform: "ios",
            country: "US",
            source: "google_ads",
            company: "Google Ads",
            campaign: "camp-1",
            creative: "creative-1",
            count: 120,
            first_seen: "2026-04-01",
            last_seen: "2026-04-18",
          },
        ];
      }

      if (sql.includes("COUNT(DISTINCT user_key) AS cohort_size")) {
        return [
          {
            cohort_date: "2026-04-01",
            platform: "ios",
            country: "US",
            source: "google_ads",
            company: "Google Ads",
            campaign: "camp-1",
            creative: "creative-1",
            cohort_size: 80,
          },
          {
            cohort_date: "2026-04-13",
            platform: "ios",
            country: "US",
            source: "google_ads",
            company: "Google Ads",
            campaign: "camp-1",
            creative: "creative-1",
            cohort_size: 40,
          },
          {
            cohort_date: "2026-04-05",
            platform: "ios",
            country: "US",
            source: "google_ads",
            company: "Google Ads",
            campaign: "camp-1",
            creative: "creative-1",
            cohort_size: 24,
          },
        ];
      }

      if (sql.includes("DATE_DIFF(e.event_date, i.cohort_date, DAY) AS lifetime_day")) {
        return [
          {
            cohort_date: "2026-04-01",
            platform: "ios",
            country: "US",
            source: "google_ads",
            company: "Google Ads",
            campaign: "camp-1",
            creative: "creative-1",
            event_date: "2026-04-01",
            lifetime_day: 0,
            revenue: 40,
          },
          {
            cohort_date: "2026-04-01",
            platform: "ios",
            country: "US",
            source: "google_ads",
            company: "Google Ads",
            campaign: "camp-1",
            creative: "creative-1",
            event_date: "2026-04-02",
            lifetime_day: 1,
            revenue: 30,
          },
          {
            cohort_date: "2026-04-01",
            platform: "ios",
            country: "US",
            source: "google_ads",
            company: "Google Ads",
            campaign: "camp-1",
            creative: "creative-1",
            event_date: "2026-04-10",
            lifetime_day: 9,
            revenue: 20,
          },
          {
            cohort_date: "2026-04-13",
            platform: "ios",
            country: "US",
            source: "google_ads",
            company: "Google Ads",
            campaign: "camp-1",
            creative: "creative-1",
            event_date: "2026-04-13",
            lifetime_day: 0,
            revenue: 10,
          },
          {
            cohort_date: "2026-04-13",
            platform: "ios",
            country: "US",
            source: "google_ads",
            company: "Google Ads",
            campaign: "camp-1",
            creative: "creative-1",
            event_date: "2026-04-14",
            lifetime_day: 1,
            revenue: 8,
          },
        ];
      }

      if (sql.includes("COUNT(*) AS event_count")) {
        return [
          { event_date: "2026-04-01", event_count: 10 },
          { event_date: "2026-04-02", event_count: 10 },
          { event_date: "2026-04-10", event_count: 10 },
          { event_date: "2026-04-13", event_count: 10 },
          { event_date: "2026-04-14", event_count: 10 },
        ];
      }

      if (sql.includes("INFORMATION_SCHEMA.COLUMNS")) {
        return [
          { table_name: "google_ads_campaign_20260401", column_name: "date" },
          { table_name: "google_ads_campaign_20260401", column_name: "country" },
          { table_name: "google_ads_campaign_20260401", column_name: "campaign_id" },
          { table_name: "google_ads_campaign_20260401", column_name: "creative_id" },
          { table_name: "google_ads_campaign_20260401", column_name: "spend" },
          { table_name: "google_ads_campaign_20260401", column_name: "installs" },
          { table_name: "google_ads_campaign_20260401", column_name: "platform" },
          { table_name: "google_ads_campaign_20260413", column_name: "date" },
          { table_name: "google_ads_campaign_20260413", column_name: "country" },
          { table_name: "google_ads_campaign_20260413", column_name: "campaign_id" },
          { table_name: "google_ads_campaign_20260413", column_name: "creative_id" },
          { table_name: "google_ads_campaign_20260413", column_name: "spend" },
          { table_name: "google_ads_campaign_20260413", column_name: "installs" },
          { table_name: "google_ads_campaign_20260413", column_name: "platform" },
        ];
      }

      if (sql.includes("WITH raw_spend AS")) {
        return [
          {
            cohort_date: "2026-04-01",
            source: "google_ads",
            company: "Google Ads",
            country: "US",
            store: "apple",
            campaign_id: "camp-1",
            creative_id: "creative-1",
            spend: 100,
            installs: 80,
          },
          {
            cohort_date: "2026-04-13",
            source: "google_ads",
            company: "Google Ads",
            country: "US",
            store: "apple",
            campaign_id: "camp-1",
            creative_id: "creative-1",
            spend: 50,
            installs: 40,
          },
          {
            cohort_date: "2026-04-05",
            source: "google_ads",
            company: "Google Ads",
            country: "US",
            store: "apple",
            campaign_id: "camp-1",
            creative_id: "creative-1",
            spend: 60,
            installs: 24,
          },
        ];
      }

      return [];
    });

    const surface = await getForecastNotebookSurface({
      bundle,
      projectLabel: "Word Catcher",
      filters: makeFilters(),
      selection: {
        revenueMode: "total",
        country: "all",
        source: "all",
        company: "all",
        campaign: "all",
        creative: "all",
      },
      horizonDays: [30, 120],
    });

    expect(surface.catalog.countries.map((entry) => entry.value)).toContain("US");
    expect(surface.catalog.sources.map((entry) => entry.value)).toContain("google_ads");
    expect(surface.catalog.campaigns.map((entry) => entry.value)).toContain("camp-1");
    expect(surface.catalog.creatives.map((entry) => entry.value)).toContain("creative-1");
    expect(surface.data.summary.spend).toBe(210);
    expect(surface.data.summary.installs).toBe(144);
    expect(surface.data.summary.cpi).toBeCloseTo(1.46, 2);
    expect(surface.data.horizonCharts[0]?.groups[0]?.series[0]?.label).toBe("Mar 20");
    expect(surface.data.horizonCharts[0]?.groups[0]?.series[0]?.value).toBe(0);
    expect(
      surface.data.horizonCharts[0]?.groups[0]?.series.find((point) => point.label === "Apr 13")?.value
    ).toBeNull();
    expect(surface.data.paybackChart.groups[0]?.series[0]?.label).toBe("D1");
    expect(surface.data.breakdownRows[0]?.spend).toBe(210);
    expect(surface.data.cohortMatrix[0]?.cohortDate).toBe("2026-03-20");
    expect(surface.data.cohortMatrix.find((row) => row.cohortDate === "2026-04-01")?.spend).toBe(160);
    expect(surface.data.cohortMatrix.find((row) => row.cohortDate === "2026-04-01")?.installs).toBe(104);
    expect(
      surface.data.cohortMatrix.find((row) => row.cohortDate === "2026-04-13")?.cells[0]?.value
    ).toBeNull();
    expect(surface.data.notes.some((note) => note.includes("Synthetic preview rows were removed"))).toBe(true);

    const revenueCall = executeBigQueryMock.mock.calls.find(([, sql]) =>
      typeof sql === "string" && sql.includes("DATE_DIFF(e.event_date, i.cohort_date, DAY) AS lifetime_day")
    );
    const corruptedDaysCall = executeBigQueryMock.mock.calls.find(([, sql]) =>
      typeof sql === "string" && sql.includes("COUNT(*) AS event_count")
    );

    expect(revenueCall?.[2]?.find((param: { name: string; value: string }) => param.name === "events_to")?.value).toBe(
      "2026-04-18"
    );
    expect(
      corruptedDaysCall?.[2]?.find((param: { name: string; value: string }) => param.name === "events_to")?.value
    ).toBe("2026-04-18");
  });

  it("tracks slice filters and custom horizons in the combination payload", async () => {
    const { buildForecastNotebookTrackingPayload } = await import("@/lib/data/forecast-notebook");

    const payload = buildForecastNotebookTrackingPayload(
      "Word Catcher",
      makeFilters({ granularityDays: 9, groupBy: "campaign" }),
      {
        revenueMode: "ads",
        country: "US",
        source: "google_ads",
        company: "Google Ads",
        campaign: "camp-1",
        creative: "creative-1",
      },
      [7, 30, 120]
    );

    expect(payload.label).toContain("Word Catcher");
    expect(payload.label).toContain("ads");
    expect(payload.label).toContain("step 9d");
    expect(payload.filters.horizonDays).toEqual([7, 30, 120]);
    expect(payload.filters.revenueMode).toBe("ads");
    expect(payload.filters.country).toBe("US");
    expect(payload.filters.source).toBe("google_ads");
    expect(payload.filters.company).toBe("Google Ads");
    expect(payload.filters.campaign).toBe("camp-1");
    expect(payload.filters.creative).toBe("creative-1");
  });

  it("uses the exact rounded cohort size for notebook bounds lookup", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");
    const cache = new Map<number, Map<string, readonly [number, number]>>();
    const neighborBounds = new Map<string, readonly [number, number]>();
    neighborBounds.set(__testables.boundsKey(30, 7), [1, 2] as const);

    cache.set(100, new Map());
    cache.set(99, neighborBounds);

    const bounds = __testables.getNotebookBounds(
      cache,
      [],
      100.4,
      7,
      30,
      360,
      [4, 7],
      [30]
    );

    expect(bounds).toEqual([-15, 15]);
    expect(__testables.normalizeBoundsCohortSize(100.5)).toBe(100);
  });

  it("caps notebook bounds lookup and expansion at 365 days", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");
    const cache = new Map<number, Map<string, readonly [number, number]>>();
    const exactBounds = new Map<string, readonly [number, number]>();
    exactBounds.set(__testables.boundsKey(365, 7), [3, 9] as const);
    cache.set(100, exactBounds);

    const lookedUp = __testables.getNotebookBounds(
      cache,
      [],
      100,
      7,
      720,
      720,
      [4, 7],
      [30, 60]
    );

    expect(lookedUp).toEqual([3, 9]);

    const trainingRecords = Array.from({ length: 10 }, (_, index) => ({
      cohortDate: `2026-03-${String(index + 1).padStart(2, "0")}`,
      cohortSize: 100,
      trueRevenue: [0, 0, 0, 0, 0],
      trueFor: new Map<number, number>([
        [30, 120],
        [60, 220],
      ]),
      predictedForByCutoff: new Map<string, number>([
        [__testables.boundsKey(30, 4), 90],
        [__testables.boundsKey(30, 7), 95],
        [__testables.boundsKey(60, 4), 170],
        [__testables.boundsKey(60, 7), 180],
      ]),
      badByCutoff: new Set<number>(),
    }));

    const table = __testables.buildBoundsForCohortSize(
      trainingRecords,
      100,
      720,
      [4, 7],
      [30, 60]
    );

    expect(table.has(__testables.boundsKey(365, 4))).toBe(true);
    expect(table.has(__testables.boundsKey(366, 4))).toBe(false);
  });

  it("clamps notebook bounds cohort sizes to the artifact corpus range", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");
    const cache = new Map<number, Map<string, readonly [number, number]>>();
    const artifactBounds = new Map<string, readonly [number, number]>();
    artifactBounds.set(__testables.boundsKey(30, 7), [4, 12] as const);
    cache.set(1000, artifactBounds);

    const bounds = __testables.getNotebookBounds(
      cache,
      [],
      1904.6,
      7,
      30,
      360,
      [4, 7],
      [30]
    );

    expect(bounds).toEqual([4, 12]);
    expect(__testables.normalizeBoundsCohortSize(1904.6)).toBe(1000);
  });

  it("matches notebook young-cohort fallback by keeping zero realized revenues in previous predictions", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");

    const predicted = __testables.fallbackYoungCohortPrediction(
      [10, 18, 20],
      2,
      30,
      [
        {
          trueRevenue: Array.from({ length: 31 }, (_, index) => (index === 2 ? 150 : index === 30 ? 300 : 0)),
          predictedFor: new Map<number, number>(),
          points: new Map(),
        },
        {
          trueRevenue: [10, 20, 50, 60, 70],
          predictedFor: new Map<number, number>([[30, 200]]),
          points: new Map(),
        },
        {
          trueRevenue: [5, 9, 0, 12, 18],
          predictedFor: new Map<number, number>([[30, 100]]),
          points: new Map(),
        },
      ]
    );

    expect(predicted).toBe(60);
  });
});
