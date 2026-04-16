"use client";

import { useEffect, useMemo, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import type { AnalyticsRuntimeBundle } from "@/lib/platform/runtime-bundle";

type SerializedSource = {
  id: string;
  projectId: string;
  sourceType:
    | "appmetrica_logs"
    | "bigquery_export"
    | "bounds_artifacts"
    | "unity_ads_spend"
    | "google_ads_spend";
  label: string;
  status: string;
  deliveryMode: string;
  frequencyHours: number;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  secretPresent: boolean;
  secretHint: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type SerializedRun = {
  id: string;
  projectId: string;
  runType: string;
  triggerKind: string;
  sourceType: string | null;
  status: string;
  requestedBy: string | null;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  windowFrom: string | null;
  windowTo: string | null;
  message: string | null;
  payload: Record<string, unknown>;
};

type SerializedProject = {
  project: {
    id: string;
    slug: string;
    displayName: string;
    description: string;
    ownerTeam: string;
    status: string;
    gcpProjectId: string;
    gcsBucket: string;
    rawDataset: string;
    stgDataset: string;
    martDataset: string;
    boundsPath: string;
    defaultGranularityDays: number;
    refreshIntervalHours: number;
    forecastIntervalHours: number;
    boundsIntervalHours: number;
    lookbackDays: number;
    initialBackfillDays: number;
    forecastHorizonDays: number;
    settings: {
      autoProvisionInfrastructure: boolean;
      provisioningRegion: string;
      autoBootstrapOnCreate: boolean;
      forecastStrategy: {
        precomputePrimaryForecasts: boolean;
        enableOnDemandForecasts: boolean;
        expandPrimaryMatrix: boolean;
        recentCombinationLimit: number;
        primaryCountries: string[];
        primarySegments: string[];
        primarySpendSources: string[];
        primaryPlatforms: string[];
      };
    };
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
  };
  sources: SerializedSource[];
  latestRuns: SerializedRun[];
};

type MetricCatalogRow = {
  metric: string;
  owner: string;
  grain: string;
  status: string;
};

type ConfigPreview = {
  ingestionConfig: Record<string, unknown>;
  forecastConfig: Record<string, unknown>;
  operatingPlan: string[];
  notebookParity: {
    defaultGranularityDays: number;
    bigRangeSupport: boolean;
    notes: string[];
  };
  sourceRegistry: Record<string, unknown>;
};

type ProjectDraft = {
  slug: string;
  displayName: string;
  description: string;
  ownerTeam: string;
  gcpProjectId: string;
  gcsBucket: string;
  rawDataset: string;
  stgDataset: string;
  martDataset: string;
  boundsPath: string;
  defaultGranularityDays: number;
  refreshIntervalHours: number;
  forecastIntervalHours: number;
  boundsIntervalHours: number;
  lookbackDays: number;
  initialBackfillDays: number;
  forecastHorizonDays: number;
  autoProvisionInfrastructure: boolean;
  provisioningRegion: string;
  autoBootstrapOnCreate: boolean;
  precomputePrimaryForecasts: boolean;
  enableOnDemandForecasts: boolean;
  expandPrimaryMatrix: boolean;
  forecastRecentCombinationLimit: number;
  forecastPrimaryCountries: string;
  forecastPrimarySegments: string;
  forecastPrimarySpendSources: string;
  forecastPrimaryPlatforms: string;
  appmetricaAppIds: string;
  appmetricaEventNames: string;
  appmetricaToken: string;
  bigquerySourceProjectId: string;
  bigquerySourceDataset: string;
  bigqueryServiceAccountJson: string;
  unityAdsEnabled: boolean;
  unityAdsMode: "bigquery" | "api";
  unityAdsSourceProjectId: string;
  unityAdsSourceDataset: string;
  unityAdsTablePattern: string;
  unityAdsOrganizationId: string;
  unityAdsApiKey: string;
  googleAdsEnabled: boolean;
  googleAdsMode: "bigquery" | "api";
  googleAdsSourceProjectId: string;
  googleAdsSourceDataset: string;
  googleAdsTablePattern: string;
  googleAdsCustomerId: string;
  googleAdsDeveloperToken: string;
  googleAdsClientId: string;
  googleAdsClientSecret: string;
  googleAdsRefreshToken: string;
  googleAdsLoginCustomerId: string;
  boundsBucket: string;
  boundsPrefix: string;
};

const STATUS_TONE: Record<string, { color: string; background: string }> = {
  draft: { color: "var(--color-ink-600)", background: "var(--color-panel-soft)" },
  configuring: { color: "var(--color-warning)", background: "#fef3c7" },
  ready: { color: "var(--color-signal-blue)", background: "var(--color-signal-blue-surface)" },
  syncing: { color: "var(--color-signal-blue)", background: "#dbeafe" },
  live: { color: "var(--color-success)", background: "#dcfce7" },
  error: { color: "var(--color-danger)", background: "#fee2e2" },
  disabled: { color: "var(--color-ink-500)", background: "var(--color-panel-soft)" },
  missing_credentials: { color: "var(--color-warning)", background: "#fef3c7" },
  configured: { color: "var(--color-signal-blue)", background: "var(--color-signal-blue-surface)" },
  waiting_credentials: { color: "var(--color-warning)", background: "#fef3c7" },
  queued: { color: "var(--color-signal-blue)", background: "var(--color-signal-blue-surface)" },
  blocked: { color: "var(--color-ink-700)", background: "#e5e7eb" },
  running: { color: "var(--color-signal-blue)", background: "#dbeafe" },
  succeeded: { color: "var(--color-success)", background: "#dcfce7" },
  failed: { color: "var(--color-danger)", background: "#fee2e2" },
};

const DEFAULT_DRAFT: ProjectDraft = {
  slug: "",
  displayName: "",
  description: "",
  ownerTeam: "Client Services",
  gcpProjectId: "",
  gcsBucket: "",
  rawDataset: "raw",
  stgDataset: "stg",
  martDataset: "mart",
  boundsPath: "",
  autoProvisionInfrastructure: true,
  provisioningRegion: "europe-west1",
  autoBootstrapOnCreate: true,
  defaultGranularityDays: 7,
  refreshIntervalHours: 6,
  forecastIntervalHours: 12,
  boundsIntervalHours: 720,
  lookbackDays: 1,
  initialBackfillDays: 180,
  forecastHorizonDays: 120,
  precomputePrimaryForecasts: true,
  enableOnDemandForecasts: true,
  expandPrimaryMatrix: true,
  forecastRecentCombinationLimit: 50,
  forecastPrimaryCountries: "US, GB, DE, CA",
  forecastPrimarySegments: "all_users, paid_users, organic_users",
  forecastPrimarySpendSources: "all_sources, unity_ads, google_ads",
  forecastPrimaryPlatforms: "all, ios, android",
  appmetricaAppIds: "",
  appmetricaEventNames: "",
  appmetricaToken: "",
  bigquerySourceProjectId: "",
  bigquerySourceDataset: "",
  bigqueryServiceAccountJson: "",
  unityAdsEnabled: true,
  unityAdsMode: "bigquery",
  unityAdsSourceProjectId: "unity-ads-398711",
  unityAdsSourceDataset: "campaigns_days",
  unityAdsTablePattern: "day_*",
  unityAdsOrganizationId: "",
  unityAdsApiKey: "",
  googleAdsEnabled: true,
  googleAdsMode: "bigquery",
  googleAdsSourceProjectId: "civic-gate-406811",
  googleAdsSourceDataset: "google_ads_9377834221",
  googleAdsTablePattern: "p_ads_*",
  googleAdsCustomerId: "",
  googleAdsDeveloperToken: "",
  googleAdsClientId: "",
  googleAdsClientSecret: "",
  googleAdsRefreshToken: "",
  googleAdsLoginCustomerId: "",
  boundsBucket: "",
  boundsPrefix: "",
};

function draftFromProject(project: SerializedProject): ProjectDraft {
  const appmetrica = project.sources.find((source) => source.sourceType === "appmetrica_logs");
  const bigquery = project.sources.find((source) => source.sourceType === "bigquery_export");
  const bounds = project.sources.find((source) => source.sourceType === "bounds_artifacts");
  const unityAds = project.sources.find((source) => source.sourceType === "unity_ads_spend");
  const googleAds = project.sources.find((source) => source.sourceType === "google_ads_spend");

  return {
    slug: project.project.slug,
    displayName: project.project.displayName,
    description: project.project.description,
    ownerTeam: project.project.ownerTeam,
    gcpProjectId: project.project.gcpProjectId,
    gcsBucket: project.project.gcsBucket,
    rawDataset: project.project.rawDataset,
    stgDataset: project.project.stgDataset,
    martDataset: project.project.martDataset,
    boundsPath: project.project.boundsPath,
    defaultGranularityDays: project.project.defaultGranularityDays,
    refreshIntervalHours: project.project.refreshIntervalHours,
    forecastIntervalHours: project.project.forecastIntervalHours,
    boundsIntervalHours: project.project.boundsIntervalHours,
    lookbackDays: project.project.lookbackDays,
    initialBackfillDays: project.project.initialBackfillDays,
    forecastHorizonDays: project.project.forecastHorizonDays,
    autoProvisionInfrastructure: project.project.settings.autoProvisionInfrastructure,
    provisioningRegion: project.project.settings.provisioningRegion,
    autoBootstrapOnCreate: project.project.settings.autoBootstrapOnCreate,
    precomputePrimaryForecasts: project.project.settings.forecastStrategy.precomputePrimaryForecasts,
    enableOnDemandForecasts: project.project.settings.forecastStrategy.enableOnDemandForecasts,
    expandPrimaryMatrix: project.project.settings.forecastStrategy.expandPrimaryMatrix,
    forecastRecentCombinationLimit: project.project.settings.forecastStrategy.recentCombinationLimit,
    forecastPrimaryCountries: project.project.settings.forecastStrategy.primaryCountries.join(", "),
    forecastPrimarySegments: project.project.settings.forecastStrategy.primarySegments.join(", "),
    forecastPrimarySpendSources: project.project.settings.forecastStrategy.primarySpendSources.join(", "),
    forecastPrimaryPlatforms: project.project.settings.forecastStrategy.primaryPlatforms.join(", "),
    appmetricaAppIds: Array.isArray(appmetrica?.config.appIds) ? (appmetrica?.config.appIds as string[]).join(", ") : "",
    appmetricaEventNames: Array.isArray(appmetrica?.config.eventNames) ? (appmetrica?.config.eventNames as string[]).join(", ") : "",
    appmetricaToken: "",
    bigquerySourceProjectId: typeof bigquery?.config.sourceProjectId === "string" ? (bigquery?.config.sourceProjectId as string) : "",
    bigquerySourceDataset: typeof bigquery?.config.sourceDataset === "string" ? (bigquery?.config.sourceDataset as string) : "",
    bigqueryServiceAccountJson: "",
    unityAdsEnabled: unityAds?.config.enabled === false ? false : Boolean(unityAds),
    unityAdsMode: unityAds?.config.mode === "api" ? "api" : "bigquery",
    unityAdsSourceProjectId: typeof unityAds?.config.sourceProjectId === "string" ? (unityAds?.config.sourceProjectId as string) : "",
    unityAdsSourceDataset: typeof unityAds?.config.sourceDataset === "string" ? (unityAds?.config.sourceDataset as string) : "",
    unityAdsTablePattern: typeof unityAds?.config.tablePattern === "string" ? (unityAds?.config.tablePattern as string) : "day_*",
    unityAdsOrganizationId: typeof unityAds?.config.organizationId === "string" ? (unityAds?.config.organizationId as string) : "",
    unityAdsApiKey: "",
    googleAdsEnabled: googleAds?.config.enabled === false ? false : Boolean(googleAds),
    googleAdsMode: googleAds?.config.mode === "api" ? "api" : "bigquery",
    googleAdsSourceProjectId: typeof googleAds?.config.sourceProjectId === "string" ? (googleAds?.config.sourceProjectId as string) : "",
    googleAdsSourceDataset: typeof googleAds?.config.sourceDataset === "string" ? (googleAds?.config.sourceDataset as string) : "",
    googleAdsTablePattern: typeof googleAds?.config.tablePattern === "string" ? (googleAds?.config.tablePattern as string) : "p_ads_*",
    googleAdsCustomerId: typeof googleAds?.config.customerId === "string" ? (googleAds?.config.customerId as string) : "",
    googleAdsDeveloperToken: "",
    googleAdsClientId: typeof googleAds?.config.clientId === "string" ? (googleAds?.config.clientId as string) : "",
    googleAdsClientSecret: "",
    googleAdsRefreshToken: "",
    googleAdsLoginCustomerId: typeof googleAds?.config.loginCustomerId === "string" ? (googleAds?.config.loginCustomerId as string) : "",
    boundsBucket: typeof bounds?.config.bucket === "string" ? (bounds?.config.bucket as string) : project.project.gcsBucket,
    boundsPrefix: typeof bounds?.config.prefix === "string" ? (bounds?.config.prefix as string) : `bounds/${project.project.slug}/`,
  };
}

function statusBadge(status: string) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.draft;
  return {
    label: status.replace(/_/g, " "),
    tone,
  };
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function parseCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugifyForInfra(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 58);
}

function deriveAutoInfrastructure(draft: ProjectDraft) {
  const slug = slugifyForInfra(draft.slug || draft.displayName || "analytics-project");
  const gcpProjectId = slugifyForInfra(draft.gcpProjectId || "analytics-platform");
  const bucket = `${gcpProjectId}-${slug}-analytics`.slice(0, 63).replace(/-+$/g, "");
  const boundsPrefix = `bounds/${slug || "project"}/`;
  return {
    rawDataset: draft.rawDataset || "raw",
    stgDataset: draft.stgDataset || "stg",
    martDataset: draft.martDataset || "mart",
    gcsBucket: bucket,
    boundsBucket: bucket,
    boundsPrefix,
    boundsPath: `gs://${bucket}/${boundsPrefix}`,
  };
}

function hasSuccessfulRun(project: SerializedProject | null, runTypes: string[]) {
  if (!project) {
    return false;
  }

  return project.latestRuns.some((run) => run.status === "succeeded" && runTypes.includes(run.runType));
}

function hasActiveRun(project: SerializedProject | null) {
  if (!project) {
    return false;
  }

  return project.latestRuns.some((run) => run.status === "queued" || run.status === "running");
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-ink-500)" }}>
        {title}
      </div>
      <pre
        style={{
          margin: 0,
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid var(--color-border-soft)",
          background: "var(--color-panel-soft)",
          fontSize: 11.5,
          lineHeight: 1.55,
          color: "var(--color-ink-800)",
          overflowX: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function CodeBlock({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-ink-500)" }}>
        {title}
      </div>
      <pre
        style={{
          margin: 0,
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid var(--color-border-soft)",
          background: "var(--color-panel-soft)",
          fontSize: 11.5,
          lineHeight: 1.55,
          color: "var(--color-ink-800)",
          overflowX: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {value}
      </pre>
    </div>
  );
}

export function SettingsControlPlane({
  initialProjects,
  metricCatalog,
}: {
  initialProjects: SerializedProject[];
  metricCatalog: MetricCatalogRow[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjects[0]?.project.id ?? null);
  const [draft, setDraft] = useState<ProjectDraft>(
    initialProjects[0] ? draftFromProject(initialProjects[0]) : DEFAULT_DRAFT
  );
  const [mode, setMode] = useState<"edit" | "create">(initialProjects[0] ? "edit" : "create");
  const [configPreview, setConfigPreview] = useState<ConfigPreview | null>(null);
  const [runtimeBundle, setRuntimeBundle] = useState<AnalyticsRuntimeBundle | null>(null);
  const [feedback, setFeedback] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const selectedProject = useMemo(
    () => projects.find((project) => project.project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const autoInfrastructure = useMemo(() => deriveAutoInfrastructure(draft), [draft]);

  const runControlState = useMemo(() => {
    const activeRun = hasActiveRun(selectedProject);
    const appmetricaReady =
      selectedProject?.sources.find((source) => source.sourceType === "appmetrica_logs")?.status === "ready";
    const warehouseReady =
      selectedProject?.sources.find((source) => source.sourceType === "bigquery_export")?.status === "ready";
    const boundsReady =
      selectedProject?.sources.find((source) => source.sourceType === "bounds_artifacts")?.status === "ready";

    return {
      bootstrap:
        mode === "create"
          ? "Create the project first."
          : activeRun
            ? "Another run is already in progress."
            : null,
      backfill:
        mode === "create"
          ? "Create the project first."
          : activeRun
            ? "Another run is already in progress."
            : !appmetricaReady || !warehouseReady
              ? "AppMetrica and warehouse connectors must be ready."
              : null,
      ingestion:
        mode === "create"
          ? "Create the project first."
          : activeRun
            ? "Another run is already in progress."
            : !appmetricaReady || !warehouseReady
              ? "AppMetrica and warehouse connectors must be ready."
              : null,
      bounds_refresh:
        mode === "create"
          ? "Create the project first."
          : activeRun
            ? "Another run is already in progress."
            : !hasSuccessfulRun(selectedProject, ["backfill", "ingestion"])
              ? "Bounds refresh unlocks after a successful backfill or ingestion."
              : !boundsReady
                ? "Bounds storage must be configured."
                : null,
      forecast:
        mode === "create"
          ? "Create the project first."
          : activeRun
            ? "Another run is already in progress."
            : !hasSuccessfulRun(selectedProject, ["bounds_refresh"])
              ? "Forecast unlocks after a successful bounds refresh."
              : null,
      serving_refresh:
        mode === "create"
          ? "Create the project first."
          : activeRun
            ? "Another run is already in progress."
            : !hasSuccessfulRun(selectedProject, ["forecast"])
              ? "Serving refresh unlocks after a successful forecast."
              : null,
    };
  }, [mode, selectedProject]);

  async function refreshSelectedProjectSnapshot(projectId: string) {
    const [projectResponse, configResponse, runtimeResponse] = await Promise.all([
      fetch(`/api/admin/projects/${projectId}`, { cache: "no-store" }),
      fetch(`/api/admin/projects/${projectId}/config`, { cache: "no-store" }),
      fetch(`/api/admin/projects/${projectId}/runtime-bundle`, { cache: "no-store" }),
    ]);

    if (projectResponse.ok) {
      const payload = await projectResponse.json().catch(() => null);
      const nextProject = payload?.project as SerializedProject | undefined;
      if (nextProject) {
        setProjects((current) =>
          current.map((project) =>
            project.project.id === nextProject.project.id ? nextProject : project
          )
        );
      }
    }

    if (configResponse.ok) {
      const payload = await configResponse.json().catch(() => null);
      setConfigPreview(payload?.config ?? null);
    } else {
      setConfigPreview(null);
    }

    if (runtimeResponse.ok) {
      const payload = await runtimeResponse.json().catch(() => null);
      setRuntimeBundle(payload?.runtimeBundle ?? null);
    } else {
      setRuntimeBundle(null);
    }
  }

  useEffect(() => {
    if (!selectedProjectId || mode === "create") {
      setConfigPreview(null);
      setRuntimeBundle(null);
      return;
    }

    const projectId = selectedProjectId;
    let active = true;

    async function loadSnapshot() {
      try {
        await refreshSelectedProjectSnapshot(projectId);
      } catch {
        if (active) {
          setConfigPreview(null);
          setRuntimeBundle(null);
        }
      }
    }

    void loadSnapshot();
    const intervalId = window.setInterval(() => {
      void loadSnapshot();
    }, 15000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [mode, selectedProjectId]);

  function updateDraft<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function beginCreate() {
    setMode("create");
    setSelectedProjectId(null);
    setDraft(DEFAULT_DRAFT);
    setConfigPreview(null);
    setRuntimeBundle(null);
    setFeedback("");
  }

  function beginEdit(project: SerializedProject) {
    setMode("edit");
    setSelectedProjectId(project.project.id);
    setDraft(draftFromProject(project));
    setFeedback("");
  }

  async function submitProject() {
    setFeedback("");
    startTransition(async () => {
      const payload = {
        ...draft,
        gcsBucket: draft.autoProvisionInfrastructure ? autoInfrastructure.gcsBucket : draft.gcsBucket,
        rawDataset: draft.autoProvisionInfrastructure ? autoInfrastructure.rawDataset : draft.rawDataset,
        stgDataset: draft.autoProvisionInfrastructure ? autoInfrastructure.stgDataset : draft.stgDataset,
        martDataset: draft.autoProvisionInfrastructure ? autoInfrastructure.martDataset : draft.martDataset,
        boundsBucket: draft.autoProvisionInfrastructure ? autoInfrastructure.boundsBucket : draft.boundsBucket,
        boundsPrefix: draft.autoProvisionInfrastructure ? autoInfrastructure.boundsPrefix : draft.boundsPrefix,
        boundsPath: draft.autoProvisionInfrastructure ? autoInfrastructure.boundsPath : draft.boundsPath,
        appmetricaAppIds: parseCsv(draft.appmetricaAppIds),
        appmetricaEventNames: parseCsv(draft.appmetricaEventNames),
        forecastPrimaryCountries: parseCsv(draft.forecastPrimaryCountries),
        forecastPrimarySegments: parseCsv(draft.forecastPrimarySegments),
        forecastPrimarySpendSources: parseCsv(draft.forecastPrimarySpendSources),
        forecastPrimaryPlatforms: parseCsv(draft.forecastPrimaryPlatforms),
      };

      const endpoint =
        mode === "create" ? "/api/admin/projects" : `/api/admin/projects/${selectedProjectId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFeedback(result.error ?? "Could not save project.");
        return;
      }

      const nextProject = result.project as SerializedProject;
      setProjects((current) => {
        const existingIndex = current.findIndex((item) => item.project.id === nextProject.project.id);
        if (existingIndex === -1) {
          return [nextProject, ...current];
        }

        return current.map((item) =>
          item.project.id === nextProject.project.id ? nextProject : item
        );
      });
      setSelectedProjectId(nextProject.project.id);
      setDraft(draftFromProject(nextProject));
      setMode("edit");
      setFeedback(
        mode === "create"
          ? nextProject.project.settings.autoBootstrapOnCreate
            ? "Project created. Bootstrap sequence queued automatically."
            : "Project created."
          : "Project updated."
      );
      await refreshSelectedProjectSnapshot(nextProject.project.id);
    });
  }

  async function triggerRun(
    runType: "bootstrap" | "backfill" | "ingestion" | "forecast" | "bounds_refresh" | "serving_refresh"
  ) {
    if (!selectedProjectId) {
      return;
    }

    setFeedback("");
    startTransition(async () => {
      const response = await fetch(`/api/admin/projects/${selectedProjectId}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runType }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFeedback(result.error ?? "Could not queue run.");
        return;
      }

      const run = result.run as SerializedRun;
      setProjects((current) =>
        current.map((project) =>
          project.project.id === selectedProjectId
            ? { ...project, latestRuns: [run, ...project.latestRuns].slice(0, 8) }
            : project
        )
      );
      setFeedback(`${runType.replace(/_/g, " ")} queued.`);
      await refreshSelectedProjectSnapshot(selectedProjectId);
    });
  }

  return (
    <main
      style={{
        padding: 24,
        display: "grid",
        gridTemplateColumns: "280px minmax(0, 1fr)",
        gap: 20,
        overflowY: "auto",
        minWidth: 0,
        flex: 1,
      }}
    >
      <aside
        style={{
          background: "var(--color-panel-base)",
          border: "1px solid var(--color-border-soft)",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-border-soft)" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Projects</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-ink-500)", lineHeight: 1.5 }}>
            Admin-only onboarding for BigQuery, AppMetrica, bounds storage, and run cadence.
          </div>
        </div>

        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
          <button type="button" onClick={beginCreate} style={PRIMARY_BUTTON_STYLE}>
            Add project
          </button>

          {projects.map((project) => {
            const badge = statusBadge(project.project.status);
            const active = project.project.id === selectedProjectId && mode === "edit";
            return (
              <button
                key={project.project.id}
                type="button"
                onClick={() => beginEdit(project)}
                style={{
                  textAlign: "left",
                  borderRadius: 10,
                  border: `1px solid ${active ? "var(--color-signal-blue)" : "var(--color-border-soft)"}`,
                  background: active ? "var(--color-signal-blue-surface)" : "var(--color-panel-soft)",
                  padding: "12px 12px 11px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-ink-950)" }}>
                    {project.project.displayName}
                  </div>
                  <span style={{ padding: "3px 7px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, background: badge.tone.background, color: badge.tone.color }}>
                    {badge.label}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                  {project.project.slug} · {project.project.ownerTeam}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {project.sources.map((source) => (
                    <span key={source.id} style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 999, background: "var(--color-panel-base)", color: "var(--color-ink-600)" }}>
                      {source.sourceType.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
        <section
          style={{
            background: "var(--color-panel-base)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 12,
            padding: "18px 20px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-950)" }}>
                {mode === "create" ? "Create analytics project" : `Configure ${selectedProject?.project.displayName ?? "project"}`}
              </div>
              <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--color-ink-600)", lineHeight: 1.6, maxWidth: 920 }}>
                A project is added here once, then the control plane generates connector config for AppMetrica Logs API,
                BigQuery joins, bounds storage in GCS, first backfill, and recurring refresh cadence. Notebook
                `run_date_freq` maps to the default dashboard granularity in this form.
              </div>
            </div>
            {feedback ? (
              <div style={{ fontSize: 12, color: "var(--color-ink-600)", background: "var(--color-panel-soft)", border: "1px solid var(--color-border-soft)", borderRadius: 10, padding: "10px 12px", maxWidth: 280 }}>
                {feedback}
              </div>
            ) : null}
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Panel title="Project registry">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <TextField label="Slug" value={draft.slug} onChange={(value) => updateDraft("slug", value)} />
                <TextField label="Display name" value={draft.displayName} onChange={(value) => updateDraft("displayName", value)} />
                <TextField label="Owner team" value={draft.ownerTeam} onChange={(value) => updateDraft("ownerTeam", value)} />
                <NumberField label="Default day step" value={draft.defaultGranularityDays} onChange={(value) => updateDraft("defaultGranularityDays", value)} />
              </div>
              <TextAreaField label="Project description" value={draft.description} onChange={(value) => updateDraft("description", value)} rows={3} />
            </Panel>

            <Panel title="Warehouse and storage">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <TextField label="GCP project id" value={draft.gcpProjectId} onChange={(value) => updateDraft("gcpProjectId", value)} />
                <TextField label="Provisioning region" value={draft.provisioningRegion} onChange={(value) => updateDraft("provisioningRegion", value)} />
              </div>
              <ToggleField
                label="Auto-create datasets and bucket"
                checked={draft.autoProvisionInfrastructure}
                onChange={(value) => updateDraft("autoProvisionInfrastructure", value)}
                description="When enabled, the first live worker should create raw/stg/mart plus the GCS bucket automatically from the project slug."
              />
              {draft.autoProvisionInfrastructure ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <ReadOnlyField label="Derived GCS bucket" value={autoInfrastructure.gcsBucket} />
                  <ReadOnlyField label="Derived bounds path" value={autoInfrastructure.boundsPath} />
                  <ReadOnlyField label="Raw dataset" value={autoInfrastructure.rawDataset} />
                  <ReadOnlyField label="Staging dataset" value={autoInfrastructure.stgDataset} />
                  <ReadOnlyField label="Mart dataset" value={autoInfrastructure.martDataset} />
                  <ReadOnlyField label="Bounds prefix" value={autoInfrastructure.boundsPrefix} />
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <TextField label="GCS bucket" value={draft.gcsBucket} onChange={(value) => updateDraft("gcsBucket", value)} />
                  <TextField label="Bounds path" value={draft.boundsPath} onChange={(value) => updateDraft("boundsPath", value)} />
                  <TextField label="Raw dataset" value={draft.rawDataset} onChange={(value) => updateDraft("rawDataset", value)} />
                  <TextField label="Staging dataset" value={draft.stgDataset} onChange={(value) => updateDraft("stgDataset", value)} />
                  <TextField label="Mart dataset" value={draft.martDataset} onChange={(value) => updateDraft("martDataset", value)} />
                  <TextField label="Bounds prefix" value={draft.boundsPrefix} onChange={(value) => updateDraft("boundsPrefix", value)} />
                </div>
              )}
            </Panel>

            <Panel title="Connector setup">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <TextField label="AppMetrica app ids" value={draft.appmetricaAppIds} onChange={(value) => updateDraft("appmetricaAppIds", value)} placeholder="wc-ios-01, wc-android-01" />
                <TextField label="Event catalog" value={draft.appmetricaEventNames} onChange={(value) => updateDraft("appmetricaEventNames", value)} placeholder="session_start, purchase, ad_impression" />
                <TextField label="BigQuery source project" value={draft.bigquerySourceProjectId} onChange={(value) => updateDraft("bigquerySourceProjectId", value)} />
                <TextField label="BigQuery source dataset" value={draft.bigquerySourceDataset} onChange={(value) => updateDraft("bigquerySourceDataset", value)} />
                {draft.autoProvisionInfrastructure ? (
                  <ReadOnlyField label="Bounds bucket" value={autoInfrastructure.boundsBucket} />
                ) : (
                  <TextField label="Bounds bucket" value={draft.boundsBucket} onChange={(value) => updateDraft("boundsBucket", value)} />
                )}
                {draft.autoProvisionInfrastructure ? (
                  <ReadOnlyField label="Bounds prefix" value={autoInfrastructure.boundsPrefix} />
                ) : (
                  <TextField label="Bounds prefix" value={draft.boundsPrefix} onChange={(value) => updateDraft("boundsPrefix", value)} />
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <TextAreaField label="AppMetrica token" value={draft.appmetricaToken} onChange={(value) => updateDraft("appmetricaToken", value)} rows={4} />
                <TextAreaField label="BigQuery service account JSON" value={draft.bigqueryServiceAccountJson} onChange={(value) => updateDraft("bigqueryServiceAccountJson", value)} rows={4} />
              </div>

              <div style={{ height: 1, background: "var(--color-border-soft)" }} />

              <ToggleField
                label="Unity Ads spend connector"
                checked={draft.unityAdsEnabled}
                onChange={(value) => updateDraft("unityAdsEnabled", value)}
                description="Use BigQuery mirror if spends are already landed there. Switch to API mode only if they are not mirrored."
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <SelectField label="Unity mode" value={draft.unityAdsMode} onChange={(value) => updateDraft("unityAdsMode", value as ProjectDraft["unityAdsMode"])} options={[{ value: "bigquery", label: "BigQuery mirror" }, { value: "api", label: "Direct API" }]} />
                {draft.unityAdsMode === "api" ? (
                  <TextField label="Unity organization id" value={draft.unityAdsOrganizationId} onChange={(value) => updateDraft("unityAdsOrganizationId", value)} />
                ) : (
                  <TextField label="Unity source project" value={draft.unityAdsSourceProjectId} onChange={(value) => updateDraft("unityAdsSourceProjectId", value)} />
                )}
                {draft.unityAdsMode === "api" ? (
                  <TextAreaField label="Unity API key" value={draft.unityAdsApiKey} onChange={(value) => updateDraft("unityAdsApiKey", value)} rows={3} />
                ) : (
                  <>
                    <TextField label="Unity source dataset" value={draft.unityAdsSourceDataset} onChange={(value) => updateDraft("unityAdsSourceDataset", value)} />
                    <TextField label="Unity table pattern" value={draft.unityAdsTablePattern} onChange={(value) => updateDraft("unityAdsTablePattern", value)} />
                  </>
                )}
              </div>

              <ToggleField
                label="Google Ads spend connector"
                checked={draft.googleAdsEnabled}
                onChange={(value) => updateDraft("googleAdsEnabled", value)}
                description="Recommended default is BigQuery mirror because the current notebooks already consume Google Ads spend from BigQuery exports."
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <SelectField label="Google Ads mode" value={draft.googleAdsMode} onChange={(value) => updateDraft("googleAdsMode", value as ProjectDraft["googleAdsMode"])} options={[{ value: "bigquery", label: "BigQuery mirror" }, { value: "api", label: "Direct API" }]} />
                {draft.googleAdsMode === "api" ? (
                  <TextField label="Google Ads customer id" value={draft.googleAdsCustomerId} onChange={(value) => updateDraft("googleAdsCustomerId", value)} />
                ) : (
                  <TextField label="Google Ads source project" value={draft.googleAdsSourceProjectId} onChange={(value) => updateDraft("googleAdsSourceProjectId", value)} />
                )}
                {draft.googleAdsMode === "api" ? (
                  <TextField label="Google Ads login customer id" value={draft.googleAdsLoginCustomerId} onChange={(value) => updateDraft("googleAdsLoginCustomerId", value)} />
                ) : (
                  <TextField label="Google Ads source dataset" value={draft.googleAdsSourceDataset} onChange={(value) => updateDraft("googleAdsSourceDataset", value)} />
                )}
                {draft.googleAdsMode === "api" ? (
                  <TextField label="Google Ads client id" value={draft.googleAdsClientId} onChange={(value) => updateDraft("googleAdsClientId", value)} />
                ) : (
                  <TextField label="Google Ads table pattern" value={draft.googleAdsTablePattern} onChange={(value) => updateDraft("googleAdsTablePattern", value)} />
                )}
                {draft.googleAdsMode === "api" ? (
                  <TextAreaField label="Google Ads developer token" value={draft.googleAdsDeveloperToken} onChange={(value) => updateDraft("googleAdsDeveloperToken", value)} rows={3} />
                ) : null}
                {draft.googleAdsMode === "api" ? (
                  <TextAreaField label="Google Ads client secret" value={draft.googleAdsClientSecret} onChange={(value) => updateDraft("googleAdsClientSecret", value)} rows={3} />
                ) : null}
                {draft.googleAdsMode === "api" ? (
                  <TextAreaField label="Google Ads refresh token" value={draft.googleAdsRefreshToken} onChange={(value) => updateDraft("googleAdsRefreshToken", value)} rows={3} />
                ) : null}
              </div>
            </Panel>

            <Panel title="Refresh and forecasting">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                <NumberField label="Refresh every (hours)" value={draft.refreshIntervalHours} onChange={(value) => updateDraft("refreshIntervalHours", value)} />
                <NumberField label="Forecast every (hours)" value={draft.forecastIntervalHours} onChange={(value) => updateDraft("forecastIntervalHours", value)} />
                <NumberField label="Bounds every (hours)" value={draft.boundsIntervalHours} onChange={(value) => updateDraft("boundsIntervalHours", value)} />
                <NumberField label="Lookback days" value={draft.lookbackDays} onChange={(value) => updateDraft("lookbackDays", value)} />
                <NumberField label="Initial backfill days" value={draft.initialBackfillDays} onChange={(value) => updateDraft("initialBackfillDays", value)} />
                <NumberField label="Forecast horizon days" value={draft.forecastHorizonDays} onChange={(value) => updateDraft("forecastHorizonDays", value)} />
              </div>
              <div style={{ height: 1, background: "var(--color-border-soft)" }} />
              <ToggleField
                label="Auto-bootstrap after project creation"
                checked={draft.autoBootstrapOnCreate}
                onChange={(value) => updateDraft("autoBootstrapOnCreate", value)}
                description="Queues backfill, then bounds refresh, forecast, and serving refresh automatically once the project is saved."
              />
              <ToggleField
                label="Precompute primary forecasts"
                checked={draft.precomputePrimaryForecasts}
                onChange={(value) => updateDraft("precomputePrimaryForecasts", value)}
                description="Keeps a warm set of baseline segments and top countries ready ahead of time."
              />
              <ToggleField
                label="Allow on-demand forecasts"
                checked={draft.enableOnDemandForecasts}
                onChange={(value) => updateDraft("enableOnDemandForecasts", value)}
                description="If a selected filter combination is cold, the service should queue a fresh forecast and show progress in the UI."
              />
              <ToggleField
                label="Expand primary matrix"
                checked={draft.expandPrimaryMatrix}
                onChange={(value) => updateDraft("expandPrimaryMatrix", value)}
                description="Warm the full project-level matrix segment × country × spend source × platform instead of only axis-level defaults."
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <NumberField label="Recent combinations to keep hot" value={draft.forecastRecentCombinationLimit} onChange={(value) => updateDraft("forecastRecentCombinationLimit", value)} />
                <TextField label="Primary countries" value={draft.forecastPrimaryCountries} onChange={(value) => updateDraft("forecastPrimaryCountries", value)} />
                <TextField label="Primary segments" value={draft.forecastPrimarySegments} onChange={(value) => updateDraft("forecastPrimarySegments", value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <TextField label="Primary spend sources" value={draft.forecastPrimarySpendSources} onChange={(value) => updateDraft("forecastPrimarySpendSources", value)} />
                <TextField label="Primary platforms" value={draft.forecastPrimaryPlatforms} onChange={(value) => updateDraft("forecastPrimaryPlatforms", value)} />
              </div>
            </Panel>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              {mode === "edit" ? (
                <button type="button" onClick={beginCreate} style={SECONDARY_BUTTON_STYLE}>
                  New project
                </button>
              ) : null}
              <button type="button" onClick={() => void submitProject()} disabled={isPending} style={PRIMARY_BUTTON_STYLE}>
                {isPending ? "Saving..." : mode === "create" ? "Create project" : "Save changes"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Panel title="Run controls">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { key: "bootstrap", label: "Bootstrap now" },
                  { key: "backfill", label: "Initial backfill" },
                  { key: "ingestion", label: "Pull now" },
                  { key: "bounds_refresh", label: "Rebuild bounds" },
                  { key: "forecast", label: "Forecast now" },
                  { key: "serving_refresh", label: "Serving refresh" },
                ].map((run) => (
                  <div key={run.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() =>
                        void triggerRun(
                          run.key as
                            | "bootstrap"
                            | "backfill"
                            | "ingestion"
                            | "forecast"
                            | "bounds_refresh"
                            | "serving_refresh"
                        )
                      }
                      disabled={!selectedProjectId || mode === "create" || isPending || Boolean(runControlState[run.key as keyof typeof runControlState])}
                      style={SECONDARY_BUTTON_STYLE}
                    >
                      {run.label}
                    </button>
                    <div style={{ minHeight: 30, fontSize: 11.5, lineHeight: 1.45, color: "var(--color-ink-500)" }}>
                      {runControlState[run.key as keyof typeof runControlState] ?? "Ready to queue."}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => (selectedProjectId ? void refreshSelectedProjectSnapshot(selectedProjectId) : undefined)}
                  disabled={!selectedProjectId || mode === "create" || isPending}
                  style={SECONDARY_BUTTON_STYLE}
                >
                  Refresh status
                </button>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-ink-500)", lineHeight: 1.6 }}>
                Bootstrap is the safe default. It queues the first full chain automatically and leaves downstream actions
                blocked until upstream data is ready.
              </div>
            </Panel>

            <Panel title="Source health">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(selectedProject?.sources ?? []).map((source) => {
                  const badge = statusBadge(source.status);
                  return (
                    <div key={source.id} style={{ border: "1px solid var(--color-border-soft)", borderRadius: 10, padding: "11px 12px", background: "var(--color-panel-soft)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>{source.label}</div>
                          <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                            {source.deliveryMode} · every {source.frequencyHours}h
                          </div>
                        </div>
                        <span style={{ padding: "3px 7px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, background: badge.tone.background, color: badge.tone.color }}>
                          {badge.label}
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10, fontSize: 11.5, color: "var(--color-ink-600)" }}>
                        <div>Last sync: {formatDateTime(source.lastSyncAt)}</div>
                        <div>Next sync: {formatDateTime(source.nextSyncAt)}</div>
                        <div>Secret: {source.secretPresent ? source.secretHint ?? "present" : "missing"}</div>
                        <div>Config: {Object.values(source.config).some(Boolean) ? "ready" : "incomplete"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Run history">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(selectedProject?.latestRuns ?? []).slice(0, 6).map((run) => {
                  const badge = statusBadge(run.status);
                  return (
                    <div key={run.id} style={{ border: "1px solid var(--color-border-soft)", borderRadius: 10, background: "var(--color-panel-soft)", padding: "10px 12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-ink-950)" }}>
                          {run.runType.replace(/_/g, " ")}
                        </div>
                        <span style={{ padding: "2px 7px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, background: badge.tone.background, color: badge.tone.color }}>
                          {badge.label}
                        </span>
                      </div>
                      <div style={{ marginTop: 5, fontSize: 11.5, color: "var(--color-ink-500)", lineHeight: 1.5 }}>
                        {formatDateTime(run.requestedAt)} · {run.triggerKind}
                        {run.message ? ` · ${run.message}` : ""}
                      </div>
                    </div>
                  );
                })}
                {(selectedProject?.latestRuns ?? []).length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--color-ink-500)" }}>
                    Runs will appear here after the first backfill or refresh request.
                  </div>
                ) : null}
              </div>
            </Panel>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 18 }}>
          <Panel title="Config preview">
            {configPreview ? (
              <div style={{ display: "grid", gap: 16 }}>
                <JsonBlock title="Ingestion config" value={configPreview.ingestionConfig} />
                <JsonBlock title="Forecast config" value={configPreview.forecastConfig} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <JsonBlock title="Notebook parity" value={configPreview.notebookParity} />
                  <JsonBlock title="Source registry" value={configPreview.sourceRegistry} />
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--color-ink-500)", lineHeight: 1.6 }}>
                Select an existing project to preview the generated config contract for ingestion, bounds, and forecast jobs.
              </div>
            )}
          </Panel>

          <Panel title="Canonical metrics">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {metricCatalog.map((metric) => (
                <div key={metric.metric} style={{ border: "1px solid var(--color-border-soft)", borderRadius: 10, padding: "10px 12px", background: "var(--color-panel-soft)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-ink-950)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      {metric.metric}
                    </div>
                    <div style={{ fontSize: 11.5, color: metric.status === "Canonical" ? "var(--color-success)" : "var(--color-warning)" }}>
                      {metric.status}
                    </div>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                    {metric.owner} · {metric.grain}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <Panel title="Runtime bundle">
            {runtimeBundle ? (
              <div style={{ display: "grid", gap: 16 }}>
                <CodeBlock
                  title={`${runtimeBundle.ingestion.jobName} · ingestion.job.yml`}
                  value={runtimeBundle.ingestion.configYaml}
                />
                <CodeBlock
                  title={`${runtimeBundle.forecasts.jobName} · forecasts.job.yml`}
                  value={runtimeBundle.forecasts.configYaml}
                />
                <JsonBlock title="Worker callbacks" value={runtimeBundle.callbacks} />
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--color-ink-500)", lineHeight: 1.6 }}>
                Select a configured project to generate the worker runtime bundle. This is the contract ingestion and
                forecast jobs should consume instead of handwritten config files.
              </div>
            )}
          </Panel>

          <Panel title="Ops handoff">
            {runtimeBundle ? (
              <div style={{ display: "grid", gap: 16 }}>
                <JsonBlock
                  title="Ingestion runtime"
                  value={{
                    provisioning: runtimeBundle.provisioning,
                    spendSources: runtimeBundle.spendSources,
                    env: runtimeBundle.ingestion.env,
                    secrets: runtimeBundle.ingestion.secrets,
                    scheduler: runtimeBundle.ingestion.scheduler,
                    commands: runtimeBundle.ingestion.commands,
                  }}
                />
                <JsonBlock
                  title="Forecast runtime"
                  value={{
                    env: runtimeBundle.forecasts.env,
                    secrets: runtimeBundle.forecasts.secrets,
                    scheduler: runtimeBundle.forecasts.scheduler,
                    commands: runtimeBundle.forecasts.commands,
                  }}
                />
                <JsonBlock title="dbt handoff" value={runtimeBundle.dbt} />
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--color-ink-500)", lineHeight: 1.6 }}>
                Generated env, secret expectations, scheduler hints, and command templates appear here for the runtime
                and data-plane deployment.
              </div>
            )}
          </Panel>
        </section>
      </section>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      style={{
        background: "var(--color-panel-base)",
        border: "1px solid var(--color-border-soft)",
        borderRadius: 12,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>{title}</div>
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-ink-500)" }}>
      {children}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <FieldLabel>{label}</FieldLabel>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} style={FIELD_STYLE} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        style={FIELD_STYLE}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <FieldLabel>{label}</FieldLabel>
      <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} style={{ ...FIELD_STYLE, resize: "vertical", minHeight: rows * 22 }} />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ ...FIELD_STYLE, opacity: 0.88, display: "flex", alignItems: "center" }}>{value}</div>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <FieldLabel>{label}</FieldLabel>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={FIELD_STYLE}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  description: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        alignItems: "flex-start",
        border: "1px solid var(--color-border-soft)",
        borderRadius: 10,
        background: "var(--color-panel-soft)",
        padding: "12px 14px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>{label}</div>
        <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", lineHeight: 1.5 }}>{description}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: 18, height: 18, marginTop: 2 }}
      />
    </label>
  );
}

const FIELD_STYLE: CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid var(--color-border-soft)",
  background: "var(--color-panel-soft)",
  color: "var(--color-ink-900)",
  padding: "10px 12px",
  fontSize: 13,
  outline: "none",
};

const PRIMARY_BUTTON_STYLE: CSSProperties = {
  border: "none",
  borderRadius: 10,
  background: "var(--color-signal-blue)",
  color: "#fff",
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const SECONDARY_BUTTON_STYLE: CSSProperties = {
  border: "1px solid var(--color-border-soft)",
  borderRadius: 10,
  background: "var(--color-panel-soft)",
  color: "var(--color-ink-800)",
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
