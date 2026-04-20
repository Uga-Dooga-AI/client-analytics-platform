import "server-only";

import {
  getAccessToken,
  loadBigQueryContexts,
  type ProjectQueryContext,
} from "@/lib/live-warehouse";
import { listAnalyticsProjects } from "@/lib/platform/store";

const DEFAULT_MONTHS = 7;
const DEFAULT_BIGQUERY_USD_PER_TIB = 5;
const MAX_MONTHS = 24;
const MAX_TOP_TABLES = 20;

type FootprintRow = {
  layer: string | null;
  dataset_name: string | null;
  table_name: string | null;
  row_count: number | null;
  logical_bytes: number | null;
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
  totalBytesBilled?: string;
  totalBytesProcessed?: string;
};

export type StorageFootprintLayerRow = {
  layer: string;
  rowCount: number;
  logicalBytes: number;
};

export type StorageFootprintProjectRow = {
  projectId: string;
  projectSlug: string;
  projectName: string;
  rowCount: number;
  logicalBytes: number;
};

export type StorageFootprintTableRow = {
  layer: string;
  datasetName: string;
  tableName: string;
  projectName: string;
  rowCount: number;
  logicalBytes: number;
};

export type StorageFootprintSnapshot = {
  generatedAt: string;
  window: {
    from: string;
    to: string;
    months: number;
  };
  query: {
    billedBytes: number;
    processedBytes: number;
    estimatedCostUsd: number;
  };
  totals: {
    rowCount: number;
    logicalBytes: number;
  };
  layers: StorageFootprintLayerRow[];
  projects: StorageFootprintProjectRow[];
  topTables: StorageFootprintTableRow[];
  warnings: string[];
};

type QueryExecutionResult = {
  rows: Array<Record<string, unknown>>;
  totalBytesBilled: number;
  totalBytesProcessed: number;
};

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampMonths(value?: number | null) {
  if (!Number.isFinite(value) || value == null) {
    return DEFAULT_MONTHS;
  }

  return Math.min(MAX_MONTHS, Math.max(1, Math.trunc(value)));
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function buildWindow(now: Date, months: number) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - months);
  return {
    from: toIsoDate(start),
    to: toIsoDate(end),
  };
}

function quoteSqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildPartitionSql(
  warehouseProjectId: string,
  datasetsByLayer: Map<string, string[]>,
  window: { from: string; to: string }
) {
  const parts: string[] = [];

  for (const [layer, datasets] of datasetsByLayer.entries()) {
    for (const dataset of datasets) {
      parts.push(`
        SELECT
          ${quoteSqlString(layer)} AS layer,
          ${quoteSqlString(dataset)} AS dataset_name,
          table_name,
          total_rows,
          total_logical_bytes
        FROM \`${warehouseProjectId}.${dataset}.INFORMATION_SCHEMA.PARTITIONS\`
        WHERE SAFE.PARSE_DATE('%Y%m%d', partition_id)
          BETWEEN DATE ${quoteSqlString(window.from)}
              AND DATE ${quoteSqlString(window.to)}
      `);
    }
  }

  return `
    WITH parts AS (
      ${parts.join("\nUNION ALL\n")}
    )
    SELECT
      layer,
      dataset_name,
      table_name,
      SUM(COALESCE(total_rows, 0)) AS row_count,
      SUM(COALESCE(total_logical_bytes, 0)) AS logical_bytes
    FROM parts
    GROUP BY 1, 2, 3
    HAVING row_count > 0 OR logical_bytes > 0
    ORDER BY logical_bytes DESC
  `;
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

async function executeMetadataQuery(
  context: ProjectQueryContext,
  sql: string
): Promise<QueryExecutionResult> {
  const token = await getAccessToken(context.serviceAccount);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-goog-user-project": context.warehouseProjectId,
  };

  const initialResponse = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${context.warehouseProjectId}/queries`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: sql,
        useLegacySql: false,
        location: context.location,
        timeoutMs: 10_000,
        maxResults: 10_000,
      }),
      cache: "no-store",
    }
  );

  if (!initialResponse.ok) {
    throw new Error(
      `BigQuery metadata query failed for warehouse ${context.warehouseProjectId}: ${initialResponse.status} ${await initialResponse.text()}`
    );
  }

  let payload = (await initialResponse.json()) as BigQueryQueryResponse;
  let schema = payload.schema?.fields ?? [];
  let rows = payload.rows ?? [];
  const jobReference = payload.jobReference;

  while (!payload.jobComplete && jobReference?.jobId) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const pollResponse = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${jobReference.projectId}/queries/${jobReference.jobId}?location=${encodeURIComponent(jobReference.location || context.location)}&maxResults=10000`,
      {
        headers,
        cache: "no-store",
      }
    );

    if (!pollResponse.ok) {
      throw new Error(
        `BigQuery metadata polling failed for warehouse ${context.warehouseProjectId}: ${pollResponse.status} ${await pollResponse.text()}`
      );
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
      throw new Error(
        `BigQuery metadata pagination failed for warehouse ${context.warehouseProjectId}: ${pageResponse.status} ${await pageResponse.text()}`
      );
    }

    const pagePayload = (await pageResponse.json()) as BigQueryQueryResponse;
    rows.push(...(pagePayload.rows ?? []));
    pageToken = pagePayload.pageToken;
  }

  return {
    rows: rows.map((row) => {
      const cells = row.f ?? [];
      return Object.fromEntries(
        schema.map((field, index) => [field.name, decodeBigQueryValue(field, cells[index]?.v)])
      );
    }),
    totalBytesBilled: Number(payload.totalBytesBilled ?? 0),
    totalBytesProcessed: Number(payload.totalBytesProcessed ?? 0),
  };
}

