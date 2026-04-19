"use server";

import "server-only";

import type { DashboardPlatformKey } from "@/lib/dashboard-filters";
import {
  executeBigQuery,
  loadBigQueryContexts,
  type BigQueryQueryParam,
  type ProjectQueryContext,
} from "@/lib/live-warehouse";
import type { AnalyticsProjectBundle, AnalyticsSourceRecord } from "@/lib/platform/store";
import type { LiveSliceCatalog, MirrorSliceDescriptor, SliceOption } from "@/lib/slice-catalog";

type LiveSliceCatalogRequest = {
  from: string;
  to: string;
  platform: DashboardPlatformKey;
};

type InstallCatalogRow = {
  platform: string | null;
  country: string | null;
  source: string | null;
  count: number | null;
  first_seen: string | null;
  last_seen: string | null;
};

type EventCatalogRow = {
  event_name: string | null;
  event_count: number | null;
};

type MirrorSchemaRow = {
  table_name: string | null;
  column_name: string | null;
};

type MirrorDescriptorRow = {
  campaign: string | null;
  creative: string | null;
  count: number | null;
  first_seen: string | null;
  last_seen: string | null;
};

type AggregatedDescriptor = {
  count: number;
  firstSeen: string | null;
  lastSeen: string | null;
};

const EVENT_FALLBACKS = [
  "session_start",
  "tutorial_complete",
  "level_complete",
  "paywall_view",
  "purchase",
  "subscription_start",
  "ad_impression",
];

const MIRROR_CAMPAIGN_COLUMN_CANDIDATES = [
  "campaign_name",
  "campaign",
  "campaign_name_1",
  "campaignname",
  "campaign_id",
];

const MIRROR_CREATIVE_COLUMN_CANDIDATES = [
  "creative_name",
  "creative_pack_name",
  "creative",
  "ad_name",
  "asset_name",
  "ad_group_ad_ad_name",
  "creative_id",
  "ad_group_ad_ad_id",
];

async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  fallback: () => T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function buildAppMetricaParams(request: LiveSliceCatalogRequest): BigQueryQueryParam[] {
  return [
    { name: "from", type: "DATE", value: request.from },
    { name: "to", type: "DATE", value: request.to },
    { name: "platform", type: "STRING", value: request.platform },
  ];
}

function normalizeMirrorCompany(source: AnalyticsSourceRecord) {
  if (source.sourceType === "unity_ads_spend") {
    return "Unity Ads";
  }

  if (source.sourceType === "google_ads_spend") {
    return "Google Ads";
  }

  return source.label;
}

function toOptionLabel(value: string) {
  return value.trim().length > 0 ? value : "Unknown";
}

function buildOptionSet(label: string, counts: Map<string, number>) {
  const options = Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: toOptionLabel(value),
      count,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.label.localeCompare(right.label);
    });

  return [
    {
      value: "all",
      label,
      count: options.reduce((sum, option) => sum + option.count, 0),
    },
    ...options,
  ] satisfies SliceOption[];
}

function sanitizeTablePattern(pattern: string) {
  return pattern.replace(/[^a-zA-Z0-9_*]/g, "");
}

function toLikePattern(tablePattern: string) {
  return sanitizeTablePattern(tablePattern).replace(/\*/g, "%");
}

function sanitizeTableIdentifier(value: string) {
  return value.replace(/[^a-zA-Z0-9_]/g, "");
}

