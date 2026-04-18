import "server-only";

import {
  executeBigQuery,
  loadBigQueryContexts,
  type ProjectQueryContext,
} from "@/lib/live-warehouse";
import type {
  DashboardGroupByKey,
  DashboardPlatformKey,
} from "@/lib/dashboard-filters";
import type { AnalyticsProjectBundle } from "@/lib/platform/store";

export type DataQualityFilters = {
  from: string;
  to: string;
  platform: DashboardPlatformKey;
  groupBy: DashboardGroupByKey;
};

export type DataQualityProjectSummary = {
  projectId: string;
  projectName: string;
  projectSlug: string;
  pipelineInstallRows: number;
  rawInstallRows: number;
  stgInstallRows: number;
  martInstallRows: number | null;
  pipelineEventRows: number;
  rawEventRows: number;
  stgEventRows: number;
  latestInstallDate: string | null;
  latestEventDate: string | null;
  installsRawToStageRatio: number | null;
  installsStageToMartRatio: number | null;
  eventsRawToStageRatio: number | null;
};

export type DataQualityDailyRow = {
  projectId: string;
  projectName: string;
  projectSlug: string;
  date: string;
  pipelineInstallRows: number;
  rawInstallRows: number;
  stgInstallRows: number;
  martInstallRows: number | null;
  pipelineEventRows: number;
  rawEventRows: number;
  stgEventRows: number;
};

export type DataQualityBreakdownRow = {
  projectId: string;
  projectName: string;
  projectSlug: string;
  dimensionValue: string;
  rawRows: number;
  stageRows: number;
  martRows: number | null;
};

export type DataQualityIdentitySummary = {
  projectId: string;
  projectName: string;
  projectSlug: string;
  rawInstallRows: number;
  rawInstallMissingDeviceRows: number;
  rawInstallMissingUserRows: number;
  rawInstallMissingBothRows: number;
  rawInstallDeviceIds: number;
  stageInstallDeviceIds: number | null;
  overlapInstallDeviceIds: number | null;
  rawInstallUserIds: number;
  stageInstallUserIds: number | null;
  overlapInstallUserIds: number | null;
  rawInstallFingerprints: number;
  stageInstallFingerprints: number | null;
  overlapInstallFingerprints: number | null;
  rawSessionRows: number;
  rawSessionMissingSessionRows: number;
  rawSessionMissingDeviceRows: number;
  rawSessionMissingUserRows: number;
  rawSessionMissingBothRows: number;
  rawSessionIds: number;
  stageSessionIds: number | null;
  overlapSessionIds: number | null;
  rawSessionDeviceIds: number;
  stageSessionDeviceIds: number | null;
  overlapSessionDeviceIds: number | null;
  rawSessionUserIds: number;
  stageSessionUserIds: number | null;
  overlapSessionUserIds: number | null;
  rawSessionFingerprints: number;
  stageSessionFingerprints: number | null;
  overlapSessionFingerprints: number | null;
};

export type DataQualityDashboardData = {
  projectSummaries: DataQualityProjectSummary[];
  dailyRows: DataQualityDailyRow[];
  installsBreakdownRows: DataQualityBreakdownRow[];
  eventsBreakdownRows: DataQualityBreakdownRow[];
  identitySummaries: DataQualityIdentitySummary[];
  installsBreakdownDimension: DashboardGroupByKey;
  eventsBreakdownDimension: DashboardGroupByKey;
  resolvedContextCount: number;
  failedProjectNames: string[];
  notes: string[];
};

type ProjectArtifacts = {
  rawInstallsTable: string | null;
  rawEventsTable: string | null;
  rawSessionsTable: string | null;
  stgInstallsTable: string | null;
  stgEventsTable: string | null;
  stgSessionsTable: string | null;
  martInstallsTable: string | null;
};

type DailyQueryRow = {
  date: string;
  pipeline_install_rows: number | null;
  raw_install_rows: number | null;
  stg_install_rows: number | null;
  mart_install_rows: number | null;
  pipeline_event_rows: number | null;
  raw_event_rows: number | null;
  stg_event_rows: number | null;
};

type BreakdownQueryRow = {
  dimension_value: string;
  raw_rows: number | null;
  stage_rows: number | null;
  mart_rows: number | null;
};

type IdentityQueryRow = {
  raw_install_rows: number | null;
  raw_install_missing_device_rows: number | null;
  raw_install_missing_user_rows: number | null;
  raw_install_missing_both_rows: number | null;
  raw_install_device_ids: number | null;
  stage_install_device_ids: number | null;
  overlap_install_device_ids: number | null;
  raw_install_user_ids: number | null;
  stage_install_user_ids: number | null;
  overlap_install_user_ids: number | null;
  raw_install_fingerprints: number | null;
  stage_install_fingerprints: number | null;
  overlap_install_fingerprints: number | null;
  raw_session_rows: number | null;
  raw_session_missing_session_rows: number | null;
  raw_session_missing_device_rows: number | null;
  raw_session_missing_user_rows: number | null;
  raw_session_missing_both_rows: number | null;
  raw_session_ids: number | null;
  stage_session_ids: number | null;
  overlap_session_ids: number | null;
  raw_session_device_ids: number | null;
  stage_session_device_ids: number | null;
  overlap_session_device_ids: number | null;
  raw_session_user_ids: number | null;
  stage_session_user_ids: number | null;
  overlap_session_user_ids: number | null;
  raw_session_fingerprints: number | null;
  stage_session_fingerprints: number | null;
  overlap_session_fingerprints: number | null;
};

const SUPPORTED_INSTALL_BREAKDOWNS = new Set<DashboardGroupByKey>([
  "source",
  "country",
  "platform",
]);
const SUPPORTED_EVENT_BREAKDOWNS = new Set<DashboardGroupByKey>([
  "country",
  "platform",
]);

function projectTablePrefix(slug: string) {
  return slug.replace(/-/g, "_");
}

function getAppMetricaAppIds(bundle: AnalyticsProjectBundle) {
  const source = bundle.sources.find((entry) => entry.sourceType === "appmetrica_logs");
  if (!Array.isArray(source?.config.appIds)) {
    return [];
  }

  return source.config.appIds.flatMap((value) => {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isInteger(parsed) && parsed > 0 ? [parsed] : [];
  });
}

