import { describe, expect, it } from "vitest";
import type { AnalyticsProjectBundle } from "@/lib/platform/store";
import { buildForecastPipelineSnapshot } from "@/lib/data/forecast-progress";

function makeBundle(): AnalyticsProjectBundle {
  const now = new Date("2026-04-20T00:00:00.000Z");

  return {
    project: {
      id: "project-hidden-objects-1",
      slug: "hidden-objects-1",
      displayName: "Hidden Objects 1",
      description: "",
      ownerTeam: "Client Services",
      status: "live",
      gcpProjectId: "analytics-platform-493522",
      gcsBucket: "analytics-platform-493522-hidden-objects-1",
      rawDataset: "raw",
      stgDataset: "stg",
      martDataset: "mart",
      boundsPath: "gs://analytics-platform-493522-hidden-objects-1/bounds/hidden-objects-1",
      defaultGranularityDays: 7,
      refreshIntervalHours: 24,
      forecastIntervalHours: 24,
      boundsIntervalHours: 0,
      lookbackDays: 30,
      initialBackfillDays: 30,
      forecastHorizonDays: 730,
      settings: {
        autoProvisionInfrastructure: true,
        provisioningRegion: "us-central1",
        autoBootstrapOnCreate: true,
        forecastStrategy: {
          precomputePrimaryForecasts: true,
          enableOnDemandForecasts: true,
          expandPrimaryMatrix: true,
          recentCombinationLimit: 50,
          primaryCountries: ["US"],
          primarySegments: ["all"],
          primarySpendSources: ["Unity Ads"],
          primaryPlatforms: ["android"],
        },
      },
      createdBy: "tester@example.com",
      updatedBy: "tester@example.com",
      createdAt: now,
      updatedAt: now,
    },
    sources: [
      {
        id: "source-appmetrica",
        projectId: "project-hidden-objects-1",
        sourceType: "appmetrica_logs",
        label: "AppMetrica Logs",
        status: "ready",
        deliveryMode: "pull",
        frequencyHours: 24,
        lastSyncAt: now,
        nextSyncAt: now,
        secretPresent: true,
        secretHint: null,
        config: {},
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "source-warehouse",
        projectId: "project-hidden-objects-1",
        sourceType: "bigquery_export",
        label: "Warehouse Export",
        status: "ready",
        deliveryMode: "pull",
        frequencyHours: 24,
        lastSyncAt: now,
        nextSyncAt: now,
        secretPresent: true,
        secretHint: null,
        config: {},
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "source-bounds",
        projectId: "project-hidden-objects-1",
        sourceType: "bounds_artifacts",
        label: "Bounds Artifacts",
        status: "ready",
        deliveryMode: "push",
        frequencyHours: 0,
        lastSyncAt: now,
        nextSyncAt: null,
        secretPresent: false,
        secretHint: null,
        config: {},
        createdAt: now,
        updatedAt: now,
      },
    ],
    latestRuns: [
      {
        id: "run-bounds-failed",
        projectId: "project-hidden-objects-1",
        runType: "bounds_refresh",
        triggerKind: "manual",
        sourceType: "bounds_artifacts",
        status: "failed",
        requestedBy: "tester@example.com",
        requestedAt: new Date("2026-04-19T22:00:00.000Z"),
        startedAt: new Date("2026-04-19T22:01:00.000Z"),
        finishedAt: new Date("2026-04-19T22:02:00.000Z"),
        windowFrom: null,
        windowTo: null,
        message: "Old manual bounds refresh failed.",
        payload: {},
      },
    ],
  };
}

describe("forecast progress", () => {
  it("treats stale manual-only bounds failures as non-blocking when artifacts already exist", () => {
    const snapshot = buildForecastPipelineSnapshot(makeBundle(), null);
    const boundsStage = snapshot.stages.find((stage) => stage.key === "bounds");

    expect(boundsStage).toBeDefined();
    expect(boundsStage?.status).toBe("ready");
    expect(boundsStage?.message).toContain("manual-only");
    expect(boundsStage?.message).not.toContain("failed");
  });
});
