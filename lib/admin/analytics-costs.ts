import "server-only";

import {
  executeBigQuery,
  getAccessToken,
  loadBigQueryContexts,
  type ProjectQueryContext,
} from "@/lib/live-warehouse";
import { listAnalyticsProjects, type AnalyticsProjectBundle } from "@/lib/platform/store";

const DEFAULT_BIGQUERY_USD_PER_TIB = 5;
const DEFAULT_STORAGE_USD_PER_GIB_MONTH = 0.02;
const BILLING_EXPORT_TABLE = process.env.ANALYTICS_BILLING_EXPORT_TABLE?.trim() || "";

export type AnalyticsCostProjectRow = {
  projectId: string;
  projectSlug: string;
  projectName: string;
  status: "ready" | "partial" | "unavailable";
  latestSuccessfulIngestionAt: string | null;
  successfulSlicesToday: number;
  skippedSlicesToday: number;
  successfulSlices30d: number;
  skippedSlices30d: number;
  rowsLoadedToday: number;
  rowsLoaded30d: number;
  retainedStageBytes: number;
  stagedTransferBytesToday: number;
  stagedTransferBytes30d: number;
  bigQueryJobsToday: number;
  bigQueryJobs30d: number;
  queryJobsToday: number;
  queryJobs30d: number;
  loadJobsToday: number;
  loadJobs30d: number;
  bytesBilledToday: number;
  bytesBilled30d: number;
  bytesProcessedToday: number;
  bytesProcessed30d: number;
  slotMsToday: number;
  slotMs30d: number;
  estimatedBigQueryCostTodayUsd: number;
  estimatedBigQueryCost30dUsd: number;
  estimatedStorageCostTodayUsd: number;
  estimatedStorageCost30dUsd: number;
  estimatedTotalTodayUsd: number;
  estimatedTotal30dUsd: number;
  attributedActualFinalized30dUsd: number | null;
  error: string | null;
};

export type AnalyticsCostServiceRow = {
  serviceDescription: string;
  finalizedCost30dUsd: number;
  reportedCostTodayUsd: number;
};

export type AnalyticsCostSnapshot = {
  generatedAt: string;
  warehouseProjectId: string | null;
  billingExportConfigured: boolean;
  billingExportTable: string | null;
  billingExportLastUpdatedAt: string | null;
  estimationCoefficients: {
    bigQueryUsdPerTib: number;
    storageUsdPerGibMonth: number;
  };
  totals: {
    trackedProjects: number;
    readyProjects: number;
    estimatedBigQueryCostTodayUsd: number;
    estimatedBigQueryCost30dUsd: number;
    estimatedStorageCostTodayUsd: number;
    estimatedStorageCost30dUsd: number;
    estimatedTotalTodayUsd: number;
    estimatedTotal30dUsd: number;
    finalizedActual30dUsd: number | null;
    reportedActualTodayUsd: number | null;
    retainedStageBytes: number;
    stagedTransferBytesToday: number;
    stagedTransferBytes30d: number;
    rowsLoadedToday: number;
    rowsLoaded30d: number;
  };
  actualByService: AnalyticsCostServiceRow[];
  projects: AnalyticsCostProjectRow[];
  warnings: string[];
};

type PipelineStatsRow = {
  latest_successful_ingestion_at: string | null;
  successful_slices_today: number | null;
  skipped_slices_today: number | null;
  successful_slices_30d: number | null;
  skipped_slices_30d: number | null;
  rows_loaded_today: number | null;
  rows_loaded_30d: number | null;
};

type JobStatsRow = {
  bigquery_jobs_today: number | null;
  bigquery_jobs_30d: number | null;
  query_jobs_today: number | null;
  query_jobs_30d: number | null;
  load_jobs_today: number | null;
  load_jobs_30d: number | null;
  bytes_billed_today: number | null;
  bytes_billed_30d: number | null;
  bytes_processed_today: number | null;
  bytes_processed_30d: number | null;
  slot_ms_today: number | null;
  slot_ms_30d: number | null;
};

