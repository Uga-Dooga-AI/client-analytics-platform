"use server";

import "server-only";

import { createSign } from "crypto";
import { getPostgresPool } from "@/lib/db/postgres";
import { decryptSecret } from "@/lib/platform/secrets";
import type { AnalyticsProjectBundle, AnalyticsSourceRecord } from "@/lib/platform/store";

type BigQuerySourceConfig = {
  sourceProjectId: string;
  sourceDataset: string;
};

type BigQueryServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type BigQueryQueryParam = {
  name: string;
  type: "STRING" | "INT64" | "FLOAT64" | "BOOL" | "DATE";
  value: string | number | boolean | null;
};

type BigQueryField = {
  name: string;
  type: string;
  mode?: string;
  fields?: BigQueryField[];
};

type BigQueryQueryResponse = {
  jobComplete?: boolean;
  pageToken?: string;
  rows?: Array<{ f?: Array<{ v?: unknown }> }>;
  schema?: { fields?: BigQueryField[] };
  jobReference?: { projectId?: string; jobId?: string; location?: string };
};

export type ProjectQueryContext = {
  bundle: AnalyticsProjectBundle;
  serviceAccount: BigQueryServiceAccount;
  warehouseProjectId: string;
  location: string;
  rawEventsTable: string;
  rawInstallsTable: string;
  rawSessionsTable: string;
};

export type LiveOverviewProjectMetric = {
  projectId: string;
  projectName: string;
  projectSlug: string;
  installs: number;
  activeDevices: number;
  revenue: number;
  spend: number;
  lastInstallDate: string | null;
  lastSessionDate: string | null;
  lastRevenueDate: string | null;
  lastSpendDate: string | null;
};

type MirrorSchemaRow = {
  table_name: string | null;
  column_name: string | null;
};

const MIRROR_DATE_COLUMN_CANDIDATES = ["date", "run_date", "segments_date", "day"];
const MIRROR_SPEND_COLUMN_CANDIDATES = ["spend", "cost", "cost_micros", "amount_micros"];

export type LiveTrackerRow = {
  projectId: string;
  projectName: string;
  installDate: string;
  trackerName: string;
  installs: number;
};

export type LiveCohortRow = {
  projectId: string;
  projectName: string;
  cohortDate: string;
  installs: number;
  firstSession: number;
  retainedD1: number;
  retainedD7: number;
  installToFirstSessionRate: number;
  d1RetentionRate: number;
  d7RetentionRate: number;
};

export type LiveFunnelRow = {
  projectId: string;
  projectName: string;
  eventName: string;
  eventCount: number;
  users: number;
  latestDate: string | null;
};

const OAUTH_SCOPE = "https://www.googleapis.com/auth/bigquery https://www.googleapis.com/auth/cloud-platform";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
const TOKEN_CACHE = new Map<string, { token: string; expiresAtMs: number }>();
const DEFAULT_BQ_LOCATION = "US";

function projectTablePrefix(slug: string) {
  return slug.replace(/-/g, "_");
}

function quoteSqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeWindow(window?: { from?: string | null; to?: string | null }) {
  const fallbackTo = new Date().toISOString().slice(0, 10);
  const fallbackFrom = fallbackTo;
  const rawFrom = isIsoDate(window?.from) ? window!.from : fallbackFrom;
  const rawTo = isIsoDate(window?.to) ? window!.to : fallbackTo;

  return rawFrom <= rawTo
    ? { from: rawFrom, to: rawTo }
    : { from: rawTo, to: rawFrom };
}

function inferWarehouseLocation(region: string | null | undefined) {
  // Cloud Run region and BigQuery dataset location are not equivalent in prod.
  // The current warehouse is provisioned in US even when workers run in europe-* regions.
  void region;
  return DEFAULT_BQ_LOCATION;
}

