"use server";

import "server-only";

import type { DashboardGroupByKey, DashboardPlatformKey } from "@/lib/dashboard-filters";
import {
  executeBigQuery,
  loadBigQueryContexts,
  type BigQueryQueryParam,
  type ProjectQueryContext,
} from "@/lib/live-warehouse";
import type { AnalyticsProjectBundle } from "@/lib/platform/store";

export type ForecastActualMetricKey = "revenue";

export type ActualLinePoint = {
  label: string;
  value: number;
};

export type ActualLineGroup = {
  id: string;
  label: string;
  color: string;
  total: number;
  points: ActualLinePoint[];
};

export type ActualMultiSeriesChart = {
  id: string;
  title: string;
  subtitle: string;
  unit: string;
  groups: ActualLineGroup[];
};

export type ForecastWorkbenchFilters = {
  from: string;
  to: string;
  platform: DashboardPlatformKey;
  groupBy: DashboardGroupByKey;
  metric: ForecastActualMetricKey;
  country: string;
  source: string;
  company: string;
  campaign: string;
  creative: string;
};

export type ForecastWorkbenchData = {
  actualChart: ActualMultiSeriesChart | null;
  notes: string[];
};

type ActualRow = {
  day: string | null;
  group_value: string | null;
  value: number | null;
};

const GROUP_COLORS = [
  "#2563eb",
  "#d97706",
  "#059669",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#ea580c",
  "#4f46e5",
];

