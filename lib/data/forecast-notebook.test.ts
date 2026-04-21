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
            campaign_name: "Search Campaign Alpha",
            creative_id: "creative-1",
            creative_name: "Playable Variant 7",
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
            campaign_name: "Search Campaign Alpha",
            creative_id: "creative-1",
            creative_name: "Playable Variant 7",
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
            campaign_name: "Search Campaign Alpha",
            creative_id: "creative-1",
            creative_name: "Playable Variant 7",
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
    expect(surface.catalog.campaigns.find((entry) => entry.value === "camp-1")?.label).toBe("Search Campaign Alpha");
    expect(surface.catalog.creatives.find((entry) => entry.value === "creative-1")?.label).toBe("Playable Variant 7");
    expect(surface.data.summary.spend).toBe(210);
    expect(surface.data.summary.installs).toBe(144);
    expect(surface.data.summary.cpi).toBeCloseTo(1.46, 2);
    expect(surface.data.horizonCharts[0]?.groups[0]?.series[0]?.label).toBe("Mar 20");
    expect(surface.data.horizonCharts[0]?.groups[0]?.series[0]?.value).toBe(0);
    expect(
      surface.data.horizonCharts[0]?.groups[0]?.series.find((point) => point.label === "Apr 13")
    ).toBeDefined();
    expect(surface.data.paybackChart.groups[0]?.series[0]?.label).toBe("D0");
    expect(surface.data.breakdownRows[0]?.spend).toBe(210);
    expect(surface.data.cohortMatrix[0]?.cohortDate).toBe("2026-03-20");
    expect(surface.data.cohortMatrix.find((row) => row.cohortDate === "2026-04-01")?.spend).toBe(160);
    expect(surface.data.cohortMatrix.find((row) => row.cohortDate === "2026-04-01")?.installs).toBe(104);
    expect(surface.data.cohortMatrix.find((row) => row.cohortDate === "2026-04-13")?.cells[0]?.value).toBeNull();
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

  it("keeps payback curves flat when later horizons lose forecast coverage", async () => {
    const { getForecastNotebookSurface } = await import("@/lib/data/forecast-notebook");
    const bundle = makeBundle();
    const context = makeContext(bundle);

    vi.setSystemTime(new Date("2026-04-15T00:00:00.000Z"));
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
            count: 100,
            first_seen: "2026-03-25",
            last_seen: "2026-03-25",
          },
        ];
      }

      if (sql.includes("COUNT(DISTINCT user_key) AS cohort_size")) {
        return [
          {
            cohort_date: "2026-03-25",
            platform: "ios",
            country: "US",
            source: "google_ads",
            company: "Google Ads",
            campaign: "camp-1",
            creative: "creative-1",
            cohort_size: 100,
          },
        ];
      }

      if (sql.includes("DATE_DIFF(e.event_date, i.cohort_date, DAY) AS lifetime_day")) {
        return [
          {
            cohort_date: "2026-03-25",
            platform: "ios",
            country: "US",
            source: "google_ads",
            company: "Google Ads",
            campaign: "camp-1",
            creative: "creative-1",
            event_date: "2026-03-25",
            lifetime_day: 0,
            revenue: 20,
          },
          {
            cohort_date: "2026-03-25",
            platform: "ios",
            country: "US",
            source: "google_ads",
            company: "Google Ads",
            campaign: "camp-1",
            creative: "creative-1",
            event_date: "2026-04-01",
            lifetime_day: 7,
            revenue: 20,
          },
          {
            cohort_date: "2026-03-25",
            platform: "ios",
            country: "US",
            source: "google_ads",
            company: "Google Ads",
            campaign: "camp-1",
            creative: "creative-1",
            event_date: "2026-04-08",
            lifetime_day: 14,
            revenue: 10,
          },
          {
            cohort_date: "2026-03-25",
            platform: "ios",
            country: "US",
            source: "google_ads",
            company: "Google Ads",
            campaign: "camp-1",
            creative: "creative-1",
            event_date: "2026-04-15",
            lifetime_day: 21,
            revenue: 10,
          },
        ];
      }

      if (sql.includes("COUNT(*) AS event_count")) {
        return [
          { event_date: "2026-03-25", event_count: 10 },
          { event_date: "2026-04-01", event_count: 10 },
          { event_date: "2026-04-08", event_count: 10 },
          { event_date: "2026-04-15", event_count: 10 },
        ];
      }

      if (sql.includes("INFORMATION_SCHEMA.COLUMNS")) {
        return [
          { table_name: "google_ads_campaign_20260325", column_name: "date" },
          { table_name: "google_ads_campaign_20260325", column_name: "country" },
          { table_name: "google_ads_campaign_20260325", column_name: "campaign_id" },
          { table_name: "google_ads_campaign_20260325", column_name: "creative_id" },
          { table_name: "google_ads_campaign_20260325", column_name: "spend" },
          { table_name: "google_ads_campaign_20260325", column_name: "installs" },
          { table_name: "google_ads_campaign_20260325", column_name: "platform" },
        ];
      }

      if (sql.includes("WITH raw_spend AS")) {
        return [
          {
            cohort_date: "2026-03-25",
            source: "google_ads",
            company: "Google Ads",
            country: "US",
            store: "apple",
            campaign_id: "camp-1",
            campaign_name: "Search Campaign Alpha",
            creative_id: "creative-1",
            creative_name: "Playable Variant 7",
            spend: 100,
            installs: 100,
          },
        ];
      }

      return [];
    });

    const surface = await getForecastNotebookSurface({
      bundle,
      projectLabel: "Word Catcher",
      filters: makeFilters({
        from: "2026-03-25",
        to: "2026-04-15",
      }),
      selection: {
        revenueMode: "total",
        country: "all",
        source: "all",
        company: "all",
        campaign: "all",
        creative: "all",
      },
      horizonDays: [30],
    });

    const paybackSeries = surface.data.paybackChart.groups[0]?.series ?? [];
    const d21 = paybackSeries.find((point) => point.label === "D21");
    const d30 = paybackSeries.find((point) => point.label === "D30");

    expect(surface.data.cohortMatrix[0]?.cells[0]?.value).toBeNull();
    expect(d21?.value).toBeTypeOf("number");
    expect(d30?.value).toBe(d21?.value ?? null);
    expect(d30?.actual).toBeNull();
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

  it("offers historical forecast cutoffs only below the selected horizon", async () => {
    const { getForecastHistoryCutoffDays } = await import("@/lib/data/forecast-notebook");

    expect(getForecastHistoryCutoffDays(30)).toEqual([7, 10, 14, 18, 24]);
    expect(getForecastHistoryCutoffDays(60)).toEqual([7, 10, 14, 18, 24, 30, 45]);
    expect(getForecastHistoryCutoffDays(7)).toEqual([]);
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

    expect(bounds).toBeNull();
    expect(__testables.normalizeBoundsCohortSize(100.5)).toBe(100);
  });

  it("backfills sparse small cohort sizes with nearest empirical neighbors", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");
    const trainingRecords = [1, 2, 3, 4, 6, 7, 19, 20, 26, 150].map((size, index) => ({
      cohortDate: `2026-02-${String(index + 1).padStart(2, "0")}`,
      cohortSize: size,
      trueRevenue: [0, 0, 0, 0, 0],
      trueFor: new Map<number, number>([[30, 100]]),
      predictedForByCutoff: new Map<string, number>([
        [__testables.boundsKey(30, 7), 90],
      ]),
      badByCutoff: new Set<number>(),
    }));

    const bounds = __testables.buildBoundsForCohortSize(
      trainingRecords,
      47,
      30,
      [7],
      [30]
    );

    expect(bounds.get(__testables.boundsKey(30, 7))).toBeDefined();
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

  it("uses lower-tail and upper-tail quantiles for notebook bounds instead of the median", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");
    const errors = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40];
    const actualRevenue = 100;
    const trainingRecords = errors.map((error, index) => ({
      cohortDate: `2026-02-${String(index + 1).padStart(2, "0")}`,
      cohortSize: 100,
      trueRevenue: [0, 0, 0, 0, 0, 0, 0],
      trueFor: new Map<number, number>([[30, actualRevenue]]),
      predictedForByCutoff: new Map<string, number>([
        [__testables.boundsKey(30, 7), actualRevenue * (1 - error / 100)],
      ]),
      badByCutoff: new Set<number>(),
    }));

    const bounds = __testables
      .buildBoundsForCohortSize(trainingRecords, 100, 30, [7], [30])
      .get(__testables.boundsKey(30, 7));

    expect(bounds).toBeDefined();
    expect(bounds?.[0]).toBeCloseTo(-45.5, 5);
    expect(bounds?.[1]).toBeCloseTo(35.5, 5);
    expect(bounds?.[0]).not.toBeCloseTo(-5, 5);
  });

  it("keeps mature live forecast points separate from realized actuals", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");
    const cohort = {
      cohortDate: "2026-04-01",
      groupValue: "selected_scope",
      spend: 100,
      installs: 80,
      cohortSize: 80,
      cohortNumDays: 1,
      cohortLifetime: 10,
      isCorrupted: 0,
      totalRevenue: [40, 50, 60, 68, 73, 79, 88, 100, 109, 117, 124],
    };

    const artifactBounds = new Map<number, Map<string, readonly [number, number]>>([
      [
        80,
        new Map<string, readonly [number, number]>([
          [__testables.boundsKey(7, 6), [-10, 20] as const],
        ]),
      ],
    ]);
    const estimatedCurves = new Map<string, number[] | null>([
      ["live:selected_scope:2026-04-01", [40, 47, 53, 58, 63, 69, 75, 99, 104, 108, 111]],
      ["train:selected_scope:2026-04-01:6", [40, 47, 53, 58, 63, 69, 75, 80, 84, 87, 90]],
    ]);

    const resources = await __testables.buildLinePredictionResources(
      [cohort],
      [7],
      1,
      [6],
      [7],
      30,
      artifactBounds,
      [],
      estimatedCurves
    );
    const predictionPoint = __testables.getPredictionPoint(
      cohort,
      7,
      new Map([["selected_scope", resources]])
    );
    const paybackPoint = __testables.aggregatePaybackPoint(
      [cohort],
      7,
      new Map([["selected_scope", resources]])
    );

    expect(predictionPoint.predicted).toBe(80);
    expect(predictionPoint.lower).toBe(72);
    expect(predictionPoint.upper).toBe(96);
    expect(predictionPoint.actual).toBe(100);

    expect(paybackPoint.predicted).toBe(80);
    expect(paybackPoint.lower).toBe(72);
    expect(paybackPoint.upper).toBe(96);
    expect(paybackPoint.actual).toBe(100);
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

  it("returns null in strict mode when only live-built bounds are available", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");
    const trainingRecords = Array.from({ length: 12 }, (_, index) => ({
      cohortDate: `2026-02-${String(index + 1).padStart(2, "0")}`,
      cohortSize: 100,
      trueRevenue: [0, 0, 0, 0, 0, 0, 0],
      trueFor: new Map<number, number>([[30, 100]]),
      predictedForByCutoff: new Map<string, number>([
        [__testables.boundsKey(30, 7), 90],
      ]),
      badByCutoff: new Set<number>(),
    }));

    const strictBounds = __testables.getNotebookBounds(
      new Map(),
      trainingRecords,
      100,
      7,
      30,
      30,
      [7],
      [30],
      undefined,
      { allowLiveFallback: false }
    );

    const fallbackBounds = __testables.getNotebookBounds(
      new Map(),
      trainingRecords,
      100,
      7,
      30,
      30,
      [7],
      [30]
    );

    expect(strictBounds).toBeNull();
    expect(fallbackBounds).toEqual(expect.any(Array));
  });

  it("ignores placeholder [-15%, +15%] artifact bounds in strict chart mode", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");
    const artifactCache = new Map<number, Map<string, readonly [number, number]>>([
      [1000, new Map([[__testables.boundsKey(30, 7), [-15, 15] as const]])],
    ]);
    const trainingRecords = Array.from({ length: 12 }, (_, index) => ({
      cohortDate: `2026-02-${String(index + 1).padStart(2, "0")}`,
      cohortSize: 1000,
      trueRevenue: [0, 0, 0, 0, 0, 0, 0],
      trueFor: new Map<number, number>([[30, 100]]),
      predictedForByCutoff: new Map<string, number>([
        [__testables.boundsKey(30, 7), 90],
      ]),
      badByCutoff: new Set<number>(),
    }));

    const strictBounds = __testables.getNotebookBounds(
      new Map(),
      trainingRecords,
      1000,
      7,
      30,
      30,
      [7],
      [30],
      artifactCache,
      { allowLiveFallback: false }
    );

    const diagnosticBounds = __testables.getNotebookBounds(
      new Map(),
      trainingRecords,
      1000,
      7,
      30,
      30,
      [7],
      [30],
      artifactCache
    );

    expect(__testables.isPlaceholderArtifactBounds([-15, 15])).toBe(true);
    expect(strictBounds).toBeNull();
    expect(diagnosticBounds).toEqual(expect.any(Array));
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

  it("allows young-cohort fallback once two historical cohort curves are available", async () => {
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
      ]
    );

    expect(predicted).toBe(50);
  });

  it("uses up to four most recent historical cohort curves for young fallback", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");

    const predicted = __testables.fallbackYoungCohortPrediction(
      [10, 18, 20],
      2,
      30,
      [
        {
          trueRevenue: [1, 2, 25, 0, 0],
          predictedFor: new Map<number, number>([[30, 100]]),
          points: new Map(),
        },
        {
          trueRevenue: [1, 2, 50, 0, 0],
          predictedFor: new Map<number, number>([[30, 200]]),
          points: new Map(),
        },
        {
          trueRevenue: [1, 2, 75, 0, 0],
          predictedFor: new Map<number, number>([[30, 300]]),
          points: new Map(),
        },
        {
          trueRevenue: [1, 2, 100, 0, 0],
          predictedFor: new Map<number, number>([[30, 400]]),
          points: new Map(),
        },
        {
          trueRevenue: [1, 2, 125, 0, 0],
          predictedFor: new Map<number, number>([[30, 500]]),
          points: new Map(),
        },
      ]
    );

    expect(predicted).toBe(80);
  });

  it("reports bounds coverage per normalized cohort size", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");

    const cohorts = [
      {
        cohortDate: "2026-04-01",
        groupValue: "selected_scope",
        cohortSize: 100.4,
        spend: 80,
        installs: 100,
        cohortLifetime: 7,
        cohortNumDays: 7,
        totalRevenue: [0, 1, 3],
        isCorrupted: 0,
      },
      {
        cohortDate: "2026-04-08",
        groupValue: "selected_scope",
        cohortSize: 260,
        spend: 120,
        installs: 260,
        cohortLifetime: 7,
        cohortNumDays: 7,
        totalRevenue: [0, 1, 3],
        isCorrupted: 0,
      },
    ];

    const artifactTables = new Map<number, Map<string, readonly [number, number]>>([
      [100, new Map([["for_30_on_7", [2, 8] as const]])],
    ]);
    const trainingRecords = Array.from({ length: 12 }, (_, index) => ({
      cohortDate: `2026-03-${String(index + 1).padStart(2, "0")}`,
      cohortSize: 260,
      trueRevenue: [0, 1, 2, 3, 4, 5, 6, 7],
      trueFor: new Map<number, number>([[30, 150]]),
      predictedForByCutoff: new Map<string, number>([
        [__testables.boundsKey(30, 7), 120],
      ]),
      badByCutoff: new Set<number>(),
    }));

    const summary = __testables.buildBoundsCoverageSummary(
      cohorts,
      trainingRecords,
      30,
      [7],
      [30],
      artifactTables
    );

    expect(summary.rows).toEqual([
      expect.objectContaining({
        cohortSize: 100,
        sliceCohorts: 1,
        source: "artifact",
      }),
      expect.objectContaining({
        cohortSize: 260,
        sliceCohorts: 1,
        source: "live_fallback",
        smoothedTrainingRecords: 12,
      }),
    ]);
  });

  it("canonicalizes Unity tracker names to the shared unity_ads source key", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");

    const sourceSql = __testables.buildSourceSql("CAST(NULL AS STRING)", "tracker_name");

    expect(sourceSql).toContain("REGEXP_CONTAINS(LOWER(COALESCE(tracker_name, '')), r'unity')");
    expect(sourceSql).toContain("THEN 'unity_ads'");
  });

  it("prefers explicit campaign markers over appmetrica internal tracking ids", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");
    const sql = __testables.buildCampaignSql(
      "click_url_parameters",
      "tracker_name",
      "tracking_id"
    );

    expect(sql).toContain("campaign_name=");
    expect(sql).toContain("appmetrica_tracking_id=");
    expect(sql.indexOf("campaign_name=")).toBeLessThan(sql.indexOf("appmetrica_tracking_id="));
  });

  it("joins forecast revenue on either profile id or device id", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");

    const joinSql = __testables.buildRevenueJoinConditionSql("i", "e");

    expect(joinSql).toContain("e.profile_key = i.profile_key");
    expect(joinSql).toContain("e.device_key = i.device_key");
    expect(joinSql).toContain("OR");
  });

  it("distributes one aggregate spend row only once across matching cohort records", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");

    const raw = __testables.buildRawCohorts({
      cohortSizeRows: [
        {
          cohort_date: "2026-03-20",
          platform: "android",
          country: "US",
          source: "unity_ads",
          company: "Unity Ads",
          campaign: "campaign-a",
          creative: "creative-a",
          cohort_size: 40,
        },
        {
          cohort_date: "2026-03-20",
          platform: "android",
          country: "US",
          source: "unity_ads",
          company: "Unity Ads",
          campaign: "campaign-b",
          creative: "creative-b",
          cohort_size: 40,
        },
      ],
      revenueRows: [],
      spendRows: [
        {
          cohort_date: "2026-03-20",
          source: "unity_ads",
          company: "Unity Ads",
          country: "US",
          store: "google",
          campaign_id: "unknown",
          creative_id: "unknown",
          spend: 120,
          installs: 48,
        },
      ],
      filters: makeFilters({
        from: "2026-03-20",
        to: "2026-03-20",
        platform: "android",
        groupBy: "none",
      }),
      selection: {
        revenueMode: "total",
        country: "US",
        source: "unity_ads",
        company: "Unity Ads",
        campaign: "all",
        creative: "all",
      },
      groupBy: "none",
    });

    const rows = Array.from(raw.values()).sort((left, right) => left.campaign.localeCompare(right.campaign));

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.spend)).toEqual([60, 60]);
    expect(rows.map((row) => row.installs)).toEqual([24, 24]);
    expect(rows.reduce((sum, row) => sum + row.spend, 0)).toBe(120);
    expect(rows.reduce((sum, row) => sum + row.installs, 0)).toBe(48);
  });

  it("does not leak country-specific spend into a narrower country slice", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");

    const raw = __testables.buildRawCohorts({
      cohortSizeRows: [
        {
          cohort_date: "2026-03-20",
          platform: "android",
          country: "US",
          source: "unity_ads",
          company: "Unity Ads",
          campaign: "campaign-a",
          creative: "creative-a",
          cohort_size: 40,
        },
      ],
      revenueRows: [],
      spendRows: [
        {
          cohort_date: "2026-03-20",
          source: "unity_ads",
          company: "Unity Ads",
          country: "CA",
          store: "google",
          campaign_id: "campaign-a",
          creative_id: "creative-a",
          spend: 120,
          installs: 48,
        },
      ],
      filters: makeFilters({
        from: "2026-03-20",
        to: "2026-03-20",
        platform: "android",
        groupBy: "none",
      }),
      selection: {
        revenueMode: "total",
        country: "US",
        source: "unity_ads",
        company: "Unity Ads",
        campaign: "all",
        creative: "all",
      },
      groupBy: "none",
    });

    const rows = Array.from(raw.values());

    expect(rows).toHaveLength(1);
    expect(rows[0]?.spend ?? 0).toBe(0);
    expect(rows[0]?.installs ?? 0).toBe(40);
  });

  it("matches spend rows by Unity campaign and creative names when AppMetrica parsed names", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");

    const raw = __testables.buildRawCohorts({
      cohortSizeRows: [
        {
          cohort_date: "2026-03-25",
          platform: "android",
          country: "US",
          source: "unity_ads",
          company: "Unity Ads",
          campaign: "PS. Unity. Android. RU. ROAS D7. 18032026",
          creative: "RU. PS. Story",
          cohort_size: 40,
        },
      ],
      revenueRows: [],
      spendRows: [
        {
          cohort_date: "2026-03-25",
          source: "unity_ads",
          company: "Unity Ads",
          country: "US",
          store: "google",
          campaign_id: "69bae3e98bc237f7685ac1c4",
          campaign_name: "PS. Unity. Android. RU. ROAS D7. 18032026",
          creative_id: "67fcfed0631fb064d140053f",
          creative_name: "RU. PS. Story",
          spend: 120,
          installs: 48,
        },
      ],
      filters: makeFilters({
        from: "2026-03-25",
        to: "2026-03-25",
        platform: "android",
        groupBy: "none",
      }),
      selection: {
        revenueMode: "total",
        country: "US",
        source: "unity_ads",
        company: "Unity Ads",
        campaign: "all",
        creative: "all",
      },
      groupBy: "none",
    });

    const rows = Array.from(raw.values());

    expect(rows).toHaveLength(1);
    expect(rows[0]?.spend ?? 0).toBe(120);
    expect(rows[0]?.installs ?? 0).toBe(48);
  });

  it("filters spend rows by the active slice before allocating them", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");

    const raw = __testables.buildRawCohorts({
      cohortSizeRows: [
        {
          cohort_date: "2026-03-20",
          platform: "android",
          country: "US",
          source: "unity_ads",
          company: "Unity Ads",
          campaign: "campaign-a",
          creative: "creative-a",
          cohort_size: 40,
        },
      ],
      revenueRows: [],
      spendRows: [
        {
          cohort_date: "2026-03-20",
          source: "unity_ads",
          company: "Unity Ads",
          country: "UNKNOWN",
          store: "google",
          campaign_id: "campaign-a",
          creative_id: "creative-a",
          spend: 120,
          installs: 48,
        },
        {
          cohort_date: "2026-03-20",
          source: "unity_ads",
          company: "Unity Ads",
          country: "US",
          store: "apple",
          campaign_id: "campaign-a",
          creative_id: "creative-a",
          spend: 90,
          installs: 36,
        },
      ],
      filters: makeFilters({
        from: "2026-03-20",
        to: "2026-03-20",
        platform: "android",
        groupBy: "none",
      }),
      selection: {
        revenueMode: "total",
        country: "US",
        source: "unity_ads",
        company: "Unity Ads",
        campaign: "all",
        creative: "all",
      },
      groupBy: "none",
    });

    const rows = Array.from(raw.values());

    expect(rows).toHaveLength(1);
    expect(rows[0]?.spend ?? 0).toBe(0);
    expect(rows[0]?.installs ?? 0).toBe(40);
  });

  it("keeps spend rows when the active campaign selection matches Unity campaign_name", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");

    const raw = __testables.buildRawCohorts({
      cohortSizeRows: [
        {
          cohort_date: "2026-03-25",
          platform: "android",
          country: "US",
          source: "unity_ads",
          company: "Unity Ads",
          campaign: "PS. Unity. Android. RU. ROAS D7. 18032026",
          creative: "RU. PS. Story",
          cohort_size: 40,
        },
      ],
      revenueRows: [],
      spendRows: [
        {
          cohort_date: "2026-03-25",
          source: "unity_ads",
          company: "Unity Ads",
          country: "US",
          store: "google",
          campaign_id: "69bae3e98bc237f7685ac1c4",
          campaign_name: "PS. Unity. Android. RU. ROAS D7. 18032026",
          creative_id: "67fcfed0631fb064d140053f",
          creative_name: "RU. PS. Story",
          spend: 120,
          installs: 48,
        },
      ],
      filters: makeFilters({
        from: "2026-03-25",
        to: "2026-03-25",
        platform: "android",
        groupBy: "none",
      }),
      selection: {
        revenueMode: "total",
        country: "US",
        source: "unity_ads",
        company: "Unity Ads",
        campaign: "PS. Unity. Android. RU. ROAS D7. 18032026",
        creative: "all",
      },
      groupBy: "none",
    });

    const rows = Array.from(raw.values());

    expect(rows).toHaveLength(1);
    expect(rows[0]?.spend ?? 0).toBe(120);
    expect(rows[0]?.installs ?? 0).toBe(48);
  });

  it("falls back to unattributed AppMetrica cohorts when explicit Unity campaign rows cannot match", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");

    const raw = __testables.buildRawCohorts({
      cohortSizeRows: [
        {
          cohort_date: "2026-03-22",
          platform: "android",
          country: "US",
          source: "unity_ads",
          company: "Unity Ads",
          campaign: "3",
          creative: "unknown",
          cohort_size: 30,
        },
        {
          cohort_date: "2026-03-22",
          platform: "android",
          country: "US",
          source: "unity_ads",
          company: "Unity Ads",
          campaign: "unknown",
          creative: "unknown",
          cohort_size: 10,
        },
        {
          cohort_date: "2026-03-22",
          platform: "android",
          country: "US",
          source: "unity_ads",
          company: "Unity Ads",
          campaign: "campaign-b",
          creative: "creative-b",
          cohort_size: 60,
        },
      ],
      revenueRows: [],
      spendRows: [
        {
          cohort_date: "2026-03-22",
          source: "unity_ads",
          company: "Unity Ads",
          country: "US",
          store: "google",
          campaign_id: "campaign-a",
          campaign_name: "Campaign A",
          creative_id: "creative-a",
          creative_name: "Creative A",
          spend: 120,
          installs: 48,
        },
      ],
      filters: makeFilters({
        from: "2026-03-22",
        to: "2026-03-22",
        platform: "android",
        groupBy: "none",
      }),
      selection: {
        revenueMode: "total",
        country: "US",
        source: "unity_ads",
        company: "Unity Ads",
        campaign: "all",
        creative: "all",
      },
      groupBy: "none",
    });

    const rows = Array.from(raw.values()).sort((left, right) => left.campaign.localeCompare(right.campaign));

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.spend)).toEqual([90, 0, 30]);
    expect(rows.map((row) => row.installs)).toEqual([36, 60, 12]);
  });

  it("does not broaden explicit Unity campaign spend into unrelated cohorts", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");

    const raw = __testables.buildRawCohorts({
      cohortSizeRows: [
        {
          cohort_date: "2026-03-20",
          platform: "android",
          country: "US",
          source: "unity_ads",
          company: "Unity Ads",
          campaign: "campaign-a",
          creative: "creative-a",
          cohort_size: 40,
        },
        {
          cohort_date: "2026-03-20",
          platform: "android",
          country: "US",
          source: "unity_ads",
          company: "Unity Ads",
          campaign: "campaign-b",
          creative: "creative-b",
          cohort_size: 60,
        },
      ],
      revenueRows: [],
      spendRows: [
        {
          cohort_date: "2026-03-20",
          source: "unity_ads",
          company: "Unity Ads",
          country: "US",
          store: "google",
          campaign_id: "campaign-z",
          creative_id: "unknown",
          spend: 120,
          installs: 48,
        },
      ],
      filters: makeFilters({
        from: "2026-03-20",
        to: "2026-03-20",
        platform: "android",
        groupBy: "none",
      }),
      selection: {
        revenueMode: "total",
        country: "US",
        source: "unity_ads",
        company: "Unity Ads",
        campaign: "all",
        creative: "all",
      },
      groupBy: "none",
    });

    const rows = Array.from(raw.values()).sort((left, right) => left.campaign.localeCompare(right.campaign));

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.spend)).toEqual([0, 0]);
    expect(rows.map((row) => row.installs)).toEqual([40, 60]);
  });

  it("uses cohort size for summary installs and CPI instead of mirror conversion counters", async () => {
    const { __testables } = await import("@/lib/data/forecast-notebook");

    const summary = __testables.buildSummary(
      [
        {
          value: "selected_scope",
          label: "Selected scope",
          cohorts: [
            {
              cohortDate: "2026-03-20",
              groupValue: "selected_scope",
              spend: 120,
              installs: 48,
              cohortSize: 80,
              cohortNumDays: 1,
              cohortLifetime: 30,
              isCorrupted: 0,
              totalRevenue: [0, 20, 40, 60],
            },
          ],
        },
      ],
      new Map()
    );

    expect(summary.installs).toBe(80);
    expect(summary.cpi).toBe(1.5);
  });

  it("loads only lightweight slice catalogs until the current selection is explicitly applied", async () => {
    const { getForecastNotebookSurface } = await import("@/lib/data/forecast-notebook");
    const bundle = makeBundle();
    const context = makeContext(bundle);

    loadBigQueryContextsMock.mockResolvedValue(new Map([[bundle.project.id, context]]));
    executeBigQueryMock.mockImplementation(async (_context: ProjectQueryContext, sql: string) => {
      if (sql.includes("INFORMATION_SCHEMA.COLUMNS") && sql.includes("table_name = @table_name")) {
        return [
          { column_name: "install_datetime" },
          { column_name: "appmetrica_device_id" },
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
            count: 20,
            first_seen: "2026-04-01",
            last_seen: "2026-04-18",
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
      loadData: false,
    });

    const executedSql = executeBigQueryMock.mock.calls.map((call) => String(call[1] ?? ""));

    expect(executedSql.some((sql) => sql.includes("COUNT(DISTINCT user_key) AS cohort_size"))).toBe(false);
    expect(executedSql.some((sql) => sql.includes("DATE_DIFF(e.event_date, i.cohort_date, DAY) AS lifetime_day"))).toBe(false);
    expect(surface.catalog.countries.some((option) => option.value === "US")).toBe(true);
    expect(surface.data.summary.confidence).toBe("Waiting for explicit load");
    expect(surface.diagnostics.descriptorRowCount).toBe(1);
    expect(surface.diagnostics.revenueRowCount).toBe(0);
  });
});