function decodeBigQueryValue(field: BigQueryField, raw: unknown): unknown {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (field.mode === "REPEATED") {
    const values = Array.isArray(raw) ? raw : [];
    return values.map((entry) => decodeBigQueryValue({ ...field, mode: "NULLABLE" }, entry));
  }

  if (field.type === "RECORD" && field.fields) {
    const cells = Array.isArray((raw as { f?: Array<{ v?: unknown }> }).f)
      ? (raw as { f: Array<{ v?: unknown }> }).f
      : [];
    return Object.fromEntries(
      field.fields.map((child, index) => [child.name, decodeBigQueryValue(child, cells[index]?.v)])
    );
  }

  if (typeof raw !== "string") {
    return raw;
  }

  switch (field.type) {
    case "INTEGER":
    case "INT64":
    case "FLOAT":
    case "FLOAT64":
    case "NUMERIC":
    case "BIGNUMERIC":
      return Number(raw);
    case "BOOLEAN":
    case "BOOL":
      return raw === "true";
    default:
      return raw;
  }
}

export async function getAccessToken(serviceAccount: BigQueryServiceAccount) {
  const cacheKey = serviceAccount.client_email;
  const cached = TOKEN_CACHE.get(cacheKey);
  if (cached && cached.expiresAtMs > Date.now() + 60_000) {
    return cached.token;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;
  const tokenUri = serviceAccount.token_uri || TOKEN_AUDIENCE;

  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claimSet = Buffer.from(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: OAUTH_SCOPE,
      aud: tokenUri,
      iat: issuedAt,
      exp: expiresAt,
    })
  ).toString("base64url");
  const unsigned = `${header}.${claimSet}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key, "base64url");
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Could not mint Google access token: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new Error("Google access token response did not include access_token.");
  }

  TOKEN_CACHE.set(cacheKey, {
    token: payload.access_token,
    expiresAtMs: Date.now() + Math.max(300, payload.expires_in ?? 3600) * 1000,
  });

  return payload.access_token;
}

export async function executeBigQuery<T extends Record<string, unknown>>(
  context: ProjectQueryContext,
  sql: string,
  params: BigQueryQueryParam[] = []
): Promise<T[]> {
  const token = await getAccessToken(context.serviceAccount);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-goog-user-project": context.warehouseProjectId,
  };

  const body = {
    query: sql,
    useLegacySql: false,
    parameterMode: params.length > 0 ? "NAMED" : undefined,
    queryParameters: params.map((param) => ({
      name: param.name,
      parameterType: { type: param.type },
      parameterValue: param.value === null ? {} : { value: String(param.value) },
    })),
    location: context.location,
    timeoutMs: 10_000,
    maxResults: 10_000,
  };

  const initialResponse = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${context.warehouseProjectId}/queries`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );

  if (!initialResponse.ok) {
    throw new Error(`BigQuery query failed: ${initialResponse.status} ${await initialResponse.text()}`);
  }

  let payload = (await initialResponse.json()) as BigQueryQueryResponse;
  let schema = payload.schema?.fields ?? [];
  let rows = payload.rows ?? [];
  const jobReference = payload.jobReference;

  while (!payload.jobComplete && jobReference?.jobId) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const pollResponse = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${jobReference.projectId}/queries/${jobReference.jobId}?location=${encodeURIComponent(jobReference.location || context.location)}&maxResults=10000`,
      {
        headers,
        cache: "no-store",
      }
    );

    if (!pollResponse.ok) {
      throw new Error(`BigQuery polling failed: ${pollResponse.status} ${await pollResponse.text()}`);
    }

    payload = (await pollResponse.json()) as BigQueryQueryResponse;
    schema = payload.schema?.fields ?? schema;
    rows = payload.rows ?? rows;
  }

  let pageToken = payload.pageToken;
  while (pageToken && jobReference?.jobId) {
    const pageResponse = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${jobReference.projectId}/queries/${jobReference.jobId}?location=${encodeURIComponent(jobReference.location || context.location)}&maxResults=10000&pageToken=${encodeURIComponent(pageToken)}`,
      {
        headers,
        cache: "no-store",
      }
    );

    if (!pageResponse.ok) {
      throw new Error(`BigQuery pagination failed: ${pageResponse.status} ${await pageResponse.text()}`);
    }

    const pagePayload = (await pageResponse.json()) as BigQueryQueryResponse;
    rows.push(...(pagePayload.rows ?? []));
    pageToken = pagePayload.pageToken;
  }

  return rows.map((row) => {
    const cells = row.f ?? [];
    return Object.fromEntries(
      schema.map((field, index) => [field.name, decodeBigQueryValue(field, cells[index]?.v)])
    ) as T;
  });
}

