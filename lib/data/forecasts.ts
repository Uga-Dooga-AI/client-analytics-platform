import type { ForecastCard, ForecastRun, ForecastTrajectory } from "@/lib/mock-data";
import { scopeBundles } from "@/lib/dashboard-live";
import { type DashboardProjectKey } from "@/lib/dashboard-filters";
import { executeBigQuery, loadBigQueryContexts, type ProjectQueryContext } from "@/lib/live-warehouse";
import { listAnalyticsProjects } from "@/lib/platform/store";

export type ForecastsFilter = {
  projectKey?: DashboardProjectKey;
};

type ForecastPointRow = {
  metric: string;
  forecast_date: string;
  p50: number | null;
  p10: number | null;
  p90: number | null;
  generated_at: string | null;
};

const FORECAST_SERIES_POINTS = 14;
const FORECAST_CARD_POINTS = 5;
const SUPPORTED_PUBLISHED_FORECAST_METRICS = new Set(["revenue"]);

function containsUnsupportedForecastMetric(text: string) {
  return /\bdau\b|\binstalls?\b/i.test(text);
}

function sanitizeForecastRunLabel(label: string) {
  return containsUnsupportedForecastMetric(label) ? "Forecast run" : label;
}

const SUPPORTED_PUBLISHED_FORECAST_METRICS = new Set(["revenue"]);

function containsUnsupportedForecastMetric(text: string) {
  return /\bdau\b|\binstalls?\b/i.test(text);
}

function sanitizeForecastRunLabel(label: string) {
  return containsUnsupportedForecastMetric(label) ? "Forecast run" : label;
}

type ForecastTableCandidate = {
  kind: "serving" | "raw";
  table: string;
};

const METRIC_META: Record<
  string,
  {
    label: string;
    unit: string;
    subtitle: string;
  }
> = {
  revenue: {
    label: "Revenue forecast",
    unit: "$",
    subtitle: "Projected revenue with confidence interval from the latest published forecast run.",
  },
};

export async function getForecastRuns(filters?: ForecastsFilter): Promise<ForecastRun[]> {
  const bundles = await listAnalyticsProjects();
  const scopedBundles = scopeBundles(bundles, filters?.projectKey ?? "all");

  return scopedBundles.flatMap((bundle) =>
    bundle.latestRuns
      .filter((run) => run.runType === "forecast")
      .map(
        (run) =>
          ({
            id: run.id,
            project: bundle.project.displayName,
            metric:
              typeof run.payload?.forecastCombination === "object" &&
              run.payload.forecastCombination &&
              typeof (run.payload.forecastCombination as Record<string, unknown>).label === "string"
                ? sanitizeForecastRunLabel(
                    String((run.payload.forecastCombination as Record<string, unknown>).label)
                  )
                : "Forecast run",
            status:
              run.status === "running"
                ? "running"
                : run.status === "succeeded"
                  ? "completed"
                  : "needs_review",
            generatedAt: run.finishedAt?.toISOString() ?? run.requestedAt.toISOString(),
            horizonDays: bundle.project.forecastHorizonDays,
            modelVersion: "runtime-bundle",
            mae: "—",
            coverage: "—",
          }) satisfies ForecastRun
      )
  );
}

export async function getForecastCards(filters?: ForecastsFilter): Promise<ForecastCard[]> {
  const trajectories = await getForecastTrajectories(filters);
  return buildForecastCards(trajectories);
}

export function buildForecastCards(trajectories: ForecastTrajectory[]): ForecastCard[] {
  return trajectories.map((trajectory) => {
    const cardPoints = thinSeries(trajectory.series, FORECAST_CARD_POINTS);
    const lastPoint = trajectory.series[trajectory.series.length - 1];
    const relativeBandWidth =
      lastPoint && Math.abs(lastPoint.value) > 0
        ? (lastPoint.upper - lastPoint.lower) / Math.abs(lastPoint.value)
        : lastPoint
          ? lastPoint.upper - lastPoint.lower
          : 0;

    let status: ForecastCard["status"] = "stable";
    if (relativeBandWidth >= 0.6) {
      status = "wide";
    } else if (relativeBandWidth >= 0.25) {
      status = "converging";
    }

    const horizonLabel = lastPoint?.label
      ? `Through ${lastPoint.label}`
      : "Awaiting forecast horizon";
    const summary = lastPoint
      ? `Latest published band ${formatValue(lastPoint.lower, trajectory.unit)}–${formatValue(lastPoint.upper, trajectory.unit)}.`
      : "No published forecast points yet.";

    return {
      id: trajectory.id,
      project: trajectory.project,
      metric: trajectory.metric,
      status,
      horizonLabel,
      summary,
      points: cardPoints.map((point) => ({
        date: point.label,
        value: point.value,
        ci: `${formatValue(point.lower, trajectory.unit)}–${formatValue(point.upper, trajectory.unit)}`,
      })),
    } satisfies ForecastCard;
  });
}

