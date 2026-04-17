import type { ForecastCard, ForecastRun, ForecastTrajectory } from "@/lib/mock-data";
import { scopeBundles } from "@/lib/dashboard-live";
import { type DashboardProjectKey } from "@/lib/dashboard-filters";
import { listAnalyticsProjects } from "@/lib/platform/store";

export type ForecastsFilter = {
  projectKey?: DashboardProjectKey;
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

export async function getForecastCards(_filters?: ForecastsFilter): Promise<ForecastCard[]> {
  return [];
}

export async function getForecastTrajectories(_filters?: ForecastsFilter): Promise<ForecastTrajectory[]> {
  return [];
}