export async function loadBigQueryContexts(
  bundles: AnalyticsProjectBundle[]
): Promise<Map<string, ProjectQueryContext>> {
  if (bundles.length === 0) {
    return new Map();
  }

  const pool = getPostgresPool();
  if (!pool) {
    return new Map();
  }

  const result = await pool.query<{
    project_id: string;
    secret_ciphertext: string | null;
  }>(
    `
      SELECT project_id, secret_ciphertext
      FROM analytics_project_sources
      WHERE project_id = ANY($1::text[])
        AND source_type = 'bigquery_export'
    `,
    [bundles.map((bundle) => bundle.project.id)]
  );

  const byProjectId = new Map(result.rows.map((row) => [row.project_id, row.secret_ciphertext]));
  const contexts = new Map<string, ProjectQueryContext>();

  for (const bundle of bundles) {
    const ciphertext = byProjectId.get(bundle.project.id);
    if (!ciphertext || !bundle.project.gcpProjectId) {
      continue;
    }

    const secret = decryptSecret(ciphertext);
    if (!secret) {
      continue;
    }

    const parsed = JSON.parse(secret) as Partial<BigQueryServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) {
      continue;
    }

    const prefix = projectTablePrefix(bundle.project.slug);
    contexts.set(bundle.project.id, {
      bundle,
      serviceAccount: {
        client_email: parsed.client_email,
        private_key: parsed.private_key,
        token_uri: parsed.token_uri,
      },
      warehouseProjectId: bundle.project.gcpProjectId,
      location: inferWarehouseLocation(bundle.project.settings.provisioningRegion),
      rawEventsTable: `${prefix}_appmetrica_events`,
      rawInstallsTable: `${prefix}_appmetrica_installs`,
      rawSessionsTable: `${prefix}_appmetrica_sessions`,
    });
  }

  return contexts;
}

