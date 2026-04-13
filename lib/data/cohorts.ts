import {
  MOCK_COHORT_DEFINITIONS,
  MOCK_COHORT_GRID,
  MOCK_COHORT_TRENDS,
  type CohortDefinition,
  type CohortHeatmapRow,
} from "@/lib/mock-data";
import { matchesProject, type DashboardProjectKey } from "@/lib/dashboard-filters";

export type CohortsFilter = {
  projectKey?: DashboardProjectKey;
};

export async function getCohortDefinitions(filters?: CohortsFilter): Promise<CohortDefinition[]> {
  if (!filters?.projectKey) return MOCK_COHORT_DEFINITIONS;
  return MOCK_COHORT_DEFINITIONS.filter((c) => matchesProject(c.project, filters.projectKey!));
}

export async function getCohortGrid(): Promise<CohortHeatmapRow[]> {
  return MOCK_COHORT_GRID;
}

export async function getCohortTrends(): Promise<typeof MOCK_COHORT_TRENDS> {
  return MOCK_COHORT_TRENDS;
}
