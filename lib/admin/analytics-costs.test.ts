import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectQueryContext } from "@/lib/live-warehouse";
import type { AnalyticsProjectBundle } from "@/lib/platform/store";

const executeBigQueryMock = vi.fn();
const getAccessTokenMock = vi.fn();
const loadBigQueryContextsMock = vi.fn();
const listAnalyticsProjectsMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/live-warehouse", () => ({
  executeBigQuery: executeBigQueryMock,
  getAccessToken: getAccessTokenMock,
  loadBigQueryContexts: loadBigQueryContextsMock,
}));

vi.mock("@/lib/platform/store", () => ({
  listAnalyticsProjects: listAnalyticsProjectsMock,
}));

function makeBundle(args: {
  id: string;
  slug: string;
  name: string;
  warehouseProjectId: string;
  bucket: string;
  boundsBucket?: string;
  boundsPrefix?: string;
}): AnalyticsProjectBundle {
  const now = new Date("2026-04-18T10:00:00.000Z");
  const boundsBucket = args.boundsBucket ?? args.bucket;
  const boundsPrefix = args.boundsPrefix ?? `bounds/${args.slug}/`;

  return {
    project: {
      id: args.id,
      slug: args.slug,
      displayName: args.name,
      description: "",
      ownerTeam: "Client Services",
      status: "ready",
      gcpProjectId: args.warehouseProjectId,
      gcsBucket: args.bucket,
      rawDataset: "raw",
      stgDataset: "stg",
      martDataset: "mart",
      boundsPath: `gs://${boundsBucket}/${boundsPrefix}`,
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
        id: `${args.id}-bq`,
        projectId: args.id,
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
          sourceProjectId: "source-project",
          sourceDataset: "analytics_export",
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `${args.id}-bounds`,
        projectId: args.id,
        sourceType: "bounds_artifacts",
        label: "Bounds artifacts",
        status: "ready",
        deliveryMode: "GCS manifest",
        frequencyHours: 24,
        lastSyncAt: now,
        nextSyncAt: now,
        secretPresent: false,
        secretHint: null,
        config: {
          bucket: boundsBucket,
          prefix: boundsPrefix,
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
      client_email: `svc@${bundle.project.gcpProjectId}.iam.gserviceaccount.com`,
      private_key: "test-key",
    },
    source: {
      sourceProjectId: "source-project",
      sourceDataset: "analytics_export",
    },
    warehouseProjectId: bundle.project.gcpProjectId,
    location: "US",
    rawEventsTable: `${bundle.project.slug.replace(/-/g, "_")}_appmetrica_events`,
    rawInstallsTable: `${bundle.project.slug.replace(/-/g, "_")}_appmetrica_installs`,
    rawSessionsTable: `${bundle.project.slug.replace(/-/g, "_")}_appmetrica_sessions`,
  };
}

describe("getAnalyticsCostSnapshot", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    getAccessTokenMock.mockResolvedValue("test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ANALYTICS_BILLING_EXPORT_TABLE;
  });

  it("attributes finalized actuals within each warehouse group and aggregates service totals", async () => {
    process.env.ANALYTICS_BILLING_EXPORT_TABLE = "billing.dataset.export";

    const alpha = makeBundle({
      id: "project-alpha",
      slug: "alpha",
      name: "Alpha",
      warehouseProjectId: "warehouse-a",
      bucket: "bucket-a",
    });
    const beta = makeBundle({
      id: "project-beta",
      slug: "beta",
      name: "Beta",
      warehouseProjectId: "warehouse-b",
      bucket: "bucket-b",
    });

    listAnalyticsProjectsMock.mockResolvedValue([alpha, beta]);
    loadBigQueryContextsMock.mockResolvedValue(
      new Map([
        [alpha.project.id, makeContext(alpha)],
        [beta.project.id, makeContext(beta)],
      ])
    );

    const oneTiB = 1024 ** 4;

    executeBigQueryMock.mockImplementation(async (context: ProjectQueryContext, sql: string) => {
      if (sql.includes(".meta.pipeline_runs")) {
        return [
          {
            latest_successful_ingestion_at: "2026-04-18T09:00:00.000Z",
            successful_slices_today: 1,
            skipped_slices_today: 0,
            successful_slices_30d: 10,
            skipped_slices_30d: 2,
            rows_loaded_today: 100,
            rows_loaded_30d: 1000,
          },
        ];
      }

      if (sql.includes("INFORMATION_SCHEMA.JOBS_BY_PROJECT")) {
        if (context.warehouseProjectId === "warehouse-a") {
          return [
            {
              bigquery_jobs_today: 1,
              bigquery_jobs_30d: 10,
              query_jobs_today: 1,
              query_jobs_30d: 8,
              load_jobs_today: 0,
              load_jobs_30d: 2,
              bytes_billed_today: 0,
              bytes_billed_30d: oneTiB,
              bytes_processed_today: 0,
              bytes_processed_30d: oneTiB,
              slot_ms_today: 0,
              slot_ms_30d: 1000,
            },
          ];
        }

        return [
          {
            bigquery_jobs_today: 2,
            bigquery_jobs_30d: 20,
            query_jobs_today: 2,
            query_jobs_30d: 18,
            load_jobs_today: 0,
            load_jobs_30d: 2,
            bytes_billed_today: 0,
            bytes_billed_30d: oneTiB * 2,
            bytes_processed_today: 0,
            bytes_processed_30d: oneTiB * 2,
            slot_ms_today: 0,
            slot_ms_30d: 2000,
          },
        ];
      }

      if (sql.includes("FROM `billing.dataset.export`")) {
        if (context.warehouseProjectId === "warehouse-a") {
          return [
            {
              service_description: "BigQuery",
              finalized_cost_30d_usd: 20,
              reported_cost_today_usd: 2,
              last_export_time: "2026-04-18T10:00:00.000Z",
            },
            {
              service_description: "Cloud Storage",
              finalized_cost_30d_usd: 10,
              reported_cost_today_usd: 1,
              last_export_time: "2026-04-18T10:00:00.000Z",
            },
          ];
        }

        return [
          {
            service_description: "BigQuery",
            finalized_cost_30d_usd: 30,
            reported_cost_today_usd: 3,
            last_export_time: "2026-04-18T11:00:00.000Z",
          },
          {
            service_description: "Cloud Run",
            finalized_cost_30d_usd: 40,
            reported_cost_today_usd: 4,
            last_export_time: "2026-04-18T11:00:00.000Z",
          },
        ];
      }

      throw new Error(`Unexpected query: ${sql}`);
    });

    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = new URL(String(input));
      const bucket = url.pathname.split("/")[4];
      const prefix = url.searchParams.get("prefix");

      if (bucket === "bucket-a" && prefix === "raw/alpha/appmetrica/") {
        return {
          ok: true,
          json: async () => ({
            items: [{ name: "raw/alpha/appmetrica/events-1.ndjson", size: "100", updated: "2026-04-18T08:00:00.000Z" }],
          }),
        } as Response;
      }

      if (bucket === "bucket-a" && prefix === "bounds/alpha/") {
        return {
          ok: true,
          json: async () => ({
            items: [{ name: "bounds/alpha/manifest.json", size: "50", updated: "2026-04-18T08:00:00.000Z" }],
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ items: [] }),
      } as Response;
    });

    const { getAnalyticsCostSnapshot } = await import("./analytics-costs");
    const snapshot = await getAnalyticsCostSnapshot();

    expect(snapshot.warehouseProjectIds).toEqual(["warehouse-a", "warehouse-b"]);
    expect(snapshot.totals.finalizedActual30dUsd).toBe(100);
    expect(snapshot.totals.reportedActualTodayUsd).toBe(10);
    expect(snapshot.billingExportLastUpdatedAt).toBe("2026-04-18T11:00:00.000Z");

    const alphaRow = snapshot.projects.find((project) => project.projectId === "project-alpha");
    const betaRow = snapshot.projects.find((project) => project.projectId === "project-beta");

    expect(alphaRow?.attributedActualFinalized30dUsd).toBeCloseTo(30, 6);
    expect(betaRow?.attributedActualFinalized30dUsd).toBeCloseTo(70, 6);
    expect(alphaRow?.retainedStageBytes).toBe(150);

    expect(snapshot.actualByService).toEqual([
      { serviceDescription: "BigQuery", finalizedCost30dUsd: 50, reportedCostTodayUsd: 5 },
      { serviceDescription: "Cloud Run", finalizedCost30dUsd: 40, reportedCostTodayUsd: 4 },
      { serviceDescription: "Cloud Storage", finalizedCost30dUsd: 10, reportedCostTodayUsd: 1 },
    ]);
  });

  it("preserves successful telemetry when storage inventory fails", async () => {
    process.env.ANALYTICS_BILLING_EXPORT_TABLE = "";

    const alpha = makeBundle({
      id: "project-alpha",
      slug: "alpha",
      name: "Alpha",
      warehouseProjectId: "warehouse-a",
      bucket: "bucket-a",
    });

    listAnalyticsProjectsMock.mockResolvedValue([alpha]);
    loadBigQueryContextsMock.mockResolvedValue(new Map([[alpha.project.id, makeContext(alpha)]]));

    executeBigQueryMock.mockImplementation(async (_context: ProjectQueryContext, sql: string) => {
      if (sql.includes(".meta.pipeline_runs")) {
        return [
          {
            latest_successful_ingestion_at: "2026-04-18T09:00:00.000Z",
            successful_slices_today: 1,
            skipped_slices_today: 0,
            successful_slices_30d: 10,
            skipped_slices_30d: 2,
            rows_loaded_today: 100,
            rows_loaded_30d: 1000,
          },
        ];
      }

      if (sql.includes("INFORMATION_SCHEMA.JOBS_BY_PROJECT")) {
        return [
          {
            bigquery_jobs_today: 1,
            bigquery_jobs_30d: 10,
            query_jobs_today: 1,
            query_jobs_30d: 8,
            load_jobs_today: 0,
            load_jobs_30d: 2,
            bytes_billed_today: 0,
            bytes_billed_30d: 1024 ** 4,
            bytes_processed_today: 0,
            bytes_processed_30d: 1024 ** 4,
            slot_ms_today: 0,
            slot_ms_30d: 1000,
          },
        ];
      }

      throw new Error(`Unexpected query: ${sql}`);
    });

    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "forbidden",
    } as Response);

    const { getAnalyticsCostSnapshot } = await import("./analytics-costs");
    const snapshot = await getAnalyticsCostSnapshot();
    const alphaRow = snapshot.projects[0];

    expect(alphaRow.status).toBe("partial");
    expect(alphaRow.rowsLoaded30d).toBe(1000);
    expect(alphaRow.bytesBilled30d).toBe(1024 ** 4);
    expect(alphaRow.estimatedBigQueryCost30dUsd).toBeCloseTo(5, 6);
    expect(alphaRow.estimatedStorageCost30dUsd).toBe(0);
    expect(alphaRow.error).toContain("storage telemetry failed");
  });
});
