import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
        id: "source-appmetrica",
        projectId: "project-word-catcher",
        sourceType: "appmetrica_logs",
        label: "AppMetrica Logs API",
        status: "ready",
        deliveryMode: "Logs API",
        frequencyHours: 6,
        lastSyncAt: now,
        nextSyncAt: now,
        secretPresent: true,
        secretHint: "token",
        config: {
          appIds: ["3927166"],
          eventNames: ["app_install", "purchase"],
        },
        createdAt: now,
        updatedAt: now,
      },
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

function tablePrefix(slug: string) {
  return slug.replace(/-/g, "_");
}

function makeContext(bundle: AnalyticsProjectBundle): ProjectQueryContext {
  const prefix = tablePrefix(bundle.project.slug);

  return {
    bundle,
    serviceAccount: {
      client_email: "svc@test.iam.gserviceaccount.com",
      private_key: "test-key",
    },
    warehouseProjectId: bundle.project.gcpProjectId,
    location: "US",
    rawEventsTable: `${prefix}_appmetrica_events`,
    rawInstallsTable: `${prefix}_appmetrica_installs`,
    rawSessionsTable: `${prefix}_appmetrica_sessions`,
  };
}

describe("data quality dashboard reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds raw -> stage -> mart reconciliation and falls back event breakdown to country", async () => {
    const { getDataQualityDashboardData } = await import("@/lib/data/data-quality");
    const bundle = makeBundle();
    const context = makeContext(bundle);
    let dailySql = "";

    loadBigQueryContextsMock.mockResolvedValue(new Map([[bundle.project.id, context]]));
    executeBigQueryMock.mockImplementation(async (_context: ProjectQueryContext, sql: string) => {
      if (sql.includes("INFORMATION_SCHEMA.TABLES")) {
        return [
          { dataset_name: "raw", table_name: "word_catcher_appmetrica_installs" },
          { dataset_name: "raw", table_name: "word_catcher_appmetrica_events" },
          { dataset_name: "raw", table_name: "word_catcher_appmetrica_sessions" },
          { dataset_name: "stg", table_name: "word_catcher_appmetrica__installs" },
          { dataset_name: "stg", table_name: "word_catcher_appmetrica__events" },
          { dataset_name: "stg", table_name: "word_catcher_appmetrica__sessions" },
          { dataset_name: "mart", table_name: "word_catcher_installs_funnel" },
        ];
      }

      if (sql.includes("pipeline_installs AS")) {
        dailySql = sql;
        return [
          {
            date: "2026-04-18",
            pipeline_install_rows: 12,
            raw_install_rows: 12,
            stg_install_rows: 10,
            mart_install_rows: 10,
            pipeline_event_rows: 30,
            raw_event_rows: 30,
            stg_event_rows: 27,
          },
          {
            date: "2026-04-17",
            pipeline_install_rows: 8,
            raw_install_rows: 8,
            stg_install_rows: 8,
            mart_install_rows: 7,
            pipeline_event_rows: 20,
            raw_event_rows: 20,
            stg_event_rows: 19,
          },
        ];
      }

      if (sql.includes("mart_breakdown")) {
        return [
          { dimension_value: "organic", raw_rows: 9, stage_rows: 8, mart_rows: 8 },
          { dimension_value: "unity ads", raw_rows: 11, stage_rows: 10, mart_rows: 9 },
        ];
      }

      if (sql.includes("raw_install_identity_base")) {
        return [
          {
            raw_install_rows: 20,
            raw_install_missing_device_rows: 0,
            raw_install_missing_user_rows: 6,
            raw_install_missing_both_rows: 0,
            raw_install_device_ids: 20,
            stage_install_device_ids: 18,
            overlap_install_device_ids: 18,
            raw_install_user_ids: 9,
            stage_install_user_ids: 9,
            overlap_install_user_ids: 9,
            raw_install_fingerprints: 20,
            stage_install_fingerprints: 18,
            overlap_install_fingerprints: 18,
            raw_session_rows: 25,
            raw_session_missing_session_rows: 1,
            raw_session_missing_device_rows: 0,
            raw_session_missing_user_rows: 8,
            raw_session_missing_both_rows: 0,
            raw_session_ids: 24,
            stage_session_ids: 24,
            overlap_session_ids: 24,
            raw_session_device_ids: 20,
            stage_session_device_ids: 20,
            overlap_session_device_ids: 20,
            raw_session_user_ids: 10,
            stage_session_user_ids: 10,
            overlap_session_user_ids: 10,
            raw_session_fingerprints: 25,
            stage_session_fingerprints: 24,
            overlap_session_fingerprints: 24,
          },
        ];
      }

      return [{ dimension_value: "US", raw_rows: 50, stage_rows: 46, mart_rows: null }];
    });

    const data = await getDataQualityDashboardData([bundle], {
      from: "2026-04-17",
      to: "2026-04-18",
      platform: "all",
      groupBy: "source",
    });

    expect(data.projectSummaries).toHaveLength(1);
    expect(data.projectSummaries[0]?.rawInstallRows).toBe(20);
    expect(data.projectSummaries[0]?.stgInstallRows).toBe(18);
    expect(data.projectSummaries[0]?.martInstallRows).toBe(17);
    expect(data.projectSummaries[0]?.rawEventRows).toBe(50);
    expect(data.projectSummaries[0]?.stgEventRows).toBe(46);
    expect(data.projectSummaries[0]?.installsRawToStageRatio).toBeCloseTo(0.9, 5);
    expect(data.projectSummaries[0]?.installsStageToMartRatio).toBeCloseTo(17 / 18, 5);
    expect(data.projectSummaries[0]?.eventsRawToStageRatio).toBeCloseTo(0.92, 5);
    expect(data.dailyRows).toHaveLength(2);
    expect(dailySql).toContain("AND app_id IN (3927166)");
    expect(data.installsBreakdownDimension).toBe("source");
    expect(data.eventsBreakdownDimension).toBe("country");
    expect(data.installsBreakdownRows[0]?.dimensionValue).toBe("unity ads");
    expect(data.eventsBreakdownRows[0]?.dimensionValue).toBe("US");
    expect(data.identitySummaries[0]?.stageInstallDeviceIds).toBe(18);
    expect(data.identitySummaries[0]?.overlapInstallUserIds).toBe(9);
    expect(data.identitySummaries[0]?.stageSessionIds).toBe(24);
    expect(data.identitySummaries[0]?.overlapSessionFingerprints).toBe(24);
    expect(data.resolvedContextCount).toBe(1);
    expect(data.failedProjectNames).toEqual([]);
    expect(data.notes.some((note) => note.includes("Event breakdown uses country/platform only"))).toBe(true);
    expect(data.notes.some((note) => note.includes("Derived fingerprints"))).toBe(true);
  });

  it("keeps mart metrics unavailable when the installs mart is missing", async () => {
    const { getDataQualityDashboardData } = await import("@/lib/data/data-quality");
    const bundle = makeBundle();
    const context = makeContext(bundle);

    loadBigQueryContextsMock.mockResolvedValue(new Map([[bundle.project.id, context]]));
    executeBigQueryMock.mockImplementation(async (_context: ProjectQueryContext, sql: string) => {
      if (sql.includes("INFORMATION_SCHEMA.TABLES")) {
        return [
          { dataset_name: "raw", table_name: "word_catcher_appmetrica_installs" },
          { dataset_name: "raw", table_name: "word_catcher_appmetrica_events" },
          { dataset_name: "stg", table_name: "word_catcher_appmetrica__installs" },
          { dataset_name: "stg", table_name: "word_catcher_appmetrica__events" },
        ];
      }

      if (sql.includes("pipeline_installs AS")) {
        return [
          {
            date: "2026-04-18",
            pipeline_install_rows: 5,
            raw_install_rows: 5,
            stg_install_rows: 5,
            mart_install_rows: 0,
            pipeline_event_rows: 9,
            raw_event_rows: 9,
            stg_event_rows: 9,
          },
        ];
      }

      if (sql.includes("raw_install_identity_base")) {
        return [
          {
            raw_install_rows: 5,
            raw_install_missing_device_rows: 0,
            raw_install_missing_user_rows: 5,
            raw_install_missing_both_rows: 0,
            raw_install_device_ids: 5,
            stage_install_device_ids: 5,
            overlap_install_device_ids: 5,
            raw_install_user_ids: 0,
            stage_install_user_ids: 0,
            overlap_install_user_ids: 0,
            raw_install_fingerprints: 5,
            stage_install_fingerprints: 5,
            overlap_install_fingerprints: 5,
            raw_session_rows: 0,
            raw_session_missing_session_rows: 0,
            raw_session_missing_device_rows: 0,
            raw_session_missing_user_rows: 0,
            raw_session_missing_both_rows: 0,
            raw_session_ids: 0,
            stage_session_ids: null,
            overlap_session_ids: null,
            raw_session_device_ids: 0,
            stage_session_device_ids: null,
            overlap_session_device_ids: null,
            raw_session_user_ids: 0,
            stage_session_user_ids: null,
            overlap_session_user_ids: null,
            raw_session_fingerprints: 0,
            stage_session_fingerprints: null,
            overlap_session_fingerprints: null,
          },
        ];
      }

      return [{ dimension_value: "organic", raw_rows: 5, stage_rows: 5, mart_rows: 0 }];
    });

    const data = await getDataQualityDashboardData([bundle], {
      from: "2026-04-18",
      to: "2026-04-18",
      platform: "all",
      groupBy: "campaign",
    });

    expect(data.projectSummaries[0]?.martInstallRows).toBeNull();
    expect(data.dailyRows[0]?.martInstallRows).toBeNull();
    expect(data.installsBreakdownRows[0]?.martRows).toBeNull();
    expect(data.installsBreakdownDimension).toBe("source");
    expect(data.eventsBreakdownDimension).toBe("country");
    expect(data.identitySummaries[0]?.stageSessionIds).toBeNull();
    expect(data.identitySummaries[0]?.overlapSessionFingerprints).toBeNull();
    expect(data.resolvedContextCount).toBe(1);
    expect(data.failedProjectNames).toEqual([]);
  });

  it("keeps successful projects visible and surfaces a note when one project fails", async () => {
    const { getDataQualityDashboardData } = await import("@/lib/data/data-quality");
    const primaryBundle = makeBundle();
    const failedBundle: AnalyticsProjectBundle = {
      ...makeBundle(),
      project: {
        ...makeBundle().project,
        id: "project-hidden-objects",
        slug: "hidden-objects",
        displayName: "Hidden Objects",
      },
    };
    const primaryContext = makeContext(primaryBundle);
    const failedContext = makeContext(failedBundle);

    loadBigQueryContextsMock.mockResolvedValue(
      new Map([
        [primaryBundle.project.id, primaryContext],
        [failedBundle.project.id, failedContext],
      ])
    );
    executeBigQueryMock.mockImplementation(async (context: ProjectQueryContext, sql: string) => {
      const prefix = tablePrefix(context.bundle.project.slug);

      if (
        context.bundle.project.id === failedBundle.project.id &&
        sql.includes("pipeline_installs AS")
      ) {
        throw new Error("simulated reconciliation failure");
      }

      if (sql.includes("INFORMATION_SCHEMA.TABLES")) {
        return [
          { dataset_name: "raw", table_name: `${prefix}_appmetrica_installs` },
          { dataset_name: "raw", table_name: `${prefix}_appmetrica_events` },
          { dataset_name: "raw", table_name: `${prefix}_appmetrica_sessions` },
          { dataset_name: "stg", table_name: `${prefix}_appmetrica__installs` },
          { dataset_name: "stg", table_name: `${prefix}_appmetrica__events` },
          { dataset_name: "stg", table_name: `${prefix}_appmetrica__sessions` },
          { dataset_name: "mart", table_name: `${prefix}_installs_funnel` },
        ];
      }

      if (sql.includes("pipeline_installs AS")) {
        return [
          {
            date: "2026-04-18",
            pipeline_install_rows: 10,
            raw_install_rows: 10,
            stg_install_rows: 10,
            mart_install_rows: 9,
            pipeline_event_rows: 15,
            raw_event_rows: 15,
            stg_event_rows: 15,
          },
        ];
      }

      if (sql.includes("raw_install_identity_base")) {
        return [
          {
            raw_install_rows: 10,
            raw_install_missing_device_rows: 0,
            raw_install_missing_user_rows: 2,
            raw_install_missing_both_rows: 0,
            raw_install_device_ids: 10,
            stage_install_device_ids: 10,
            overlap_install_device_ids: 10,
            raw_install_user_ids: 8,
            stage_install_user_ids: 8,
            overlap_install_user_ids: 8,
            raw_install_fingerprints: 10,
            stage_install_fingerprints: 10,
            overlap_install_fingerprints: 10,
            raw_session_rows: 11,
            raw_session_missing_session_rows: 0,
            raw_session_missing_device_rows: 0,
            raw_session_missing_user_rows: 3,
            raw_session_missing_both_rows: 0,
            raw_session_ids: 11,
            stage_session_ids: 11,
            overlap_session_ids: 11,
            raw_session_device_ids: 10,
            stage_session_device_ids: 10,
            overlap_session_device_ids: 10,
            raw_session_user_ids: 8,
            stage_session_user_ids: 8,
            overlap_session_user_ids: 8,
            raw_session_fingerprints: 11,
            stage_session_fingerprints: 11,
            overlap_session_fingerprints: 11,
          },
        ];
      }

      return [{ dimension_value: "organic", raw_rows: 10, stage_rows: 10, mart_rows: 9 }];
    });

    const data = await getDataQualityDashboardData([primaryBundle, failedBundle], {
      from: "2026-04-18",
      to: "2026-04-18",
      platform: "all",
      groupBy: "source",
    });

    expect(data.projectSummaries).toHaveLength(1);
    expect(data.projectSummaries[0]?.projectName).toBe("Word Catcher");
    expect(data.resolvedContextCount).toBe(2);
    expect(data.failedProjectNames).toEqual(["Hidden Objects"]);
    expect(
      data.notes.some((note) =>
        note.includes("Some projects were omitted") && note.includes("Hidden Objects")
      )
    ).toBe(true);
  });
});
