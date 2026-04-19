import type {
  AnalyticsForecastCombinationRecord,
  AnalyticsProjectBundle,
  AnalyticsRunStatus,
  AnalyticsRunType,
  AnalyticsSourceRecord,
  AnalyticsSyncRunRecord,
} from "@/lib/platform/store";

export type ForecastPipelineStageStatus =
  | "ready"
  | "running"
  | "queued"
  | "blocked"
  | "failed"
  | "waiting_credentials";

export type ForecastPipelineStage = {
  key: "sources" | "bounds" | "forecast";
  label: string;
  status: ForecastPipelineStageStatus;
  message: string;
  progressPercent: number;
  updatedAt: string | null;
  runId: string | null;
  runType: AnalyticsRunType | null;
};

export type ForecastPipelineSnapshot = {
  combinationKey: string | null;
  combinationLabel: string | null;
  combinationStatus: AnalyticsRunStatus | null;
  stages: ForecastPipelineStage[];
};

const ACTIVE_RUN_STATUSES = new Set<AnalyticsRunStatus>([
  "queued",
  "blocked",
  "running",
  "waiting_credentials",
]);

const CRITICAL_SOURCE_TYPES = new Set(["appmetrica_logs", "bigquery_export"]);

function serializeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function stageProgress(status: ForecastPipelineStageStatus) {
  switch (status) {
    case "ready":
      return 100;
    case "running":
      return 72;
    case "queued":
      return 24;
    case "blocked":
      return 8;
    case "waiting_credentials":
      return 4;
    case "failed":
    default:
      return 100;
  }
}

function compareRunFreshness(left: AnalyticsSyncRunRecord, right: AnalyticsSyncRunRecord) {
  const leftTime = left.finishedAt?.getTime() ?? left.startedAt?.getTime() ?? left.requestedAt.getTime();
  const rightTime = right.finishedAt?.getTime() ?? right.startedAt?.getTime() ?? right.requestedAt.getTime();
  return leftTime - rightTime;
}

function sortRunsByFreshness(runs: AnalyticsSyncRunRecord[]) {
  return [...runs].sort((left, right) => compareRunFreshness(right, left));
}

function latestRun(
  bundle: AnalyticsProjectBundle,
  runTypes: AnalyticsRunType[],
  statuses?: AnalyticsRunStatus[]
) {
  const filtered = bundle.latestRuns.filter(
    (run) =>
      runTypes.includes(run.runType) &&
      (statuses ? statuses.includes(run.status) : true)
  );
  return sortRunsByFreshness(filtered)[0] ?? null;
}

function latestSuccessfulRun(bundle: AnalyticsProjectBundle, runTypes: AnalyticsRunType[]) {
  return latestRun(bundle, runTypes, ["succeeded"]);
}

function latestFailedRun(bundle: AnalyticsProjectBundle, runTypes: AnalyticsRunType[]) {
  return latestRun(bundle, runTypes, ["failed"]);
}

function latestActiveRun(bundle: AnalyticsProjectBundle, runTypes: AnalyticsRunType[]) {
  const filtered = bundle.latestRuns.filter(
    (run) => runTypes.includes(run.runType) && ACTIVE_RUN_STATUSES.has(run.status)
  );
  return sortRunsByFreshness(filtered)[0] ?? null;
}

function statusFromRun(run: AnalyticsSyncRunRecord): ForecastPipelineStageStatus {
  if (run.status === "succeeded") {
    return "ready";
  }
  return run.status;
}

function buildRunStage(
  key: ForecastPipelineStage["key"],
  label: string,
  run: AnalyticsSyncRunRecord
): ForecastPipelineStage {
  const status = statusFromRun(run);
  return {
    key,
    label,
    status,
    message: run.message ?? `${label} ${status}.`,
    progressPercent: stageProgress(status),
    updatedAt: serializeDate(run.finishedAt ?? run.startedAt ?? run.requestedAt),
    runId: run.id,
    runType: run.runType,
  };
}

function summarizeSourceIssue(source: AnalyticsSourceRecord) {
  if (source.status === "missing_credentials") {
    return `${source.label} is missing credentials.`;
  }
  if (source.status === "configured") {
    return `${source.label} is configured but not ready yet.`;
  }
  if (source.status === "error") {
    return `${source.label} is in error state.`;
  }
  return `${source.label} is not ready.`;
}