export async function getLiveOverviewMetrics(
  bundles: AnalyticsProjectBundle[],
  window?: { from?: string | null; to?: string | null }
) {
  const contexts = await loadBigQueryContexts(bundles);
  const normalizedWindow = normalizeWindow(window);
  const settled = await Promise.allSettled(
    Array.from(contexts.values()).map(async (context) => {
      const spendPromise = loadLiveOverviewSpendMetric(
        context,
        normalizedWindow.from,
        normalizedWindow.to
      );
      const rows = await executeBigQuery<{
        installs: number | null;
        active_devices: number | null;
        revenue: number | null;
        last_install_date: string | null;
        last_session_date: string | null;
        last_revenue_date: string | null;
      }>(
        context,
        `
          WITH install_window AS (
            SELECT
              COUNT(DISTINCT CAST(appmetrica_device_id AS STRING)) AS installs
            FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawInstallsTable}\`
            WHERE _PARTITIONDATE
              BETWEEN @window_from
                  AND @window_to
              AND DATE(SAFE_CAST(install_datetime AS TIMESTAMP))
              BETWEEN @window_from
                  AND @window_to
          ),
          install_latest AS (
            SELECT
              CAST(MAX(DATE(SAFE_CAST(install_datetime AS TIMESTAMP))) AS STRING) AS last_install_date
            FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawInstallsTable}\`
          ),
          session_window AS (
            SELECT
              COUNT(DISTINCT CAST(appmetrica_device_id AS STRING)) AS active_devices
            FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawSessionsTable}\`
            WHERE _PARTITIONDATE
              BETWEEN @window_from
                  AND @window_to
              AND DATE(SAFE_CAST(session_start_datetime AS TIMESTAMP))
              BETWEEN @window_from
                  AND @window_to
          ),
          session_latest AS (
            SELECT
              CAST(MAX(DATE(SAFE_CAST(session_start_datetime AS TIMESTAMP))) AS STRING) AS last_session_date
            FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawSessionsTable}\`
          ),
          revenue_window AS (
            SELECT
              ROUND(SUM(revenue_value), 2) AS revenue
            FROM (
              SELECT
                COALESCE(
                  SAFE_CAST(JSON_VALUE(event_json, '$.price') AS FLOAT64),
                  SAFE_CAST(JSON_VALUE(event_json, '$.revenue') AS FLOAT64),
                  SAFE_CAST(JSON_VALUE(event_json, '$.value') AS FLOAT64),
                  0
                ) AS revenue_value
              FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawEventsTable}\`
              WHERE _PARTITIONDATE
                BETWEEN @window_from
                    AND @window_to
                AND DATE(SAFE_CAST(event_datetime AS TIMESTAMP))
                BETWEEN @window_from
                    AND @window_to
                AND event_name IN ('c_ad_revenue', 'purchase', 'in_app_purchase', 'subscription_start')
            )
          ),
          revenue_latest AS (
            SELECT
              CAST(MAX(DATE(SAFE_CAST(event_datetime AS TIMESTAMP))) AS STRING) AS last_revenue_date
            FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawEventsTable}\`
            WHERE event_name IN ('c_ad_revenue', 'purchase', 'in_app_purchase', 'subscription_start')
          )
          SELECT
            install_window.installs,
            session_window.active_devices,
            revenue_window.revenue,
            install_latest.last_install_date,
            session_latest.last_session_date,
            revenue_latest.last_revenue_date
          FROM install_window
          CROSS JOIN session_window
          CROSS JOIN revenue_window
          CROSS JOIN install_latest
          CROSS JOIN session_latest
          CROSS JOIN revenue_latest
        `,
        [
          { name: "window_from", type: "DATE", value: normalizedWindow.from },
          { name: "window_to", type: "DATE", value: normalizedWindow.to },
        ]
      );
      const spendMetric = await spendPromise;

      const row = rows[0];
      return {
        projectId: context.bundle.project.id,
        projectName: context.bundle.project.displayName,
        projectSlug: context.bundle.project.slug,
        installs: Number(row?.installs ?? 0),
        activeDevices: Number(row?.active_devices ?? 0),
        revenue: Number(row?.revenue ?? 0),
        spend: spendMetric.spend,
        lastInstallDate: row?.last_install_date ?? null,
        lastSessionDate: row?.last_session_date ?? null,
        lastRevenueDate: row?.last_revenue_date ?? null,
        lastSpendDate: spendMetric.lastSpendDate,
      } satisfies LiveOverviewProjectMetric;
    })
  );

  return settled.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));
}

async function loadLiveOverviewSpendMetric(
  context: ProjectQueryContext,
  from: string,
  to: string
) {
  const mirrorSources = context.bundle.sources.filter(
    (source) =>
      (source.sourceType === "unity_ads_spend" || source.sourceType === "google_ads_spend") &&
      source.config.enabled === true &&
      source.config.mode === "bigquery"
  );

  if (mirrorSources.length === 0) {
    return { spend: 0, lastSpendDate: null };
  }

  const settled = await Promise.allSettled(
    mirrorSources.map((source) => queryOverviewSpendSource(context, source, from, to))
  );

  let spend = 0;
  const lastSpendDates: string[] = [];

  for (const entry of settled) {
    if (entry.status !== "fulfilled") {
      continue;
    }
    spend += entry.value.spend;
    if (entry.value.lastSpendDate) {
      lastSpendDates.push(entry.value.lastSpendDate);
    }
  }

  return {
    spend: Number(spend.toFixed(2)),
    lastSpendDate: lastSpendDates.sort().at(-1) ?? null,
  };
}

