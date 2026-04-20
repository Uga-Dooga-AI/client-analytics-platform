import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectQueryContext } from "@/lib/live-warehouse";
import type { AnalyticsProjectBundle } from "@/lib/platform/store";

const getAccessTokenMock = vi.fn();
const loadBigQueryContextsMock = vi.fn();
const listAnalyticsProjectsMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/live-warehouse", () => ({
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
}) {
  const now = new Date("2026-04-20T10:00:00.000Z");

  return {
    project: {
      id: args.id,
      slug: args.slug,
      displayName: args.name,
      description: "",
      ownerTeam: "Client Services",
      status: "ready",
      gcpProjectId: args.warehouseProjectId,
      gcsBucket: "bucket",
      rawDataset: "raw",
      stgDataset: "stg",
      martDataset: "mart",
      boundsPath: `gs://bucket/bounds/${args.slug}/`,
      defaultGranularityDays: 7,
      refreshIntervalHours: 6,
      forecastIntervalHours: 12,
      boundsIntervalHours: 0,
      lookbackDays: 30,
      initialBackfillDays: 365,
      forecastHorizonDays: 730,
      settings: {
        autoProvisionInfrastructure: true,
        provisioningRegion: "europe-west4",
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
  } satisfies AnalyticsProjectBundle;
}

function makeContext(bundle: AnalyticsProjectBundle): ProjectQueryContext {
  return {
    bundle,
    serviceAccount: {
      client_email: `svc@${bundle.project.gcpProjectId}.iam.gserviceaccount.com`,
      private_key: "test-key",
    },
    warehouseProjectId: bundle.project.gcpProjectId,
    location: "US",
    rawEventsTable: `${bundle.project.slug.replace(/-/g, "_")}_appmetrica_events`,
    rawInstallsTable: `${bundle.project.slug.replace(/-/g, "_")}_appmetrica_installs`,
    rawSessionsTable: `${bundle.project.slug.replace(/-/g, "_")}_appmetrica_sessions`,
  };
}

function makeBigQueryResponse(rows: Array<Record<string, string | number>>, totals?: {
  billedBytes?: string;
  processedBytes?: string;
}) {
  return {
    ok: true,
    json: async () => ({
      jobComplete: true,
      totalBytesBilled: totals?.billedBytes ?? "1024",
      totalBytesProcessed: totals?.processedBytes ?? "2048",
      schema: {
        fields: [
          { name: "layer", type: "STRING" },
          { name: "dataset_name", type: "STRING" },
          { name: "table_name", type: "STRING" },
          { name: "row_count", type: "INT64" },
          { name: "logical_bytes", type: "INT64" },
        ],
      },
      rows: rows.map((row) => ({
        f: [
          { v: String(row.layer) },
          { v: String(row.dataset_name) },
          { v: String(row.table_name) },
          { v: String(row.row_count) },
          { v: String(row.logical_bytes) },
        ],
      })),
    }),
  };
}

describe("getStorageFootprintSnapshot", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    getAccessTokenMock.mockResolvedValue("test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ANALYTICS_EST_BIGQUERY_USD_PER_TIB;
  });

  it("aggregates metadata footprint by project and layer using partition metadata only", async () => {
    process.env.ANALYTICS_EST_BIGQUERY_USD_PER_TIB = "5";

    const alpha = makeBundle({
      id: "project-alpha",
      slug: "hidden-objects-1",
      name: "Hidden Object 1",
      warehouseProjectId: "warehouse-a",
    });
    const beta = makeBundle({
      id: "project-beta",
      slug: "words-in-word",
      name: "Words in Word",
      warehouseProjectId: "warehouse-a",
    });

    listAnalyticsProjectsMock.mockResolvedValue([alpha, beta]);
    loadBigQueryContextsMock.mockResolvedValue(
      new Map([
        [alpha.project.id, makeContext(alpha)],
        [beta.project.id, makeContext(beta)],
      ])
    );

    fetchMock.mockResolvedValueOnce(
      makeBigQueryResponse(
        [
          {
            layer: "raw",
            dataset_name: "raw",
            table_name: "hidden_objects_1_appmetrica_installs",
            row_count: 100,
            logical_bytes: 4096,
          },
          {
            layer: "stg",
            dataset_name: "stg",
            table_name: "hidden_objects_1_installs",
            row_count: 90,
            logical_bytes: 2048,
          },
          {
            layer: "raw",
            dataset_name: "raw",
            table_name: "words_in_word_appmetrica_events",
            row_count: 300,
            logical_bytes: 8192,
          },
        ],
        {
          billedBytes: "4096",
          processedBytes: "16384",
        }
      )
    );

    const { getStorageFootprintSnapshot } = await import("@/lib/admin/storage-footprint");
    const snapshot = await getStorageFootprintSnapshot({
      months: 7,
      now: new Date("2026-04-20T12:00:00.000Z"),
    });

    expect(getAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(snapshot.window).toEqual({
      from: "2025-09-20",
      to: "2026-04-20",
      months: 7,
    });
    expect(snapshot.query.billedBytes).toBe(4096);
    expect(snapshot.query.processedBytes).toBe(16384);
    expect(snapshot.totals.rowCount).toBe(490);
    expect(snapshot.totals.logicalBytes).toBe(14336);
    expect(snapshot.layers).toEqual([
      { layer: "raw", rowCount: 400, logicalBytes: 12288 },
      { layer: "stg", rowCount: 90, logicalBytes: 2048 },
    ]);
    expect(snapshot.projects).toEqual([
      {
        projectId: beta.project.id,
        projectSlug: beta.project.slug,
        projectName: beta.project.displayName,
        rowCount: 300,
        logicalBytes: 8192,
      },
      {
        projectId: alpha.project.id,
        projectSlug: alpha.project.slug,
        projectName: alpha.project.displayName,
        rowCount: 190,
        logicalBytes: 6144,
      },
    ]);
    expect(snapshot.topTables[0]).toMatchObject({
      tableName: "words_in_word_appmetrica_events",
      projectName: "Words in Word",
      logicalBytes: 8192,
    });
    expect(snapshot.warnings).toContain(
      "The snapshot is metadata-only and windowed by partition date. Unpartitioned tables are intentionally excluded because they cannot be attributed to a 7-month window reliably."
    );
  });
});