function projectTablePrefix(slug: string) {
  return slug.replace(/-/g, "_");
}

function estimateBigQueryCostUsd(bytesBilled: number, usdPerTib: number) {
  return (bytesBilled / 1024 ** 4) * usdPerTib;
}

export async function getStorageFootprintSnapshot(options?: {
  months?: number;
  now?: Date;
}): Promise<StorageFootprintSnapshot> {
  const bundles = await listAnalyticsProjects();
  const contexts = await loadBigQueryContexts(bundles);
  const months = clampMonths(options?.months);
  const now = options?.now ?? new Date();
  const window = buildWindow(now, months);
  const usdPerTib = envNumber(
    "ANALYTICS_EST_BIGQUERY_USD_PER_TIB",
    DEFAULT_BIGQUERY_USD_PER_TIB
  );

  const warehouseGroups = new Map<
    string,
    {
      context: ProjectQueryContext;
      bundles: typeof bundles;
      datasetsByLayer: Map<string, string[]>;
    }
  >();
  const warnings: string[] = [];

  for (const bundle of bundles) {
    const context = contexts.get(bundle.project.id);
    if (!context) {
      warnings.push(
        `BigQuery credentials are unavailable for ${bundle.project.displayName}, so it was excluded from the footprint snapshot.`
      );
      continue;
    }

    const existing = warehouseGroups.get(context.warehouseProjectId);
    if (!existing) {
      warehouseGroups.set(context.warehouseProjectId, {
        context,
        bundles: [bundle],
        datasetsByLayer: new Map([
          ["raw", [bundle.project.rawDataset]],
          ["stg", [bundle.project.stgDataset]],
          ["mart", [bundle.project.martDataset]],
        ]),
      });
      continue;
    }

    existing.bundles.push(bundle);
    for (const [layer, dataset] of [
      ["raw", bundle.project.rawDataset],
      ["stg", bundle.project.stgDataset],
      ["mart", bundle.project.martDataset],
    ] as const) {
      const current = existing.datasetsByLayer.get(layer) ?? [];
      if (!current.includes(dataset)) {
        current.push(dataset);
        existing.datasetsByLayer.set(layer, current);
      }
    }
  }

  const layers = new Map<string, StorageFootprintLayerRow>();
  const projects = new Map<string, StorageFootprintProjectRow>();
  const topTables: StorageFootprintTableRow[] = [];
  let totalRows = 0;
  let totalBytes = 0;
  let billedBytes = 0;
  let processedBytes = 0;

  const warehouseEntries = Array.from(warehouseGroups.values());
  const settled = await Promise.allSettled(
    warehouseEntries.map(async (entry) => {
      const sql = buildPartitionSql(entry.context.warehouseProjectId, entry.datasetsByLayer, window);
      const result = await executeMetadataQuery(entry.context, sql);
      return {
        entry,
        rows: result.rows as FootprintRow[],
        billedBytes: result.totalBytesBilled,
        processedBytes: result.totalBytesProcessed,
      };
    })
  );

  for (const result of settled) {
    if (result.status !== "fulfilled") {
      const message =
        result.reason instanceof Error ? result.reason.message : "Unknown metadata query error.";
      warnings.push(message);
      continue;
    }

    billedBytes += result.value.billedBytes;
    processedBytes += result.value.processedBytes;

    const matchers = result.value.entry.bundles
      .map((bundle) => ({
        id: bundle.project.id,
        slug: bundle.project.slug,
        name: bundle.project.displayName,
        prefix: projectTablePrefix(bundle.project.slug),
      }))
      .sort((left, right) => right.prefix.length - left.prefix.length);

    for (const row of result.value.rows) {
      const tableName = String(row.table_name ?? "");
      const layer = String(row.layer ?? "unknown");
      const datasetName = String(row.dataset_name ?? "");
      const rowCount = Number(row.row_count ?? 0);
      const logicalBytes = Number(row.logical_bytes ?? 0);
      totalRows += rowCount;
      totalBytes += logicalBytes;

      const layerAgg = layers.get(layer) ?? { layer, rowCount: 0, logicalBytes: 0 };
      layerAgg.rowCount += rowCount;
      layerAgg.logicalBytes += logicalBytes;
      layers.set(layer, layerAgg);

      const matched =
        matchers.find(
          (candidate) =>
            tableName === candidate.prefix || tableName.startsWith(`${candidate.prefix}_`)
        ) ?? null;

      if (!matched) {
        warnings.push(
          `Table ${datasetName}.${tableName} in warehouse ${result.value.entry.context.warehouseProjectId} could not be attributed to a registered project.`
        );
        continue;
      }

      const projectAgg = projects.get(matched.id) ?? {
        projectId: matched.id,
        projectSlug: matched.slug,
        projectName: matched.name,
        rowCount: 0,
        logicalBytes: 0,
      };
      projectAgg.rowCount += rowCount;
      projectAgg.logicalBytes += logicalBytes;
      projects.set(matched.id, projectAgg);

      topTables.push({
        layer,
        datasetName,
        tableName,
        projectName: matched.name,
        rowCount,
        logicalBytes,
      });
    }
  }

  if (warehouseGroups.size > 1) {
    warnings.push(
      `This footprint snapshot spans multiple warehouse projects: ${Array.from(warehouseGroups.keys()).sort().join(", ")}.`
    );
  }
  warnings.push(
    "The snapshot is metadata-only and windowed by partition date. Unpartitioned tables are intentionally excluded because they cannot be attributed to a 7-month window reliably."
  );

  const dedupedWarnings = Array.from(new Set(warnings));

  return {
    generatedAt: new Date().toISOString(),
    window: {
      ...window,
      months,
    },
    query: {
      billedBytes,
      processedBytes,
      estimatedCostUsd: estimateBigQueryCostUsd(billedBytes, usdPerTib),
    },
    totals: {
      rowCount: totalRows,
      logicalBytes: totalBytes,
    },
    layers: Array.from(layers.values()).sort((left, right) => right.logicalBytes - left.logicalBytes),
    projects: Array.from(projects.values()).sort(
      (left, right) => right.logicalBytes - left.logicalBytes
    ),
    topTables: topTables
      .sort((left, right) => right.logicalBytes - left.logicalBytes)
      .slice(0, MAX_TOP_TABLES),
    warnings: dedupedWarnings,
  };
}