function summarizeUnsyncedSource(source: AnalyticsSourceRecord) {
  return `${source.label} is configured, but the first successful sync has not completed yet.`;
}

function buildSourceStage(bundle: AnalyticsProjectBundle): ForecastPipelineStage {
  const criticalSources = bundle.sources.filter((source) =>
    CRITICAL_SOURCE_TYPES.has(source.sourceType)
  );
  const missingSources = criticalSources.filter((source) => source.status !== "ready");
  const unsyncedReadySources = criticalSources.filter(
    (source) => source.status === "ready" && !source.lastSyncAt
  );
  const active = latestActiveRun(bundle, ["backfill", "ingestion"]);
  if (active) {
    return buildRunStage("sources", "Source Sync", active);
  }
  if (missingSources.length > 0) {
    const message =
      missingSources.length === 1
        ? summarizeSourceIssue(missingSources[0]!)
        : `${missingSources.length} critical sources are not ready yet.`;
    return {
      key: "sources",
      label: "Source Sync",
      status: "waiting_credentials",
      message,
      progressPercent: stageProgress("waiting_credentials"),
      updatedAt: null,
      runId: null,
      runType: null,
    };
  }
  if (unsyncedReadySources.length > 0) {
    const message =
      unsyncedReadySources.length === 1
        ? summarizeUnsyncedSource(unsyncedReadySources[0]!)
        : `${unsyncedReadySources.length} critical sources are configured, but their first sync has not completed yet.`;
    return {
      key: "sources",
      label: "Source Sync",
      status: "blocked",
      message,
      progressPercent: stageProgress("blocked"),
      updatedAt: null,
      runId: null,
      runType: null,
    };
  }

  const failed = latestFailedRun(bundle, ["backfill", "ingestion"]);
  const success = latestSuccessfulRun(bundle, ["backfill", "ingestion"]);
  if (failed && (!success || compareRunFreshness(failed, success) > 0)) {
    return buildRunStage("sources", "Source Sync", failed);
  }
  if (success) {
    return {
      key: "sources",
      label: "Source Sync",
      status: "ready",
      message: success.message ?? "Latest source sync finished successfully.",
      progressPercent: stageProgress("ready"),
      updatedAt: serializeDate(success.finishedAt ?? success.startedAt ?? success.requestedAt),
      runId: success.id,
      runType: success.runType,
    };
  }

  return {
    key: "sources",
    label: "Source Sync",
    status: "blocked",
    message: "No successful ingestion or backfill run has completed yet.",
    progressPercent: stageProgress("blocked"),
    updatedAt: null,
    runId: null,
    runType: null,
  };
}

function buildBoundsStage(
  bundle: AnalyticsProjectBundle,
  sourceStage: ForecastPipelineStage
): ForecastPipelineStage {
  const active = latestActiveRun(bundle, ["bounds_refresh"]);
  if (active) {
    return buildRunStage("bounds", "Bounds Refresh", active);
  }

  const failed = latestFailedRun(bundle, ["bounds_refresh"]);
  const success = latestSuccessfulRun(bundle, ["bounds_refresh"]);
  const latestSourceSuccess = latestSuccessfulRun(bundle, ["backfill", "ingestion"]);

  if (failed && (!success || compareRunFreshness(failed, success) > 0)) {
    return buildRunStage("bounds", "Bounds Refresh", failed);
  }

  if (
    success &&
    (!latestSourceSuccess || compareRunFreshness(success, latestSourceSuccess) >= 0)
  ) {
    return {
      key: "bounds",
      label: "Bounds Refresh",
      status: "ready",
      message: success.message ?? "Bounds are up to date for the latest synced source data.",
      progressPercent: stageProgress("ready"),
      updatedAt: serializeDate(success.finishedAt ?? success.startedAt ?? success.requestedAt),
      runId: success.id,
      runType: success.runType,
    };
  }

  if (sourceStage.status === "waiting_credentials") {
    return {
      key: "bounds",
      label: "Bounds Refresh",
      status: "waiting_credentials",
      message: "Bounds cannot refresh until critical source credentials are fixed.",
      progressPercent: stageProgress("waiting_credentials"),
      updatedAt: null,
      runId: null,
      runType: null,
    };
  }

  return {
    key: "bounds",
    label: "Bounds Refresh",
    status: "blocked",
    message:
      latestSourceSuccess
        ? "Bounds are older than the latest source sync and need a rebuild."
        : "Bounds are waiting for the first successful source sync.",
    progressPercent: stageProgress("blocked"),
    updatedAt: serializeDate(latestSourceSuccess?.finishedAt ?? latestSourceSuccess?.requestedAt),
    runId: null,
    runType: null,
  };
}