type BillingExportRow = {
  service_description: string | null;
  finalized_cost_30d_usd: number | null;
  reported_cost_today_usd: number | null;
  last_export_time: string | null;
};

type StorageListResponse = {
  nextPageToken?: string;
  items?: Array<{
    name?: string;
    size?: string;
    updated?: string;
  }>;
};

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function thirtyDaysAgoUtc() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

function estimateBigQueryCostUsd(bytesBilled: number, usdPerTib: number) {
  return (bytesBilled / 1024 ** 4) * usdPerTib;
}

function estimateDailyStorageCostUsd(retainedBytes: number, usdPerGibMonth: number) {
  return (retainedBytes / 1024 ** 3) * (usdPerGibMonth / 30);
}

async function queryPipelineStats(context: ProjectQueryContext): Promise<PipelineStatsRow> {
  const gcsUriPrefix = `gs://${context.bundle.project.gcsBucket}/raw/${context.bundle.project.slug}/appmetrica/%`;
  const rows = await executeBigQuery<PipelineStatsRow>(
    context,
    `
      SELECT
        CAST(MAX(IF(status IN ('success', 'skipped_existing'), finished_at, NULL)) AS STRING) AS latest_successful_ingestion_at,
        COUNTIF(status = 'success' AND partition_date = CURRENT_DATE()) AS successful_slices_today,
        COUNTIF(status = 'skipped_existing' AND partition_date = CURRENT_DATE()) AS skipped_slices_today,
        COUNTIF(
          status = 'success'
          AND partition_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 29 DAY) AND CURRENT_DATE()
        ) AS successful_slices_30d,
        COUNTIF(
          status = 'skipped_existing'
          AND partition_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 29 DAY) AND CURRENT_DATE()
        ) AS skipped_slices_30d,
        SUM(IF(status = 'success' AND partition_date = CURRENT_DATE(), COALESCE(rows_loaded, 0), 0)) AS rows_loaded_today,
        SUM(
          IF(
            status = 'success'
            AND partition_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 29 DAY) AND CURRENT_DATE(),
            COALESCE(rows_loaded, 0),
            0
          )
        ) AS rows_loaded_30d
      FROM \`${context.warehouseProjectId}.meta.pipeline_runs\`
      WHERE gcs_uri LIKE @gcs_uri_prefix
    `,
    [{ name: "gcs_uri_prefix", type: "STRING", value: gcsUriPrefix }]
  );

  return rows[0] ?? {
    latest_successful_ingestion_at: null,
    successful_slices_today: 0,
    skipped_slices_today: 0,
    successful_slices_30d: 0,
    skipped_slices_30d: 0,
    rows_loaded_today: 0,
    rows_loaded_30d: 0,
  };
}