async function queryOverviewSpendSource(
  context: ProjectQueryContext,
  source: AnalyticsSourceRecord,
  from: string,
  to: string
) {
  const sourceProjectId =
    typeof source.config.sourceProjectId === "string" ? source.config.sourceProjectId : "";
  const sourceDataset =
    typeof source.config.sourceDataset === "string" ? source.config.sourceDataset : "";
  const tablePattern =
    typeof source.config.tablePattern === "string" ? source.config.tablePattern : "";

  if (!sourceProjectId || !sourceDataset || !tablePattern) {
    return { spend: 0, lastSpendDate: null };
  }

  const rows = await executeBigQuery<MirrorSchemaRow>(
    context,
    `
      SELECT
        table_name,
        LOWER(column_name) AS column_name
      FROM \`${sourceProjectId}.${sourceDataset}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name LIKE @table_pattern
    `,
    [{ name: "table_pattern", type: "STRING", value: tablePattern.replace(/\*/g, "%") }]
  );

  const columnsByTable = rows.reduce<Map<string, Set<string>>>((acc, row) => {
    const tableName = row.table_name?.trim();
    const columnName = row.column_name?.trim().toLowerCase();
    if (!tableName || !columnName) {
      return acc;
    }
    const current = acc.get(tableName) ?? new Set<string>();
    current.add(columnName);
    acc.set(tableName, current);
    return acc;
  }, new Map());

  const tableNames = selectMirrorTables(Array.from(columnsByTable.keys()), from, to);
  if (tableNames.length === 0) {
    return { spend: 0, lastSpendDate: null };
  }

  const selects = tableNames.flatMap((tableName) => {
    const columns = columnsByTable.get(tableName) ?? new Set<string>();
    const spendColumn = firstExistingCandidate(columns, MIRROR_SPEND_COLUMN_CANDIDATES);
    if (!spendColumn) {
      return [];
    }

    const dateColumn = firstExistingCandidate(columns, MIRROR_DATE_COLUMN_CANDIDATES);
    const parsedTableDate = toIsoDateFromKey(parseMirrorTableDate(tableName));
    const tableRef = `\`${sourceProjectId}.${sourceDataset}.${sanitizeTableIdentifier(tableName)}\``;
    const spendDateExpr = dateColumn
      ? `CAST(SAFE_CAST(${dateColumn} AS DATE) AS STRING)`
      : parsedTableDate
        ? `'${parsedTableDate}'`
        : "CAST(NULL AS STRING)";
    const spendExpr =
      spendColumn.includes("micros")
        ? `SAFE_CAST(${spendColumn} AS FLOAT64) / 1000000`
        : `SAFE_CAST(${spendColumn} AS FLOAT64)`;

    return [
      `
        SELECT
          ${spendDateExpr} AS spend_date,
          SUM(COALESCE(${spendExpr}, 0)) AS spend
        FROM ${tableRef}
        WHERE (${spendDateExpr}) BETWEEN CAST(@window_from AS STRING) AND CAST(@window_to AS STRING)
        GROUP BY 1
      `,
    ];
  });

  if (selects.length === 0) {
    return { spend: 0, lastSpendDate: null };
  }

  const result = await executeBigQuery<{ spend: number | null; last_spend_date: string | null }>(
    context,
    `
      WITH raw_spend AS (
        ${selects.join("\nUNION ALL\n")}
      )
      SELECT
        ROUND(SUM(spend), 2) AS spend,
        CAST(MAX(spend_date) AS STRING) AS last_spend_date
      FROM raw_spend
      WHERE spend_date IS NOT NULL
    `,
    [
      { name: "window_from", type: "DATE", value: from },
      { name: "window_to", type: "DATE", value: to },
    ]
  );

  const row = result[0];
  return {
    spend: Number(row?.spend ?? 0),
    lastSpendDate: row?.last_spend_date ?? null,
  };
}