export async function getForecastTrajectories(filters?: ForecastsFilter): Promise<ForecastTrajectory[]> {
  const bundles = await listAnalyticsProjects();
  const scopedBundles = scopeBundles(bundles, filters?.projectKey ?? "all");
  const contexts = await loadBigQueryContexts(scopedBundles);
  const trajectories: ForecastTrajectory[] = [];

  await Promise.all(
    Array.from(contexts.values()).map(async (context) => {
      const rows = await loadLatestForecastRows(context);
      if (rows.length === 0) {
        return;
      }

      const rowsByMetric = rows.reduce<Map<string, ForecastPointRow[]>>((acc, row) => {
        if (!SUPPORTED_PUBLISHED_FORECAST_METRICS.has(row.metric)) {
          return acc;
        }
        const current = acc.get(row.metric) ?? [];
        current.push(row);
        acc.set(row.metric, current);
        return acc;
      }, new Map());

      for (const [metric, metricRows] of rowsByMetric) {
        const series = thinSeries(metricRows, FORECAST_SERIES_POINTS).map((row) => ({
          label: formatDateLabel(row.forecast_date),
          value: Number(row.p50 ?? 0),
          lower: Number(row.p10 ?? 0),
          upper: Number(row.p90 ?? 0),
          actual: null,
        }));

        if (series.length === 0) {
          continue;
        }

        const meta = METRIC_META[metric] ?? {
          label: metric.replace(/_/g, " "),
          unit: "",
          subtitle: "Projected metric with confidence interval from the latest published forecast run.",
        };

        trajectories.push({
          id: `${context.bundle.project.slug}-${metric}`,
          project: context.bundle.project.displayName,
          metric: meta.label,
          unit: meta.unit,
          subtitle: meta.subtitle,
          series,
        });
      }
    })
  );

  return trajectories.sort((left, right) => {
    if (left.project !== right.project) {
      return left.project.localeCompare(right.project);
    }

    return left.metric.localeCompare(right.metric);
  });
}

async function loadLatestForecastRows(context: ProjectQueryContext): Promise<ForecastPointRow[]> {
  const prefix = context.bundle.project.slug.replace(/-/g, "_");
  const tables: ForecastTableCandidate[] = [
    {
      kind: "serving",
      table: `\`${context.warehouseProjectId}.${context.bundle.project.martDataset}.${prefix}_forecast_points_serving\``,
    },
    {
      kind: "raw",
      table: `\`${context.warehouseProjectId}.${context.bundle.project.martDataset}.${prefix}_forecast_points\``,
    },
  ];

  for (const candidate of tables) {
    try {
      const rows = await executeBigQuery<ForecastPointRow>(
        context,
        `
          WITH latest_generated AS (
            SELECT MAX(generated_at) AS latest_generated_at
            FROM ${candidate.table}
          )
          SELECT
            metric,
            CAST(date AS STRING) AS forecast_date,
            p50,
            p10,
            p90,
            CAST(generated_at AS STRING) AS generated_at
          FROM ${candidate.table}
          CROSS JOIN latest_generated
          WHERE latest_generated.latest_generated_at IS NOT NULL
            AND generated_at = latest_generated.latest_generated_at
            AND metric = 'revenue'
          ORDER BY metric, date
        `
      );

      if (rows.length > 0) {
        if (candidate.kind === "raw") {
          console.warn("[FORECASTS] Falling back to raw forecast table for live reads", {
            projectId: context.bundle.project.id,
            projectSlug: context.bundle.project.slug,
            table: candidate.table,
          });
        }
        return rows;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown BigQuery error";
      console.error("[FORECASTS] Failed to read forecast table", {
        projectId: context.bundle.project.id,
        projectSlug: context.bundle.project.slug,
        tableKind: candidate.kind,
        table: candidate.table,
        message,
      });
    }
  }

  return [];
}

function thinSeries<T>(series: T[], maxPoints: number) {
  if (series.length <= maxPoints) {
    return series;
  }

  const sampled: T[] = [];
  const seen = new Set<number>();

  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex =
      maxPoints === 1
        ? 0
        : Math.round((index * (series.length - 1)) / (maxPoints - 1));
    if (seen.has(sourceIndex)) {
      continue;
    }
    seen.add(sourceIndex);
    sampled.push(series[sourceIndex]);
  }

  return sampled;
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatValue(value: number, unit: string) {
  if (unit === "$") {
    return `$${value.toFixed(2)}`;
  }

  if (unit.trim().length === 0) {
    return value.toFixed(1);
  }

  return `${value.toFixed(1)}${unit}`;
}