async function queryJobStats(context: ProjectQueryContext): Promise<JobStatsRow> {
  const location = context.location.toLowerCase();
  const prefix = `${context.bundle.project.slug.replace(/-/g, "_")}_`;
  const queryPattern = `(?i)\\b${prefix}[a-z0-9_]*\\b`;

  const rows = await executeBigQuery<JobStatsRow>(
    context,
    `
      WITH matched_jobs AS (
        SELECT
          creation_time,
          job_type,
          total_bytes_billed,
          total_bytes_processed,
          total_slot_ms
        FROM \`${context.warehouseProjectId}.region-${location}.INFORMATION_SCHEMA.JOBS_BY_PROJECT\`
        WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
          AND state = 'DONE'
          AND error_result IS NULL
          AND job_type IN ('QUERY', 'LOAD')
          AND (
            COALESCE(destination_table.table_id, '') LIKE CONCAT(@table_prefix, '%')
            OR REGEXP_CONTAINS(COALESCE(query, ''), @query_pattern)
          )
      )
      SELECT
        COUNTIF(creation_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY)) AS bigquery_jobs_today,
        COUNT(*) AS bigquery_jobs_30d,
        COUNTIF(job_type = 'QUERY' AND creation_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY)) AS query_jobs_today,
        COUNTIF(job_type = 'QUERY') AS query_jobs_30d,
        COUNTIF(job_type = 'LOAD' AND creation_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY)) AS load_jobs_today,
        COUNTIF(job_type = 'LOAD') AS load_jobs_30d,
        SUM(IF(creation_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), COALESCE(total_bytes_billed, 0), 0)) AS bytes_billed_today,
        SUM(COALESCE(total_bytes_billed, 0)) AS bytes_billed_30d,
        SUM(IF(creation_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), COALESCE(total_bytes_processed, 0), 0)) AS bytes_processed_today,
        SUM(COALESCE(total_bytes_processed, 0)) AS bytes_processed_30d,
        SUM(IF(creation_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), COALESCE(total_slot_ms, 0), 0)) AS slot_ms_today,
        SUM(COALESCE(total_slot_ms, 0)) AS slot_ms_30d
      FROM matched_jobs
    `,
    [
      { name: "table_prefix", type: "STRING", value: prefix },
      { name: "query_pattern", type: "STRING", value: queryPattern },
    ]
  );

  return rows[0] ?? {
    bigquery_jobs_today: 0,
    bigquery_jobs_30d: 0,
    query_jobs_today: 0,
    query_jobs_30d: 0,
    load_jobs_today: 0,
    load_jobs_30d: 0,
    bytes_billed_today: 0,
    bytes_billed_30d: 0,
    bytes_processed_today: 0,
    bytes_processed_30d: 0,
    slot_ms_today: 0,
    slot_ms_30d: 0,
  };
}

async function queryStorageStats(context: ProjectQueryContext) {
  const token = await getAccessToken(context.serviceAccount);
  const prefix = `raw/${context.bundle.project.slug}/appmetrica/`;
  const todayStart = startOfTodayUtc();
  const thirtyDaysAgo = thirtyDaysAgoUtc();
  let nextPageToken: string | undefined;
  let retainedStageBytes = 0;
  let stagedTransferBytesToday = 0;
  let stagedTransferBytes30d = 0;

  do {
    const params = new URLSearchParams({
      prefix,
      fields: "items(name,size,updated),nextPageToken",
      maxResults: "1000",
    });
    if (nextPageToken) {
      params.set("pageToken", nextPageToken);
    }

    const response = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(context.bundle.project.gcsBucket)}/o?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-goog-user-project": context.warehouseProjectId,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(`GCS inventory query failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as StorageListResponse;
    for (const entry of payload.items ?? []) {
      const size = Number(entry.size ?? 0);
      retainedStageBytes += size;

      const updatedAt = entry.updated ? new Date(entry.updated) : null;
      if (updatedAt && updatedAt >= thirtyDaysAgo) {
        stagedTransferBytes30d += size;
      }
      if (updatedAt && updatedAt >= todayStart) {
        stagedTransferBytesToday += size;
      }
    }

    nextPageToken = payload.nextPageToken;
  } while (nextPageToken);

  return {
    retainedStageBytes,
    stagedTransferBytesToday,
    stagedTransferBytes30d,
  };
}

