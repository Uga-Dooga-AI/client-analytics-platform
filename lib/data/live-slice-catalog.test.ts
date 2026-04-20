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
    sources: [
      {
        id: "source-unity",
        projectId: "project-word-catcher",
        sourceType: "unity_ads_spend",
        label: "Unity Ads spend",
        status: "ready",
        deliveryMode: "BigQuery mirror",
        frequencyHours: 6,
        lastSyncAt: now,
        nextSyncAt: now,
        secretPresent: false,
        secretHint: null,
        config: {
          enabled: true,
          mode: "bigquery",
          sourceProjectId: "unity-ads-398711",
          sourceDataset: "campaigns_days",
          tablePattern: "day_*",
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

describe("live slice catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds real appmetrica options and best-effort mirror catalogs", async () => {
    const { getLiveSliceCatalog } = await import("@/lib/data/live-slice-catalog");
    const bundle = makeBundle();
    const context = makeContext(bundle);

    loadBigQueryContextsMock.mockResolvedValue(new Map([[bundle.project.id, context]]));
    executeBigQueryMock.mockImplementation(async (_context: ProjectQueryContext, sql: string) => {
      if (sql.includes("COUNT(*) AS count") && sql.includes("tracker_name")) {
        return [
          { platform: "ios", country: "US", source: "google ads", count: 12, first_seen: "2026-04-02", last_seen: "2026-04-18" },
          { platform: "android", country: "DE", source: "organic", count: 7, first_seen: "2026-04-01", last_seen: "2026-04-17" },
        ];
      }

      if (sql.includes("COUNT(*) AS event_count")) {
        return [
          { event_name: "session_start", event_count: 40 },
          { event_name: "purchase", event_count: 5 },
        ];
      }

      if (sql.includes("INFORMATION_SCHEMA.COLUMNS")) {
        return [
          { table_name: "day_20260417", column_name: "campaign_name" },
          { table_name: "day_20260417", column_name: "creative_name" },
          { table_name: "day_20260418", column_name: "campaign_name" },
          { table_name: "day_20260418", column_name: "creative_name" },
        ];
      }

      if (sql.includes("SUM(count) AS count") && sql.includes("GROUP BY 1, 2")) {
        return [
          { campaign: "Spring Puzzle", creative: "Burst Video", count: 10, first_seen: "2026-04-10", last_seen: "2026-04-18" },
          { campaign: "Retention Sweep", creative: "Claim Banner", count: 6, first_seen: "2026-04-15", last_seen: "2026-04-18" },
        ];
      }

      return [];
    });

    const catalog = await getLiveSliceCatalog([bundle], {
      from: "2026-04-01",
      to: "2026-04-18",
      platform: "all",
    });

    expect(catalog.appmetricaDescriptors).toHaveLength(2);
    expect(catalog.events[0]?.value).toBe("all");
    expect(catalog.events.some((option) => option.value === "purchase")).toBe(true);
    expect(catalog.mirrorOptions?.companies.some((option) => option.value === "Unity Ads")).toBe(true);
    expect(catalog.mirrorOptions?.campaigns.some((option) => option.value === "Spring Puzzle")).toBe(true);
    expect(catalog.mirrorOptions?.creatives.some((option) => option.value === "Burst Video")).toBe(true);
    expect(catalog.appmetricaDescriptors[0]?.firstSeen).toBeTruthy();
    expect(catalog.mirrorDescriptors[0]?.firstSeen).toBeTruthy();
  });

  it("keeps appmetrica dimensions when event catalog loading fails", async () => {
    const { getLiveSliceCatalog } = await import("@/lib/data/live-slice-catalog");
    const bundle = makeBundle();
    const context = makeContext(bundle);

    loadBigQueryContextsMock.mockResolvedValue(new Map([[bundle.project.id, context]]));
    executeBigQueryMock.mockImplementation(async (_context: ProjectQueryContext, sql: string) => {
      if (sql.includes("COUNT(*) AS count") && sql.includes("tracker_name")) {
        return [{ platform: "ios", country: "US", source: "google ads", count: 12, first_seen: "2026-04-02", last_seen: "2026-04-18" }];
      }

      if (sql.includes("COUNT(*) AS event_count")) {
        throw new Error("events query timed out");
      }

      return [];
    });

    const catalog = await getLiveSliceCatalog([bundle], {
      from: "2026-04-01",
      to: "2026-04-18",
      platform: "all",
    });

    expect(catalog.appmetricaDescriptors).toEqual([
      { platform: "ios", country: "US", source: "google ads", count: 12, firstSeen: "2026-04-02", lastSeen: "2026-04-18" },
    ]);
    expect(catalog.notes.some((note) => note.includes("event catalog"))).toBe(true);
  });
});
