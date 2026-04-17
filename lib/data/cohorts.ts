import type { CohortDefinition, CohortHeatmapRow } from "@/lib/mock-data";
import type { DashboardProjectKey } from "@/lib/dashboard-filters";

export type CohortsFilter = {
  projectKey?: DashboardProjectKey;
};

export type CohortTrends = {
  labels: string[];
  iosD7: number[];
  androidD7: number[];
  iosD30: number[];
  androidD30: number[];
};

export async function getCohortDefinitions(_filters?: CohortsFilter): Promise<CohortDefinition[]> {
  return [];
}

export async function getCohortGrid(): Promise<CohortHeatmapRow[]> {
  return [];
}

export async function getCohortTrends(): Promise<CohortTrends> {
  return {
    labels: [],
    iosD7: [],
    androidD7: [],
    iosD30: [],
    androidD30: [],
  };
}