function buildDateDomain(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const domain: string[] = [];

  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    domain.push(cursor.toISOString().slice(0, 10));
  }

  return domain;
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatGroupLabel(groupBy: DashboardGroupByKey, value: string) {
  if (groupBy === "platform") {
    if (value === "ios") {
      return "iOS";
    }

    if (value === "android") {
      return "Android";
    }
  }

  if (groupBy === "country" && value === "UNKNOWN") {
    return "Unknown country";
  }

  if (groupBy === "source" && value === "organic") {
    return "Organic";
  }

  if (groupBy === "source") {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return value;
}

function supportedGroupBy(requested: DashboardGroupByKey) {
  const allowed = new Set<DashboardGroupByKey>(["none", "platform", "country"]);
  return allowed.has(requested) ? requested : "none";
}

function buildCommonParams(filters: ForecastWorkbenchFilters): BigQueryQueryParam[] {
  return [
    { name: "from", type: "DATE", value: filters.from },
    { name: "to", type: "DATE", value: filters.to },
    { name: "platform", type: "STRING", value: filters.platform },
    { name: "country", type: "STRING", value: filters.country },
    { name: "source", type: "STRING", value: filters.source },
  ];
}

function buildInstallGroupExpression(groupBy: DashboardGroupByKey) {
  if (groupBy === "platform") {
    return `COALESCE(NULLIF(LOWER(CAST(os_name AS STRING)), ''), 'unknown')`;
  }

  if (groupBy === "country") {
    return `COALESCE(NULLIF(UPPER(CAST(country_iso_code AS STRING)), ''), 'UNKNOWN')`;
  }

  if (groupBy === "source") {
    return `COALESCE(NULLIF(CAST(tracker_name AS STRING), ''), 'organic')`;
  }

  return `'Selected scope'`;
}

function buildEventGroupExpression(groupBy: DashboardGroupByKey) {
  if (groupBy === "platform") {
    return `COALESCE(NULLIF(LOWER(CAST(os_name AS STRING)), ''), 'unknown')`;
  }

  if (groupBy === "country") {
    return `COALESCE(NULLIF(UPPER(CAST(country_iso_code AS STRING)), ''), 'UNKNOWN')`;
  }

  return `'Selected scope'`;
}

async function loadMetricRows(
  context: ProjectQueryContext,
  filters: ForecastWorkbenchFilters,
  normalizedGroupBy: DashboardGroupByKey
) {
  const params = buildCommonParams(filters);
  return executeBigQuery<ActualRow>(
    context,
    `
      SELECT
        CAST(DATE(SAFE_CAST(event_datetime AS TIMESTAMP)) AS STRING) AS day,
        ${buildEventGroupExpression(normalizedGroupBy)} AS group_value,
        COUNT(DISTINCT CAST(appmetrica_device_id AS STRING)) AS value
      FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawEventsTable}\`
      WHERE _PARTITIONDATE BETWEEN DATE(@from) AND DATE(@to)
        AND DATE(SAFE_CAST(event_datetime AS TIMESTAMP)) BETWEEN DATE(@from) AND DATE(@to)
        AND (@platform = 'all' OR LOWER(CAST(os_name AS STRING)) = @platform)
        AND (@country = 'all' OR UPPER(CAST(country_iso_code AS STRING)) = @country)
      GROUP BY 1, 2
      ORDER BY day, group_value
    `,
    params
  );
}

export async function getForecastWorkbenchData(
  bundles: AnalyticsProjectBundle[],
  filters: ForecastWorkbenchFilters
): Promise<ForecastWorkbenchData> {
  const contexts = await loadBigQueryContexts(bundles);
  const notes: string[] = [];

  const normalizedGroupBy = supportedGroupBy(filters.groupBy);
  if (normalizedGroupBy !== filters.groupBy) {
    notes.push(
      `Grouping "${filters.groupBy}" is not available for revenue, so the chart falls back to selected scope.`
    );
  }

  if (filters.source !== "all") {
    notes.push(
      "Revenue actuals are not attributed to tracker_name in the current warehouse contract, so traffic-source filter is ignored for that chart."
    );
  }

  if (filters.company !== "all" || filters.campaign !== "all" || filters.creative !== "all") {
    notes.push(
      "Company, campaign, and creative filters are not yet connected to forecast actuals because the current revenue contract is not sliced by those dimensions."
    );
  }

  const settled = await Promise.allSettled(
    Array.from(contexts.values()).map(async (context) => loadMetricRows(context, filters, normalizedGroupBy))
  );

  const valueByGroupAndDay = new Map<string, number>();
  const totalsByGroup = new Map<string, number>();

  for (const result of settled) {
    if (result.status !== "fulfilled") {
      const message = result.reason instanceof Error ? result.reason.message : "Unknown BigQuery error";
      notes.push(`Actual chart query failed for one project (${message}).`);
      continue;
    }

    for (const row of result.value) {
      const day = row.day ?? filters.from;
      const groupValue = row.group_value ?? "Selected scope";
      const value = Number(row.value ?? 0);
      const key = `${groupValue}__${day}`;
      valueByGroupAndDay.set(key, (valueByGroupAndDay.get(key) ?? 0) + value);
      totalsByGroup.set(groupValue, (totalsByGroup.get(groupValue) ?? 0) + value);
    }
  }

  if (totalsByGroup.size === 0) {
    return {
      actualChart: null,
      notes,
    };
  }

  const dateDomain = buildDateDomain(filters.from, filters.to);
  const orderedGroups = Array.from(totalsByGroup.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .slice(0, normalizedGroupBy === "none" ? 1 : 8);

  return {
    actualChart: {
      id: "forecast-actuals-revenue",
      title: "Actual revenue by day",
      subtitle:
        normalizedGroupBy === "none"
          ? "Live warehouse actuals for the currently selected scope."
          : `Live warehouse actuals grouped by ${normalizedGroupBy}.`,
      unit: "$",
      groups: orderedGroups.map(([groupValue, total], index) => ({
        id: `revenue-${groupValue}`,
        label: formatGroupLabel(normalizedGroupBy, groupValue),
        color: GROUP_COLORS[index % GROUP_COLORS.length],
        total,
        points: dateDomain.map((day) => ({
          label: formatDateLabel(day),
          value: valueByGroupAndDay.get(`${groupValue}__${day}`) ?? 0,
        })),
      })),
    },
    notes,
  };
}
