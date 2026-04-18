import type { ForecastCard, ForecastRun, ForecastTrajectory } from "@/lib/mock-data";
import { scopeBundles } from "@/lib/dashboard-live";
import { type DashboardProjectKey } from "@/lib/dashboard-filters";
import { executeBigQuery, loadBigQueryContexts } from "@/lib/live-warehouse";
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
  exposures: {
    label: "Exposure forecast",
    unit: "",
    subtitle: "Projected experiment exposure volume with confidence interval from the latest published forecast run.",
  },
  activations: {
    label: "Activation forecast",
    unit: "",
    subtitle: "Projected activation volume with confidence interval from the latest published forecast run.",
  },
  guardrail_crashes: {
    label: "Crash guardrail forecast",
    unit: "",
    subtitle: "Projected guardrail crash count with confidence interval from the latest published forecast run.",
  },
  guardrail_errors: {
    label: "Error guardrail forecast",
    unit: "",
    subtitle: "Projected guardrail error count with confidence interval from the latest published forecast run.",
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
                ? String((run.payload.forecastCombination as Record<string, unknown>).label)
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
      const prefix = context.bundle.project.slug.replace(/-/g, "_");
      const forecastTable = `\`${context.warehouseProjectId}.${context.bundle.project.martDataset}.${prefix}_forecast_points_serving\``;

      let rows: ForecastPointRow[] = [];
      try {
        rows = await executeBigQuery<ForecastPointRow>(
          context,
          `
            WITH latest_generated AS (
              SELECT MAX(generated_at) AS latest_generated_at
              FROM ${forecastTable}
            )
            SELECT
              metric,
              CAST(date AS STRING) AS forecast_date,
              p50,
              p10,
              p90,
              CAST(generated_at AS STRING) AS generated_at
            FROM ${forecastTable}
            CROSS JOIN latest_generated
            WHERE latest_generated.latest_generated_at IS NOT NULL
              AND generated_at = latest_generated.latest_generated_at
            ORDER BY metric, date
          `
        );
      } catch {
        return;
      }

      const rowsByMetric = rows.reduce<Map<string, ForecastPointRow[]>>((acc, row) => {
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