export async function getLiveTrackerRows(bundles: AnalyticsProjectBundle[]) {
  const contexts = await loadBigQueryContexts(bundles);
  const settled = await Promise.allSettled(
    Array.from(contexts.values()).map(async (context) => {
      const rows = await executeBigQuery<{
        install_date: string;
        tracker_name: string | null;
        installs: number | null;
      }>(
        context,
        `
          WITH install_anchor AS (
            SELECT
              COALESCE(MAX(_PARTITIONDATE), CURRENT_DATE()) AS max_install_partition,
              COALESCE(MAX(DATE(SAFE_CAST(install_datetime AS TIMESTAMP))), CURRENT_DATE()) AS max_install_date
            FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawInstallsTable}\`
          )
          SELECT
            CAST(DATE(SAFE_CAST(install_datetime AS TIMESTAMP)) AS STRING) AS install_date,
            COALESCE(NULLIF(tracker_name, ''), 'organic') AS tracker_name,
            COUNT(DISTINCT CAST(appmetrica_device_id AS STRING)) AS installs
          FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawInstallsTable}\`
          CROSS JOIN install_anchor
          WHERE _PARTITIONDATE
            BETWEEN DATE_SUB(install_anchor.max_install_partition, INTERVAL 13 DAY)
                AND install_anchor.max_install_partition
            AND DATE(SAFE_CAST(install_datetime AS TIMESTAMP))
            BETWEEN DATE_SUB(install_anchor.max_install_date, INTERVAL 13 DAY)
                AND install_anchor.max_install_date
          GROUP BY 1, 2
          ORDER BY install_date DESC, installs DESC
        `
      );

      return rows.map((row) => ({
        projectId: context.bundle.project.id,
        projectName: context.bundle.project.displayName,
        installDate: row.install_date,
        trackerName: row.tracker_name ?? "organic",
        installs: Number(row.installs ?? 0),
      })) satisfies LiveTrackerRow[];
    })
  );

  return settled.flatMap((entry) => (entry.status === "fulfilled" ? entry.value : []));
}

