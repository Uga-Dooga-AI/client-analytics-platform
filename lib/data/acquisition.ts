import {
  MOCK_ACQUISITION_TRAJECTORIES,
  MOCK_ACQUISITION_BREAKDOWN,
  type AcquisitionTrajectory,
  type AcquisitionBreakdownRow,
} from "@/lib/mock-data";
import { matchesProject, type DashboardProjectKey } from "@/lib/dashboard-filters";

export type AcquisitionFilter = {
  projectKey?: DashboardProjectKey;
};

export async function getAcquisitionTrajectories(
  filters?: AcquisitionFilter
): Promise<AcquisitionTrajectory[]> {
  if (!filters?.projectKey) return MOCK_ACQUISITION_TRAJECTORIES;
  return MOCK_ACQUISITION_TRAJECTORIES.filter((t) => matchesProject(t.project, filters.projectKey!));
}

export async function getAcquisitionBreakdown(
  filters?: AcquisitionFilter
): Promise<AcquisitionBreakdownRow[]> {
  if (!filters?.projectKey) return MOCK_ACQUISITION_BREAKDOWN;
  return MOCK_ACQUISITION_BREAKDOWN.filter((r) => matchesProject(r.project, filters.projectKey!));
}