function firstExistingCandidate(columns: Set<string>, candidates: string[]) {
  return candidates.find((candidate) => columns.has(candidate)) ?? null;
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

function mergeDescriptorCoverage(
  current: AggregatedDescriptor | undefined,
  count: number,
  firstSeen: string | null,
  lastSeen: string | null
): AggregatedDescriptor {
  return {
    count: (current?.count ?? 0) + count,
    firstSeen:
      current?.firstSeen && firstSeen
        ? (current.firstSeen < firstSeen ? current.firstSeen : firstSeen)
        : (current?.firstSeen ?? firstSeen),
    lastSeen:
      current?.lastSeen && lastSeen
        ? (current.lastSeen > lastSeen ? current.lastSeen : lastSeen)
        : (current?.lastSeen ?? lastSeen),
  };
}

function selectMirrorTables(tableNames: string[], request: LiveSliceCatalogRequest) {
  const fromKey = request.from.replace(/-/g, "");
  const toKey = request.to.replace(/-/g, "");
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

  return [...tableNames].sort((left, right) => left.localeCompare(right)).slice(-31);
}

async function loadAppMetricaInstallDescriptors(
  context: ProjectQueryContext,
  request: LiveSliceCatalogRequest
) {
  const params = buildAppMetricaParams(request);

  return executeBigQuery<InstallCatalogRow>(
    context,
    `
      SELECT
        COALESCE(NULLIF(LOWER(CAST(os_name AS STRING)), ''), 'unknown') AS platform,
        COALESCE(NULLIF(UPPER(CAST(country_iso_code AS STRING)), ''), 'UNKNOWN') AS country,
        COALESCE(NULLIF(CAST(tracker_name AS STRING), ''), 'organic') AS source,
        COUNT(*) AS count,
        CAST(MIN(DATE(SAFE_CAST(install_datetime AS TIMESTAMP))) AS STRING) AS first_seen,
        CAST(MAX(DATE(SAFE_CAST(install_datetime AS TIMESTAMP))) AS STRING) AS last_seen
      FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawInstallsTable}\`
      WHERE _PARTITIONDATE BETWEEN DATE(@from) AND DATE(@to)
        AND (@platform = 'all' OR LOWER(CAST(os_name AS STRING)) = @platform)
      GROUP BY 1, 2, 3
    `,
    params
  );
}

async function loadAppMetricaEventCatalog(
  context: ProjectQueryContext,
  request: LiveSliceCatalogRequest
) {
  const params = buildAppMetricaParams(request);

  return executeBigQuery<EventCatalogRow>(
    context,
    `
      SELECT
        LOWER(CAST(event_name AS STRING)) AS event_name,
        COUNT(*) AS event_count
      FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawEventsTable}\`
      WHERE _PARTITIONDATE BETWEEN DATE(@from) AND DATE(@to)
        AND (@platform = 'all' OR LOWER(CAST(os_name AS STRING)) = @platform)
      GROUP BY 1
      ORDER BY event_count DESC, event_name
      LIMIT 50
    `,
    params
  );
}

async function discoverMirrorColumns(
  context: ProjectQueryContext,
  source: AnalyticsSourceRecord,
  request: LiveSliceCatalogRequest
) {
  const sourceProjectId =
    typeof source.config.sourceProjectId === "string" ? source.config.sourceProjectId : "";
  const sourceDataset =
    typeof source.config.sourceDataset === "string" ? source.config.sourceDataset : "";
  const tablePattern =
    typeof source.config.tablePattern === "string" ? source.config.tablePattern : "";

  if (!sourceProjectId || !sourceDataset || !tablePattern) {
    return null;
  }

  const rows = await executeBigQuery<MirrorSchemaRow>(
    context,
    `
      SELECT
        table_name,
        LOWER(column_name) AS column_name
      FROM \`${sourceProjectId}.${sourceDataset}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name LIKE @tablePattern
    `,
    [{ name: "tablePattern", type: "STRING", value: toLikePattern(tablePattern) }]
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

  if (columnsByTable.size === 0) {
    return null;
  }

  const tables = selectMirrorTables(Array.from(columnsByTable.keys()), request)
    .map((tableName) => {
      const columns = columnsByTable.get(tableName) ?? new Set<string>();
      return {
        tableName,
        campaignColumn: firstExistingCandidate(columns, MIRROR_CAMPAIGN_COLUMN_CANDIDATES),
        creativeColumn: firstExistingCandidate(columns, MIRROR_CREATIVE_COLUMN_CANDIDATES),
      };
    })
    .filter((table) => table.campaignColumn || table.creativeColumn);

  if (tables.length === 0) {
    return null;
  }

  return {
    sourceProjectId,
    sourceDataset,
    tables,
  };
}

async function loadMirrorDimensionCounts(
  context: ProjectQueryContext,
  source: AnalyticsSourceRecord,
  request: LiveSliceCatalogRequest
) {
  const schema = await discoverMirrorColumns(context, source, request);
  if (!schema) {
    return null;
  }

  const rowSelects = schema.tables.map((table) => {
    const tableRef = `\`${schema.sourceProjectId}.${schema.sourceDataset}.${sanitizeTableIdentifier(table.tableName)}\``;
    const tableDate = toIsoDateFromKey(parseMirrorTableDate(table.tableName));
    const campaignExpr = table.campaignColumn
      ? `NULLIF(TRIM(CAST(${table.campaignColumn} AS STRING)), '')`
      : "CAST(NULL AS STRING)";
    const creativeExpr = table.creativeColumn
      ? `NULLIF(TRIM(CAST(${table.creativeColumn} AS STRING)), '')`
      : "CAST(NULL AS STRING)";
    const tableDateExpr = tableDate ? `DATE '${tableDate}'` : "CAST(NULL AS DATE)";

    return `
      SELECT
        ${campaignExpr} AS campaign,
        ${creativeExpr} AS creative,
        ${tableDateExpr} AS table_date,
        COUNT(*) AS count
      FROM ${tableRef}
      GROUP BY 1, 2, 3
      HAVING campaign IS NOT NULL OR creative IS NOT NULL
    `;
  });

  if (rowSelects.length === 0) {
    return null;
  }

  return executeBigQuery<MirrorDescriptorRow>(
    context,
    `
      WITH mirror_rows AS (
        ${rowSelects.join("\nUNION ALL\n")}
      )
      SELECT
        campaign,
        creative,
        SUM(count) AS count,
        CAST(MIN(table_date) AS STRING) AS first_seen,
        CAST(MAX(table_date) AS STRING) AS last_seen
      FROM mirror_rows
      GROUP BY 1, 2
      ORDER BY count DESC, campaign, creative
      LIMIT 400
    `
  );
}

export async function getLiveSliceCatalog(
  bundles: AnalyticsProjectBundle[],
  request: LiveSliceCatalogRequest
): Promise<LiveSliceCatalog> {
  const contexts = await loadBigQueryContexts(bundles);
  const appmetricaCounts = new Map<string, AggregatedDescriptor>();
  const eventCounts = new Map<string, number>();
  const companyCounts = new Map<string, number>();
  const campaignCounts = new Map<string, number>();
  const creativeCounts = new Map<string, number>();
  const mirrorDescriptors: MirrorSliceDescriptor[] = [];
  const notes: string[] = [];

  await Promise.all(
    Array.from(contexts.values()).map(async (context) => {
      try {
        const installRows = await withTimeout<Awaited<ReturnType<typeof loadAppMetricaInstallDescriptors>> | "__timeout__">(
          loadAppMetricaInstallDescriptors(context, request),
          8_000,
          () => "__timeout__"
        );

        if (installRows === "__timeout__") {
          notes.push(
            `${context.bundle.project.displayName}: AppMetrica dimension catalog timed out, so country and traffic-source options may be incomplete for this request.`
          );
        } else {
          for (const row of installRows) {
            const platform = row.platform ?? "unknown";
            const country = row.country ?? "UNKNOWN";
            const source = row.source ?? "organic";
            const count = Number(row.count ?? 0);
            const key = `${platform}__${country}__${source}`;
            appmetricaCounts.set(
              key,
              mergeDescriptorCoverage(
                appmetricaCounts.get(key),
                count,
                row.first_seen ?? null,
                row.last_seen ?? null
              )
            );
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown BigQuery error";
        notes.push(
          `${context.bundle.project.displayName}: could not load live AppMetrica dimension catalog (${message}).`
        );
      }

      try {
        const eventRows = await withTimeout<Awaited<ReturnType<typeof loadAppMetricaEventCatalog>> | "__timeout__">(
          loadAppMetricaEventCatalog(context, request),
          4_000,
          () => "__timeout__"
        );

        if (eventRows === "__timeout__") {
          notes.push(
            `${context.bundle.project.displayName}: AppMetrica event catalog timed out, so event suggestions may be incomplete.`
          );
          return;
        }

        for (const row of eventRows) {
          const eventName = row.event_name?.trim();
          if (!eventName) {
            continue;
          }
          eventCounts.set(eventName, (eventCounts.get(eventName) ?? 0) + Number(row.event_count ?? 0));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown BigQuery error";
        notes.push(`${context.bundle.project.displayName}: could not load live AppMetrica event catalog (${message}).`);
      }
    })
  );

  await Promise.all(
    bundles.map(async (bundle) => {
      const context = contexts.get(bundle.project.id);
      if (!context) {
        return;
      }

      const mirrorSources = bundle.sources.filter(
        (source) =>
          (source.sourceType === "unity_ads_spend" || source.sourceType === "google_ads_spend") &&
          source.config.enabled === true &&
          source.config.mode === "bigquery"
      );

      await Promise.all(
        mirrorSources.map(async (source) => {
          const company = normalizeMirrorCompany(source);

          try {
            const mirrorCounts = await withTimeout<Awaited<ReturnType<typeof loadMirrorDimensionCounts>> | "__timeout__">(
              loadMirrorDimensionCounts(context, source, request),
              8_000,
              () => "__timeout__"
            );
            if (mirrorCounts === "__timeout__") {
              notes.push(
                `${bundle.project.displayName}: ${company} mirror catalog timed out, so campaign and creative filter options may be incomplete.`
              );
              return;
            }
            if (!mirrorCounts) {
              return;
            }

            let companyTotal = 0;

            for (const row of mirrorCounts) {
              const count = Number(row.count ?? 0);
              const campaign = row.campaign?.trim() ?? "";
              const creative = row.creative?.trim() ?? "";

              companyTotal += count;

              if (campaign) {
                campaignCounts.set(campaign, (campaignCounts.get(campaign) ?? 0) + count);
              }

              if (creative) {
                creativeCounts.set(creative, (creativeCounts.get(creative) ?? 0) + count);
              }

              if (campaign || creative) {
                mirrorDescriptors.push({
                  company,
                  campaign: campaign || "Unknown",
                  creative: creative || "Unknown",
                  count,
                  firstSeen: row.first_seen ?? null,
                  lastSeen: row.last_seen ?? null,
                });
              }
            }

            companyCounts.set(company, (companyCounts.get(company) ?? 0) + companyTotal);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown BigQuery error";
            notes.push(`${bundle.project.displayName}: could not inspect ${company} mirror catalog (${message}).`);
          }
        })
      );
    })
  );

  const appmetricaDescriptors = Array.from(appmetricaCounts.entries()).map(([key, count]) => {
    const [platform, country, source] = key.split("__");
    return {
      platform,
      country,
      source,
      count: count.count,
      firstSeen: count.firstSeen,
      lastSeen: count.lastSeen,
    };
  });

  const configuredFallbackEvents = EVENT_FALLBACKS.filter((eventName) => !eventCounts.has(eventName));
  for (const eventName of configuredFallbackEvents) {
    eventCounts.set(eventName, 0);
  }

  if (contexts.size === 0) {
    notes.push("No live BigQuery contexts are available for the selected scope.");
  }

  if (campaignCounts.size === 0 && creativeCounts.size === 0 && companyCounts.size > 0) {
    notes.push(
      "Company connectors are configured, but campaign and creative catalogs are not normalized well enough yet to expose reliable live options."
    );
  }

  if (companyCounts.size === 0) {
    notes.push(
      "Campaign, creative, and company filters stay hidden unless live mirror metadata is available. AppMetrica currently covers platform, country, source, and events."
    );
  }

  return {
    appmetricaDescriptors,
    mirrorDescriptors,
    mirrorOptions: {
      companies: buildOptionSet("All companies", companyCounts),
      campaigns: buildOptionSet("All campaigns", campaignCounts),
      creatives: buildOptionSet("All creatives", creativeCounts),
    },
    events: buildOptionSet("All events", eventCounts),
    notes: Array.from(new Set(notes)),
  };
}
