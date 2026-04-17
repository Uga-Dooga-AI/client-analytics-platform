import { projectNameToKey, type DashboardProjectKey } from "@/lib/dashboard-filters";
import type {
  AnalyticsProjectBundle,
  AnalyticsSourceRecord,
  AnalyticsSyncRunRecord,
} from "@/lib/platform/store";

export function scopeBundles(
  bundles: AnalyticsProjectBundle[],
  projectKey: DashboardProjectKey
) {
  if (projectKey === "all") {
    return bundles;
  }

  return bundles.filter((bundle) => bundle.project.slug === projectKey);
}

export function compareRunsDesc(
  left: AnalyticsSyncRunRecord,
  right: AnalyticsSyncRunRecord
) {
  return right.requestedAt.getTime() - left.requestedAt.getTime();
}

export function formatDateTime(value?: Date | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(value);
}

export function formatRelativeTime(value?: Date | null) {
  if (!value) {
    return "Never";
  }

  const diffMs = value.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absMs < 60_000) {
    return rtf.format(Math.round(diffMs / 1_000), "second");
  }

  if (absMs < 3_600_000) {
    return rtf.format(Math.round(diffMs / 60_000), "minute");
  }

  if (absMs < 86_400_000) {
    return rtf.format(Math.round(diffMs / 3_600_000), "hour");
  }

  return rtf.format(Math.round(diffMs / 86_400_000), "day");
}

export function runStatusTone(status: AnalyticsSyncRunRecord["status"]) {
  switch (status) {
    case "succeeded":
      return { label: "Succeeded", color: "var(--color-success)", background: "#dcfce7" };
    case "running":
      return { label: "Running", color: "var(--color-signal-blue)", background: "var(--color-signal-blue-surface)" };
    case "queued":
      return { label: "Queued", color: "var(--color-ink-700)", background: "var(--color-panel-soft)" };
    case "blocked":
      return { label: "Blocked", color: "var(--color-warning)", background: "#fef3c7" };
    case "waiting_credentials":
      return { label: "Waiting credentials", color: "var(--color-warning)", background: "#fef3c7" };
    case "failed":
    default:
      return { label: "Failed", color: "var(--color-danger)", background: "#fee2e2" };
  }
}

export function sourceStatusTone(status: AnalyticsSourceRecord["status"]) {
  switch (status) {
    case "ready":
      return { label: "Ready", color: "var(--color-success)", background: "#dcfce7" };
    case "syncing":
      return { label: "Syncing", color: "var(--color-signal-blue)", background: "var(--color-signal-blue-surface)" };
    case "configured":
      return { label: "Configured", color: "var(--color-ink-700)", background: "var(--color-panel-soft)" };
    case "disabled":
      return { label: "Disabled", color: "var(--color-ink-500)", background: "var(--color-panel-soft)" };
    case "missing_credentials":
      return { label: "Missing credentials", color: "var(--color-warning)", background: "#fef3c7" };
    case "error":
    default:
      return { label: "Error", color: "var(--color-danger)", background: "#fee2e2" };
  }
}

export function summarizeSourceConfig(source: AnalyticsSourceRecord) {
  const config = source.config ?? {};

  if (source.sourceType === "appmetrica_logs") {
    const appIds = Array.isArray(config.appIds) ? config.appIds.join(", ") : "No app ids";
    const eventNames = Array.isArray(config.eventNames) && config.eventNames.length > 0
      ? `${config.eventNames.length} tracked events`
      : "All events";
    return `${appIds} · ${eventNames}`;
  }

  if (source.sourceType === "bigquery_export") {
    const projectId = typeof config.sourceProjectId === "string" ? config.sourceProjectId : "unknown project";
    const dataset = typeof config.sourceDataset === "string" ? config.sourceDataset : "unknown dataset";
    return `${projectId}.${dataset}`;
  }

  if (source.sourceType === "unity_ads_spend" || source.sourceType === "google_ads_spend") {
    const enabled = config.enabled === true ? "enabled" : "disabled";
    const projectId = typeof config.sourceProjectId === "string" ? config.sourceProjectId : null;
    const dataset = typeof config.sourceDataset === "string" ? config.sourceDataset : null;
    const target = projectId && dataset ? `${projectId}.${dataset}` : "not configured";
    return `${enabled} · ${target}`;
  }

  if (source.sourceType === "bounds_artifacts") {
    const bucket = typeof config.bucket === "string" ? config.bucket : "bucket not set";
    const prefix = typeof config.prefix === "string" ? config.prefix : "prefix not set";
    return `${bucket} · ${prefix}`;
  }

  return source.deliveryMode;
}

export function flattenRuns(bundles: AnalyticsProjectBundle[]) {
  return bundles
    .flatMap((bundle) =>
      bundle.latestRuns.map((run) => ({
        projectId: bundle.project.id,
        projectSlug: bundle.project.slug,
        projectName: bundle.project.displayName,
        run,
      }))
    )
    .sort((left, right) => compareRunsDesc(left.run, right.run));
}

export function findLatestRun(
  bundle: AnalyticsProjectBundle,
  runTypes?: AnalyticsSyncRunRecord["runType"][]
) {
  const candidates = runTypes
    ? bundle.latestRuns.filter((run) => runTypes.includes(run.runType))
    : bundle.latestRuns;

  return [...candidates].sort(compareRunsDesc)[0] ?? null;
}

export function countScopedRuns(
  bundles: AnalyticsProjectBundle[],
  predicate: (run: AnalyticsSyncRunRecord) => boolean
) {
  return bundles.flatMap((bundle) => bundle.latestRuns).filter(predicate).length;
}

export function bundleKeyFromProjectName(projectName: string) {
  return projectNameToKey(projectName);
}