export async function getLiveCohortRows(bundles: AnalyticsProjectBundle[]) {
  const contexts = await loadBigQueryContexts(bundles);
  const settled = await Promise.allSettled(
    Array.from(contexts.values()).map(async (context) => {
      const rows = await executeBigQuery<{
        cohort_date: string;
        installs: number | null;
        first_session: number | null;
        retained_d1: number | null;
        retained_d7: number | null;
        install_to_first_session_rate: number | null;
        d1_retention_rate: number | null;
        d7_retention_rate: number | null;
      }>(
        context,
        `
          WITH install_anchor AS (
            SELECT
              COALESCE(MAX(_PARTITIONDATE), CURRENT_DATE()) AS max_install_partition,
              COALESCE(MAX(DATE(SAFE_CAST(install_datetime AS TIMESTAMP))), CURRENT_DATE()) AS max_install_date
            FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawInstallsTable}\`
          ),
          installs AS (
            SELECT DISTINCT
              CAST(appmetrica_device_id AS STRING) AS device_id,
              DATE(SAFE_CAST(install_datetime AS TIMESTAMP)) AS install_date
            FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawInstallsTable}\`
            CROSS JOIN install_anchor
            WHERE _PARTITIONDATE
              BETWEEN DATE_SUB(install_anchor.max_install_partition, INTERVAL 21 DAY)
                  AND install_anchor.max_install_partition
              AND DATE(SAFE_CAST(install_datetime AS TIMESTAMP))
              BETWEEN DATE_SUB(install_anchor.max_install_date, INTERVAL 21 DAY)
                  AND install_anchor.max_install_date
          ),
          first_sessions AS (
            SELECT
              i.device_id,
              MIN(DATE(SAFE_CAST(session_start_datetime AS TIMESTAMP))) AS first_session_date
            FROM installs i
            CROSS JOIN install_anchor
            LEFT JOIN \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawSessionsTable}\`
              ON CAST(appmetrica_device_id AS STRING) = i.device_id
             AND _PARTITIONDATE
               BETWEEN DATE_SUB(install_anchor.max_install_partition, INTERVAL 21 DAY)
                   AND DATE_ADD(install_anchor.max_install_partition, INTERVAL 1 DAY)
             AND DATE(SAFE_CAST(session_start_datetime AS TIMESTAMP))
               BETWEEN i.install_date AND DATE_ADD(i.install_date, INTERVAL 1 DAY)
            GROUP BY 1
          ),
          daily_activity AS (
            SELECT DISTINCT
              CAST(appmetrica_device_id AS STRING) AS device_id,
              DATE(SAFE_CAST(session_start_datetime AS TIMESTAMP)) AS session_date
            FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawSessionsTable}\`
            CROSS JOIN install_anchor
            WHERE _PARTITIONDATE
              BETWEEN DATE_SUB(install_anchor.max_install_partition, INTERVAL 28 DAY)
                  AND DATE_ADD(install_anchor.max_install_partition, INTERVAL 7 DAY)
              AND DATE(SAFE_CAST(session_start_datetime AS TIMESTAMP))
              BETWEEN DATE_SUB(install_anchor.max_install_date, INTERVAL 28 DAY)
                  AND DATE_ADD(install_anchor.max_install_date, INTERVAL 7 DAY)
          )
          SELECT
            CAST(i.install_date AS STRING) AS cohort_date,
            COUNT(DISTINCT i.device_id) AS installs,
            COUNT(DISTINCT CASE
              WHEN fs.first_session_date BETWEEN i.install_date AND DATE_ADD(i.install_date, INTERVAL 1 DAY)
              THEN i.device_id
            END) AS first_session,
            COUNT(DISTINCT CASE
              WHEN da_d1.session_date = DATE_ADD(i.install_date, INTERVAL 1 DAY)
              THEN i.device_id
            END) AS retained_d1,
            COUNT(DISTINCT CASE
              WHEN da_d7.session_date = DATE_ADD(i.install_date, INTERVAL 7 DAY)
              THEN i.device_id
            END) AS retained_d7,
            SAFE_DIVIDE(
              COUNT(DISTINCT CASE
                WHEN fs.first_session_date BETWEEN i.install_date AND DATE_ADD(i.install_date, INTERVAL 1 DAY)
                THEN i.device_id
              END),
              COUNT(DISTINCT i.device_id)
            ) AS install_to_first_session_rate,
            SAFE_DIVIDE(
              COUNT(DISTINCT CASE
                WHEN da_d1.session_date = DATE_ADD(i.install_date, INTERVAL 1 DAY)
                THEN i.device_id
              END),
              COUNT(DISTINCT i.device_id)
            ) AS d1_retention_rate,
            SAFE_DIVIDE(
              COUNT(DISTINCT CASE
                WHEN da_d7.session_date = DATE_ADD(i.install_date, INTERVAL 7 DAY)
                THEN i.device_id
              END),
              COUNT(DISTINCT i.device_id)
            ) AS d7_retention_rate
          FROM installs i
          LEFT JOIN first_sessions fs ON fs.device_id = i.device_id
          LEFT JOIN daily_activity da_d1
            ON da_d1.device_id = i.device_id
           AND da_d1.session_date = DATE_ADD(i.install_date, INTERVAL 1 DAY)
          LEFT JOIN daily_activity da_d7
            ON da_d7.device_id = i.device_id
           AND da_d7.session_date = DATE_ADD(i.install_date, INTERVAL 7 DAY)
          GROUP BY 1
          ORDER BY cohort_date DESC
          LIMIT 10
        `
      );

      return rows.map((row) => ({
        projectId: context.bundle.project.id,
        projectName: context.bundle.project.displayName,
        cohortDate: row.cohort_date,
        installs: Number(row.installs ?? 0),
        firstSession: Number(row.first_session ?? 0),
        retainedD1: Number(row.retained_d1 ?? 0),
        retainedD7: Number(row.retained_d7 ?? 0),
        installToFirstSessionRate: Number(row.install_to_first_session_rate ?? 0),
        d1RetentionRate: Number(row.d1_retention_rate ?? 0),
        d7RetentionRate: Number(row.d7_retention_rate ?? 0),
      })) satisfies LiveCohortRow[];
    })
  );

  return settled.flatMap((entry) => (entry.status === "fulfilled" ? entry.value : []));
}

