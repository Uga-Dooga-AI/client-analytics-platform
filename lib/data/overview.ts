import { MOCK_KPIS, MOCK_FRESHNESS, type KpiMetric } from "@/lib/mock-data";

export async function getOverviewKPIs(): Promise<KpiMetric[]> {
  return MOCK_KPIS;
}

export async function getOverviewFreshness(): Promise<typeof MOCK_FRESHNESS> {
  return MOCK_FRESHNESS;
}