function safeRatio(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function chooseInstallBreakdownDimension(groupBy: DashboardGroupByKey) {
  if (SUPPORTED_INSTALL_BREAKDOWNS.has(groupBy)) {
    return groupBy;
  }

  return "source" satisfies DashboardGroupByKey;
}

function chooseEventBreakdownDimension(groupBy: DashboardGroupByKey) {
  if (SUPPORTED_EVENT_BREAKDOWNS.has(groupBy)) {
    return groupBy;
  }

  return "country" satisfies DashboardGroupByKey;
}

function buildInstallDimensionExpression(
  layer: "raw" | "stg" | "mart",
  dimension: DashboardGroupByKey
) {
  if (dimension === "source") {
    const column =
      layer === "raw"
        ? "tracker_name"
        : layer === "stg"
          ? "tracker_name"
          : "tracker_name";
    const fallback = layer === "mart" ? "unknown" : "organic";
    return `COALESCE(NULLIF(LOWER(CAST(${column} AS STRING)), ''), '${fallback}')`;
  }

  if (dimension === "country") {
    if (layer === "mart") {
      return null;
    }

    const column = layer === "raw" ? "country_iso_code" : "country_code";
    return `COALESCE(NULLIF(UPPER(CAST(${column} AS STRING)), ''), 'UNKNOWN')`;
  }

  if (dimension === "platform") {
    return `COALESCE(NULLIF(LOWER(CAST(os_name AS STRING)), ''), 'unknown')`;
  }

  return null;
}

function buildEventDimensionExpression(
  layer: "raw" | "stg",
  dimension: DashboardGroupByKey
) {
  if (dimension === "country") {
    const column = layer === "raw" ? "country_iso_code" : "country_code";
    return `COALESCE(NULLIF(UPPER(CAST(${column} AS STRING)), ''), 'UNKNOWN')`;
  }

  if (dimension === "platform") {
    return `COALESCE(NULLIF(LOWER(CAST(os_name AS STRING)), ''), 'unknown')`;
  }

  return null;
}

function buildInstallFingerprintExpression(layer: "raw" | "stg") {
  const installedAt =
    layer === "raw"
      ? "SAFE_CAST(install_datetime AS TIMESTAMP)"
      : "CAST(installed_at AS TIMESTAMP)";
  const deviceId = layer === "raw" ? "appmetrica_device_id" : "device_id";
  const osName = layer === "raw" ? "os_name" : "os_name";
  const country = layer === "raw" ? "country_iso_code" : "country_code";
  const tracker = layer === "raw" ? "tracker_name" : "tracker_name";
  const appVersion = layer === "raw" ? "app_version_name" : "app_version";
  const userId = layer === "raw" ? "profile_id" : "user_id";

  return `
    CASE
      WHEN ${installedAt} IS NULL OR COALESCE(CAST(${osName} AS STRING), '') = '' THEN NULL
      ELSE TO_HEX(MD5(CONCAT(
        FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S', ${installedAt}, 'UTC'),
        '|', COALESCE(NULLIF(CAST(${deviceId} AS STRING), ''), '~'),
        '|', LOWER(COALESCE(CAST(${osName} AS STRING), '')),
        '|', UPPER(COALESCE(CAST(${country} AS STRING), '')),
        '|', COALESCE(CAST(${tracker} AS STRING), ''),
        '|', COALESCE(CAST(${appVersion} AS STRING), ''),
        '|', COALESCE(NULLIF(CAST(${userId} AS STRING), ''), '~')
      )))
    END
  `;
}

function buildSessionFingerprintExpression(layer: "raw" | "stg") {
  const startedAt =
    layer === "raw"
      ? "SAFE_CAST(session_start_datetime AS TIMESTAMP)"
      : "CAST(session_started_at AS TIMESTAMP)";
  const deviceId = layer === "raw" ? "appmetrica_device_id" : "device_id";
  const osName = layer === "raw" ? "os_name" : "os_name";
  const userId = layer === "raw" ? "profile_id" : "user_id";

  return `
    CASE
      WHEN ${startedAt} IS NULL OR COALESCE(CAST(${osName} AS STRING), '') = '' THEN NULL
      ELSE TO_HEX(MD5(CONCAT(
        FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S', ${startedAt}, 'UTC'),
        '|', COALESCE(NULLIF(CAST(${deviceId} AS STRING), ''), '~'),
        '|', LOWER(COALESCE(CAST(${osName} AS STRING), '')),
        '|', COALESCE(NULLIF(CAST(${userId} AS STRING), ''), '~')
      )))
    END
  `;
}

async function loadProjectArtifacts(context: ProjectQueryContext): Promise<ProjectArtifacts> {
  const prefix = projectTablePrefix(context.bundle.project.slug);
  const rawInstalls = context.rawInstallsTable;
  const rawEvents = context.rawEventsTable;
  const rawSessions = context.rawSessionsTable;
  const stgInstalls = `${prefix}_appmetrica__installs`;
  const stgEvents = `${prefix}_appmetrica__events`;
  const stgSessions = `${prefix}_appmetrica__sessions`;
  const martInstalls = `${prefix}_installs_funnel`;

  const rows = await executeBigQuery<{
    dataset_name: string;
    table_name: string;
  }>(
    context,
    `
      SELECT 'raw' AS dataset_name, table_name
      FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.INFORMATION_SCHEMA.TABLES\`
      WHERE table_name IN ('${rawInstalls}', '${rawEvents}', '${rawSessions}')

      UNION ALL

      SELECT 'stg' AS dataset_name, table_name
      FROM \`${context.warehouseProjectId}.${context.bundle.project.stgDataset}.INFORMATION_SCHEMA.TABLES\`
      WHERE table_name IN ('${stgInstalls}', '${stgEvents}', '${stgSessions}')

      UNION ALL

      SELECT 'mart' AS dataset_name, table_name
      FROM \`${context.warehouseProjectId}.${context.bundle.project.martDataset}.INFORMATION_SCHEMA.TABLES\`
      WHERE table_name IN ('${martInstalls}')
    `
  );

  const byDataset = new Map(rows.map((row) => [`${row.dataset_name}:${row.table_name}`, true]));

  return {
    rawInstallsTable: byDataset.has(`raw:${rawInstalls}`) ? rawInstalls : null,
    rawEventsTable: byDataset.has(`raw:${rawEvents}`) ? rawEvents : null,
    rawSessionsTable: byDataset.has(`raw:${rawSessions}`) ? rawSessions : null,
    stgInstallsTable: byDataset.has(`stg:${stgInstalls}`) ? stgInstalls : null,
    stgEventsTable: byDataset.has(`stg:${stgEvents}`) ? stgEvents : null,
    stgSessionsTable: byDataset.has(`stg:${stgSessions}`) ? stgSessions : null,
    martInstallsTable: byDataset.has(`mart:${martInstalls}`) ? martInstalls : null,
  };
}

function buildDailySql(context: ProjectQueryContext, artifacts: ProjectArtifacts) {
  const pipelineAppIds = getAppMetricaAppIds(context.bundle);
  const rawInstallsTable = artifacts.rawInstallsTable
    ? `\`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${artifacts.rawInstallsTable}\``
    : null;
  const rawEventsTable = artifacts.rawEventsTable
    ? `\`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${artifacts.rawEventsTable}\``
    : null;
  const stgInstallsTable = artifacts.stgInstallsTable
    ? `\`${context.warehouseProjectId}.${context.bundle.project.stgDataset}.${artifacts.stgInstallsTable}\``
    : null;
  const stgEventsTable = artifacts.stgEventsTable
    ? `\`${context.warehouseProjectId}.${context.bundle.project.stgDataset}.${artifacts.stgEventsTable}\``
    : null;
  const martInstallsTable = artifacts.martInstallsTable
    ? `\`${context.warehouseProjectId}.${context.bundle.project.martDataset}.${artifacts.martInstallsTable}\``
    : null;

  const emptyCounts = (column: string) => `
    SELECT
      CAST(NULL AS STRING) AS date,
      CAST(0 AS INT64) AS ${column}
    WHERE FALSE
  `;

  const stageInstallSql = stgInstallsTable
    ? `
      SELECT
        CAST(install_date AS STRING) AS date,
        COUNT(*) AS stg_install_rows
      FROM ${stgInstallsTable}
      WHERE install_date BETWEEN @date_from AND @date_to
        AND (@platform = 'all' OR LOWER(os_name) = @platform)
      GROUP BY 1
    `
    : emptyCounts("stg_install_rows");

  const martInstallSql = martInstallsTable
    ? `
      SELECT
        CAST(install_date AS STRING) AS date,
        SUM(COALESCE(installed, 0)) AS mart_install_rows
      FROM ${martInstallsTable}
      WHERE install_date BETWEEN @date_from AND @date_to
        AND (@platform = 'all' OR LOWER(os_name) = @platform)
      GROUP BY 1
    `
    : emptyCounts("mart_install_rows");

  const stageEventSql = stgEventsTable
    ? `
      SELECT
        CAST(event_date AS STRING) AS date,
        COUNT(*) AS stg_event_rows
      FROM ${stgEventsTable}
      WHERE event_date BETWEEN @date_from AND @date_to
        AND (@platform = 'all' OR LOWER(os_name) = @platform)
      GROUP BY 1
    `
    : emptyCounts("stg_event_rows");

  const pipelineInstallSql =
    pipelineAppIds.length > 0
      ? `
      SELECT
        CAST(partition_date AS STRING) AS date,
        SUM(COALESCE(rows_loaded, 0)) AS pipeline_install_rows
      FROM \`${context.warehouseProjectId}.meta.pipeline_runs\`
      WHERE partition_date BETWEEN @date_from AND @date_to
        AND resource = 'installations'
        AND app_id IN (${pipelineAppIds.join(", ")})
        AND status IN ('success', 'skipped_existing', 'skipped_empty')
      GROUP BY 1
    `
      : emptyCounts("pipeline_install_rows");

  const pipelineEventSql =
    pipelineAppIds.length > 0
      ? `
      SELECT
        CAST(partition_date AS STRING) AS date,
        SUM(COALESCE(rows_loaded, 0)) AS pipeline_event_rows
      FROM \`${context.warehouseProjectId}.meta.pipeline_runs\`
      WHERE partition_date BETWEEN @date_from AND @date_to
        AND resource = 'events'
        AND app_id IN (${pipelineAppIds.join(", ")})
        AND status IN ('success', 'skipped_existing', 'skipped_empty')
      GROUP BY 1
    `
      : emptyCounts("pipeline_event_rows");

  return `
    WITH pipeline_installs AS (
      ${pipelineInstallSql}
    ),
    raw_installs AS (
      ${
        rawInstallsTable
          ? `
      SELECT
        CAST(DATE(SAFE_CAST(install_datetime AS TIMESTAMP)) AS STRING) AS date,
        COUNT(*) AS raw_install_rows
      FROM ${rawInstallsTable}
      WHERE _PARTITIONDATE BETWEEN @date_from AND @date_to
        AND DATE(SAFE_CAST(install_datetime AS TIMESTAMP)) BETWEEN @date_from AND @date_to
        AND (@platform = 'all' OR LOWER(os_name) = @platform)
      GROUP BY 1
      `
          : emptyCounts("raw_install_rows")
      }
    ),
    stg_installs AS (
      ${stageInstallSql}
    ),
    mart_installs AS (
      ${martInstallSql}
    ),
    pipeline_events AS (
      ${pipelineEventSql}
    ),
    raw_events AS (
      ${
        rawEventsTable
          ? `
      SELECT
        CAST(DATE(SAFE_CAST(event_datetime AS TIMESTAMP)) AS STRING) AS date,
        COUNT(*) AS raw_event_rows
      FROM ${rawEventsTable}
      WHERE _PARTITIONDATE BETWEEN @date_from AND @date_to
        AND DATE(SAFE_CAST(event_datetime AS TIMESTAMP)) BETWEEN @date_from AND @date_to
        AND (@platform = 'all' OR LOWER(os_name) = @platform)
      GROUP BY 1
      `
          : emptyCounts("raw_event_rows")
      }
    ),
    stg_events AS (
      ${stageEventSql}
    )
    SELECT
      date,
      SUM(pipeline_install_rows) AS pipeline_install_rows,
      SUM(raw_install_rows) AS raw_install_rows,
      SUM(stg_install_rows) AS stg_install_rows,
      SUM(mart_install_rows) AS mart_install_rows,
      SUM(pipeline_event_rows) AS pipeline_event_rows,
      SUM(raw_event_rows) AS raw_event_rows,
      SUM(stg_event_rows) AS stg_event_rows
    FROM (
      SELECT date, pipeline_install_rows, 0 AS raw_install_rows, 0 AS stg_install_rows, 0 AS mart_install_rows, 0 AS pipeline_event_rows, 0 AS raw_event_rows, 0 AS stg_event_rows FROM pipeline_installs
      UNION ALL
      SELECT date, 0, raw_install_rows, 0, 0, 0, 0, 0 FROM raw_installs
      UNION ALL
      SELECT date, 0, 0, stg_install_rows, 0, 0, 0, 0 FROM stg_installs
      UNION ALL
      SELECT date, 0, 0, 0, mart_install_rows, 0, 0, 0 FROM mart_installs
      UNION ALL
      SELECT date, 0, 0, 0, 0, pipeline_event_rows, 0, 0 FROM pipeline_events
      UNION ALL
      SELECT date, 0, 0, 0, 0, 0, raw_event_rows, 0 FROM raw_events
      UNION ALL
      SELECT date, 0, 0, 0, 0, 0, 0, stg_event_rows FROM stg_events
    )
    GROUP BY 1
    ORDER BY date DESC
  `;
}

function buildInstallBreakdownSql(
  context: ProjectQueryContext,
  artifacts: ProjectArtifacts,
  dimension: DashboardGroupByKey
) {
  const rawInstallsTable = artifacts.rawInstallsTable
    ? `\`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${artifacts.rawInstallsTable}\``
    : null;
  const rawDimension = buildInstallDimensionExpression("raw", dimension);
  const stgDimension = buildInstallDimensionExpression("stg", dimension);
  const martDimension = buildInstallDimensionExpression("mart", dimension);
  const stgInstallsTable = artifacts.stgInstallsTable
    ? `\`${context.warehouseProjectId}.${context.bundle.project.stgDataset}.${artifacts.stgInstallsTable}\``
    : null;
  const martInstallsTable = artifacts.martInstallsTable
    ? `\`${context.warehouseProjectId}.${context.bundle.project.martDataset}.${artifacts.martInstallsTable}\``
    : null;

  if (!rawDimension || !stgDimension) {
    return null;
  }

  const rawSql = rawInstallsTable
    ? `
    SELECT
      ${rawDimension} AS dimension_value,
      COUNT(*) AS raw_rows
    FROM ${rawInstallsTable}
    WHERE _PARTITIONDATE BETWEEN @date_from AND @date_to
      AND DATE(SAFE_CAST(install_datetime AS TIMESTAMP)) BETWEEN @date_from AND @date_to
      AND (@platform = 'all' OR LOWER(os_name) = @platform)
    GROUP BY 1
  `
    : "SELECT CAST(NULL AS STRING) AS dimension_value, CAST(0 AS INT64) AS raw_rows WHERE FALSE";

  const stageSql = stgInstallsTable
    ? `
      SELECT
        ${stgDimension} AS dimension_value,
        COUNT(*) AS stage_rows
      FROM ${stgInstallsTable}
      WHERE install_date BETWEEN @date_from AND @date_to
        AND (@platform = 'all' OR LOWER(os_name) = @platform)
      GROUP BY 1
    `
    : null;

  const martSql =
    martInstallsTable && martDimension
      ? `
        SELECT
          ${martDimension} AS dimension_value,
          SUM(COALESCE(installed, 0)) AS mart_rows
        FROM ${martInstallsTable}
        WHERE install_date BETWEEN @date_from AND @date_to
          AND (@platform = 'all' OR LOWER(os_name) = @platform)
        GROUP BY 1
      `
      : null;

  return `
    WITH raw_breakdown AS (
      ${rawSql}
    ),
    stage_breakdown AS (
      ${stageSql ?? "SELECT CAST(NULL AS STRING) AS dimension_value, CAST(0 AS INT64) AS stage_rows WHERE FALSE"}
    ),
    mart_breakdown AS (
      ${martSql ?? "SELECT CAST(NULL AS STRING) AS dimension_value, CAST(0 AS INT64) AS mart_rows WHERE FALSE"}
    )
    SELECT
      dimension_value,
      SUM(raw_rows) AS raw_rows,
      SUM(stage_rows) AS stage_rows,
      SUM(mart_rows) AS mart_rows
    FROM (
      SELECT dimension_value, raw_rows, 0 AS stage_rows, 0 AS mart_rows FROM raw_breakdown
      UNION ALL
      SELECT dimension_value, 0, stage_rows, 0 FROM stage_breakdown
      UNION ALL
      SELECT dimension_value, 0, 0, mart_rows FROM mart_breakdown
    )
    GROUP BY 1
    ORDER BY stage_rows DESC, raw_rows DESC, dimension_value ASC
  `;
}

function buildEventBreakdownSql(
  context: ProjectQueryContext,
  artifacts: ProjectArtifacts,
  dimension: DashboardGroupByKey
) {
  const rawEventsTable = artifacts.rawEventsTable
    ? `\`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${artifacts.rawEventsTable}\``
    : null;
  const rawDimension = buildEventDimensionExpression("raw", dimension);
  const stageDimension = buildEventDimensionExpression("stg", dimension);
  const stgEventsTable = artifacts.stgEventsTable
    ? `\`${context.warehouseProjectId}.${context.bundle.project.stgDataset}.${artifacts.stgEventsTable}\``
    : null;

  if (!rawDimension || !stageDimension) {
    return null;
  }

  return `
    WITH raw_breakdown AS (
      ${
        rawEventsTable
          ? `
      SELECT
        ${rawDimension} AS dimension_value,
        COUNT(*) AS raw_rows
      FROM ${rawEventsTable}
      WHERE _PARTITIONDATE BETWEEN @date_from AND @date_to
        AND DATE(SAFE_CAST(event_datetime AS TIMESTAMP)) BETWEEN @date_from AND @date_to
        AND (@platform = 'all' OR LOWER(os_name) = @platform)
      GROUP BY 1
      `
          : "SELECT CAST(NULL AS STRING) AS dimension_value, CAST(0 AS INT64) AS raw_rows WHERE FALSE"
      }
    ),
    stage_breakdown AS (
      ${
        stgEventsTable
          ? `
      SELECT
        ${stageDimension} AS dimension_value,
        COUNT(*) AS stage_rows
      FROM ${stgEventsTable}
      WHERE event_date BETWEEN @date_from AND @date_to
        AND (@platform = 'all' OR LOWER(os_name) = @platform)
      GROUP BY 1
      `
          : "SELECT CAST(NULL AS STRING) AS dimension_value, CAST(0 AS INT64) AS stage_rows WHERE FALSE"
      }
    )
    SELECT
      dimension_value,
      SUM(raw_rows) AS raw_rows,
      SUM(stage_rows) AS stage_rows,
      CAST(NULL AS INT64) AS mart_rows
    FROM (
      SELECT dimension_value, raw_rows, 0 AS stage_rows FROM raw_breakdown
      UNION ALL
      SELECT dimension_value, 0, stage_rows FROM stage_breakdown
    )
    GROUP BY 1
    ORDER BY stage_rows DESC, raw_rows DESC, dimension_value ASC
  `;
}

function buildIdentitySql(context: ProjectQueryContext, artifacts: ProjectArtifacts) {
  const rawInstallsTable = artifacts.rawInstallsTable
    ? `\`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${artifacts.rawInstallsTable}\``
    : null;
  const rawSessionsTable = artifacts.rawSessionsTable
    ? `\`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${artifacts.rawSessionsTable}\``
    : null;
  const stgInstallsTable = artifacts.stgInstallsTable
    ? `\`${context.warehouseProjectId}.${context.bundle.project.stgDataset}.${artifacts.stgInstallsTable}\``
    : null;
  const stgSessionsTable = artifacts.stgSessionsTable
    ? `\`${context.warehouseProjectId}.${context.bundle.project.stgDataset}.${artifacts.stgSessionsTable}\``
    : null;

  const installStageCount = (sql: string) => (artifacts.stgInstallsTable ? sql : "CAST(NULL AS INT64)");
  const sessionStageCount = (sql: string) => (artifacts.stgSessionsTable ? sql : "CAST(NULL AS INT64)");

  return `
    WITH raw_install_identity_base AS (
      ${
        rawInstallsTable
          ? `
      SELECT
        NULLIF(CAST(appmetrica_device_id AS STRING), '') AS device_id,
        NULLIF(CAST(profile_id AS STRING), '') AS user_id,
        ${buildInstallFingerprintExpression("raw")} AS fingerprint_key
      FROM ${rawInstallsTable}
      WHERE _PARTITIONDATE BETWEEN @date_from AND @date_to
        AND DATE(SAFE_CAST(install_datetime AS TIMESTAMP)) BETWEEN @date_from AND @date_to
        AND (@platform = 'all' OR LOWER(os_name) = @platform)
      `
          : `
      SELECT
        CAST(NULL AS STRING) AS device_id,
        CAST(NULL AS STRING) AS user_id,
        CAST(NULL AS STRING) AS fingerprint_key
      WHERE FALSE
      `
      }
    ),
    stage_install_identity_base AS (
      ${
        stgInstallsTable
          ? `
      SELECT
        NULLIF(CAST(device_id AS STRING), '') AS device_id,
        NULLIF(CAST(user_id AS STRING), '') AS user_id,
        ${buildInstallFingerprintExpression("stg")} AS fingerprint_key
      FROM ${stgInstallsTable}
      WHERE install_date BETWEEN @date_from AND @date_to
        AND (@platform = 'all' OR LOWER(os_name) = @platform)
      `
          : `
      SELECT
        CAST(NULL AS STRING) AS device_id,
        CAST(NULL AS STRING) AS user_id,
        CAST(NULL AS STRING) AS fingerprint_key
      WHERE FALSE
      `
      }
    ),
    raw_install_device_ids AS (
      SELECT DISTINCT device_id FROM raw_install_identity_base WHERE device_id IS NOT NULL
    ),
    stage_install_device_ids AS (
      SELECT DISTINCT device_id FROM stage_install_identity_base WHERE device_id IS NOT NULL
    ),
    raw_install_user_ids AS (
      SELECT DISTINCT user_id FROM raw_install_identity_base WHERE user_id IS NOT NULL
    ),
    stage_install_user_ids AS (
      SELECT DISTINCT user_id FROM stage_install_identity_base WHERE user_id IS NOT NULL
    ),
    raw_install_fingerprints AS (
      SELECT DISTINCT fingerprint_key FROM raw_install_identity_base WHERE fingerprint_key IS NOT NULL
    ),
    stage_install_fingerprints AS (
      SELECT DISTINCT fingerprint_key FROM stage_install_identity_base WHERE fingerprint_key IS NOT NULL
    ),
    raw_session_identity_base AS (
      ${
        rawSessionsTable
          ? `
      SELECT
        NULLIF(CAST(session_id AS STRING), '') AS session_id,
        NULLIF(CAST(appmetrica_device_id AS STRING), '') AS device_id,
        NULLIF(CAST(profile_id AS STRING), '') AS user_id,
        ${buildSessionFingerprintExpression("raw")} AS fingerprint_key
      FROM ${rawSessionsTable}
      WHERE _PARTITIONDATE BETWEEN @date_from AND @date_to
        AND DATE(SAFE_CAST(session_start_datetime AS TIMESTAMP)) BETWEEN @date_from AND @date_to
        AND (@platform = 'all' OR LOWER(os_name) = @platform)
      `
          : `
      SELECT
        CAST(NULL AS STRING) AS session_id,
        CAST(NULL AS STRING) AS device_id,
        CAST(NULL AS STRING) AS user_id,
        CAST(NULL AS STRING) AS fingerprint_key
      WHERE FALSE
      `
      }
    ),
    stage_session_identity_base AS (
      ${
        stgSessionsTable
          ? `
      SELECT
        NULLIF(CAST(session_id AS STRING), '') AS session_id,
        NULLIF(CAST(device_id AS STRING), '') AS device_id,
        NULLIF(CAST(user_id AS STRING), '') AS user_id,
        ${buildSessionFingerprintExpression("stg")} AS fingerprint_key
      FROM ${stgSessionsTable}
      WHERE session_date BETWEEN @date_from AND @date_to
        AND (@platform = 'all' OR LOWER(os_name) = @platform)
      `
          : `
      SELECT
        CAST(NULL AS STRING) AS session_id,
        CAST(NULL AS STRING) AS device_id,
        CAST(NULL AS STRING) AS user_id,
        CAST(NULL AS STRING) AS fingerprint_key
      WHERE FALSE
      `
      }
    ),
    raw_session_ids AS (
      SELECT DISTINCT session_id FROM raw_session_identity_base WHERE session_id IS NOT NULL
    ),
    stage_session_ids AS (
      SELECT DISTINCT session_id FROM stage_session_identity_base WHERE session_id IS NOT NULL
    ),
    raw_session_device_ids AS (
      SELECT DISTINCT device_id FROM raw_session_identity_base WHERE device_id IS NOT NULL
    ),
    stage_session_device_ids AS (
      SELECT DISTINCT device_id FROM stage_session_identity_base WHERE device_id IS NOT NULL
    ),
    raw_session_user_ids AS (
      SELECT DISTINCT user_id FROM raw_session_identity_base WHERE user_id IS NOT NULL
    ),
    stage_session_user_ids AS (
      SELECT DISTINCT user_id FROM stage_session_identity_base WHERE user_id IS NOT NULL
    ),
    raw_session_fingerprints AS (
      SELECT DISTINCT fingerprint_key FROM raw_session_identity_base WHERE fingerprint_key IS NOT NULL
    ),
    stage_session_fingerprints AS (
      SELECT DISTINCT fingerprint_key FROM stage_session_identity_base WHERE fingerprint_key IS NOT NULL
    )
    SELECT
      (SELECT COUNT(*) FROM raw_install_identity_base) AS raw_install_rows,
      (SELECT COUNTIF(device_id IS NULL) FROM raw_install_identity_base) AS raw_install_missing_device_rows,
      (SELECT COUNTIF(user_id IS NULL) FROM raw_install_identity_base) AS raw_install_missing_user_rows,
      (SELECT COUNTIF(device_id IS NULL AND user_id IS NULL) FROM raw_install_identity_base) AS raw_install_missing_both_rows,
      (SELECT COUNT(*) FROM raw_install_device_ids) AS raw_install_device_ids,
      ${installStageCount("(SELECT COUNT(*) FROM stage_install_device_ids)")} AS stage_install_device_ids,
      ${installStageCount(
        "(SELECT COUNT(*) FROM raw_install_device_ids raw INNER JOIN stage_install_device_ids stage USING (device_id))"
      )} AS overlap_install_device_ids,
      (SELECT COUNT(*) FROM raw_install_user_ids) AS raw_install_user_ids,
      ${installStageCount("(SELECT COUNT(*) FROM stage_install_user_ids)")} AS stage_install_user_ids,
      ${installStageCount(
        "(SELECT COUNT(*) FROM raw_install_user_ids raw INNER JOIN stage_install_user_ids stage USING (user_id))"
      )} AS overlap_install_user_ids,
      (SELECT COUNT(*) FROM raw_install_fingerprints) AS raw_install_fingerprints,
      ${installStageCount("(SELECT COUNT(*) FROM stage_install_fingerprints)")} AS stage_install_fingerprints,
      ${installStageCount(
        "(SELECT COUNT(*) FROM raw_install_fingerprints raw INNER JOIN stage_install_fingerprints stage USING (fingerprint_key))"
      )} AS overlap_install_fingerprints,
      (SELECT COUNT(*) FROM raw_session_identity_base) AS raw_session_rows,
      (SELECT COUNTIF(session_id IS NULL) FROM raw_session_identity_base) AS raw_session_missing_session_rows,
      (SELECT COUNTIF(device_id IS NULL) FROM raw_session_identity_base) AS raw_session_missing_device_rows,
      (SELECT COUNTIF(user_id IS NULL) FROM raw_session_identity_base) AS raw_session_missing_user_rows,
      (SELECT COUNTIF(session_id IS NULL AND device_id IS NULL AND user_id IS NULL) FROM raw_session_identity_base) AS raw_session_missing_both_rows,
      (SELECT COUNT(*) FROM raw_session_ids) AS raw_session_ids,
      ${sessionStageCount("(SELECT COUNT(*) FROM stage_session_ids)")} AS stage_session_ids,
      ${sessionStageCount(
        "(SELECT COUNT(*) FROM raw_session_ids raw INNER JOIN stage_session_ids stage USING (session_id))"
      )} AS overlap_session_ids,
      (SELECT COUNT(*) FROM raw_session_device_ids) AS raw_session_device_ids,
      ${sessionStageCount("(SELECT COUNT(*) FROM stage_session_device_ids)")} AS stage_session_device_ids,
      ${sessionStageCount(
        "(SELECT COUNT(*) FROM raw_session_device_ids raw INNER JOIN stage_session_device_ids stage USING (device_id))"
      )} AS overlap_session_device_ids,
      (SELECT COUNT(*) FROM raw_session_user_ids) AS raw_session_user_ids,
      ${sessionStageCount("(SELECT COUNT(*) FROM stage_session_user_ids)")} AS stage_session_user_ids,
      ${sessionStageCount(
        "(SELECT COUNT(*) FROM raw_session_user_ids raw INNER JOIN stage_session_user_ids stage USING (user_id))"
      )} AS overlap_session_user_ids,
      (SELECT COUNT(*) FROM raw_session_fingerprints) AS raw_session_fingerprints,
      ${sessionStageCount("(SELECT COUNT(*) FROM stage_session_fingerprints)")} AS stage_session_fingerprints,
      ${sessionStageCount(
        "(SELECT COUNT(*) FROM raw_session_fingerprints raw INNER JOIN stage_session_fingerprints stage USING (fingerprint_key))"
      )} AS overlap_session_fingerprints
  `;
}

function summarizeProject(
  context: ProjectQueryContext,
  dailyRows: DataQualityDailyRow[],
  artifacts: ProjectArtifacts
): DataQualityProjectSummary {
  const totals = dailyRows.reduce(
    (acc, row) => {
      acc.pipelineInstallRows += row.pipelineInstallRows;
      acc.rawInstallRows += row.rawInstallRows;
      acc.stgInstallRows += row.stgInstallRows;
      acc.pipelineEventRows += row.pipelineEventRows;
      acc.rawEventRows += row.rawEventRows;
      acc.stgEventRows += row.stgEventRows;
      acc.martInstallRows += row.martInstallRows ?? 0;
      if (row.rawInstallRows > 0 || row.stgInstallRows > 0 || (row.martInstallRows ?? 0) > 0) {
        acc.latestInstallDate = acc.latestInstallDate ? (acc.latestInstallDate > row.date ? acc.latestInstallDate : row.date) : row.date;
      }
      if (row.rawEventRows > 0 || row.stgEventRows > 0) {
        acc.latestEventDate = acc.latestEventDate ? (acc.latestEventDate > row.date ? acc.latestEventDate : row.date) : row.date;
      }
      return acc;
    },
    {
      pipelineInstallRows: 0,
      rawInstallRows: 0,
      stgInstallRows: 0,
      martInstallRows: 0,
      pipelineEventRows: 0,
      rawEventRows: 0,
      stgEventRows: 0,
      latestInstallDate: null as string | null,
      latestEventDate: null as string | null,
    }
  );

  return {
    projectId: context.bundle.project.id,
    projectName: context.bundle.project.displayName,
    projectSlug: context.bundle.project.slug,
    pipelineInstallRows: totals.pipelineInstallRows,
    rawInstallRows: totals.rawInstallRows,
    stgInstallRows: totals.stgInstallRows,
    martInstallRows: artifacts.martInstallsTable ? totals.martInstallRows : null,
    pipelineEventRows: totals.pipelineEventRows,
    rawEventRows: totals.rawEventRows,
    stgEventRows: totals.stgEventRows,
    latestInstallDate: totals.latestInstallDate,
    latestEventDate: totals.latestEventDate,
    installsRawToStageRatio: safeRatio(totals.stgInstallRows, totals.rawInstallRows),
    installsStageToMartRatio: artifacts.martInstallsTable
      ? safeRatio(totals.martInstallRows, totals.stgInstallRows)
      : null,
    eventsRawToStageRatio: safeRatio(totals.stgEventRows, totals.rawEventRows),
  };
}

function normalizeIdentitySummary(
  context: ProjectQueryContext,
  row: IdentityQueryRow
): DataQualityIdentitySummary {
  return {
    projectId: context.bundle.project.id,
    projectName: context.bundle.project.displayName,
    projectSlug: context.bundle.project.slug,
    rawInstallRows: Number(row.raw_install_rows ?? 0),
    rawInstallMissingDeviceRows: Number(row.raw_install_missing_device_rows ?? 0),
    rawInstallMissingUserRows: Number(row.raw_install_missing_user_rows ?? 0),
    rawInstallMissingBothRows: Number(row.raw_install_missing_both_rows ?? 0),
    rawInstallDeviceIds: Number(row.raw_install_device_ids ?? 0),
    stageInstallDeviceIds: row.stage_install_device_ids === null ? null : Number(row.stage_install_device_ids ?? 0),
    overlapInstallDeviceIds:
      row.overlap_install_device_ids === null ? null : Number(row.overlap_install_device_ids ?? 0),
    rawInstallUserIds: Number(row.raw_install_user_ids ?? 0),
    stageInstallUserIds: row.stage_install_user_ids === null ? null : Number(row.stage_install_user_ids ?? 0),
    overlapInstallUserIds:
      row.overlap_install_user_ids === null ? null : Number(row.overlap_install_user_ids ?? 0),
    rawInstallFingerprints: Number(row.raw_install_fingerprints ?? 0),
    stageInstallFingerprints:
      row.stage_install_fingerprints === null ? null : Number(row.stage_install_fingerprints ?? 0),
    overlapInstallFingerprints:
      row.overlap_install_fingerprints === null ? null : Number(row.overlap_install_fingerprints ?? 0),
    rawSessionRows: Number(row.raw_session_rows ?? 0),
    rawSessionMissingSessionRows: Number(row.raw_session_missing_session_rows ?? 0),
    rawSessionMissingDeviceRows: Number(row.raw_session_missing_device_rows ?? 0),
    rawSessionMissingUserRows: Number(row.raw_session_missing_user_rows ?? 0),
    rawSessionMissingBothRows: Number(row.raw_session_missing_both_rows ?? 0),
    rawSessionIds: Number(row.raw_session_ids ?? 0),
    stageSessionIds: row.stage_session_ids === null ? null : Number(row.stage_session_ids ?? 0),
    overlapSessionIds: row.overlap_session_ids === null ? null : Number(row.overlap_session_ids ?? 0),
    rawSessionDeviceIds: Number(row.raw_session_device_ids ?? 0),
    stageSessionDeviceIds:
      row.stage_session_device_ids === null ? null : Number(row.stage_session_device_ids ?? 0),
    overlapSessionDeviceIds:
      row.overlap_session_device_ids === null ? null : Number(row.overlap_session_device_ids ?? 0),
    rawSessionUserIds: Number(row.raw_session_user_ids ?? 0),
    stageSessionUserIds: row.stage_session_user_ids === null ? null : Number(row.stage_session_user_ids ?? 0),
    overlapSessionUserIds:
      row.overlap_session_user_ids === null ? null : Number(row.overlap_session_user_ids ?? 0),
    rawSessionFingerprints: Number(row.raw_session_fingerprints ?? 0),
    stageSessionFingerprints:
      row.stage_session_fingerprints === null ? null : Number(row.stage_session_fingerprints ?? 0),
    overlapSessionFingerprints:
      row.overlap_session_fingerprints === null ? null : Number(row.overlap_session_fingerprints ?? 0),
  };
}

export async function getDataQualityDashboardData(
  bundles: AnalyticsProjectBundle[],
  filters: DataQualityFilters
): Promise<DataQualityDashboardData> {
  const contexts = await loadBigQueryContexts(bundles);
  const contextEntries = Array.from(contexts.values());
  const installsBreakdownDimension = chooseInstallBreakdownDimension(filters.groupBy);
  const eventsBreakdownDimension = chooseEventBreakdownDimension(filters.groupBy);
  const notes: string[] = [];

  if (filters.groupBy !== installsBreakdownDimension) {
    notes.push(
      "Install breakdown uses source/country/platform only. Campaign, creative, company, and segment-level reconciliation are not present in AppMetrica raw/stage tables yet."
    );
  }

  if (filters.groupBy !== eventsBreakdownDimension) {
    notes.push(
      "Event breakdown uses country/platform only because AppMetrica event tables do not carry tracker/campaign metadata."
    );
  }

  notes.push(
    "The page reconciles the pipeline as raw AppMetrica load metadata → raw BigQuery tables → dbt staging views → mart installs funnel."
  );
  notes.push(
    "Unity Ads / Google Ads mirrors are configured operationally, but quantitative mirror-to-AppMetrica matching still needs a normalized external schema contract."
  );
  notes.push(
    "Identity reconciliation compares distinct AppMetrica device_id / profile_id / session_id sets from raw Logs API loads against staged BigQuery views over the selected date range."
  );
  notes.push(
    "Derived fingerprints are diagnostic-only surrogate keys computed from timestamps and stable device metadata at query time. They are not written back as fake IDs."
  );

  const pipelineMetadataUnavailableProjects = contextEntries.flatMap((context) =>
    getAppMetricaAppIds(context.bundle).length > 0 ? [] : [context.bundle.project.displayName]
  );
  if (pipelineMetadataUnavailableProjects.length > 0) {
    notes.push(
      `Pipeline load metadata is unavailable for projects without configured AppMetrica app IDs, so pipeline install/event columns default to 0 for: ${pipelineMetadataUnavailableProjects.join(", ")}.`
    );
  }

  const settled = await Promise.allSettled(
    contextEntries.map(async (context) => {
      const artifacts = await loadProjectArtifacts(context);
      const params = [
        { name: "date_from", type: "DATE" as const, value: filters.from },
        { name: "date_to", type: "DATE" as const, value: filters.to },
        { name: "platform", type: "STRING" as const, value: filters.platform },
      ];
      const [dailyRows, installsBreakdownRows, eventsBreakdownRows, identityRows] = await Promise.all([
        executeBigQuery<DailyQueryRow>(context, buildDailySql(context, artifacts), params),
        (() => {
          const sql = buildInstallBreakdownSql(context, artifacts, installsBreakdownDimension);
          return sql ? executeBigQuery<BreakdownQueryRow>(context, sql, params) : Promise.resolve([]);
        })(),
        (() => {
          const sql = buildEventBreakdownSql(context, artifacts, eventsBreakdownDimension);
          return sql ? executeBigQuery<BreakdownQueryRow>(context, sql, params) : Promise.resolve([]);
        })(),
        executeBigQuery<IdentityQueryRow>(context, buildIdentitySql(context, artifacts), params),
      ]);

      const normalizedDailyRows = dailyRows.map((row) => ({
        projectId: context.bundle.project.id,
        projectName: context.bundle.project.displayName,
        projectSlug: context.bundle.project.slug,
        date: row.date,
        pipelineInstallRows: Number(row.pipeline_install_rows ?? 0),
        rawInstallRows: Number(row.raw_install_rows ?? 0),
        stgInstallRows: Number(row.stg_install_rows ?? 0),
        martInstallRows: artifacts.martInstallsTable ? Number(row.mart_install_rows ?? 0) : null,
        pipelineEventRows: Number(row.pipeline_event_rows ?? 0),
        rawEventRows: Number(row.raw_event_rows ?? 0),
        stgEventRows: Number(row.stg_event_rows ?? 0),
      })) satisfies DataQualityDailyRow[];

      return {
        projectSummary: summarizeProject(context, normalizedDailyRows, artifacts),
        dailyRows: normalizedDailyRows,
        installsBreakdownRows: installsBreakdownRows.map((row) => ({
          projectId: context.bundle.project.id,
          projectName: context.bundle.project.displayName,
          projectSlug: context.bundle.project.slug,
          dimensionValue: row.dimension_value,
          rawRows: Number(row.raw_rows ?? 0),
          stageRows: Number(row.stage_rows ?? 0),
          martRows: artifacts.martInstallsTable && row.mart_rows !== null ? Number(row.mart_rows ?? 0) : null,
        })) satisfies DataQualityBreakdownRow[],
        eventsBreakdownRows: eventsBreakdownRows.map((row) => ({
          projectId: context.bundle.project.id,
          projectName: context.bundle.project.displayName,
          projectSlug: context.bundle.project.slug,
          dimensionValue: row.dimension_value,
          rawRows: Number(row.raw_rows ?? 0),
          stageRows: Number(row.stage_rows ?? 0),
          martRows: null,
        })) satisfies DataQualityBreakdownRow[],
        identitySummary: normalizeIdentitySummary(
          context,
          identityRows[0] ?? {
            raw_install_rows: 0,
            raw_install_missing_device_rows: 0,
            raw_install_missing_user_rows: 0,
            raw_install_missing_both_rows: 0,
            raw_install_device_ids: 0,
            stage_install_device_ids: artifacts.stgInstallsTable ? 0 : null,
            overlap_install_device_ids: artifacts.stgInstallsTable ? 0 : null,
            raw_install_user_ids: 0,
            stage_install_user_ids: artifacts.stgInstallsTable ? 0 : null,
            overlap_install_user_ids: artifacts.stgInstallsTable ? 0 : null,
            raw_install_fingerprints: 0,
            stage_install_fingerprints: artifacts.stgInstallsTable ? 0 : null,
            overlap_install_fingerprints: artifacts.stgInstallsTable ? 0 : null,
            raw_session_rows: 0,
            raw_session_missing_session_rows: 0,
            raw_session_missing_device_rows: 0,
            raw_session_missing_user_rows: 0,
            raw_session_missing_both_rows: 0,
            raw_session_ids: 0,
            stage_session_ids: artifacts.stgSessionsTable ? 0 : null,
            overlap_session_ids: artifacts.stgSessionsTable ? 0 : null,
            raw_session_device_ids: 0,
            stage_session_device_ids: artifacts.stgSessionsTable ? 0 : null,
            overlap_session_device_ids: artifacts.stgSessionsTable ? 0 : null,
            raw_session_user_ids: 0,
            stage_session_user_ids: artifacts.stgSessionsTable ? 0 : null,
            overlap_session_user_ids: artifacts.stgSessionsTable ? 0 : null,
            raw_session_fingerprints: 0,
            stage_session_fingerprints: artifacts.stgSessionsTable ? 0 : null,
            overlap_session_fingerprints: artifacts.stgSessionsTable ? 0 : null,
          }
        ),
      };
    })
  );

  const fulfilled = settled.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));
  const failedProjectNames = settled.flatMap((entry, index) =>
    entry.status === "rejected" ? [contextEntries[index]?.bundle.project.displayName ?? "Unknown project"] : []
  );

  if (failedProjectNames.length > 0) {
    notes.push(
      `Some projects were omitted because one or more reconciliation queries failed: ${failedProjectNames.join(", ")}.`
    );
  }

  return {
    projectSummaries: fulfilled
      .map((entry) => entry.projectSummary)
      .sort((left, right) => left.projectName.localeCompare(right.projectName)),
    dailyRows: fulfilled
      .flatMap((entry) => entry.dailyRows)
      .sort((left, right) =>
        left.date === right.date
          ? left.projectName.localeCompare(right.projectName)
          : right.date.localeCompare(left.date)
      ),
    installsBreakdownRows: fulfilled
      .flatMap((entry) => entry.installsBreakdownRows)
      .sort((left, right) =>
        left.projectName === right.projectName
          ? right.stageRows - left.stageRows || right.rawRows - left.rawRows
          : left.projectName.localeCompare(right.projectName)
      ),
    eventsBreakdownRows: fulfilled
      .flatMap((entry) => entry.eventsBreakdownRows)
      .sort((left, right) =>
        left.projectName === right.projectName
          ? right.stageRows - left.stageRows || right.rawRows - left.rawRows
          : left.projectName.localeCompare(right.projectName)
      ),
    identitySummaries: fulfilled
      .map((entry) => entry.identitySummary)
      .sort((left, right) => left.projectName.localeCompare(right.projectName)),
    installsBreakdownDimension,
    eventsBreakdownDimension,
    resolvedContextCount: contextEntries.length,
    failedProjectNames,
    notes,
  };
}
