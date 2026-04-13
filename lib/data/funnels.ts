import { MOCK_FUNNELS, type Funnel } from "@/lib/mock-data";
import { matchesProject, type DashboardProjectKey } from "@/lib/dashboard-filters";

export type FunnelsFilter = {
  projectKey?: DashboardProjectKey;
};

export async function getFunnels(filters?: FunnelsFilter): Promise<Funnel[]> {
  if (!filters?.projectKey) return MOCK_FUNNELS;
  return MOCK_FUNNELS.filter((f) => matchesProject(f.project, filters.projectKey!));
}

export async function getFunnelById(id: string): Promise<Funnel | null> {
  return MOCK_FUNNELS.find((f) => f.id === id) ?? null;
}