export async function getLiveFunnelRows(bundles: AnalyticsProjectBundle[]) {
  const contexts = await loadBigQueryContexts(bundles);
  const settled = await Promise.allSettled(
    Array.from(contexts.values()).map(async (context) => {
      const appmetricaSource = context.bundle.sources.find((source) => source.sourceType === "appmetrica_logs");
      const eventNames = Array.isArray(appmetricaSource?.config.eventNames)
        ? appmetricaSource.config.eventNames.filter((value): value is string => typeof value === "string" && value.length > 0)
        : [];
      if (eventNames.length === 0) {
        return [] as LiveFunnelRow[];
      }

      const rows = await executeBigQuery<{
        event_name: string;
        event_count: number | null;
        users: number | null;
        latest_date: string | null;
      }>(
        context,
        `
          WITH event_anchor AS (
            SELECT
              COALESCE(MAX(_PARTITIONDATE), CURRENT_DATE()) AS max_event_partition,
              COALESCE(MAX(DATE(SAFE_CAST(event_datetime AS TIMESTAMP))), CURRENT_DATE()) AS max_event_date
            FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawEventsTable}\`
            WHERE event_name IN (${eventNames.map(quoteSqlString).join(", ")})
          )
          SELECT
            event_name,
            COUNT(*) AS event_count,
            COUNT(DISTINCT CAST(appmetrica_device_id AS STRING)) AS users,
            CAST(MAX(DATE(SAFE_CAST(event_datetime AS TIMESTAMP))) AS STRING) AS latest_date
          FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawEventsTable}\`
          CROSS JOIN event_anchor
          WHERE _PARTITIONDATE
            BETWEEN DATE_SUB(event_anchor.max_event_partition, INTERVAL 6 DAY)
                AND event_anchor.max_event_partition
            AND DATE(SAFE_CAST(event_datetime AS TIMESTAMP))
            BETWEEN DATE_SUB(event_anchor.max_event_date, INTERVAL 6 DAY)
                AND event_anchor.max_event_date
            AND event_name IN (${eventNames.map(quoteSqlString).join(", ")})
          GROUP BY 1
        `
      );

      return rows.map((row) => ({
        projectId: context.bundle.project.id,
        projectName: context.bundle.project.displayName,
        eventName: row.event_name,
        eventCount: Number(row.event_count ?? 0),
        users: Number(row.users ?? 0),
        latestDate: row.latest_date ?? null,
      })) satisfies LiveFunnelRow[];
    })
  );

  return settled.flatMap((entry) => (entry.status === "fulfilled" ? entry.value : []));
}

function firstExistingCandidate(columns: Set<string>, candidates: string[]) {
  return candidates.find((candidate) => columns.has(candidate)) ?? null;
}

function sanitizeTableIdentifier(value: string) {
  return value.replace(/[^a-zA-Z0-9_]/g, "");
}

function parseMirrorTableDate(tableName: string) {
  const match = tableName.match(/(\d{8})$/);
  return match ? match[1] : null;
}

function toIsoDateFromKey(dateKey: string | null) {
  if (!dateKey || !/^\d{8}$/.test(dateKey)) {
    return null;
  }
  return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
}

function selectMirrorTables(tableNames: string[], from: string, to: string) {
  const fromKey = from.replace(/-/g, "");
  const toKey = to.replace(/-/g, "");
  const datedTables = tableNames
    .map((tableName) => ({
      tableName,
      dateKey: parseMirrorTableDate(tableName),
    }))
    .filter((entry): entry is { tableName: string; dateKey: string } => Boolean(entry.dateKey))
    .filter((entry) => entry.dateKey >= fromKey && entry.dateKey <= toKey)
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));

  if (datedTables.length > 0) {
    return datedTables.map((entry) => entry.tableName);
  }

  return [...tableNames].sort((left, right) => left.localeCompare(right)).slice(-32);
}
