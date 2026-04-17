import type { Funnel, FunnelDetail } from "@/lib/mock-data";
import type { DashboardProjectKey } from "@/lib/dashboard-filters";

export type FunnelsFilter = {
  projectKey?: DashboardProjectKey;
};

export async function getFunnels(_filters?: FunnelsFilter): Promise<Funnel[]> {
  return [];
}

export async function getFunnelById(_id: string): Promise<Funnel | null> {
  return null;
}

export async function getFunnelDetail(_id: string): Promise<FunnelDetail | null> {
  return null;
}
