import type { AnalyticsProjectBundle } from "./store";

export type RuntimeBundleSection = {
  jobName: string;
  image: string;
  configYaml: string;
  env: Array<{ name: string; value: string; sensitive?: boolean }>;
  secrets: Array<{ name: string; source: string; present: boolean }>;
  commands: string[];
  scheduler: {
    intervalHours: number;
    cronHint: string;
    note: string;
  };
};

export type AnalyticsRuntimeBundle = {
  project: {
    slug: string;
    displayName: string;
    gcpProjectId: string;
    datasets: {
      raw: string;
      stg: string;
      mart: string;
    };
    storage: {
      bucket: string;
      boundsPath: string;
    };
    settings: AnalyticsProjectBundle["project"]["settings"];
  };
  provisioning: {
    region: string;
    autoCreateInfrastructure: boolean;
    bucket: string;
    datasets: {
      raw: string;
      stg: string;
      mart: string;
    };
    notes: string[];
  };
  spendSources: {
    unityAds: Record<string, unknown>;
    googleAds: Record<string, unknown>;
  };
  ingestion: RuntimeBundleSection;
  forecasts: RuntimeBundleSection;
  callbacks: {
    auth: string;
    endpoints: {
      runtimeBundlePath: string;
      claimRunPath: string;
      runStatusPathTemplate: string;
      forecastCombinationPath: string;
    };
    exampleHeaders: Record<string, string>;
  };
  dbt: {
    varsYaml: string;
    commands: string[];
  };
  notes: string[];
};

function toYaml(value: unknown, depth = 0): string {
  const indent = "  ".repeat(depth);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    return value
      .map((item) => {
        if (item && typeof item === "object") {
          const nested = toYaml(item, depth + 1);
          return `${indent}- ${nested.startsWith("\n") ? nested.slice(1) : nested.replace(/^/, "\n")}`;
        }
        return `${indent}- ${formatScalar(item)}`;
      })
      .join("\n");
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return "{}";
    }

    return entries
      .map(([key, nestedValue]) => {
        if (
          nestedValue &&
          typeof nestedValue === "object" &&
          ((Array.isArray(nestedValue) && nestedValue.length > 0) ||
            (!Array.isArray(nestedValue) && Object.keys(nestedValue as Record<string, unknown>).length > 0))
        ) {
          return `${indent}${key}:\n${toYaml(nestedValue, depth + 1)}`;
        }

        return `${indent}${key}: ${formatScalar(nestedValue)}`;
      })
      .join("\n");
  }

  return `${indent}${formatScalar(value)}`;
}

function formatScalar(value: unknown) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "string") {
    if (value.length === 0) {
      return '""';
    }

    if (/^[a-zA-Z0-9._/-]+$/.test(value)) {
      return value;
    }

    return JSON.stringify(value);
  }

  return JSON.stringify(value);
}

function buildCronHint(intervalHours: number) {
  if (intervalHours === 24) {
    return "0 4 * * *";
  }

  if (intervalHours > 0 && 24 % intervalHours === 0) {
    return `0 */${intervalHours} * * *`;
  }

  return "custom cadence";
}

function inferWarehouseLocation(region: string) {
  // Cloud Run region and BigQuery dataset location are decoupled.
  // Default to US unless an explicit warehouse-location field is introduced.
  void region;
  return "US";
}

function jobBaseName(bundle: AnalyticsProjectBundle) {
  return `analytics-${bundle.project.slug}`;
}

function buildForecastPrewarmPlan(settings: AnalyticsProjectBundle["project"]["settings"]) {
  const strategy = settings.forecastStrategy;
  const axes = {
    segments: strategy.primarySegments,
    countries: strategy.primaryCountries,
    spendSources: strategy.primarySpendSources,
    platforms: strategy.primaryPlatforms,
  };

  return {
    expandPrimaryMatrix: strategy.expandPrimaryMatrix,
    axes,
    estimatedCombinationCount: strategy.expandPrimaryMatrix
      ? Math.max(1, axes.segments.length)
        * Math.max(1, axes.countries.length)
        * Math.max(1, axes.spendSources.length)
        * Math.max(1, axes.platforms.length)
      : axes.segments.length + axes.countries.length + axes.spendSources.length + axes.platforms.length,
  };
}

