import {
  MOCK_FORECAST_RUNS,
  MOCK_FORECAST_CARDS,
  MOCK_FORECAST_TRAJECTORIES,
  type ForecastRun,
  type ForecastCard,
  type ForecastTrajectory,
} from "@/lib/mock-data";
import { matchesProject, type DashboardProjectKey } from "@/lib/dashboard-filters";

export type ForecastsFilter = {
  projectKey?: DashboardProjectKey;
};

export async function getForecastRuns(filters?: ForecastsFilter): Promise<ForecastRun[]> {
  if (!filters?.projectKey) return MOCK_FORECAST_RUNS;
  return MOCK_FORECAST_RUNS.filter((r) => matchesProject(r.project, filters.projectKey!));
}

export async function getForecastCards(filters?: ForecastsFilter): Promise<ForecastCard[]> {
  if (!filters?.projectKey) return MOCK_FORECAST_CARDS;
  return MOCK_FORECAST_CARDS.filter((c) => matchesProject(c.project, filters.projectKey!));
}

export async function getForecastTrajectories(filters?: ForecastsFilter): Promise<ForecastTrajectory[]> {
  if (!filters?.projectKey) return MOCK_FORECAST_TRAJECTORIES;
  return MOCK_FORECAST_TRAJECTORIES.filter((t) => matchesProject(t.project, filters.projectKey!));
}