async function queryBillingExportSummary(
  context: ProjectQueryContext
): Promise<{
  actualByService: AnalyticsCostServiceRow[];
  finalizedActual30dUsd: number | null;
  reportedActualTodayUsd: number | null;
  lastUpdatedAt: string | null;
}> {
  if (!BILLING_EXPORT_TABLE) {
    return {
      actualByService: [],
      finalizedActual30dUsd: null,
      reportedActualTodayUsd: null,
      lastUpdatedAt: null,
    };
  }

  const rows = await executeBigQuery<BillingExportRow>(
    context,
    `
      SELECT
        service.description AS service_description,
        ROUND(
          SUM(
            IF(
              DATE(usage_start_time) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY),
              cost,
              0
            )
          ),
          6
        ) AS finalized_cost_30d_usd,
        ROUND(
          SUM(
            IF(DATE(usage_start_time) = CURRENT_DATE(), cost, 0)
          ),
          6
        ) AS reported_cost_today_usd,
        CAST(MAX(export_time) AS STRING) AS last_export_time
      FROM \`${BILLING_EXPORT_TABLE}\`
      WHERE project.id = @warehouse_project_id
        AND DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        AND service.description IN ('BigQuery', 'Cloud Storage', 'Cloud Run')
      GROUP BY 1
      ORDER BY finalized_cost_30d_usd DESC
    `,
    [{ name: "warehouse_project_id", type: "STRING", value: context.warehouseProjectId }]
  );

  const actualByService = rows.map((row) => ({
    serviceDescription: row.service_description ?? "Unknown",
    finalizedCost30dUsd: toNumber(row.finalized_cost_30d_usd),
    reportedCostTodayUsd: toNumber(row.reported_cost_today_usd),
  }));

  const finalizedActual30dUsd = actualByService.reduce(
    (sum, row) => sum + row.finalizedCost30dUsd,
    0
  );
  const reportedActualTodayUsd = actualByService.reduce(
    (sum, row) => sum + row.reportedCostTodayUsd,
    0
  );

  return {
    actualByService,
    finalizedActual30dUsd,
    reportedActualTodayUsd,
    lastUpdatedAt:
      rows.find((row) => row.last_export_time)?.last_export_time ?? null,
  };
}