const FORECAST_RUNTIME_METRICS = [
  "revenue",
] as const;

export function buildAnalyticsRuntimeBundle(
  bundle: AnalyticsProjectBundle,
  options?: { baseUrl?: string }
): AnalyticsRuntimeBundle {
  const appmetrica = bundle.sources.find((source) => source.sourceType === "appmetrica_logs");
  const bigquery = bundle.sources.find((source) => source.sourceType === "bigquery_export");
  const bounds = bundle.sources.find((source) => source.sourceType === "bounds_artifacts");
  const unityAds = bundle.sources.find((source) => source.sourceType === "unity_ads_spend");
  const googleAds = bundle.sources.find((source) => source.sourceType === "google_ads_spend");
  const baseUrl = options?.baseUrl ?? "";
  const jobName = jobBaseName(bundle);
  const warehouseLocation = inferWarehouseLocation(bundle.project.settings.provisioningRegion);
  const prewarmPlan = buildForecastPrewarmPlan(bundle.project.settings);
  const rawPrefix = `raw/${bundle.project.slug}/appmetrica`;
  const runtimeBundlePath = `/api/internal/projects/${bundle.project.id}/runtime-bundle`;
  const claimRunPath = `/api/internal/projects/${bundle.project.id}/claim-run`;
  const runStatusPathTemplate = `/api/internal/runs/{runId}`;
  const forecastCombinationPath = `/api/internal/projects/${bundle.project.id}/forecast-combinations`;

  const ingestionConfig = {
    provisioning: {
      region: bundle.project.settings.provisioningRegion,
      auto_create_infrastructure: bundle.project.settings.autoProvisionInfrastructure,
      datasets: {
        raw: bundle.project.rawDataset,
        stg: bundle.project.stgDataset,
        mart: bundle.project.martDataset,
      },
      bucket: bundle.project.gcsBucket,
    },
    appmetrica: {
      app_ids: Array.isArray(appmetrica?.config.appIds) ? appmetrica?.config.appIds : [],
      event_names: Array.isArray(appmetrica?.config.eventNames) ? appmetrica?.config.eventNames : [],
      lookback_days: bundle.project.lookbackDays,
    },
    gcs: {
      bucket: bounds?.config.bucket || bundle.project.gcsBucket,
      prefix: rawPrefix,
    },
    bigquery: {
      project_id: bundle.project.gcpProjectId,
      location: warehouseLocation,
      raw_dataset: bundle.project.rawDataset,
      stg_dataset: bundle.project.stgDataset,
      mart_dataset: bundle.project.martDataset,
      events_table: `${bundle.project.slug.replace(/-/g, "_")}_appmetrica_events`,
      installs_table: `${bundle.project.slug.replace(/-/g, "_")}_appmetrica_installs`,
      sessions_table: `${bundle.project.slug.replace(/-/g, "_")}_appmetrica_sessions`,
    },
    spend_sources: {
      unity_ads: unityAds?.config ?? { enabled: false },
      google_ads: googleAds?.config ?? { enabled: false },
    },
    schedule: {
      interval_hours: bundle.project.refreshIntervalHours,
      initial_backfill_days: bundle.project.initialBackfillDays,
    },
  };

  const forecastsConfig = {
    project_slug: bundle.project.slug,
    bigquery: {
      project_id: bundle.project.gcpProjectId,
      location: warehouseLocation,
      raw_dataset: bundle.project.rawDataset,
      stg_dataset: bundle.project.stgDataset,
      mart_dataset: bundle.project.martDataset,
      experiment_daily_table: `${bundle.project.slug.replace(/-/g, "_")}_experiment_daily`,
      forecast_table: `${bundle.project.slug.replace(/-/g, "_")}_forecast_points`,
    },
    forecast: {
      horizon_days: bundle.project.forecastHorizonDays,
      min_history_days: Math.max(14, bundle.project.defaultGranularityDays * 2),
      engine: "auto",
      confidence_interval: 0.8,
      metrics: [...FORECAST_RUNTIME_METRICS],
      bounds_bucket: bounds?.config.bucket || bundle.project.gcsBucket,
      bounds_prefix: bounds?.config.prefix || `bounds/${bundle.project.slug}/`,
      strategy: bundle.project.settings.forecastStrategy,
      prewarm_plan: prewarmPlan,
    },
    schedule: {
      forecast_interval_hours: bundle.project.forecastIntervalHours,
      bounds_refresh_hours: bundle.project.boundsIntervalHours,
    },
  };

  return {
    project: {
      slug: bundle.project.slug,
      displayName: bundle.project.displayName,
      gcpProjectId: bundle.project.gcpProjectId,
      datasets: {
        raw: bundle.project.rawDataset,
        stg: bundle.project.stgDataset,
        mart: bundle.project.martDataset,
      },
      storage: {
        bucket: bundle.project.gcsBucket,
        boundsPath: bundle.project.boundsPath,
      },
      settings: bundle.project.settings,
    },
    provisioning: {
      region: bundle.project.settings.provisioningRegion,
      autoCreateInfrastructure: bundle.project.settings.autoProvisionInfrastructure,
      bucket: bundle.project.gcsBucket,
      datasets: {
        raw: bundle.project.rawDataset,
        stg: bundle.project.stgDataset,
        mart: bundle.project.martDataset,
      },
      notes: [
        "When autoCreateInfrastructure is true, the first live worker should ensure the GCS bucket and raw/stg/mart/meta datasets exist before ingesting data.",
        "Bounds artifacts stay in the same bucket unless a dedicated bounds bucket is configured.",
      ],
    },
    spendSources: {
      unityAds: unityAds?.config ?? { enabled: false },
      googleAds: googleAds?.config ?? { enabled: false },
    },
    ingestion: {
      jobName: `${jobName}-ingestion`,
      image: `gcr.io/${bundle.project.gcpProjectId || "REPLACE_GCP_PROJECT"}/${jobName}-ingestion:latest`,
      configYaml: toYaml(ingestionConfig),
      env: [
        { name: "GCP_PROJECT_ID", value: bundle.project.gcpProjectId || "REPLACE_GCP_PROJECT" },
        { name: "GCS_BUCKET", value: String(bounds?.config.bucket || bundle.project.gcsBucket || "REPLACE_BUCKET") },
        { name: "BQ_DATASET", value: bundle.project.rawDataset },
        { name: "BQ_LOCATION", value: warehouseLocation },
        { name: "JOB_CONFIG_PATH", value: "/workspace/runtime/ingestion.job.yml" },
        { name: "WORKER_CONTROL_BASE_URL", value: baseUrl || "https://REPLACE_HOST" },
      ],
      secrets: [
        { name: "APPMETRICA_TOKEN", source: "settings.appmetricaToken", present: appmetrica?.secretPresent ?? false },
        {
          name: "GOOGLE_APPLICATION_CREDENTIALS",
          source: "settings.bigqueryServiceAccountJson",
          present: bigquery?.secretPresent ?? false,
        },
        { name: "WORKER_CONTROL_SECRET", source: "runtime env", present: false },
      ],
      commands: [
        `gcloud run jobs create ${jobName}-ingestion --image gcr.io/${bundle.project.gcpProjectId || "REPLACE_GCP_PROJECT"}/${jobName}-ingestion:latest --region ${bundle.project.settings.provisioningRegion} --project ${bundle.project.gcpProjectId || "REPLACE_GCP_PROJECT"}`,
        `gcloud run jobs execute ${jobName}-ingestion --region ${bundle.project.settings.provisioningRegion} --project ${bundle.project.gcpProjectId || "REPLACE_GCP_PROJECT"}`,
      ],
      scheduler: {
        intervalHours: bundle.project.refreshIntervalHours,
        cronHint: buildCronHint(bundle.project.refreshIntervalHours),
        note: "Use the admin control plane cadence as the source of truth; scheduler should only mirror it.",
      },
    },
    forecasts: {
      jobName: `${jobName}-forecasts`,
      image: `gcr.io/${bundle.project.gcpProjectId || "REPLACE_GCP_PROJECT"}/${jobName}-forecasts:latest`,
      configYaml: toYaml(forecastsConfig),
      env: [
        { name: "GCP_PROJECT_ID", value: bundle.project.gcpProjectId || "REPLACE_GCP_PROJECT" },
        { name: "BQ_MART_DATASET", value: bundle.project.martDataset },
        { name: "BQ_LOCATION", value: warehouseLocation },
        { name: "JOB_CONFIG_PATH", value: "/workspace/runtime/forecasts.job.yml" },
        { name: "WORKER_CONTROL_BASE_URL", value: baseUrl || "https://REPLACE_HOST" },
      ],
      secrets: [
        {
          name: "GOOGLE_APPLICATION_CREDENTIALS",
          source: "settings.bigqueryServiceAccountJson",
          present: bigquery?.secretPresent ?? false,
        },
        { name: "WORKER_CONTROL_SECRET", source: "runtime env", present: false },
      ],
      commands: [
        `gcloud run jobs create ${jobName}-forecasts --image gcr.io/${bundle.project.gcpProjectId || "REPLACE_GCP_PROJECT"}/${jobName}-forecasts:latest --region ${bundle.project.settings.provisioningRegion} --project ${bundle.project.gcpProjectId || "REPLACE_GCP_PROJECT"}`,
        `gcloud run jobs execute ${jobName}-forecasts --region ${bundle.project.settings.provisioningRegion} --project ${bundle.project.gcpProjectId || "REPLACE_GCP_PROJECT"}`,
      ],
      scheduler: {
        intervalHours: bundle.project.forecastIntervalHours,
        cronHint: buildCronHint(bundle.project.forecastIntervalHours),
        note: "Forecast job should run only after ingestion and bounds publish complete.",
      },
    },
    callbacks: {
      auth: "Authorization: Bearer $WORKER_CONTROL_SECRET",
      endpoints: {
        runtimeBundlePath: `${baseUrl}${runtimeBundlePath}`,
        claimRunPath: `${baseUrl}${claimRunPath}`,
        runStatusPathTemplate: `${baseUrl}${runStatusPathTemplate}`,
        forecastCombinationPath: `${baseUrl}${forecastCombinationPath}`,
      },
      exampleHeaders: {
        Authorization: "Bearer $WORKER_CONTROL_SECRET",
        "Content-Type": "application/json",
      },
    },
    dbt: {
      varsYaml: toYaml({
        project_slug: bundle.project.slug,
        gcp_project_id: bundle.project.gcpProjectId,
        raw_dataset: bundle.project.rawDataset,
        stg_dataset: bundle.project.stgDataset,
        mart_dataset: bundle.project.martDataset,
      }),
      commands: [
        `dbt build --project-dir dbt --vars 'project_slug: ${bundle.project.slug}, gcp_project_id: ${bundle.project.gcpProjectId}, raw_dataset: ${bundle.project.rawDataset}, stg_dataset: ${bundle.project.stgDataset}, mart_dataset: ${bundle.project.martDataset}' --select +mart_experiment_daily +mart_cohort_daily +mart_daily_active_users +mart_funnel_daily +mart_installs_funnel +mart_revenue_metrics +mart_session_metrics`,
        `dbt build --project-dir dbt --vars 'project_slug: ${bundle.project.slug}, gcp_project_id: ${bundle.project.gcpProjectId}, raw_dataset: ${bundle.project.rawDataset}, stg_dataset: ${bundle.project.stgDataset}, mart_dataset: ${bundle.project.martDataset}' --select mart_forecast_points`,
      ],
    },
    notes: [
      "Project credentials stay in the control plane; worker config is generated from the registry, not handwritten.",
      "Bootstrap should auto-run after project creation: backfill → bounds refresh → forecast.",
      "Bounds artifacts should be published to GCS manifests and then read by forecasts and serving tables.",
      "Forecast strategy keeps a project-level matrix of segments, countries, spend sources, and platforms warm and remembers the last N viewed combinations for follow-up precompute.",
      "Cold forecast combinations can be registered through the control plane endpoint so workers can queue or prewarm them without redeploying config.",
      "Workers should PATCH run status back into the control plane so Settings reflects actual runtime progress.",
      "The current operational forecast worker is restricted to revenue until notebook-parity cohort forecasts replace the daily-series placeholder model.",
    ],
  };
}
