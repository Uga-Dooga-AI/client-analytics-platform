import { describe, expect, it } from "vitest";
import { buildAnalyticsRuntimeBundle } from "./runtime-bundle";
import type { AnalyticsProjectBundle } from "./store";

function buildFixture(): AnalyticsProjectBundle {
  const now = new Date("2026-04-15T10:00:00.000Z");

  return {
    project: {
      id: "project-1",
      slug: "word-catcher",
      displayName: "Word Catcher",
      description: "",
      ownerTeam: "Client Services",
      status: "ready",
      gcpProjectId: "ugada-word-catcher-prod",
      gcsBucket: "ugada-analytics-word-catcher",
      rawDataset: "raw",
      stgDataset: "stg",
      martDataset: "mart",
      boundsPath: "gs://ugada-analytics-word-catcher/bounds/word-catcher/",
      defaultGranularityDays: 7,
      refreshIntervalHours: 6,
      forecastIntervalHours: 12,
      boundsIntervalHours: 720,
      lookbackDays: 1,
      initialBackfillDays: 180,
      forecastHorizonDays: 120,
      settings: {
        autoProvisionInfrastructure: true,
        provisioningRegion: "europe-west1",
        autoBootstrapOnCreate: true,
        forecastStrategy: {
          precomputePrimaryForecasts: true,
          enableOnDemandForecasts: true,
          expandPrimaryMatrix: true,
          recentCombinationLimit: 50,
          primaryCountries: ["US", "GB"],
          primarySegments: ["all_users", "paid_users"],
          primarySpendSources: ["all_sources", "unity_ads", "google_ads"],
          primaryPlatforms: ["all", "ios", "android"],
        },
      },
      createdBy: "tester",
      updatedBy: "tester",
      createdAt: now,
      updatedAt: now,
    },
    sources: [
      {
        id: "src-appmetrica",
        projectId: "project-1",
        sourceType: "appmetrica_logs",
        label: "AppMetrica Logs API",
        status: "ready",
        deliveryMode: "Logs API · D+1",
        frequencyHours: 6,
        lastSyncAt: now,
        nextSyncAt: now,
        secretPresent: true,
        secretHint: "••••1234",
        config: {
          appIds: ["wc-ios-01", "wc-android-01"],
          eventNames: ["session_start", "purchase"],
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "src-bigquery",
        projectId: "project-1",
        sourceType: "bigquery_export",
        label: "BigQuery export",
        status: "ready",
        deliveryMode: "Dataset pull",
        frequencyHours: 6,
        lastSyncAt: now,
        nextSyncAt: now,
        secretPresent: true,
        secretHint: "svc@test",
        config: {
          sourceProjectId: "ugada-ga4-word-catcher",
          sourceDataset: "analytics_export",
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "src-bounds",
        projectId: "project-1",
        sourceType: "bounds_artifacts",
        label: "Bounds artifacts",
        status: "ready",
        deliveryMode: "GCS manifest",
        frequencyHours: 24,
        lastSyncAt: now,
        nextSyncAt: now,
        secretPresent: false,
        secretHint: null,
        config: {
          bucket: "ugada-analytics-word-catcher",
          prefix: "bounds/word-catcher/",
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "src-unity",
        projectId: "project-1",
        sourceType: "unity_ads_spend",
        label: "Unity Ads spend",
        status: "ready",
        deliveryMode: "BigQuery mirror",
        frequencyHours: 6,
        lastSyncAt: now,
        nextSyncAt: now,
        secretPresent: false,
        secretHint: null,
        config: {
          enabled: true,
          mode: "bigquery",
          sourceProjectId: "unity-ads-398711",
          sourceDataset: "campaigns_days",
          tablePattern: "day_*",
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "src-google-ads",
        projectId: "project-1",
        sourceType: "google_ads_spend",
        label: "Google Ads spend",
        status: "ready",
        deliveryMode: "BigQuery mirror",
        frequencyHours: 6,
        lastSyncAt: now,
        nextSyncAt: now,
        secretPresent: false,
        secretHint: null,
        config: {
          enabled: true,
          mode: "bigquery",
          sourceProjectId: "civic-gate-406811",
          sourceDataset: "google_ads_9377834221",
          tablePattern: "p_ads_*",
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
    latestRuns: [],
  };
}

describe("buildAnalyticsRuntimeBundle", () => {
  it("builds ingestion and forecast runtime sections from project config", () => {
    const bundle = buildAnalyticsRuntimeBundle(buildFixture(), {
      baseUrl: "https://analytics.example.com",
    });

    expect(bundle.project.slug).toBe("word-catcher");
    expect(bundle.ingestion.jobName).toContain("ingestion");
    expect(bundle.ingestion.configYaml).toContain("app_ids:");
    expect(bundle.ingestion.configYaml).toContain("spend_sources:");
    expect(bundle.ingestion.secrets.find((secret) => secret.name === "APPMETRICA_TOKEN")?.present).toBe(true);
    expect(bundle.forecasts.configYaml).toContain("horizon_days: 120");
    expect(bundle.forecasts.configYaml).toContain("recentCombinationLimit: 50");
    expect(bundle.forecasts.configYaml).toContain("expandPrimaryMatrix: true");
    expect(bundle.forecasts.configYaml).toContain("project_slug: word-catcher");
    expect(bundle.forecasts.configYaml).toContain("location: US");
    expect(bundle.ingestion.env.some((entry) => entry.name === "BQ_LOCATION" && entry.value === "US")).toBe(true);
    expect(bundle.forecasts.configYaml).toContain("- revenue");
    expect(bundle.forecasts.configYaml).toContain("- guardrail_crashes");
    expect(bundle.forecasts.configYaml).not.toContain("ad_revenue");
    expect(bundle.forecasts.configYaml).not.toContain("- spend");
    expect(bundle.dbt.commands[0]).toContain("gcp_project_id: ugada-word-catcher-prod");
    expect(bundle.dbt.commands[1]).toContain("mart_forecast_points");
    expect(bundle.callbacks.endpoints.claimRunPath).toContain("/api/internal/projects/project-1/claim-run");
    expect(bundle.callbacks.endpoints.runStatusPathTemplate).toContain("/api/internal/runs/{runId}");
    expect(bundle.callbacks.endpoints.forecastCombinationPath).toContain(
      "/api/internal/projects/project-1/forecast-combinations"
    );
    expect(bundle.provisioning.autoCreateInfrastructure).toBe(true);
  });
});