function findCombinationRun(
  bundle: AnalyticsProjectBundle,
  combination: AnalyticsForecastCombinationRecord | null
) {
  if (!combination?.lastForecastRunId) {
    return null;
  }
  return (
    bundle.latestRuns.find((run) => run.id === combination.lastForecastRunId) ?? null
  );
}

function buildForecastStage(
  bundle: AnalyticsProjectBundle,
  combination: AnalyticsForecastCombinationRecord | null,
  boundsStage: ForecastPipelineStage
): ForecastPipelineStage {
  const combinationRun = findCombinationRun(bundle, combination);
  const active = combinationRun && ACTIVE_RUN_STATUSES.has(combinationRun.status)
    ? combinationRun
    : latestActiveRun(bundle, ["forecast"]);
  if (active) {
    return buildRunStage("forecast", "Forecast Run", active);
  }

  const failed =
    combinationRun?.status === "failed"
      ? combinationRun
      : latestFailedRun(bundle, ["forecast"]);
  const success =
    combinationRun?.status === "succeeded"
      ? combinationRun
      : latestSuccessfulRun(bundle, ["forecast"]);
  const latestBoundsSuccess = latestSuccessfulRun(bundle, ["bounds_refresh"]);

  if (failed && (!success || compareRunFreshness(failed, success) > 0)) {
    return buildRunStage("forecast", "Forecast Run", failed);
  }

  if (combination && !combination.lastForecastRunId && bundle.project.settings.forecastStrategy.enableOnDemandForecasts) {
    return {
      key: "forecast",
      label: "Forecast Run",
      status: "blocked",
      message: "This slice has not registered an on-demand forecast run yet. The page will queue it after load if needed.",
      progressPercent: stageProgress("blocked"),
      updatedAt: serializeDate(combination.lastViewedAt),
      runId: null,
      runType: null,
    };
  }

  if (
    success &&
    (!latestBoundsSuccess || compareRunFreshness(success, latestBoundsSuccess) >= 0)
  ) {
    return {
      key: "forecast",
      label: "Forecast Run",
      status: "ready",
      message: success.message ?? "Latest forecast artifacts are up to date.",
      progressPercent: stageProgress("ready"),
      updatedAt: serializeDate(success.finishedAt ?? success.startedAt ?? success.requestedAt),
      runId: success.id,
      runType: success.runType,
    };
  }

  if (boundsStage.status === "waiting_credentials") {
    return {
      key: "forecast",
      label: "Forecast Run",
      status: "waiting_credentials",
      message: "Forecast execution cannot start until upstream credentials and bounds are ready.",
      progressPercent: stageProgress("waiting_credentials"),
      updatedAt: null,
      runId: null,
      runType: null,
    };
  }

  return {
    key: "forecast",
    label: "Forecast Run",
    status: "blocked",
    message:
      latestBoundsSuccess
        ? "Forecast output is older than the latest bounds refresh and needs a rerun."
        : "Forecast is waiting for the first successful bounds refresh.",
    progressPercent: stageProgress("blocked"),
    updatedAt: serializeDate(latestBoundsSuccess?.finishedAt ?? latestBoundsSuccess?.requestedAt),
    runId: combination?.lastForecastRunId ?? null,
    runType: "forecast",
  };
}

export function serializeForecastPipelineSnapshot(snapshot: ForecastPipelineSnapshot) {
  return snapshot;
}

export function buildForecastPipelineSnapshot(
  bundle: AnalyticsProjectBundle,
  combination: AnalyticsForecastCombinationRecord | null
): ForecastPipelineSnapshot {
  const sourceStage = buildSourceStage(bundle);
  const boundsStage = buildBoundsStage(bundle, sourceStage);
  const forecastStage = buildForecastStage(bundle, combination, boundsStage);

  return {
    combinationKey: combination?.combinationKey ?? null,
    combinationLabel: combination?.label ?? null,
    combinationStatus: combination?.lastForecastStatus ?? null,
    stages: [sourceStage, boundsStage, forecastStage],
  };
}
