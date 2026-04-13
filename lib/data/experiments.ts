import {
  MOCK_EXPERIMENTS,
  MOCK_EXPERIMENT_DETAILS,
  type Experiment,
  type ExperimentDetail,
} from "@/lib/mock-data";
import { matchesProject, type DashboardProjectKey } from "@/lib/dashboard-filters";

export type ExperimentsFilter = {
  projectKey?: DashboardProjectKey;
};

export async function getExperiments(filters?: ExperimentsFilter): Promise<Experiment[]> {
  if (!filters?.projectKey) return MOCK_EXPERIMENTS;
  return MOCK_EXPERIMENTS.filter((e) => matchesProject(e.project, filters.projectKey!));
}

export async function getExperimentById(
  id: string
): Promise<{ experiment: Experiment; detail: ExperimentDetail } | null> {
  const experiment = MOCK_EXPERIMENTS.find((e) => e.id === id);
  if (!experiment) return null;
  const detail = MOCK_EXPERIMENT_DETAILS[experiment.id];
  if (!detail) return null;
  return { experiment, detail };
}
