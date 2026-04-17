import type {
  DataSourceBinding,
  ProjectBinding,
} from "@/lib/mock-data";
import { getAnalyticsSettingsSnapshot } from "@/lib/platform/store";

export async function getDataSources(): Promise<DataSourceBinding[]> {
  const snapshot = await getAnalyticsSettingsSnapshot();

  return snapshot.sourceRegistry.map((source) => ({
    source: source.source,
    project: source.project,
    deliveryMode: source.deliveryMode,
    status:
      source.status === "ready"
        ? "ready_for_key"
        : source.status === "disabled"
          ? "deferred"
          : "mock_only",
    lastSync: source.lastSyncAt?.toISOString() ?? "Never",
    notes: source.notes,
  }));
}

export async function getProjectBindings(): Promise<ProjectBinding[]> {
  const snapshot = await getAnalyticsSettingsSnapshot();

  return snapshot.projects.map((bundle) => ({
    projectKey: bundle.project.slug,
    owner: bundle.project.ownerTeam || "Unassigned",
    servingMode: bundle.project.status,
    sources: bundle.sources.map((source) => source.label),
    status:
      bundle.project.status === "live"
        ? "partial_data"
        : bundle.project.status === "ready"
          ? "shell_live"
          : "planned",
  }));
}

export async function getMetricCatalog() {
  return (await getAnalyticsSettingsSnapshot()).metricCatalog;
}
