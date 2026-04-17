import type { KpiMetric } from "@/lib/mock-data";
import { countScopedRuns, flattenRuns, scopeBundles } from "@/lib/dashboard-live";
import { listAnalyticsProjects } from "@/lib/platform/store";

export async function getOverviewKPIs(projectKey: string = "all"): Promise<KpiMetric[]> {
  const bundles = scopeBundles(await listAnalyticsProjects(), projectKey);
  const sources = bundles.flatMap((bundle) => bundle.sources);
  const latestSuccess = flattenRuns(bundles).find(({ run }) => run.status === "succeeded")?.run;

  return [
    {
      label: "Projects in scope",
      value: bundles.length.toString(),
      change: 0,
    },
    {
      label: "Ready sources",
      value: sources.filter((source) => source.status === "ready").length.toString(),
      change: 0,
    },
    {
      label: "Running jobs",
      value: countScopedRuns(bundles, (run) => run.status === "running").toString(),
      change: 0,
    },
    {
      label: "Latest success",
      value: latestSuccess?.runType ?? "none",
      change: 0,
    },
  ];
}

export async function getOverviewFreshness(projectKey: string = "all") {
  const bundles = scopeBundles(await listAnalyticsProjects(), projectKey);

  return bundles.flatMap((bundle) =>
    bundle.sources.map((source) => ({
      source: `${bundle.project.displayName} · ${source.label}`,
      time: source.lastSyncAt ? source.lastSyncAt.toISOString() : null,
      statusLabel: source.status,
    }))
  );
}