async function buildProjectRow(
  bundle: AnalyticsProjectBundle,
  context: ProjectQueryContext | undefined,
  coefficients: { bigQueryUsdPerTib: number; storageUsdPerGibMonth: number }
): Promise<AnalyticsCostProjectRow> {
  if (!context) {
    return {
      projectId: bundle.project.id,
      projectSlug: bundle.project.slug,
      projectName: bundle.project.displayName,
      status: "unavailable",
      latestSuccessfulIngestionAt: null,
      successfulSlicesToday: 0,
      skippedSlicesToday: 0,
      successfulSlices30d: 0,
      skippedSlices30d: 0,
      rowsLoadedToday: 0,
      rowsLoaded30d: 0,
      retainedStageBytes: 0,
      stagedTransferBytesToday: 0,
      stagedTransferBytes30d: 0,
      bigQueryJobsToday: 0,
      bigQueryJobs30d: 0,
      queryJobsToday: 0,
      queryJobs30d: 0,
      loadJobsToday: 0,
      loadJobs30d: 0,
      bytesBilledToday: 0,
      bytesBilled30d: 0,
      bytesProcessedToday: 0,
      bytesProcessed30d: 0,
      slotMsToday: 0,
      slotMs30d: 0,
      estimatedBigQueryCostTodayUsd: 0,
      estimatedBigQueryCost30dUsd: 0,
      estimatedStorageCostTodayUsd: 0,
      estimatedStorageCost30dUsd: 0,
      estimatedTotalTodayUsd: 0,
      estimatedTotal30dUsd: 0,
      attributedActualFinalized30dUsd: null,
      error: "BigQuery credentials are missing or incomplete for this project.",
    };
  }

  try {
    const [pipeline, jobs, storage] = await Promise.all([
      queryPipelineStats(context),
      queryJobStats(context),
      queryStorageStats(context),
    ]);

    const estimatedBigQueryCostTodayUsd = estimateBigQueryCostUsd(
      toNumber(jobs.bytes_billed_today),
      coefficients.bigQueryUsdPerTib
    );
    const estimatedBigQueryCost30dUsd = estimateBigQueryCostUsd(
      toNumber(jobs.bytes_billed_30d),
      coefficients.bigQueryUsdPerTib
    );
    const estimatedStorageCostTodayUsd = estimateDailyStorageCostUsd(
      storage.retainedStageBytes,
      coefficients.storageUsdPerGibMonth
    );
    const estimatedStorageCost30dUsd =
      (storage.retainedStageBytes / 1024 ** 3) * coefficients.storageUsdPerGibMonth;

    return {
      projectId: bundle.project.id,
      projectSlug: bundle.project.slug,
      projectName: bundle.project.displayName,
      status: "ready",
      latestSuccessfulIngestionAt: pipeline.latest_successful_ingestion_at,
      successfulSlicesToday: toNumber(pipeline.successful_slices_today),
      skippedSlicesToday: toNumber(pipeline.skipped_slices_today),
      successfulSlices30d: toNumber(pipeline.successful_slices_30d),
      skippedSlices30d: toNumber(pipeline.skipped_slices_30d),
      rowsLoadedToday: toNumber(pipeline.rows_loaded_today),
      rowsLoaded30d: toNumber(pipeline.rows_loaded_30d),
      retainedStageBytes: storage.retainedStageBytes,
      stagedTransferBytesToday: storage.stagedTransferBytesToday,
      stagedTransferBytes30d: storage.stagedTransferBytes30d,
      bigQueryJobsToday: toNumber(jobs.bigquery_jobs_today),
      bigQueryJobs30d: toNumber(jobs.bigquery_jobs_30d),
      queryJobsToday: toNumber(jobs.query_jobs_today),
      queryJobs30d: toNumber(jobs.query_jobs_30d),
      loadJobsToday: toNumber(jobs.load_jobs_today),
      loadJobs30d: toNumber(jobs.load_jobs_30d),
      bytesBilledToday: toNumber(jobs.bytes_billed_today),
      bytesBilled30d: toNumber(jobs.bytes_billed_30d),
      bytesProcessedToday: toNumber(jobs.bytes_processed_today),
      bytesProcessed30d: toNumber(jobs.bytes_processed_30d),
      slotMsToday: toNumber(jobs.slot_ms_today),
      slotMs30d: toNumber(jobs.slot_ms_30d),
      estimatedBigQueryCostTodayUsd,
      estimatedBigQueryCost30dUsd,
      estimatedStorageCostTodayUsd,
      estimatedStorageCost30dUsd,
      estimatedTotalTodayUsd: estimatedBigQueryCostTodayUsd + estimatedStorageCostTodayUsd,
      estimatedTotal30dUsd: estimatedBigQueryCost30dUsd + estimatedStorageCost30dUsd,
      attributedActualFinalized30dUsd: null,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown analytics ops error.";
    return {
      projectId: bundle.project.id,
      projectSlug: bundle.project.slug,
      projectName: bundle.project.displayName,
      status: "partial",
      latestSuccessfulIngestionAt: null,
      successfulSlicesToday: 0,
      skippedSlicesToday: 0,
      successfulSlices30d: 0,
      skippedSlices30d: 0,
      rowsLoadedToday: 0,
      rowsLoaded30d: 0,
      retainedStageBytes: 0,
      stagedTransferBytesToday: 0,
      stagedTransferBytes30d: 0,
      bigQueryJobsToday: 0,
      bigQueryJobs30d: 0,
      queryJobsToday: 0,
      queryJobs30d: 0,
      loadJobsToday: 0,
      loadJobs30d: 0,
      bytesBilledToday: 0,
      bytesBilled30d: 0,
      bytesProcessedToday: 0,
      bytesProcessed30d: 0,
      slotMsToday: 0,
      slotMs30d: 0,
      estimatedBigQueryCostTodayUsd: 0,
      estimatedBigQueryCost30dUsd: 0,
      estimatedStorageCostTodayUsd: 0,
      estimatedStorageCost30dUsd: 0,
      estimatedTotalTodayUsd: 0,
      estimatedTotal30dUsd: 0,
      attributedActualFinalized30dUsd: null,
      error: message,
    };
  }
}

export async function getAnalyticsCostSnapshot(): Promise<AnalyticsCostSnapshot> {
  const bundles = await listAnalyticsProjects();
  const contexts = await loadBigQueryContexts(bundles);
  const coefficients = {
    bigQueryUsdPerTib: envNumber(
      "ANALYTICS_EST_BIGQUERY_USD_PER_TIB",
      DEFAULT_BIGQUERY_USD_PER_TIB
    ),
    storageUsdPerGibMonth: envNumber(
      "ANALYTICS_EST_STORAGE_USD_PER_GIB_MONTH",
      DEFAULT_STORAGE_USD_PER_GIB_MONTH
    ),
  };

  const projects = await Promise.all(
    bundles.map((bundle) => buildProjectRow(bundle, contexts.get(bundle.project.id), coefficients))
  );

  const primaryContext = Array.from(contexts.values())[0];
  const billingSummary = primaryContext
    ? await queryBillingExportSummary(primaryContext).catch(() => ({
        actualByService: [],
        finalizedActual30dUsd: null,
        reportedActualTodayUsd: null,
        lastUpdatedAt: null,
      }))
    : {
        actualByService: [],
        finalizedActual30dUsd: null,
        reportedActualTodayUsd: null,
        lastUpdatedAt: null,
      };

  const provisionalTotal30d = projects.reduce(
    (sum, row) => sum + row.estimatedTotal30dUsd,
    0
  );
  const finalizedActual30dUsd = billingSummary.finalizedActual30dUsd;
  const projectsWithActuals = projects.map((row) => ({
    ...row,
    attributedActualFinalized30dUsd:
      finalizedActual30dUsd != null && provisionalTotal30d > 0
        ? (row.estimatedTotal30dUsd / provisionalTotal30d) * finalizedActual30dUsd
        : null,
  }));

  const warnings: string[] = [];
  if (!BILLING_EXPORT_TABLE) {
    warnings.push(
      "Actual finalized cost is unavailable until ANALYTICS_BILLING_EXPORT_TABLE points to a Cloud Billing export table."
    );
  }
  if (projectsWithActuals.some((row) => row.status !== "ready")) {
    warnings.push(
      "Some projects could not be measured completely because their BigQuery or storage credentials are incomplete or the warehouse query failed."
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    warehouseProjectId: primaryContext?.warehouseProjectId ?? null,
    billingExportConfigured: Boolean(BILLING_EXPORT_TABLE),
    billingExportTable: BILLING_EXPORT_TABLE || null,
    billingExportLastUpdatedAt: billingSummary.lastUpdatedAt,
    estimationCoefficients: coefficients,
    totals: {
      trackedProjects: projectsWithActuals.length,
      readyProjects: projectsWithActuals.filter((row) => row.status === "ready").length,
      estimatedBigQueryCostTodayUsd: projectsWithActuals.reduce(
        (sum, row) => sum + row.estimatedBigQueryCostTodayUsd,
        0
      ),
      estimatedBigQueryCost30dUsd: projectsWithActuals.reduce(
        (sum, row) => sum + row.estimatedBigQueryCost30dUsd,
        0
      ),
      estimatedStorageCostTodayUsd: projectsWithActuals.reduce(
        (sum, row) => sum + row.estimatedStorageCostTodayUsd,
        0
      ),
      estimatedStorageCost30dUsd: projectsWithActuals.reduce(
        (sum, row) => sum + row.estimatedStorageCost30dUsd,
        0
      ),
      estimatedTotalTodayUsd: projectsWithActuals.reduce(
        (sum, row) => sum + row.estimatedTotalTodayUsd,
        0
      ),
      estimatedTotal30dUsd: projectsWithActuals.reduce(
        (sum, row) => sum + row.estimatedTotal30dUsd,
        0
      ),
      finalizedActual30dUsd,
      reportedActualTodayUsd: billingSummary.reportedActualTodayUsd,
      retainedStageBytes: projectsWithActuals.reduce(
        (sum, row) => sum + row.retainedStageBytes,
        0
      ),
      stagedTransferBytesToday: projectsWithActuals.reduce(
        (sum, row) => sum + row.stagedTransferBytesToday,
        0
      ),
      stagedTransferBytes30d: projectsWithActuals.reduce(
        (sum, row) => sum + row.stagedTransferBytes30d,
        0
      ),
      rowsLoadedToday: projectsWithActuals.reduce(
        (sum, row) => sum + row.rowsLoadedToday,
        0
      ),
      rowsLoaded30d: projectsWithActuals.reduce(
        (sum, row) => sum + row.rowsLoaded30d,
        0
      ),
    },
    actualByService: billingSummary.actualByService,
    projects: projectsWithActuals.sort(
      (left, right) => right.estimatedTotal30dUsd - left.estimatedTotal30dUsd
    ),
    warnings,
  };
}
