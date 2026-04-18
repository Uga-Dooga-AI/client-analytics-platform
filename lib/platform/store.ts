import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { MOCK_METRIC_CATALOG } from "@/lib/mock-data";
import { getPostgresPool } from "@/lib/db/postgres";
import { dispatchAnalyticsRunSafely } from "./run-dispatcher";
import { encryptSecret } from "./secrets";

export type AnalyticsProjectStatus =
  | "draft"
  | "configuring"
  | "ready"
  | "syncing"
  | "live"
  | "error";

export type AnalyticsSourceType =
  | "appmetrica_logs"
  | "bigquery_export"
  | "bounds_artifacts"
  | "unity_ads_spend"
  | "google_ads_spend";

export type AnalyticsSourceStatus =
  | "disabled"
  | "missing_credentials"
  | "configured"
  | "ready"
  | "syncing"
  | "error";

export type AnalyticsRunType =
  | "bootstrap"
  | "ingestion"
  | "backfill"
  | "forecast"
  | "bounds_refresh"
  | "serving_refresh";

export type AnalyticsRunStatus =
  | "queued"
  | "blocked"
  | "running"
  | "succeeded"
  | "failed"
  | "waiting_credentials";

export type AnalyticsTriggerKind = "manual" | "scheduled" | "bootstrap";

const DEFAULT_INITIAL_BACKFILL_DAYS = 365;
const DEFAULT_FORECAST_HORIZON_DAYS = 730;
const MAX_BACKFILL_CHUNK_DAYS = 3;
const LATEST_RUNS_LIMIT = 100;

export interface AnalyticsForecastStrategy {
  precomputePrimaryForecasts: boolean;
  enableOnDemandForecasts: boolean;
  expandPrimaryMatrix: boolean;
  recentCombinationLimit: number;
  primaryCountries: string[];
  primarySegments: string[];
  primarySpendSources: string[];
  primaryPlatforms: string[];
}

export interface AnalyticsProjectSettings {
  autoProvisionInfrastructure: boolean;
  provisioningRegion: string;
  autoBootstrapOnCreate: boolean;
  forecastStrategy: AnalyticsForecastStrategy;
}

export interface AnalyticsProjectRecord {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  ownerTeam: string;
  status: AnalyticsProjectStatus;
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
  settings: AnalyticsProjectSettings;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalyticsSourceRecord {
  id: string;
  projectId: string;
  sourceType: AnalyticsSourceType;
  label: string;
  status: AnalyticsSourceStatus;
  deliveryMode: string;
  frequencyHours: number;
  lastSyncAt: Date | null;
  nextSyncAt: Date | null;
  secretPresent: boolean;
  secretHint: string | null;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalyticsSyncRunRecord {
  id: string;
  projectId: string;
  runType: AnalyticsRunType;
  triggerKind: AnalyticsTriggerKind;
  sourceType: AnalyticsSourceType | null;
  status: AnalyticsRunStatus;
  requestedBy: string | null;
  requestedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  windowFrom: string | null;
  windowTo: string | null;
  message: string | null;
  payload: Record<string, unknown>;
}

export interface AnalyticsProjectBundle {
  project: AnalyticsProjectRecord;
  sources: AnalyticsSourceRecord[];
  latestRuns: AnalyticsSyncRunRecord[];
}

export interface AnalyticsForecastCombinationRecord {
  id: string;
  projectId: string;
  combinationKey: string;
  label: string;
  sourcePage: string | null;
  filters: Record<string, unknown>;
  viewCount: number;
  firstViewedAt: Date;
  lastViewedAt: Date;
  lastForecastRunId: string | null;
  lastForecastStatus: AnalyticsRunStatus | null;
}

export interface AnalyticsProjectInput {
  slug: string;
  displayName: string;
  description?: string;
  ownerTeam?: string;
  gcpProjectId?: string;
  gcsBucket?: string;
  rawDataset?: string;
  stgDataset?: string;
  martDataset?: string;
  boundsPath?: string;
  defaultGranularityDays?: number;
  refreshIntervalHours?: number;
  forecastIntervalHours?: number;
  boundsIntervalHours?: number;
  lookbackDays?: number;
  initialBackfillDays?: number;
  forecastHorizonDays?: number;
  autoProvisionInfrastructure?: boolean;
  provisioningRegion?: string;
  autoBootstrapOnCreate?: boolean;
  precomputePrimaryForecasts?: boolean;
  enableOnDemandForecasts?: boolean;
  expandPrimaryMatrix?: boolean;
  forecastRecentCombinationLimit?: number;
  forecastPrimaryCountries?: string[];
  forecastPrimarySegments?: string[];
  forecastPrimarySpendSources?: string[];
  forecastPrimaryPlatforms?: string[];
  appmetricaAppIds?: string[];
  appmetricaEventNames?: string[];
  appmetricaToken?: string;
  bigquerySourceProjectId?: string;
  bigquerySourceDataset?: string;
  bigqueryServiceAccountJson?: string;
  unityAdsEnabled?: boolean;
  unityAdsMode?: "bigquery" | "api";
  unityAdsSourceProjectId?: string;
  unityAdsSourceDataset?: string;
  unityAdsTablePattern?: string;
  unityAdsOrganizationId?: string;
  unityAdsApiKey?: string;
  googleAdsEnabled?: boolean;
  googleAdsMode?: "bigquery" | "api";
  googleAdsSourceProjectId?: string;
  googleAdsSourceDataset?: string;
  googleAdsTablePattern?: string;
  googleAdsCustomerId?: string;
  googleAdsDeveloperToken?: string;
  googleAdsClientId?: string;
  googleAdsClientSecret?: string;
  googleAdsRefreshToken?: string;
  googleAdsLoginCustomerId?: string;
  boundsBucket?: string;
  boundsPrefix?: string;
}

export interface AnalyticsSyncRequestInput {
  runType: AnalyticsRunType;
  requestedBy: string | null;
  triggerKind?: AnalyticsTriggerKind;
  windowFrom?: string | null;
  windowTo?: string | null;
  payload?: Record<string, unknown>;
}

export interface AnalyticsRunUpdateInput {
  status?: AnalyticsRunStatus;
  message?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  sourceType?: AnalyticsSourceType | null;
  sourceStatus?: AnalyticsSourceStatus;
  lastSyncAt?: string | null;
  nextSyncAt?: string | null;
  payload?: Record<string, unknown>;
}

export interface AnalyticsRunClaimInput {
  runTypes?: AnalyticsRunType[];
  message?: string | null;
}

export interface AnalyticsForecastCombinationInput {
  key?: string;
  label: string;
  sourcePage?: string | null;
  filters: Record<string, unknown>;
}

type DemoPlatformStore = {
  seeded: boolean;
  projects: AnalyticsProjectRecord[];
  sources: AnalyticsSourceRecord[];
  runs: AnalyticsSyncRunRecord[];
  forecastCombinations: AnalyticsForecastCombinationRecord[];
};

const DEMO_ACCESS_ENABLED = process.env.DEMO_ACCESS_ENABLED === "true";
const SYSTEM_FORECAST_SOURCE_PAGE_PREFIX = "/system/";
const PRIMARY_PREWARM_SOURCE_PAGE = "/system/prewarm";
const MAX_PRIMARY_PREWARM_COMBINATIONS = 240;
export const DEFAULT_ANALYTICS_PROJECT_SETTINGS: AnalyticsProjectSettings = {
  autoProvisionInfrastructure: true,
  provisioningRegion: "europe-west1",
  autoBootstrapOnCreate: true,
  forecastStrategy: {
    precomputePrimaryForecasts: true,
    enableOnDemandForecasts: true,
    expandPrimaryMatrix: true,
    recentCombinationLimit: 50,
    primaryCountries: ["US", "GB", "DE", "CA"],
    primarySegments: ["all_users", "paid_users", "organic_users"],
    primarySpendSources: ["all_sources", "unity_ads", "google_ads"],
    primaryPlatforms: ["all", "ios", "android"],
  },
};
const DEMO_PROJECT_OPTIONS = [
  {
    slug: "word-catcher",
    displayName: "Word Catcher",
    ownerTeam: "Client Services",
    gcpProjectId: "analytics-platform-493522",
    gcsBucket: "analytics-platform-493522-word-catcher-analytics",
    boundsPath: "gs://analytics-platform-493522-word-catcher-analytics/bounds/word-catcher/",
    appIds: ["3927166"],
    eventNames: ["ads_initialized"],
    sourceProjectId: "words-fill-18977463",
    sourceDataset: "analytics_212553644",
  },
  {
    slug: "words-in-word",
    displayName: "Words in Word",
    ownerTeam: "Client Services",
    gcpProjectId: "ugada-words-in-word-prod",
    gcsBucket: "ugada-analytics-words-in-word",
    boundsPath: "gs://ugada-analytics-words-in-word/bounds/words-in-word/",
    appIds: ["wiw-ios-01", "wiw-android-01"],
    eventNames: ["session_start", "level_complete", "purchase", "subscription_start"],
    sourceProjectId: "ugada-ga4-words-in-word",
    sourceDataset: "analytics_export",
  },
  {
    slug: "2pg",
    displayName: "2PG",
    ownerTeam: "Client Services",
    gcpProjectId: "ugada-2pg-prod",
    gcsBucket: "ugada-analytics-2pg",
    boundsPath: "gs://ugada-analytics-2pg/bounds/2pg/",
    appIds: ["2pg-ios-01", "2pg-android-01"],
    eventNames: ["session_start", "paywall_view", "purchase", "ad_impression"],
    sourceProjectId: "ugada-ga4-2pg",
    sourceDataset: "analytics_export",
  },
] as const;

declare global {
  // eslint-disable-next-line no-var
  var __analyticsPlatformDataSchemaReady: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __analyticsPlatformDemoDataStore: DemoPlatformStore | undefined;
}

function useDemoStore() {
  return DEMO_ACCESS_ENABLED;
}

function getDemoStore() {
  if (!globalThis.__analyticsPlatformDemoDataStore) {
    globalThis.__analyticsPlatformDemoDataStore = {
      seeded: false,
      projects: [],
      sources: [],
      runs: [],
      forecastCombinations: [],
    };
  }

  return globalThis.__analyticsPlatformDemoDataStore;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeText(value: string | undefined, maxLength: number, fallback = "") {
  if (!value) {
    return fallback;
  }

  return value.trim().slice(0, maxLength);
}

function normalizeStringList(values?: string[]) {
  if (!values) {
    return [];
  }

  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 64);
}

function normalizeUpperStringList(values?: string[]) {
  return normalizeStringList(values).map((value) => value.toUpperCase());
}

function normalizeInt(value: number | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeBoolean(value: boolean | undefined, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeChoice<T extends string>(
  value: T | undefined,
  allowed: readonly T[],
  fallback: T
) {
  return value && allowed.includes(value) ? value : fallback;
}

function normalizeRegion(value: string | undefined, fallback = DEFAULT_ANALYTICS_PROJECT_SETTINGS.provisioningRegion) {
  const normalized = normalizeText(value, 64, fallback);
  return normalized || fallback;
}

function deriveStorageBucket(projectId: string, slug: string) {
  const base = slugify(`${projectId}-${slug}-analytics`).slice(0, 58).replace(/-+$/g, "");
  return base || `${slug}-analytics`;
}

function deriveBoundsPrefix(slug: string) {
  return `bounds/${slug}/`;
}

function deriveBoundsPath(bucket: string, slug: string) {
  return `gs://${bucket}/${deriveBoundsPrefix(slug)}`;
}

function normalizeProjectSettings(input: AnalyticsProjectInput) {
  return {
    autoProvisionInfrastructure: normalizeBoolean(
      input.autoProvisionInfrastructure,
      DEFAULT_ANALYTICS_PROJECT_SETTINGS.autoProvisionInfrastructure
    ),
    provisioningRegion: normalizeRegion(input.provisioningRegion),
    autoBootstrapOnCreate: normalizeBoolean(
      input.autoBootstrapOnCreate,
      DEFAULT_ANALYTICS_PROJECT_SETTINGS.autoBootstrapOnCreate
    ),
    forecastStrategy: {
      precomputePrimaryForecasts: normalizeBoolean(
        input.precomputePrimaryForecasts,
        DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.precomputePrimaryForecasts
      ),
      enableOnDemandForecasts: normalizeBoolean(
        input.enableOnDemandForecasts,
        DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.enableOnDemandForecasts
      ),
      expandPrimaryMatrix: normalizeBoolean(
        input.expandPrimaryMatrix,
        DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.expandPrimaryMatrix
      ),
      recentCombinationLimit: normalizeInt(
        input.forecastRecentCombinationLimit,
        DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.recentCombinationLimit,
        1,
        200
      ),
      primaryCountries:
        normalizeUpperStringList(input.forecastPrimaryCountries).length > 0
          ? normalizeUpperStringList(input.forecastPrimaryCountries)
          : DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.primaryCountries,
      primarySegments:
        normalizeStringList(input.forecastPrimarySegments).length > 0
          ? normalizeStringList(input.forecastPrimarySegments)
          : DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.primarySegments,
      primarySpendSources:
        normalizeStringList(input.forecastPrimarySpendSources).length > 0
          ? normalizeStringList(input.forecastPrimarySpendSources)
          : DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.primarySpendSources,
      primaryPlatforms:
        normalizeStringList(input.forecastPrimaryPlatforms).length > 0
          ? normalizeStringList(input.forecastPrimaryPlatforms)
          : DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.primaryPlatforms,
    },
  } satisfies AnalyticsProjectSettings;
}

function parseProjectSettings(value: unknown): AnalyticsProjectSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const forecast = raw.forecastStrategy && typeof raw.forecastStrategy === "object"
    ? (raw.forecastStrategy as Record<string, unknown>)
    : {};

  return {
    autoProvisionInfrastructure:
      typeof raw.autoProvisionInfrastructure === "boolean"
        ? raw.autoProvisionInfrastructure
        : DEFAULT_ANALYTICS_PROJECT_SETTINGS.autoProvisionInfrastructure,
    provisioningRegion:
      typeof raw.provisioningRegion === "string" && raw.provisioningRegion.trim().length > 0
        ? raw.provisioningRegion
        : DEFAULT_ANALYTICS_PROJECT_SETTINGS.provisioningRegion,
    autoBootstrapOnCreate:
      typeof raw.autoBootstrapOnCreate === "boolean"
        ? raw.autoBootstrapOnCreate
        : DEFAULT_ANALYTICS_PROJECT_SETTINGS.autoBootstrapOnCreate,
    forecastStrategy: {
      precomputePrimaryForecasts:
        typeof forecast.precomputePrimaryForecasts === "boolean"
          ? forecast.precomputePrimaryForecasts
          : DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.precomputePrimaryForecasts,
      enableOnDemandForecasts:
        typeof forecast.enableOnDemandForecasts === "boolean"
          ? forecast.enableOnDemandForecasts
          : DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.enableOnDemandForecasts,
      expandPrimaryMatrix:
        typeof forecast.expandPrimaryMatrix === "boolean"
          ? forecast.expandPrimaryMatrix
          : DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.expandPrimaryMatrix,
      recentCombinationLimit:
        typeof forecast.recentCombinationLimit === "number"
          ? Math.max(1, Math.min(200, Math.round(forecast.recentCombinationLimit)))
          : DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.recentCombinationLimit,
      primaryCountries:
        Array.isArray(forecast.primaryCountries) && forecast.primaryCountries.length > 0
          ? forecast.primaryCountries.map((entry) => String(entry).toUpperCase()).slice(0, 24)
          : DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.primaryCountries,
      primarySegments:
        Array.isArray(forecast.primarySegments) && forecast.primarySegments.length > 0
          ? forecast.primarySegments.map((entry) => String(entry)).slice(0, 24)
          : DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.primarySegments,
      primarySpendSources:
        Array.isArray(forecast.primarySpendSources) && forecast.primarySpendSources.length > 0
          ? forecast.primarySpendSources.map((entry) => String(entry)).slice(0, 24)
          : DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.primarySpendSources,
      primaryPlatforms:
        Array.isArray(forecast.primaryPlatforms) && forecast.primaryPlatforms.length > 0
          ? forecast.primaryPlatforms.map((entry) => String(entry)).slice(0, 24)
          : DEFAULT_ANALYTICS_PROJECT_SETTINGS.forecastStrategy.primaryPlatforms,
    },
  };
}

function normalizeJsonLike(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJsonLike(entry));
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = normalizeJsonLike((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value ?? null;
}

function buildForecastCombinationKey(value: Record<string, unknown>) {
  return JSON.stringify(normalizeJsonLike(value));
}

function isSystemForecastCombinationSource(sourcePage: string | null) {
  return sourcePage?.startsWith(SYSTEM_FORECAST_SOURCE_PAGE_PREFIX) ?? false;
}

function primarySpendSourcesForBundle(bundle: AnalyticsProjectBundle) {
  const requested = bundle.project.settings.forecastStrategy.primarySpendSources;
  const enabledOptional = new Set(getEnabledOptionalSpendSources(bundle));
  const filtered = requested.filter(
    (source) => source === "all_sources" || enabledOptional.has(source as AnalyticsSourceType)
  );
  return filtered.length > 0 ? filtered : ["all_sources"];
}

function buildPrimaryForecastLabel(project: AnalyticsProjectRecord, filters: Record<string, unknown>) {
  const parts = [project.displayName];

  if (typeof filters.segment === "string" && filters.segment.length > 0) {
    parts.push(filters.segment);
  }
  if (typeof filters.country === "string" && filters.country.length > 0) {
    parts.push(filters.country);
  }
  if (typeof filters.spendSource === "string" && filters.spendSource.length > 0) {
    parts.push(filters.spendSource);
  }
  if (typeof filters.platform === "string" && filters.platform.length > 0) {
    parts.push(filters.platform);
  }

  return parts.join(" · ");
}

function buildPrimaryForecastCombinationInputs(
  bundle: AnalyticsProjectBundle
): AnalyticsForecastCombinationInput[] {
  if (!bundle.project.settings.forecastStrategy.precomputePrimaryForecasts) {
    return [];
  }

  const segments = bundle.project.settings.forecastStrategy.primarySegments.length > 0
    ? bundle.project.settings.forecastStrategy.primarySegments
    : ["all_users"];
  const countries = bundle.project.settings.forecastStrategy.primaryCountries.length > 0
    ? bundle.project.settings.forecastStrategy.primaryCountries
    : ["ALL"];
  const spendSources = primarySpendSourcesForBundle(bundle);
  const platforms = bundle.project.settings.forecastStrategy.primaryPlatforms.length > 0
    ? bundle.project.settings.forecastStrategy.primaryPlatforms
    : ["all"];

  const combinations = new Map<string, AnalyticsForecastCombinationInput>();
  const register = (filters: Record<string, unknown>) => {
    const key = buildForecastCombinationKey(filters);
    if (combinations.has(key)) {
      return;
    }

    combinations.set(key, {
      key,
      label:
        Object.keys(filters).length === 0
          ? `${bundle.project.displayName} · overall`
          : buildPrimaryForecastLabel(bundle.project, filters),
      sourcePage: PRIMARY_PREWARM_SOURCE_PAGE,
      filters,
    });
  };

  register({});

  if (bundle.project.settings.forecastStrategy.expandPrimaryMatrix) {
    for (const segment of segments) {
      for (const country of countries) {
        for (const spendSource of spendSources) {
          for (const platform of platforms) {
            register({
              segment,
              country,
              spendSource,
              platform,
            });
          }
        }
      }
    }
  } else {
    for (const segment of segments) {
      register({ segment });
    }
    for (const country of countries) {
      register({ country });
    }
    for (const spendSource of spendSources) {
      register({ spendSource });
    }
    for (const platform of platforms) {
      register({ platform });
    }
  }

  return Array.from(combinations.values()).slice(0, MAX_PRIMARY_PREWARM_COMBINATIONS);
}

function buildForecastPrewarmPlan(bundle: AnalyticsProjectBundle) {
  const strategy = bundle.project.settings.forecastStrategy;
  const axes = {
    segments: strategy.primarySegments,
    countries: strategy.primaryCountries,
    spendSources: primarySpendSourcesForBundle(bundle),
    platforms: strategy.primaryPlatforms,
  };

  const estimatedCombinationCount = strategy.expandPrimaryMatrix
    ? Math.max(1, axes.segments.length)
      * Math.max(1, axes.countries.length)
      * Math.max(1, axes.spendSources.length)
      * Math.max(1, axes.platforms.length)
    : axes.segments.length + axes.countries.length + axes.spendSources.length + axes.platforms.length;

  return {
    expandPrimaryMatrix: strategy.expandPrimaryMatrix,
    axes,
    estimatedCombinationCount,
    notes: strategy.expandPrimaryMatrix
      ? [
          "Primary prewarm expands the matrix segment × country × spend source × platform inside one project.",
          "Recent viewed combinations are kept separately and supplement the primary matrix.",
        ]
      : [
          "Primary prewarm is axis-based only and does not expand the full cross-product matrix.",
          "Recent viewed combinations are still kept separately and supplement the primary set.",
        ],
  };
}

function nextSyncAtFromHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function compareIsoDates(left: string, right: string) {
  return left.localeCompare(right);
}

function addDaysToIsoDate(value: string, days: number) {
  const parsed = new Date(`${value}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function resolveRequestedBackfillWindow(
  bundle: AnalyticsProjectBundle,
  windowFrom: string | null | undefined,
  windowTo: string | null | undefined
) {
  if (windowFrom && windowTo) {
    return compareIsoDates(windowFrom, windowTo) <= 0
      ? { windowFrom, windowTo }
      : { windowFrom: windowTo, windowTo: windowFrom };
  }

  const windowEnd = addDaysToIsoDate(new Date().toISOString().slice(0, 10), -bundle.project.lookbackDays);
  const windowStart = addDaysToIsoDate(
    windowEnd,
    -Math.max(bundle.project.initialBackfillDays - 1, 0)
  );

  return { windowFrom: windowStart, windowTo: windowEnd };
}

function resolveChunkedBackfillWindow(
  bundle: AnalyticsProjectBundle,
  windowFrom: string | null | undefined,
  windowTo: string | null | undefined
) {
  const requestedWindow = resolveRequestedBackfillWindow(bundle, windowFrom, windowTo);
  const maxChunkWindowTo = addDaysToIsoDate(
    requestedWindow.windowFrom,
    Math.max(MAX_BACKFILL_CHUNK_DAYS - 1, 0)
  );

  return {
    windowFrom: requestedWindow.windowFrom,
    windowTo:
      compareIsoDates(maxChunkWindowTo, requestedWindow.windowTo) < 0
        ? maxChunkWindowTo
        : requestedWindow.windowTo,
    payload: {
      backfillRequestedWindowFrom: requestedWindow.windowFrom,
      backfillRequestedWindowTo: requestedWindow.windowTo,
      backfillChunkDays: MAX_BACKFILL_CHUNK_DAYS,
    },
  };
}

function secretHintForValue(sourceType: AnalyticsSourceType, value?: string) {
  if (!value) {
    return null;
  }

  if (sourceType === "bigquery_export") {
    const emailMatch = value.match(/"client_email"\s*:\s*"([^"]+)"/);
    if (emailMatch?.[1]) {
      return emailMatch[1];
    }
  }

  if (sourceType === "google_ads_spend") {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if (typeof parsed.customerId === "string" && parsed.customerId.length > 0) {
        return `customer ${parsed.customerId}`;
      }
    } catch {
      return `••••${value.slice(-4)}`;
    }
  }

  return `••••${value.slice(-4)}`;
}

function deriveSourceRecord(source: AnalyticsSourceRecord): AnalyticsSourceRecord {
  if (source.sourceType === "appmetrica_logs") {
    const appIds = Array.isArray(source.config.appIds) ? source.config.appIds : [];
    const status =
      appIds.length > 0 && source.secretPresent ? "ready" : appIds.length > 0 ? "configured" : "missing_credentials";
    return { ...source, status };
  }

  if (source.sourceType === "bigquery_export") {
    const hasProject = typeof source.config.sourceProjectId === "string" && source.config.sourceProjectId.length > 0;
    const hasDataset = typeof source.config.sourceDataset === "string" && source.config.sourceDataset.length > 0;
    const status = source.secretPresent ? "ready" : hasProject && hasDataset ? "configured" : "missing_credentials";
    return { ...source, status };
  }

  if (source.sourceType === "unity_ads_spend") {
    if (source.config.enabled === false) {
      return { ...source, status: "disabled" };
    }

    const mode = source.config.mode === "api" ? "api" : "bigquery";
    if (mode === "api") {
      const hasOrg = typeof source.config.organizationId === "string" && source.config.organizationId.length > 0;
      const status = hasOrg && source.secretPresent ? "ready" : hasOrg ? "configured" : "missing_credentials";
      return { ...source, status };
    }

    const hasProject = typeof source.config.sourceProjectId === "string" && source.config.sourceProjectId.length > 0;
    const hasDataset = typeof source.config.sourceDataset === "string" && source.config.sourceDataset.length > 0;
    const status = hasProject && hasDataset ? "ready" : "configured";
    return { ...source, status };
  }

  if (source.sourceType === "google_ads_spend") {
    if (source.config.enabled === false) {
      return { ...source, status: "disabled" };
    }

    const mode = source.config.mode === "api" ? "api" : "bigquery";
    if (mode === "api") {
      const hasCustomerId =
        typeof source.config.customerId === "string" && source.config.customerId.length > 0;
      const status =
        hasCustomerId && source.secretPresent ? "ready" : hasCustomerId ? "configured" : "missing_credentials";
      return { ...source, status };
    }

    const hasProject = typeof source.config.sourceProjectId === "string" && source.config.sourceProjectId.length > 0;
    const hasDataset = typeof source.config.sourceDataset === "string" && source.config.sourceDataset.length > 0;
    const status = hasProject && hasDataset ? "ready" : "configured";
    return { ...source, status };
  }

  const hasBucket = typeof source.config.bucket === "string" && source.config.bucket.length > 0;
  const hasPrefix = typeof source.config.prefix === "string" && source.config.prefix.length > 0;
  return { ...source, status: hasBucket && hasPrefix ? "ready" : "configured" };
}

function deriveProjectStatus(
  project: AnalyticsProjectRecord,
  sources: AnalyticsSourceRecord[],
  latestRuns: AnalyticsSyncRunRecord[]
): AnalyticsProjectStatus {
  const hasRunning = latestRuns.some(
    (run) => run.status === "running" || run.status === "queued" || run.status === "blocked"
  );
  if (hasRunning) {
    return "syncing";
  }

  const failedRun = latestRuns.find((run) => run.status === "failed");
  if (failedRun) {
    return "error";
  }

  const activeSources = sources.filter((source) => source.status !== "disabled");
  const readySources = activeSources.filter((source) => source.status === "ready");
  if (readySources.length < 2) {
    return readySources.length === 0 ? "draft" : "configuring";
  }

  const hasSuccess = latestRuns.some((run) => run.status === "succeeded");
  return hasSuccess ? "live" : "ready";
}

function metricCatalogPreview() {
  return MOCK_METRIC_CATALOG;
}

function seedDemoStore() {
  const store = getDemoStore();
  if (store.seeded) {
    return;
  }

  const now = new Date();
  store.projects = DEMO_PROJECT_OPTIONS.map((entry, index) => {
    const projectId = randomUUID();
    const createdAt = new Date(now.getTime() - (index + 3) * 86400000);
    return {
      id: projectId,
      slug: entry.slug,
      displayName: entry.displayName,
      description: `${entry.displayName} analytics shell with notebook-parity cohorts, forecasts, and source orchestration.`,
      ownerTeam: entry.ownerTeam,
      status: "live",
      gcpProjectId: entry.gcpProjectId,
      gcsBucket: entry.gcsBucket,
      rawDataset: "raw",
      stgDataset: "stg",
      martDataset: "mart",
      boundsPath: entry.boundsPath,
      defaultGranularityDays: index === 0 ? 7 : 14,
      refreshIntervalHours: 6,
      forecastIntervalHours: 12,
      boundsIntervalHours: 720,
      lookbackDays: 1,
      initialBackfillDays: DEFAULT_INITIAL_BACKFILL_DAYS,
      forecastHorizonDays: DEFAULT_FORECAST_HORIZON_DAYS,
      settings: DEFAULT_ANALYTICS_PROJECT_SETTINGS,
      createdBy: "demo-admin",
      updatedBy: "demo-admin",
      createdAt,
      updatedAt: new Date(createdAt.getTime() + 6 * 60 * 60 * 1000),
    };
  });

  store.sources = store.projects.flatMap((project, index) => {
    const template = DEMO_PROJECT_OPTIONS[index];
    const baseTime = new Date(now.getTime() - (index + 1) * 60 * 60 * 1000);

    return [
      deriveSourceRecord({
        id: randomUUID(),
        projectId: project.id,
        sourceType: "appmetrica_logs",
        label: "AppMetrica Logs API",
        status: "ready",
        deliveryMode: "Logs API · D+1",
        frequencyHours: 6,
        lastSyncAt: new Date(baseTime.getTime() - 40 * 60 * 1000),
        nextSyncAt: nextSyncAtFromHours(6),
        secretPresent: true,
        secretHint: "••••a9e9",
        config: {
          appIds: template.appIds,
          eventNames: template.eventNames,
        },
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }),
      deriveSourceRecord({
        id: randomUUID(),
        projectId: project.id,
        sourceType: "bigquery_export",
        label: "BigQuery export",
        status: "ready",
        deliveryMode: "Dataset pull",
        frequencyHours: 6,
        lastSyncAt: new Date(baseTime.getTime() - 20 * 60 * 1000),
        nextSyncAt: nextSyncAtFromHours(6),
        secretPresent: true,
        secretHint: `${template.slug}@project.iam.gserviceaccount.com`,
        config: {
          sourceProjectId: template.sourceProjectId,
          sourceDataset: template.sourceDataset,
        },
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }),
      deriveSourceRecord({
        id: randomUUID(),
        projectId: project.id,
        sourceType: "bounds_artifacts",
        label: "Bounds artifacts",
        status: "ready",
        deliveryMode: "GCS manifest",
        frequencyHours: 720,
        lastSyncAt: new Date(baseTime.getTime() - 5 * 60 * 1000),
        nextSyncAt: nextSyncAtFromHours(720),
        secretPresent: false,
        secretHint: null,
        config: {
          bucket: template.gcsBucket,
          prefix: `bounds/${template.slug}/`,
        },
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }),
      deriveSourceRecord({
        id: randomUUID(),
        projectId: project.id,
        sourceType: "unity_ads_spend",
        label: "Unity Ads spend",
        status: "ready",
        deliveryMode: "BigQuery mirror",
        frequencyHours: 6,
        lastSyncAt: new Date(baseTime.getTime() - 30 * 60 * 1000),
        nextSyncAt: nextSyncAtFromHours(6),
        secretPresent: false,
        secretHint: null,
        config: {
          enabled: true,
          mode: "bigquery",
          sourceProjectId: "unity-ads-398711",
          sourceDataset: "campaigns_days",
          tablePattern: "day_*",
        },
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }),
      deriveSourceRecord({
        id: randomUUID(),
        projectId: project.id,
        sourceType: "google_ads_spend",
        label: "Google Ads spend",
        status: "ready",
        deliveryMode: "BigQuery mirror",
        frequencyHours: 6,
        lastSyncAt: new Date(baseTime.getTime() - 35 * 60 * 1000),
        nextSyncAt: nextSyncAtFromHours(6),
        secretPresent: false,
        secretHint: null,
        config: {
          enabled: true,
          mode: "bigquery",
          sourceProjectId: "civic-gate-406811",
          sourceDataset: "google_ads_9377834221",
          tablePattern: "p_ads_*",
        },
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }),
    ];
  });

  store.runs = store.projects.flatMap((project, index) => {
    const requestedAt = new Date(now.getTime() - (index + 1) * 2 * 60 * 60 * 1000);
    return [
      {
        id: randomUUID(),
        projectId: project.id,
        runType: "ingestion",
        triggerKind: "scheduled",
        sourceType: "appmetrica_logs",
        status: "succeeded",
        requestedBy: "system",
        requestedAt,
        startedAt: new Date(requestedAt.getTime() + 2 * 60 * 1000),
        finishedAt: new Date(requestedAt.getTime() + 9 * 60 * 1000),
        windowFrom: new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10),
        windowTo: new Date(now.getTime() - 86400000).toISOString().slice(0, 10),
        message: "Daily refresh completed.",
        payload: {},
      },
      {
        id: randomUUID(),
        projectId: project.id,
        runType: "forecast",
        triggerKind: "scheduled",
        sourceType: "bounds_artifacts",
        status: index === 1 ? "running" : "succeeded",
        requestedBy: "system",
        requestedAt: new Date(requestedAt.getTime() + 30 * 60 * 1000),
        startedAt: new Date(requestedAt.getTime() + 36 * 60 * 1000),
        finishedAt: index === 1 ? null : new Date(requestedAt.getTime() + 55 * 60 * 1000),
        windowFrom: null,
        windowTo: null,
        message: index === 1 ? "Bounds refresh is preparing forecast intervals." : "Forecast artifacts published.",
        payload: { horizonDays: DEFAULT_FORECAST_HORIZON_DAYS },
      },
    ];
  });

  store.forecastCombinations = store.projects.map((project, index) => {
    const filters = normalizeJsonLike({
      projectKey: project.slug,
      country: index === 0 ? "US" : "GB",
      segment: index === 0 ? "paid_users" : "organic_users",
      platform: index % 2 === 0 ? "ios" : "android",
      groupBy: "country",
      revenueMode: "total",
      dayStep: project.defaultGranularityDays,
    }) as Record<string, unknown>;
    const combinationKey = buildForecastCombinationKey(filters);
    const lastViewedAt = new Date(now.getTime() - (index + 1) * 45 * 60 * 1000);
    const matchingRun = store.runs.find(
      (run) => run.projectId === project.id && run.runType === "forecast"
    );

    return {
      id: randomUUID(),
      projectId: project.id,
      combinationKey,
      label: `${project.displayName} · ${String(filters.country)} · ${String(filters.segment)}`,
      sourcePage: "/acquisition",
      filters,
      viewCount: 3 + index,
      firstViewedAt: new Date(lastViewedAt.getTime() - 3 * 24 * 60 * 60 * 1000),
      lastViewedAt,
      lastForecastRunId: matchingRun?.id ?? null,
      lastForecastStatus: matchingRun?.status ?? null,
    } satisfies AnalyticsForecastCombinationRecord;
  });

  store.seeded = true;
}

function normalizePgProject(row: Record<string, unknown>): AnalyticsProjectRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    displayName: String(row.display_name),
    description: typeof row.description === "string" ? row.description : "",
    ownerTeam: typeof row.owner_team === "string" ? row.owner_team : "",
    status: String(row.status) as AnalyticsProjectStatus,
    gcpProjectId: typeof row.gcp_project_id === "string" ? row.gcp_project_id : "",
    gcsBucket: typeof row.gcs_bucket === "string" ? row.gcs_bucket : "",
    rawDataset: typeof row.raw_dataset === "string" ? row.raw_dataset : "raw",
    stgDataset: typeof row.stg_dataset === "string" ? row.stg_dataset : "stg",
    martDataset: typeof row.mart_dataset === "string" ? row.mart_dataset : "mart",
    boundsPath: typeof row.bounds_path === "string" ? row.bounds_path : "",
    defaultGranularityDays: Number(row.default_granularity_days ?? 7),
    refreshIntervalHours: Number(row.refresh_interval_hours ?? 6),
    forecastIntervalHours: Number(row.forecast_interval_hours ?? 12),
    boundsIntervalHours: Number(row.bounds_interval_hours ?? 720),
    lookbackDays: Number(row.lookback_days ?? 1),
    initialBackfillDays: Number(row.initial_backfill_days ?? DEFAULT_INITIAL_BACKFILL_DAYS),
    forecastHorizonDays: Number(row.forecast_horizon_days ?? DEFAULT_FORECAST_HORIZON_DAYS),
    settings: parseProjectSettings(row.settings_json),
    createdBy: typeof row.created_by === "string" ? row.created_by : null,
    updatedBy: typeof row.updated_by === "string" ? row.updated_by : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

function normalizePgSource(row: Record<string, unknown>): AnalyticsSourceRecord {
  return deriveSourceRecord({
    id: String(row.id),
    projectId: String(row.project_id),
    sourceType: String(row.source_type) as AnalyticsSourceType,
    label: String(row.label),
    status: String(row.status) as AnalyticsSourceStatus,
    deliveryMode: typeof row.delivery_mode === "string" ? row.delivery_mode : "",
    frequencyHours: Number(row.frequency_hours ?? 6),
    lastSyncAt: row.last_sync_at ? new Date(String(row.last_sync_at)) : null,
    nextSyncAt: row.next_sync_at ? new Date(String(row.next_sync_at)) : null,
    secretPresent: Boolean(row.secret_present),
    secretHint: typeof row.secret_hint === "string" ? row.secret_hint : null,
    config: (row.config_json as Record<string, unknown> | null) ?? {},
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  });
}

function normalizePgRun(row: Record<string, unknown>): AnalyticsSyncRunRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    runType: String(row.run_type) as AnalyticsRunType,
    triggerKind: String(row.trigger_kind) as AnalyticsTriggerKind,
    sourceType: row.source_type ? (String(row.source_type) as AnalyticsSourceType) : null,
    status: String(row.status) as AnalyticsRunStatus,
    requestedBy: typeof row.requested_by === "string" ? row.requested_by : null,
    requestedAt: new Date(String(row.requested_at)),
    startedAt: row.started_at ? new Date(String(row.started_at)) : null,
    finishedAt: row.finished_at ? new Date(String(row.finished_at)) : null,
    windowFrom: typeof row.window_from === "string" ? row.window_from : null,
    windowTo: typeof row.window_to === "string" ? row.window_to : null,
    message: typeof row.message === "string" ? row.message : null,
    payload: (row.payload as Record<string, unknown> | null) ?? {},
  };
}

function normalizePgForecastCombination(
  row: Record<string, unknown>
): AnalyticsForecastCombinationRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    combinationKey: String(row.combination_key),
    label: typeof row.label === "string" ? row.label : "",
    sourcePage: typeof row.source_page === "string" ? row.source_page : null,
    filters: (row.filters_json as Record<string, unknown> | null) ?? {},
    viewCount: Number(row.view_count ?? 1),
    firstViewedAt: new Date(String(row.first_viewed_at)),
    lastViewedAt: new Date(String(row.last_viewed_at)),
    lastForecastRunId:
      typeof row.last_forecast_run_id === "string" ? row.last_forecast_run_id : null,
    lastForecastStatus:
      typeof row.last_forecast_status === "string"
        ? (row.last_forecast_status as AnalyticsRunStatus)
        : null,
  };
}

async function ensurePlatformSchema() {
  if (useDemoStore()) {
    seedDemoStore();
    return;
  }

  const pool = getPostgresPool();
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!globalThis.__analyticsPlatformDataSchemaReady) {
    globalThis.__analyticsPlatformDataSchemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS analytics_projects (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          description TEXT,
          owner_team TEXT,
          status TEXT NOT NULL,
          gcp_project_id TEXT,
          gcs_bucket TEXT,
          raw_dataset TEXT NOT NULL DEFAULT 'raw',
          stg_dataset TEXT NOT NULL DEFAULT 'stg',
          mart_dataset TEXT NOT NULL DEFAULT 'mart',
          bounds_path TEXT,
          default_granularity_days INTEGER NOT NULL DEFAULT 7,
          refresh_interval_hours INTEGER NOT NULL DEFAULT 6,
          forecast_interval_hours INTEGER NOT NULL DEFAULT 12,
          bounds_interval_hours INTEGER NOT NULL DEFAULT 720,
          lookback_days INTEGER NOT NULL DEFAULT 1,
          initial_backfill_days INTEGER NOT NULL DEFAULT 365,
          forecast_horizon_days INTEGER NOT NULL DEFAULT 730,
          settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_by TEXT,
          updated_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS analytics_project_sources (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES analytics_projects (id) ON DELETE CASCADE,
          source_type TEXT NOT NULL,
          label TEXT NOT NULL,
          status TEXT NOT NULL,
          delivery_mode TEXT,
          frequency_hours INTEGER NOT NULL DEFAULT 6,
          last_sync_at TIMESTAMPTZ,
          next_sync_at TIMESTAMPTZ,
          secret_present BOOLEAN NOT NULL DEFAULT FALSE,
          secret_hint TEXT,
          secret_ciphertext TEXT,
          config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(project_id, source_type)
        );

        CREATE TABLE IF NOT EXISTS analytics_sync_runs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES analytics_projects (id) ON DELETE CASCADE,
          run_type TEXT NOT NULL,
          trigger_kind TEXT NOT NULL,
          source_type TEXT,
          status TEXT NOT NULL,
          requested_by TEXT,
          requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          started_at TIMESTAMPTZ,
          finished_at TIMESTAMPTZ,
          window_from TEXT,
          window_to TEXT,
          message TEXT,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE TABLE IF NOT EXISTS analytics_forecast_combinations (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES analytics_projects (id) ON DELETE CASCADE,
          combination_key TEXT NOT NULL,
          label TEXT NOT NULL,
          source_page TEXT,
          filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          view_count INTEGER NOT NULL DEFAULT 1,
          first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_forecast_run_id TEXT,
          last_forecast_status TEXT,
          UNIQUE(project_id, combination_key)
        );

        CREATE INDEX IF NOT EXISTS idx_analytics_projects_slug ON analytics_projects (slug);
        CREATE INDEX IF NOT EXISTS idx_analytics_project_sources_project_id ON analytics_project_sources (project_id, source_type);
        CREATE INDEX IF NOT EXISTS idx_analytics_sync_runs_project_id ON analytics_sync_runs (project_id, requested_at DESC);
        CREATE INDEX IF NOT EXISTS idx_analytics_forecast_combinations_project_id ON analytics_forecast_combinations (project_id, last_viewed_at DESC);
      `);

      await pool.query(`
        ALTER TABLE analytics_projects
        ADD COLUMN IF NOT EXISTS settings_json JSONB NOT NULL DEFAULT '{}'::jsonb;
      `);

      await pool.query(`
        ALTER TABLE analytics_projects
        ALTER COLUMN initial_backfill_days SET DEFAULT 365,
        ALTER COLUMN forecast_horizon_days SET DEFAULT 730;
      `);
    })();
  }

  await globalThis.__analyticsPlatformDataSchemaReady;
}

async function withPgTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const pool = getPostgresPool();
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getPgProjectSources(client: Pick<PoolClient, "query">, projectIds: string[]) {
  if (projectIds.length === 0) {
    return [];
  }

  const result = await client.query(
    `SELECT * FROM analytics_project_sources WHERE project_id = ANY($1::text[]) ORDER BY source_type ASC`,
    [projectIds]
  );

  return result.rows.map((row) => normalizePgSource(row as Record<string, unknown>));
}

async function getPgProjectRuns(client: Pick<PoolClient, "query">, projectIds: string[]) {
  if (projectIds.length === 0) {
    return [];
  }

  const result = await client.query(
    `
      SELECT *
      FROM analytics_sync_runs
      WHERE project_id = ANY($1::text[])
      ORDER BY requested_at DESC
    `,
    [projectIds]
  );

  return result.rows.map((row) => normalizePgRun(row as Record<string, unknown>));
}

async function getPgForecastCombinations(
  client: Pick<PoolClient, "query">,
  projectId: string,
  limit = 50,
  options?: { includeSystem?: boolean }
) {
  const values: Array<string | number> = [projectId];
  let query = `
    SELECT *
    FROM analytics_forecast_combinations
    WHERE project_id = $1
  `;

  if (!options?.includeSystem) {
    values.push(`${SYSTEM_FORECAST_SOURCE_PAGE_PREFIX}%`);
    query += ` AND COALESCE(source_page, '') NOT LIKE $${values.length}`;
  }

  query += ` ORDER BY last_viewed_at DESC`;

  if (Number.isFinite(limit) && limit > 0) {
    values.push(limit);
    query += ` LIMIT $${values.length}`;
  }

  const result = await client.query(query, values);

  return result.rows.map((row) =>
    normalizePgForecastCombination(row as Record<string, unknown>)
  );
}

function trimDemoForecastCombinations(
  store: DemoPlatformStore,
  projectId: string,
  recentLimit: number
) {
  const projectEntries = store.forecastCombinations
    .filter((entry) => entry.projectId === projectId)
    .sort((left, right) => right.lastViewedAt.getTime() - left.lastViewedAt.getTime());
  const systemEntries = projectEntries.filter((entry) =>
    isSystemForecastCombinationSource(entry.sourcePage)
  );
  const recentEntries = projectEntries
    .filter((entry) => !isSystemForecastCombinationSource(entry.sourcePage))
    .slice(0, recentLimit);
  const keepIds = new Set([...systemEntries, ...recentEntries].map((entry) => entry.id));

  store.forecastCombinations = store.forecastCombinations.filter(
    (entry) => entry.projectId !== projectId || keepIds.has(entry.id)
  );
}

async function trimPgForecastCombinations(
  client: Pick<PoolClient, "query">,
  projectId: string,
  recentLimit: number
) {
  const recentResult = await client.query(
    `
      SELECT id
      FROM analytics_forecast_combinations
      WHERE project_id = $1
        AND COALESCE(source_page, '') NOT LIKE $2
      ORDER BY last_viewed_at DESC
      OFFSET $3
    `,
    [projectId, `${SYSTEM_FORECAST_SOURCE_PAGE_PREFIX}%`, recentLimit]
  );

  const staleIds = recentResult.rows.map((row) => String(row.id));
  if (staleIds.length === 0) {
    return;
  }

  await client.query(
    `DELETE FROM analytics_forecast_combinations WHERE id = ANY($1::text[])`,
    [staleIds]
  );
}

async function upsertForecastCombinations(
  projectId: string,
  combinations: AnalyticsForecastCombinationInput[]
) {
  if (combinations.length === 0) {
    return [] as AnalyticsForecastCombinationRecord[];
  }

  const now = new Date();

  if (useDemoStore()) {
    seedDemoStore();
    const store = getDemoStore();
    for (const input of combinations) {
      const combinationKey =
        normalizeText(input.key, 2048) || buildForecastCombinationKey(input.filters);
      const existingIndex = store.forecastCombinations.findIndex(
        (entry) =>
          entry.projectId === projectId && entry.combinationKey === combinationKey
      );

      if (existingIndex >= 0) {
        const existing = store.forecastCombinations[existingIndex];
        store.forecastCombinations[existingIndex] = {
          ...existing,
          label: normalizeText(input.label, 240, existing.label),
          sourcePage: normalizeText(input.sourcePage ?? undefined, 128) || null,
          filters: normalizeJsonLike(input.filters) as Record<string, unknown>,
        };
      } else {
        store.forecastCombinations.unshift({
          id: randomUUID(),
          projectId,
          combinationKey,
          label: normalizeText(input.label, 240, "Forecast combination"),
          sourcePage: normalizeText(input.sourcePage ?? undefined, 128) || null,
          filters: normalizeJsonLike(input.filters) as Record<string, unknown>,
          viewCount: 0,
          firstViewedAt: now,
          lastViewedAt: now,
          lastForecastRunId: null,
          lastForecastStatus: null,
        });
      }
    }

    return store.forecastCombinations.filter((entry) => entry.projectId === projectId);
  }

  await withPgTransaction(async (client) => {
    for (const input of combinations) {
      const combinationKey =
        normalizeText(input.key, 2048) || buildForecastCombinationKey(input.filters);
      await client.query(
        `
          INSERT INTO analytics_forecast_combinations (
            id,
            project_id,
            combination_key,
            label,
            source_page,
            filters_json,
            view_count,
            first_viewed_at,
            last_viewed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, 0, $7, $8)
          ON CONFLICT (project_id, combination_key)
          DO UPDATE SET
            label = EXCLUDED.label,
            source_page = EXCLUDED.source_page,
            filters_json = EXCLUDED.filters_json,
            first_viewed_at = LEAST(
              analytics_forecast_combinations.first_viewed_at,
              EXCLUDED.first_viewed_at
            ),
            last_viewed_at = GREATEST(
              analytics_forecast_combinations.last_viewed_at,
              EXCLUDED.last_viewed_at
            )
        `,
        [
          randomUUID(),
          projectId,
          combinationKey,
          normalizeText(input.label, 240, "Forecast combination"),
          normalizeText(input.sourcePage ?? undefined, 128) || null,
          JSON.stringify(normalizeJsonLike(input.filters)),
          now,
          now,
        ]
      );
    }
  });

  const pool = getPostgresPool();
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return getPgForecastCombinations(pool, projectId, 5000, {
    includeSystem: true,
  });
}

export async function listForecastPrewarmCombinations(projectId: string, recentLimit = 50) {
  const bundle = await getAnalyticsProject(projectId);
  if (!bundle) {
    throw new Error("Project not found.");
  }

  const primaryInputs = buildPrimaryForecastCombinationInputs(bundle);
  const primaryKeys = new Set(primaryInputs.map((entry) => entry.key ?? buildForecastCombinationKey(entry.filters)));
  const primaryMap = new Map(primaryInputs.map((entry) => [entry.key ?? buildForecastCombinationKey(entry.filters), entry]));
  const storedCombinations = await listForecastCombinations(
    projectId,
    Math.max(primaryInputs.length + recentLimit + 20, 100),
    { includeSystem: true }
  );

  const recentCombinations = storedCombinations
    .filter((entry) => !primaryKeys.has(entry.combinationKey))
    .slice(0, recentLimit);

  const primaryCombinations = primaryInputs.map((entry) => {
    const key = entry.key ?? buildForecastCombinationKey(entry.filters);
    const stored =
      storedCombinations.find((candidate) => candidate.combinationKey === key) ?? null;
    if (stored) {
      return stored;
    }

    return {
      id: `planned-${bundle.project.id}-${key}`,
      projectId: bundle.project.id,
      combinationKey: key,
      label: entry.label,
      sourcePage: entry.sourcePage ?? PRIMARY_PREWARM_SOURCE_PAGE,
      filters: normalizeJsonLike(entry.filters) as Record<string, unknown>,
      viewCount: 0,
      firstViewedAt: bundle.project.createdAt,
      lastViewedAt: bundle.project.updatedAt,
      lastForecastRunId: null,
      lastForecastStatus: null,
    } satisfies AnalyticsForecastCombinationRecord;
  });

  const merged = [...primaryCombinations, ...recentCombinations].filter(
    (entry, index, entries) =>
      entries.findIndex((candidate) => candidate.combinationKey === entry.combinationKey) ===
      index
  );

  return {
    combinations: merged,
    primaryCount: primaryCombinations.length,
    recentCount: recentCombinations.length,
    totalCount: merged.length,
    primaryKeys: Array.from(primaryMap.keys()),
  };
}

async function seedPrimaryForecastCombinations(
  projectId: string,
  actor: string | null,
  options?: { queueRuns?: boolean; triggerKind?: AnalyticsTriggerKind }
) {
  const bundle = await getAnalyticsProject(projectId);
  if (!bundle || !bundle.project.settings.forecastStrategy.precomputePrimaryForecasts) {
    return { combinations: [] as AnalyticsForecastCombinationRecord[], queuedRuns: [] as AnalyticsSyncRunRecord[] };
  }

  const primaryInputs = buildPrimaryForecastCombinationInputs(bundle);
  const combinations = await upsertForecastCombinations(bundle.project.id, primaryInputs);
  const queuedRuns: AnalyticsSyncRunRecord[] = [];

  if (useDemoStore()) {
    const store = getDemoStore();
    trimDemoForecastCombinations(
      store,
      bundle.project.id,
      bundle.project.settings.forecastStrategy.recentCombinationLimit
    );
  } else {
    await withPgTransaction(async (client) => {
      await trimPgForecastCombinations(
        client,
        bundle.project.id,
        bundle.project.settings.forecastStrategy.recentCombinationLimit
      );
    });
  }

  if (!options?.queueRuns) {
    return { combinations, queuedRuns };
  }

  const combinationsByKey = new Map(
    combinations.map((entry) => [entry.combinationKey, entry] as const)
  );
  for (const input of primaryInputs) {
    const key = input.key ?? buildForecastCombinationKey(input.filters);
    const current = combinationsByKey.get(key);
    if (!current) {
      continue;
    }

    const isWarm =
      current.lastForecastStatus === "queued" ||
      current.lastForecastStatus === "blocked" ||
      current.lastForecastStatus === "running" ||
      current.lastForecastStatus === "succeeded";
    if (isWarm) {
      continue;
    }

    const queuedRun = await requestAnalyticsSync(bundle.project.id, {
      runType: "forecast",
      requestedBy: actor,
      triggerKind: options.triggerKind ?? "bootstrap",
      payload: {
        forecastCombination: {
          key,
          label: input.label,
          sourcePage: input.sourcePage,
          filters: input.filters,
          prewarm: true,
        },
      },
    });

    queuedRuns.push(queuedRun);
    await setForecastCombinationRunReference(
      bundle.project.id,
      key,
      queuedRun.id,
      queuedRun.status
    );
  }

  return { combinations, queuedRuns };
}

function ensureProjectPayload(input: AnalyticsProjectInput) {
  const slug = slugify(input.slug || input.displayName || "");
  const displayName = normalizeText(input.displayName, 96, titleFromSlug(slug));

  if (!slug || !displayName) {
    throw new Error("Project slug and display name are required.");
  }

  const settings = normalizeProjectSettings(input);
  const defaultBucket = deriveStorageBucket(
    normalizeText(input.gcpProjectId, 120, "analytics-platform-493522"),
    slug
  );
  const gcsBucket =
    settings.autoProvisionInfrastructure
      ? normalizeText(input.gcsBucket, 120, defaultBucket)
      : normalizeText(input.gcsBucket, 120, defaultBucket);
  const rawDataset = normalizeText(input.rawDataset, 64, "raw");
  const stgDataset = normalizeText(input.stgDataset, 64, "stg");
  const martDataset = normalizeText(input.martDataset, 64, "mart");
  const boundsPrefix = normalizeText(input.boundsPrefix, 180, deriveBoundsPrefix(slug));
  const boundsBucket = normalizeText(input.boundsBucket, 120, gcsBucket);

  return {
    slug,
    displayName,
    description: normalizeText(input.description, 220),
    ownerTeam: normalizeText(input.ownerTeam, 64, "Client Services"),
    gcpProjectId: normalizeText(input.gcpProjectId, 120, "analytics-platform-493522"),
    gcsBucket,
    rawDataset,
    stgDataset,
    martDataset,
    boundsPath: normalizeText(input.boundsPath, 220, deriveBoundsPath(boundsBucket, slug)),
    defaultGranularityDays: normalizeInt(input.defaultGranularityDays, 7, 1, 90),
    refreshIntervalHours: normalizeInt(input.refreshIntervalHours, 6, 1, 168),
    forecastIntervalHours: normalizeInt(input.forecastIntervalHours, 12, 1, 168),
    boundsIntervalHours: normalizeInt(input.boundsIntervalHours, 720, 1, 24 * 365),
    lookbackDays: normalizeInt(input.lookbackDays, 1, 1, 365),
    initialBackfillDays: normalizeInt(
      input.initialBackfillDays,
      DEFAULT_INITIAL_BACKFILL_DAYS,
      1,
      DEFAULT_INITIAL_BACKFILL_DAYS
    ),
    forecastHorizonDays: normalizeInt(
      input.forecastHorizonDays,
      DEFAULT_FORECAST_HORIZON_DAYS,
      7,
      DEFAULT_FORECAST_HORIZON_DAYS
    ),
    settings,
    appmetricaAppIds: normalizeStringList(input.appmetricaAppIds),
    appmetricaEventNames: normalizeStringList(input.appmetricaEventNames),
    appmetricaToken: normalizeText(input.appmetricaToken, 4096),
    bigquerySourceProjectId: normalizeText(input.bigquerySourceProjectId, 120),
    bigquerySourceDataset: normalizeText(input.bigquerySourceDataset, 120),
    bigqueryServiceAccountJson: normalizeText(input.bigqueryServiceAccountJson, 16000),
    unityAdsEnabled: normalizeBoolean(input.unityAdsEnabled, false),
    unityAdsMode: normalizeChoice(input.unityAdsMode, ["bigquery", "api"] as const, "bigquery"),
    unityAdsSourceProjectId: normalizeText(input.unityAdsSourceProjectId, 120),
    unityAdsSourceDataset: normalizeText(input.unityAdsSourceDataset, 120),
    unityAdsTablePattern: normalizeText(input.unityAdsTablePattern, 120, "day_*"),
    unityAdsOrganizationId: normalizeText(input.unityAdsOrganizationId, 120),
    unityAdsApiKey: normalizeText(input.unityAdsApiKey, 4096),
    googleAdsEnabled: normalizeBoolean(input.googleAdsEnabled, false),
    googleAdsMode: normalizeChoice(input.googleAdsMode, ["bigquery", "api"] as const, "bigquery"),
    googleAdsSourceProjectId: normalizeText(input.googleAdsSourceProjectId, 120),
    googleAdsSourceDataset: normalizeText(input.googleAdsSourceDataset, 120),
    googleAdsTablePattern: normalizeText(input.googleAdsTablePattern, 120, "p_ads_*"),
    googleAdsCustomerId: normalizeText(input.googleAdsCustomerId, 64),
    googleAdsDeveloperToken: normalizeText(input.googleAdsDeveloperToken, 512),
    googleAdsClientId: normalizeText(input.googleAdsClientId, 512),
    googleAdsClientSecret: normalizeText(input.googleAdsClientSecret, 4096),
    googleAdsRefreshToken: normalizeText(input.googleAdsRefreshToken, 4096),
    googleAdsLoginCustomerId: normalizeText(input.googleAdsLoginCustomerId, 64),
    boundsBucket,
    boundsPrefix,
  };
}

function sourcePayloadsFromInput(projectId: string, input: ReturnType<typeof ensureProjectPayload>) {
  return [
    deriveSourceRecord({
      id: randomUUID(),
      projectId,
      sourceType: "appmetrica_logs",
      label: "AppMetrica Logs API",
      status: "missing_credentials",
      deliveryMode: "Logs API · D+1",
      frequencyHours: input.refreshIntervalHours,
      lastSyncAt: null,
      nextSyncAt: nextSyncAtFromHours(input.refreshIntervalHours),
      secretPresent: Boolean(input.appmetricaToken),
      secretHint: secretHintForValue("appmetrica_logs", input.appmetricaToken),
      config: {
        appIds: input.appmetricaAppIds,
        eventNames: input.appmetricaEventNames,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    deriveSourceRecord({
      id: randomUUID(),
      projectId,
      sourceType: "bigquery_export",
      label: "BigQuery export",
      status: "missing_credentials",
      deliveryMode: "Dataset pull",
      frequencyHours: input.refreshIntervalHours,
      lastSyncAt: null,
      nextSyncAt: nextSyncAtFromHours(input.refreshIntervalHours),
      secretPresent: Boolean(input.bigqueryServiceAccountJson),
      secretHint: secretHintForValue("bigquery_export", input.bigqueryServiceAccountJson),
      config: {
        sourceProjectId: input.bigquerySourceProjectId,
        sourceDataset: input.bigquerySourceDataset,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    deriveSourceRecord({
      id: randomUUID(),
      projectId,
      sourceType: "unity_ads_spend",
      label: "Unity Ads spend",
      status: "disabled",
      deliveryMode: input.unityAdsMode === "api" ? "Direct API" : "BigQuery mirror",
      frequencyHours: input.refreshIntervalHours,
      lastSyncAt: null,
      nextSyncAt: nextSyncAtFromHours(input.refreshIntervalHours),
      secretPresent: Boolean(input.unityAdsApiKey),
      secretHint: secretHintForValue("unity_ads_spend", input.unityAdsApiKey),
      config: {
        enabled: input.unityAdsEnabled,
        mode: input.unityAdsMode,
        sourceProjectId: input.unityAdsSourceProjectId,
        sourceDataset: input.unityAdsSourceDataset,
        tablePattern: input.unityAdsTablePattern,
        organizationId: input.unityAdsOrganizationId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    deriveSourceRecord({
      id: randomUUID(),
      projectId,
      sourceType: "google_ads_spend",
      label: "Google Ads spend",
      status: "disabled",
      deliveryMode: input.googleAdsMode === "api" ? "Direct API" : "BigQuery mirror",
      frequencyHours: input.refreshIntervalHours,
      lastSyncAt: null,
      nextSyncAt: nextSyncAtFromHours(input.refreshIntervalHours),
      secretPresent: Boolean(
        input.googleAdsDeveloperToken ||
          input.googleAdsClientSecret ||
          input.googleAdsRefreshToken
      ),
      secretHint: secretHintForValue(
        "google_ads_spend",
        JSON.stringify({
          customerId: input.googleAdsCustomerId,
          developerToken: input.googleAdsDeveloperToken,
        })
      ),
      config: {
        enabled: input.googleAdsEnabled,
        mode: input.googleAdsMode,
        sourceProjectId: input.googleAdsSourceProjectId,
        sourceDataset: input.googleAdsSourceDataset,
        tablePattern: input.googleAdsTablePattern,
        customerId: input.googleAdsCustomerId,
        loginCustomerId: input.googleAdsLoginCustomerId,
        clientId: input.googleAdsClientId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    deriveSourceRecord({
      id: randomUUID(),
      projectId,
      sourceType: "bounds_artifacts",
      label: "Bounds artifacts",
      status: "configured",
      deliveryMode: "GCS manifest",
      frequencyHours: input.boundsIntervalHours,
      lastSyncAt: null,
      nextSyncAt: nextSyncAtFromHours(input.boundsIntervalHours),
      secretPresent: false,
      secretHint: null,
      config: {
        bucket: input.boundsBucket,
        prefix: input.boundsPrefix,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  ];
}

function immutableInfraChangesForProject(
  existing: AnalyticsProjectBundle,
  next: ReturnType<typeof ensureProjectPayload>
) {
  const changes: string[] = [];

  if (existing.project.slug !== next.slug) {
    changes.push("slug");
  }
  if (existing.project.gcpProjectId !== next.gcpProjectId) {
    changes.push("warehouse project");
  }
  if (existing.project.gcsBucket !== next.gcsBucket) {
    changes.push("storage bucket");
  }
  if (existing.project.rawDataset !== next.rawDataset) {
    changes.push("raw dataset");
  }
  if (existing.project.stgDataset !== next.stgDataset) {
    changes.push("stg dataset");
  }
  if (existing.project.martDataset !== next.martDataset) {
    changes.push("mart dataset");
  }
  if (existing.project.boundsPath !== next.boundsPath) {
    changes.push("bounds path");
  }

  return changes;
}

function mergeExistingSourceSecrets(
  nextSources: AnalyticsSourceRecord[],
  existingSources: AnalyticsSourceRecord[],
  input: ReturnType<typeof ensureProjectPayload>
) {
  return nextSources.map((source) => {
    const existingSource = existingSources.find((entry) => entry.sourceType === source.sourceType);
    if (!existingSource) {
      return source;
    }

    const shouldPreserveSecret =
      (source.sourceType === "appmetrica_logs" && !input.appmetricaToken) ||
      (source.sourceType === "bigquery_export" && !input.bigqueryServiceAccountJson) ||
      (source.sourceType === "unity_ads_spend" && !input.unityAdsApiKey) ||
      (source.sourceType === "google_ads_spend" &&
        !input.googleAdsDeveloperToken &&
        !input.googleAdsClientSecret &&
        !input.googleAdsRefreshToken);

    if (!shouldPreserveSecret) {
      return source;
    }

    return {
      ...source,
      secretPresent: existingSource.secretPresent,
      secretHint: existingSource.secretHint,
    };
  });
}

function serializeClientDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

function parseOptionalDateTime(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mergeRunPayload(
  currentPayload: Record<string, unknown>,
  patchPayload?: Record<string, unknown>
) {
  return patchPayload ? { ...currentPayload, ...patchPayload } : currentPayload;
}

function deriveSourcePatchAfterRun(
  source: AnalyticsSourceRecord,
  run: AnalyticsSyncRunRecord,
  patch: AnalyticsRunUpdateInput
) {
  const lastSyncAt =
    parseOptionalDateTime(patch.lastSyncAt) ??
    (patch.status === "succeeded" ? run.finishedAt ?? new Date() : source.lastSyncAt);
  const nextSyncAt =
    parseOptionalDateTime(patch.nextSyncAt) ??
    (lastSyncAt ? new Date(lastSyncAt.getTime() + source.frequencyHours * 60 * 60 * 1000) : source.nextSyncAt);

  let status: AnalyticsSourceStatus = source.status;
  if (patch.sourceStatus) {
    status = patch.sourceStatus;
  } else if (patch.status === "running" || patch.status === "queued") {
    status = "syncing";
  } else if (patch.status === "succeeded") {
    status = source.secretPresent || source.sourceType === "bounds_artifacts" ? "ready" : "configured";
  } else if (patch.status === "failed") {
    status = "error";
  }

  return {
    ...source,
    status,
    lastSyncAt,
    nextSyncAt,
    updatedAt: new Date(),
  };
}

function applyForecastCombinationStatusToDemoStore(
  store: DemoPlatformStore,
  run: AnalyticsSyncRunRecord
) {
  const combination = forecastCombinationStatusFromRun(run);
  if (!combination) {
    return;
  }

  store.forecastCombinations = store.forecastCombinations.map((entry) =>
    entry.projectId === run.projectId && entry.combinationKey === combination.key
      ? {
          ...entry,
          lastForecastRunId: run.id,
          lastForecastStatus: run.status,
        }
      : entry
  );
}

async function setForecastCombinationRunReference(
  projectId: string,
  combinationKey: string,
  runId: string,
  status: AnalyticsRunStatus
) {
  if (useDemoStore()) {
    seedDemoStore();
    const store = getDemoStore();
    store.forecastCombinations = store.forecastCombinations.map((entry) =>
      entry.projectId === projectId && entry.combinationKey === combinationKey
        ? {
            ...entry,
            lastForecastRunId: runId,
            lastForecastStatus: status,
          }
        : entry
    );
    return;
  }

  await withPgTransaction(async (client) => {
    await client.query(
      `
        UPDATE analytics_forecast_combinations
        SET
          last_forecast_run_id = $3,
          last_forecast_status = $4
        WHERE project_id = $1 AND combination_key = $2
      `,
      [projectId, combinationKey, runId, status]
    );
  });
}

async function applyForecastCombinationStatusPg(
  client: Pick<PoolClient, "query">,
  run: AnalyticsSyncRunRecord
) {
  const combination = forecastCombinationStatusFromRun(run);
  if (!combination) {
    return;
  }

  await client.query(
    `
      UPDATE analytics_forecast_combinations
      SET
        last_forecast_run_id = $3,
        last_forecast_status = $4
      WHERE project_id = $1 AND combination_key = $2
    `,
    [run.projectId, combination.key, run.id, run.status]
  );
}

export function serializeProjectBundle(bundle: AnalyticsProjectBundle) {
  return {
    project: {
      ...bundle.project,
      createdAt: bundle.project.createdAt.toISOString(),
      updatedAt: bundle.project.updatedAt.toISOString(),
    },
    sources: bundle.sources.map((source) => ({
      ...source,
      lastSyncAt: serializeClientDate(source.lastSyncAt),
      nextSyncAt: serializeClientDate(source.nextSyncAt),
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString(),
    })),
    latestRuns: bundle.latestRuns.map((run) => ({
      ...run,
      requestedAt: run.requestedAt.toISOString(),
      startedAt: serializeClientDate(run.startedAt),
      finishedAt: serializeClientDate(run.finishedAt),
    })),
  };
}

export function serializeForecastCombination(
  combination: AnalyticsForecastCombinationRecord
) {
  return {
    ...combination,
    firstViewedAt: combination.firstViewedAt.toISOString(),
    lastViewedAt: combination.lastViewedAt.toISOString(),
  };
}

export async function listAnalyticsProjects(): Promise<AnalyticsProjectBundle[]> {
  await ensurePlatformSchema();

  if (useDemoStore()) {
    seedDemoStore();
    const store = getDemoStore();
    return store.projects
      .map((project) => {
        const sources = store.sources.filter((source) => source.projectId === project.id);
        const latestRuns = store.runs
          .filter((run) => run.projectId === project.id)
          .sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime())
          .slice(0, LATEST_RUNS_LIMIT);
        return {
          project: { ...project, status: deriveProjectStatus(project, sources, latestRuns) },
          sources,
          latestRuns,
        };
      })
      .sort((left, right) => left.project.displayName.localeCompare(right.project.displayName));
  }

  const pool = getPostgresPool();
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const projectsResult = await pool.query(`SELECT * FROM analytics_projects ORDER BY display_name ASC`);
  const projects = projectsResult.rows.map((row) => normalizePgProject(row as Record<string, unknown>));
  const projectIds = projects.map((project) => project.id);
  const sourcesResult = projectIds.length
    ? await pool.query(`SELECT * FROM analytics_project_sources WHERE project_id = ANY($1::text[]) ORDER BY source_type ASC`, [projectIds])
    : { rows: [] };
  const runsResult = projectIds.length
    ? await pool.query(
        `SELECT * FROM analytics_sync_runs WHERE project_id = ANY($1::text[]) ORDER BY requested_at DESC`,
        [projectIds]
      )
    : { rows: [] };
  const normalizedSources = sourcesResult.rows.map((row) => normalizePgSource(row as Record<string, unknown>));
  const normalizedRuns = runsResult.rows.map((row) => normalizePgRun(row as Record<string, unknown>));

  return projects.map((project) => {
    const projectSources = normalizedSources.filter((source) => source.projectId === project.id);
    const latestRuns = normalizedRuns
      .filter((run) => run.projectId === project.id)
      .slice(0, LATEST_RUNS_LIMIT);
    return {
      project: { ...project, status: deriveProjectStatus(project, projectSources, latestRuns) },
      sources: projectSources,
      latestRuns,
    };
  });
}

export async function listAnalyticsProjectOptions() {
  const bundles = await listAnalyticsProjects();
  return bundles.map((bundle) => ({
    key: bundle.project.slug,
    label: bundle.project.displayName,
    shortLabel: bundle.project.displayName
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 4)
      .toUpperCase(),
    status: bundle.project.status,
  }));
}

export async function getAnalyticsProject(projectId: string) {
  const bundles = await listAnalyticsProjects();
  return bundles.find((bundle) => bundle.project.id === projectId || bundle.project.slug === projectId) ?? null;
}

async function upsertProjectSourcesPg(
  client: PoolClient,
  projectId: string,
  input: ReturnType<typeof ensureProjectPayload>,
  existingSources: AnalyticsSourceRecord[] = []
) {
  const sourcePayloads = mergeExistingSourceSecrets(sourcePayloadsFromInput(projectId, input), existingSources, input);

  for (const source of sourcePayloads) {
    const secretValue =
      source.sourceType === "appmetrica_logs"
        ? input.appmetricaToken
        : source.sourceType === "bigquery_export"
          ? input.bigqueryServiceAccountJson
          : source.sourceType === "unity_ads_spend"
            ? input.unityAdsApiKey
            : source.sourceType === "google_ads_spend"
              ? input.googleAdsDeveloperToken ||
                input.googleAdsClientSecret ||
                input.googleAdsRefreshToken
                ? JSON.stringify({
                    developerToken: input.googleAdsDeveloperToken,
                    clientId: input.googleAdsClientId,
                    clientSecret: input.googleAdsClientSecret,
                    refreshToken: input.googleAdsRefreshToken,
                    customerId: input.googleAdsCustomerId,
                    loginCustomerId: input.googleAdsLoginCustomerId,
                  })
                : null
          : null;
    const secretCiphertext = secretValue ? encryptSecret(secretValue) : null;

    await client.query(
      `
        INSERT INTO analytics_project_sources (
          id,
          project_id,
          source_type,
          label,
          status,
          delivery_mode,
          frequency_hours,
          last_sync_at,
          next_sync_at,
          secret_present,
          secret_hint,
          secret_ciphertext,
          config_json,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW(), NOW()
        )
        ON CONFLICT (project_id, source_type)
        DO UPDATE SET
          label = EXCLUDED.label,
          status = EXCLUDED.status,
          delivery_mode = EXCLUDED.delivery_mode,
          frequency_hours = EXCLUDED.frequency_hours,
          next_sync_at = EXCLUDED.next_sync_at,
          secret_present = EXCLUDED.secret_present,
          secret_hint = EXCLUDED.secret_hint,
          secret_ciphertext = COALESCE(EXCLUDED.secret_ciphertext, analytics_project_sources.secret_ciphertext),
          config_json = EXCLUDED.config_json,
          updated_at = NOW()
      `,
      [
        source.id,
        projectId,
        source.sourceType,
        source.label,
        source.status,
        source.deliveryMode,
        source.frequencyHours,
        source.lastSyncAt,
        source.nextSyncAt,
        source.secretPresent,
        source.secretHint,
        secretCiphertext,
        JSON.stringify(source.config),
      ]
    );
  }
}

export async function createAnalyticsProject(
  input: AnalyticsProjectInput,
  actor: string | null
) {
  await ensurePlatformSchema();
  const normalized = ensureProjectPayload(input);

  if (useDemoStore()) {
    seedDemoStore();
    const store = getDemoStore();
    if (store.projects.some((project) => project.slug === normalized.slug)) {
      throw new Error("Project slug already exists.");
    }

    const projectId = randomUUID();
    const createdAt = new Date();
    const project: AnalyticsProjectRecord = {
      id: projectId,
      slug: normalized.slug,
      displayName: normalized.displayName,
      description: normalized.description,
      ownerTeam: normalized.ownerTeam,
      status: "draft",
      gcpProjectId: normalized.gcpProjectId,
      gcsBucket: normalized.gcsBucket,
      rawDataset: normalized.rawDataset,
      stgDataset: normalized.stgDataset,
      martDataset: normalized.martDataset,
      boundsPath: normalized.boundsPath,
      defaultGranularityDays: normalized.defaultGranularityDays,
      refreshIntervalHours: normalized.refreshIntervalHours,
      forecastIntervalHours: normalized.forecastIntervalHours,
      boundsIntervalHours: normalized.boundsIntervalHours,
      lookbackDays: normalized.lookbackDays,
      initialBackfillDays: normalized.initialBackfillDays,
      forecastHorizonDays: normalized.forecastHorizonDays,
      settings: normalized.settings,
      createdBy: actor,
      updatedBy: actor,
      createdAt,
      updatedAt: createdAt,
    };
    const sources = sourcePayloadsFromInput(projectId, normalized);
    const latestRuns: AnalyticsSyncRunRecord[] = [];
    project.status = deriveProjectStatus(project, sources, latestRuns);
    store.projects.unshift(project);
    store.sources.push(...sources);
    return { project, sources, latestRuns };
  }

  const createdProjectId = await withPgTransaction(async (client) => {
    const existing = await client.query(`SELECT id FROM analytics_projects WHERE slug = $1 LIMIT 1`, [normalized.slug]);
    if (existing.rowCount) {
      throw new Error("Project slug already exists.");
    }

    const projectId = randomUUID();
    await client.query(
      `
        INSERT INTO analytics_projects (
          id,
          slug,
          display_name,
          description,
          owner_team,
          status,
          gcp_project_id,
          gcs_bucket,
          raw_dataset,
          stg_dataset,
          mart_dataset,
          bounds_path,
          default_granularity_days,
          refresh_interval_hours,
          forecast_interval_hours,
          bounds_interval_hours,
          lookback_days,
          initial_backfill_days,
          forecast_horizon_days,
          settings_json,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20, $21, NOW(), NOW()
        )
      `,
      [
        projectId,
        normalized.slug,
        normalized.displayName,
        normalized.description,
        normalized.ownerTeam,
        normalized.gcpProjectId,
        normalized.gcsBucket,
        normalized.rawDataset,
        normalized.stgDataset,
        normalized.martDataset,
        normalized.boundsPath,
        normalized.defaultGranularityDays,
        normalized.refreshIntervalHours,
        normalized.forecastIntervalHours,
        normalized.boundsIntervalHours,
        normalized.lookbackDays,
        normalized.initialBackfillDays,
        normalized.forecastHorizonDays,
        JSON.stringify(normalized.settings),
        actor,
        actor,
      ]
    );

    await upsertProjectSourcesPg(client, projectId, normalized);
    return projectId;
  });

  const bundle = await getAnalyticsProject(createdProjectId);
  if (!bundle) {
    throw new Error("Project was created but could not be reloaded.");
  }

  if (bundle.project.settings.autoBootstrapOnCreate) {
    await requestAnalyticsSync(bundle.project.id, {
      runType: "bootstrap",
      requestedBy: actor,
      triggerKind: "bootstrap",
    });
    return (await getAnalyticsProject(createdProjectId)) ?? bundle;
  }

  await seedPrimaryForecastCombinations(bundle.project.id, actor, {
    queueRuns: false,
  });

  return bundle;
}

export async function updateAnalyticsProject(
  projectId: string,
  patch: Partial<AnalyticsProjectInput>,
  actor: string | null
) {
  await ensurePlatformSchema();
  const existing = await getAnalyticsProject(projectId);
  if (!existing) {
    throw new Error("Project not found.");
  }

  const appmetricaSource = existing.sources.find((source) => source.sourceType === "appmetrica_logs");
  const bigquerySource = existing.sources.find((source) => source.sourceType === "bigquery_export");
  const boundsSource = existing.sources.find((source) => source.sourceType === "bounds_artifacts");
  const unityAdsSource = existing.sources.find((source) => source.sourceType === "unity_ads_spend");
  const googleAdsSource = existing.sources.find((source) => source.sourceType === "google_ads_spend");

  const normalized = ensureProjectPayload({
    ...existing.project,
    autoProvisionInfrastructure: patch.autoProvisionInfrastructure ?? existing.project.settings.autoProvisionInfrastructure,
    provisioningRegion: patch.provisioningRegion ?? existing.project.settings.provisioningRegion,
    autoBootstrapOnCreate: patch.autoBootstrapOnCreate ?? existing.project.settings.autoBootstrapOnCreate,
    precomputePrimaryForecasts:
      patch.precomputePrimaryForecasts ?? existing.project.settings.forecastStrategy.precomputePrimaryForecasts,
    enableOnDemandForecasts:
      patch.enableOnDemandForecasts ?? existing.project.settings.forecastStrategy.enableOnDemandForecasts,
    expandPrimaryMatrix:
      patch.expandPrimaryMatrix ?? existing.project.settings.forecastStrategy.expandPrimaryMatrix,
    forecastRecentCombinationLimit:
      patch.forecastRecentCombinationLimit ?? existing.project.settings.forecastStrategy.recentCombinationLimit,
    forecastPrimaryCountries:
      patch.forecastPrimaryCountries ?? existing.project.settings.forecastStrategy.primaryCountries,
    forecastPrimarySegments:
      patch.forecastPrimarySegments ?? existing.project.settings.forecastStrategy.primarySegments,
    forecastPrimarySpendSources:
      patch.forecastPrimarySpendSources ?? existing.project.settings.forecastStrategy.primarySpendSources,
    forecastPrimaryPlatforms:
      patch.forecastPrimaryPlatforms ?? existing.project.settings.forecastStrategy.primaryPlatforms,
    appmetricaAppIds:
      patch.appmetricaAppIds ??
      (Array.isArray(appmetricaSource?.config.appIds)
        ? (appmetricaSource?.config.appIds as string[])
        : []),
    appmetricaEventNames:
      patch.appmetricaEventNames ??
      (Array.isArray(appmetricaSource?.config.eventNames)
        ? (appmetricaSource?.config.eventNames as string[])
        : []),
    bigquerySourceProjectId:
      patch.bigquerySourceProjectId ??
      (typeof bigquerySource?.config.sourceProjectId === "string"
        ? (bigquerySource?.config.sourceProjectId as string)
        : ""),
    bigquerySourceDataset:
      patch.bigquerySourceDataset ??
      (typeof bigquerySource?.config.sourceDataset === "string"
        ? (bigquerySource?.config.sourceDataset as string)
        : ""),
    unityAdsEnabled:
      patch.unityAdsEnabled ??
      (unityAdsSource?.config.enabled === false ? false : Boolean(unityAdsSource)),
    unityAdsMode:
      patch.unityAdsMode ??
      (unityAdsSource?.config.mode === "api" ? "api" : "bigquery"),
    unityAdsSourceProjectId:
      patch.unityAdsSourceProjectId ??
      (typeof unityAdsSource?.config.sourceProjectId === "string"
        ? (unityAdsSource?.config.sourceProjectId as string)
        : ""),
    unityAdsSourceDataset:
      patch.unityAdsSourceDataset ??
      (typeof unityAdsSource?.config.sourceDataset === "string"
        ? (unityAdsSource?.config.sourceDataset as string)
        : ""),
    unityAdsTablePattern:
      patch.unityAdsTablePattern ??
      (typeof unityAdsSource?.config.tablePattern === "string"
        ? (unityAdsSource?.config.tablePattern as string)
        : "day_*"),
    unityAdsOrganizationId:
      patch.unityAdsOrganizationId ??
      (typeof unityAdsSource?.config.organizationId === "string"
        ? (unityAdsSource?.config.organizationId as string)
        : ""),
    googleAdsEnabled:
      patch.googleAdsEnabled ??
      (googleAdsSource?.config.enabled === false ? false : Boolean(googleAdsSource)),
    googleAdsMode:
      patch.googleAdsMode ??
      (googleAdsSource?.config.mode === "api" ? "api" : "bigquery"),
    googleAdsSourceProjectId:
      patch.googleAdsSourceProjectId ??
      (typeof googleAdsSource?.config.sourceProjectId === "string"
        ? (googleAdsSource?.config.sourceProjectId as string)
        : ""),
    googleAdsSourceDataset:
      patch.googleAdsSourceDataset ??
      (typeof googleAdsSource?.config.sourceDataset === "string"
        ? (googleAdsSource?.config.sourceDataset as string)
        : ""),
    googleAdsTablePattern:
      patch.googleAdsTablePattern ??
      (typeof googleAdsSource?.config.tablePattern === "string"
        ? (googleAdsSource?.config.tablePattern as string)
        : "p_ads_*"),
    googleAdsCustomerId:
      patch.googleAdsCustomerId ??
      (typeof googleAdsSource?.config.customerId === "string"
        ? (googleAdsSource?.config.customerId as string)
        : ""),
    googleAdsClientId:
      patch.googleAdsClientId ??
      (typeof googleAdsSource?.config.clientId === "string"
        ? (googleAdsSource?.config.clientId as string)
        : ""),
    googleAdsLoginCustomerId:
      patch.googleAdsLoginCustomerId ??
      (typeof googleAdsSource?.config.loginCustomerId === "string"
        ? (googleAdsSource?.config.loginCustomerId as string)
        : ""),
    boundsBucket:
      patch.boundsBucket ??
      (typeof boundsSource?.config.bucket === "string"
        ? (boundsSource?.config.bucket as string)
        : existing.project.gcsBucket),
    boundsPrefix:
      patch.boundsPrefix ??
      (typeof boundsSource?.config.prefix === "string"
        ? (boundsSource?.config.prefix as string)
        : `bounds/${existing.project.slug}/`),
    ...patch,
  });

  const hasRuntimeState =
    existing.latestRuns.length > 0 ||
    existing.sources.some((source) => source.lastSyncAt !== null);
  if (hasRuntimeState) {
    const immutableChanges = immutableInfraChangesForProject(existing, normalized);
    if (immutableChanges.length > 0) {
      throw new Error(
        `Cannot change ${immutableChanges.join(", ")} after the project has already produced runtime state. Create a new project or run an explicit migration instead.`
      );
    }
  }

  if (useDemoStore()) {
    seedDemoStore();
    const store = getDemoStore();
    const project = store.projects.find((entry) => entry.id === existing.project.id);
    if (!project) {
      throw new Error("Project not found.");
    }

    Object.assign(project, {
      slug: normalized.slug,
      displayName: normalized.displayName,
      description: normalized.description,
      ownerTeam: normalized.ownerTeam,
      gcpProjectId: normalized.gcpProjectId,
      gcsBucket: normalized.gcsBucket,
      rawDataset: normalized.rawDataset,
      stgDataset: normalized.stgDataset,
      martDataset: normalized.martDataset,
      boundsPath: normalized.boundsPath,
      defaultGranularityDays: normalized.defaultGranularityDays,
      refreshIntervalHours: normalized.refreshIntervalHours,
      forecastIntervalHours: normalized.forecastIntervalHours,
      boundsIntervalHours: normalized.boundsIntervalHours,
      lookbackDays: normalized.lookbackDays,
      initialBackfillDays: normalized.initialBackfillDays,
      forecastHorizonDays: normalized.forecastHorizonDays,
      settings: normalized.settings,
      updatedBy: actor,
      updatedAt: new Date(),
    });

    const nextSources = mergeExistingSourceSecrets(
      sourcePayloadsFromInput(existing.project.id, normalized),
      existing.sources,
      normalized
    );
    store.sources = store.sources.filter((source) => source.projectId !== existing.project.id).concat(nextSources);
    const latestRuns = store.runs
      .filter((run) => run.projectId === existing.project.id)
      .sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime())
      .slice(0, LATEST_RUNS_LIMIT);
    project.status = deriveProjectStatus(project, nextSources, latestRuns);
    return { project, sources: nextSources, latestRuns };
  }

  const updatedProjectId = await withPgTransaction(async (client) => {
    await client.query(
      `
        UPDATE analytics_projects
        SET
          slug = $2,
          display_name = $3,
          description = $4,
          owner_team = $5,
          gcp_project_id = $6,
          gcs_bucket = $7,
          raw_dataset = $8,
          stg_dataset = $9,
          mart_dataset = $10,
          bounds_path = $11,
          default_granularity_days = $12,
          refresh_interval_hours = $13,
          forecast_interval_hours = $14,
          bounds_interval_hours = $15,
          lookback_days = $16,
          initial_backfill_days = $17,
          forecast_horizon_days = $18,
          settings_json = $19::jsonb,
          updated_by = $20,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        existing.project.id,
        normalized.slug,
        normalized.displayName,
        normalized.description,
        normalized.ownerTeam,
        normalized.gcpProjectId,
        normalized.gcsBucket,
        normalized.rawDataset,
        normalized.stgDataset,
        normalized.martDataset,
        normalized.boundsPath,
        normalized.defaultGranularityDays,
        normalized.refreshIntervalHours,
        normalized.forecastIntervalHours,
        normalized.boundsIntervalHours,
        normalized.lookbackDays,
        normalized.initialBackfillDays,
        normalized.forecastHorizonDays,
        JSON.stringify(normalized.settings),
        actor,
      ]
    );

    await upsertProjectSourcesPg(client, existing.project.id, normalized, existing.sources);
    return existing.project.id;
  });

  const bundle = await getAnalyticsProject(updatedProjectId);
  if (!bundle) {
    throw new Error("Project was updated but could not be reloaded.");
  }

  const forecastSettingsChanged =
    patch.precomputePrimaryForecasts !== undefined ||
    patch.expandPrimaryMatrix !== undefined ||
    patch.forecastRecentCombinationLimit !== undefined ||
    patch.forecastPrimaryCountries !== undefined ||
    patch.forecastPrimarySegments !== undefined ||
    patch.forecastPrimarySpendSources !== undefined ||
    patch.forecastPrimaryPlatforms !== undefined;

  if (forecastSettingsChanged) {
    await seedPrimaryForecastCombinations(bundle.project.id, actor, {
      queueRuns: bundle.latestRuns.some(
        (run) => run.runType === "forecast" && run.status === "succeeded"
      ),
      triggerKind: "manual",
    });
    return (await getAnalyticsProject(updatedProjectId)) ?? bundle;
  }

  return bundle;
}

export async function listAnalyticsProjectRuns(projectId: string) {
  const bundle = await getAnalyticsProject(projectId);
  return bundle?.latestRuns ?? [];
}

export async function getAnalyticsRunContext(runId: string) {
  await ensurePlatformSchema();

  if (useDemoStore()) {
    seedDemoStore();
    const store = getDemoStore();
    const run = store.runs.find((entry) => entry.id === runId) ?? null;
    if (!run) {
      return null;
    }

    const bundle = await getAnalyticsProject(run.projectId);
    return bundle ? { run, bundle } : null;
  }

  const pool = getPostgresPool();
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const runResult = await pool.query(`SELECT * FROM analytics_sync_runs WHERE id = $1 LIMIT 1`, [runId]);
  if (!runResult.rowCount) {
    return null;
  }

  const run = normalizePgRun(runResult.rows[0] as Record<string, unknown>);
  const bundle = await getAnalyticsProject(run.projectId);
  return bundle ? { run, bundle } : null;
}

export async function getAnalyticsProjectBySlug(slug: string) {
  return getAnalyticsProject(slug);
}

function forecastCombinationStatusFromRun(run: AnalyticsSyncRunRecord) {
  const payload = run.payload.forecastCombination;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const key =
    typeof (payload as Record<string, unknown>).key === "string"
      ? ((payload as Record<string, unknown>).key as string)
      : null;
  if (!key) {
    return null;
  }

  return {
    key,
    runId: run.id,
    status: run.status,
  };
}

function isForecastCombinationWarm(
  bundle: AnalyticsProjectBundle,
  combinationKey: string
) {
  return bundle.latestRuns.some((run) => {
    if (run.runType !== "forecast") {
      return false;
    }

    const combination = forecastCombinationStatusFromRun(run);
    if (!combination || combination.key !== combinationKey) {
      return false;
    }

    return (
      combination.status === "queued" ||
      combination.status === "blocked" ||
      combination.status === "running" ||
      combination.status === "succeeded"
    );
  });
}

export async function listForecastCombinations(
  projectId: string,
  limit = 50,
  options?: { includeSystem?: boolean }
) {
  await ensurePlatformSchema();

  if (useDemoStore()) {
    seedDemoStore();
    const store = getDemoStore();
    return store.forecastCombinations
      .filter((entry) => options?.includeSystem || !isSystemForecastCombinationSource(entry.sourcePage))
      .filter((entry) => entry.projectId === projectId)
      .sort((left, right) => right.lastViewedAt.getTime() - left.lastViewedAt.getTime())
      .slice(0, limit);
  }

  const pool = getPostgresPool();
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return getPgForecastCombinations(pool, projectId, limit, options);
}

export async function recordForecastCombinationView(
  projectId: string,
  input: AnalyticsForecastCombinationInput,
  actor: string | null
) {
  await ensurePlatformSchema();
  const bundle = await getAnalyticsProject(projectId);
  if (!bundle) {
    throw new Error("Project not found.");
  }

  const filters = normalizeJsonLike(input.filters) as Record<string, unknown>;
  const combinationKey =
    normalizeText(input.key, 2048) || buildForecastCombinationKey(filters);
  const label = normalizeText(input.label, 240, "Ad hoc forecast");
  const sourcePage = normalizeText(input.sourcePage ?? undefined, 128) || null;

  let combination: AnalyticsForecastCombinationRecord;
  if (useDemoStore()) {
    seedDemoStore();
    const store = getDemoStore();
    const existingIndex = store.forecastCombinations.findIndex(
      (entry) =>
        entry.projectId === bundle.project.id && entry.combinationKey === combinationKey
    );
    if (existingIndex >= 0) {
      const existing = store.forecastCombinations[existingIndex];
      combination = {
        ...existing,
        label,
        sourcePage,
        filters,
        viewCount: existing.viewCount + 1,
        lastViewedAt: new Date(),
      };
      store.forecastCombinations[existingIndex] = combination;
    } else {
      combination = {
        id: randomUUID(),
        projectId: bundle.project.id,
        combinationKey,
        label,
        sourcePage,
        filters,
        viewCount: 1,
        firstViewedAt: new Date(),
        lastViewedAt: new Date(),
        lastForecastRunId: null,
        lastForecastStatus: null,
      };
      store.forecastCombinations.unshift(combination);
    }

    trimDemoForecastCombinations(
      store,
      bundle.project.id,
      bundle.project.settings.forecastStrategy.recentCombinationLimit
    );
  } else {
    combination = await withPgTransaction(async (client) => {
      const existingResult = await client.query(
        `
          SELECT *
          FROM analytics_forecast_combinations
          WHERE project_id = $1 AND combination_key = $2
          LIMIT 1
        `,
        [bundle.project.id, combinationKey]
      );

      if (existingResult.rowCount) {
        await client.query(
          `
            UPDATE analytics_forecast_combinations
            SET
              label = $3,
              source_page = $4,
              filters_json = $5::jsonb,
              view_count = analytics_forecast_combinations.view_count + 1,
              last_viewed_at = NOW()
            WHERE project_id = $1 AND combination_key = $2
          `,
          [bundle.project.id, combinationKey, label, sourcePage, JSON.stringify(filters)]
        );
      } else {
        await client.query(
          `
            INSERT INTO analytics_forecast_combinations (
              id,
              project_id,
              combination_key,
              label,
              source_page,
              filters_json,
              view_count,
              first_viewed_at,
              last_viewed_at
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, 1, NOW(), NOW())
          `,
          [randomUUID(), bundle.project.id, combinationKey, label, sourcePage, JSON.stringify(filters)]
        );
      }

      await trimPgForecastCombinations(
        client,
        bundle.project.id,
        bundle.project.settings.forecastStrategy.recentCombinationLimit
      );

      const currentResult = await client.query(
        `
          SELECT *
          FROM analytics_forecast_combinations
          WHERE project_id = $1 AND combination_key = $2
          LIMIT 1
        `,
        [bundle.project.id, combinationKey]
      );

      return normalizePgForecastCombination(currentResult.rows[0] as Record<string, unknown>);
    });
  }

  let queuedRun: AnalyticsSyncRunRecord | null = null;
  if (
    bundle.project.settings.forecastStrategy.enableOnDemandForecasts &&
    !isForecastCombinationWarm(bundle, combinationKey)
  ) {
    queuedRun = await requestAnalyticsSync(bundle.project.id, {
      runType: "forecast",
      requestedBy: actor,
      triggerKind: "manual",
      payload: {
        forecastCombination: {
          key: combinationKey,
          label,
          sourcePage,
          filters,
        },
      },
    });

    const status =
      queuedRun.runType === "forecast" ? queuedRun.status : combination.lastForecastStatus;
    combination = {
      ...combination,
      lastForecastRunId: queuedRun.id,
      lastForecastStatus: status ?? null,
    };

    if (useDemoStore()) {
      const store = getDemoStore();
      store.forecastCombinations = store.forecastCombinations.map((entry) =>
        entry.id === combination.id ? combination : entry
      );
    } else {
      await withPgTransaction(async (client) => {
        await client.query(
          `
            UPDATE analytics_forecast_combinations
            SET
              last_forecast_run_id = $3,
              last_forecast_status = $4
            WHERE id = $1 AND project_id = $2
          `,
          [combination.id, combination.projectId, combination.lastForecastRunId, combination.lastForecastStatus]
        );
      });
    }
  }

  return { combination, queuedRun };
}

function getEnabledOptionalSpendSources(bundle: AnalyticsProjectBundle) {
  return bundle.sources
    .filter(
      (source) =>
        (source.sourceType === "unity_ads_spend" || source.sourceType === "google_ads_spend") &&
        source.status !== "disabled"
    )
    .map((source) => source.sourceType);
}

function requiredSourceStatusesForRun(bundle: AnalyticsProjectBundle, runType: AnalyticsRunType) {
  if (runType === "ingestion" || runType === "backfill") {
    return [
      "bigquery_export",
      "appmetrica_logs",
      ...getEnabledOptionalSpendSources(bundle),
    ] as AnalyticsSourceType[];
  }

  if (runType === "bounds_refresh") {
    return ["bigquery_export"] as AnalyticsSourceType[];
  }

  if (runType === "forecast") {
    return [
      "bigquery_export",
      "bounds_artifacts",
      ...getEnabledOptionalSpendSources(bundle),
    ] as AnalyticsSourceType[];
  }

  return [
    "bigquery_export",
    ...getEnabledOptionalSpendSources(bundle),
  ] as AnalyticsSourceType[];
}

function runDependencies(runType: AnalyticsRunType) {
  if (runType === "bounds_refresh") {
    return ["backfill", "ingestion"] as AnalyticsRunType[];
  }

  if (runType === "forecast") {
    return ["bounds_refresh"] as AnalyticsRunType[];
  }

  if (runType === "serving_refresh") {
    return ["forecast"] as AnalyticsRunType[];
  }

  return [] as AnalyticsRunType[];
}

function activeProjectRuns(bundle: AnalyticsProjectBundle) {
  return bundle.latestRuns.filter((run) => run.status === "queued" || run.status === "running");
}

function activeRunBlocksCandidate(
  activeRun: AnalyticsSyncRunRecord,
  candidateRunType: AnalyticsRunType
) {
  if (activeRun.status !== "queued" && activeRun.status !== "running") {
    return false;
  }

  if (candidateRunType === "bounds_refresh") {
    return (
      activeRun.runType === "bounds_refresh" ||
      activeRun.runType === "forecast" ||
      activeRun.runType === "serving_refresh"
    );
  }

  if (candidateRunType === "forecast") {
    return (
      activeRun.runType === "bounds_refresh" ||
      activeRun.runType === "forecast" ||
      activeRun.runType === "serving_refresh"
    );
  }

  return activeRun.runType !== "bootstrap";
}

function isPendingRunStatus(status: AnalyticsRunStatus) {
  return (
    status === "queued" ||
    status === "running" ||
    status === "blocked" ||
    status === "waiting_credentials"
  );
}

function stableRunSignatureValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableRunSignatureValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, [key, entryValue]) => {
        acc[key] = stableRunSignatureValue(entryValue);
        return acc;
      }, {});
  }

  return value ?? null;
}

function buildRunSignature(
  runType: AnalyticsRunType,
  windowFrom: string | null,
  windowTo: string | null,
  payload: Record<string, unknown>
) {
  const forecastCombination =
    payload.forecastCombination && typeof payload.forecastCombination === "object"
      ? (payload.forecastCombination as Record<string, unknown>)
      : null;

  return JSON.stringify(
    stableRunSignatureValue({
      runType,
      windowFrom: windowFrom ?? null,
      windowTo: windowTo ?? null,
      stage: typeof payload.stage === "string" ? payload.stage : null,
      sequence: typeof payload.sequence === "string" ? payload.sequence : null,
      forceReload: payload.forceReload === true,
      forecastCombinationKey:
        typeof forecastCombination?.key === "string" ? forecastCombination.key : null,
      forecastFilters: forecastCombination?.filters ?? null,
    })
  );
}

function findEquivalentPendingRun(
  runs: AnalyticsSyncRunRecord[],
  candidate: AnalyticsSyncRunRecord
) {
  const candidateSignature = buildRunSignature(
    candidate.runType,
    candidate.windowFrom,
    candidate.windowTo,
    candidate.payload
  );

  return runs.find(
    (run) =>
      isPendingRunStatus(run.status) &&
      buildRunSignature(run.runType, run.windowFrom, run.windowTo, run.payload) ===
        candidateSignature
  );
}

function latestSuccessfulRun(
  bundle: AnalyticsProjectBundle,
  runTypes: AnalyticsRunType[]
) {
  return bundle.latestRuns
    .filter(
      (run) =>
        run.status === "succeeded" &&
        run.finishedAt &&
        runTypes.includes(run.runType)
    )
    .sort((left, right) => {
      const leftFinishedAt = left.finishedAt?.getTime() ?? 0;
      const rightFinishedAt = right.finishedAt?.getTime() ?? 0;
      if (leftFinishedAt !== rightFinishedAt) {
        return rightFinishedAt - leftFinishedAt;
      }

      return right.requestedAt.getTime() - left.requestedAt.getTime();
    })[0] ?? null;
}

function compareRunFreshness(left: AnalyticsSyncRunRecord, right: AnalyticsSyncRunRecord) {
  const finishedDelta = (left.finishedAt?.getTime() ?? 0) - (right.finishedAt?.getTime() ?? 0);
  if (finishedDelta !== 0) {
    return finishedDelta;
  }

  return left.requestedAt.getTime() - right.requestedAt.getTime();
}

function hasSuccessfulDependency(bundle: AnalyticsProjectBundle, runType: AnalyticsRunType) {
  if (runType === "bounds_refresh") {
    return bundle.latestRuns.some(
      (run) =>
        (run.runType === "backfill" || run.runType === "ingestion") &&
        run.status === "succeeded"
    );
  }

  if (runType === "forecast") {
    const latestBoundsRefresh = latestSuccessfulRun(bundle, ["bounds_refresh"]);
    if (!latestBoundsRefresh?.finishedAt) {
      return false;
    }

    const latestSourceRefresh = latestSuccessfulRun(bundle, ["backfill", "ingestion"]);
    if (!latestSourceRefresh?.finishedAt) {
      return true;
    }

    return compareRunFreshness(latestBoundsRefresh, latestSourceRefresh) >= 0;
  }

  const dependencies = runDependencies(runType);
  if (dependencies.length === 0) {
    return true;
  }

  return dependencies.every((dependency) =>
    bundle.latestRuns.some((run) => run.runType === dependency && run.status === "succeeded")
  );
}

function buildRunMessage(
  bundle: AnalyticsProjectBundle,
  input: AnalyticsSyncRequestInput,
  status: AnalyticsRunStatus,
  requiredSources: AnalyticsSourceType[],
  missingSources: AnalyticsSourceType[],
  blockingRun?: AnalyticsSyncRunRecord | null
) {
  if (status === "waiting_credentials") {
    return `Waiting for ${missingSources.join(", ")} configuration before this run can start.`;
  }

  if (status === "blocked" && blockingRun) {
    return `Waiting for ${blockingRun.runType.replace(/_/g, " ")} to finish before this run can start.`;
  }

  if (status === "blocked") {
    if (input.runType === "bounds_refresh") {
      return "Waiting for backfill or ingestion to finish before bounds refresh can start.";
    }

    const dependencies = runDependencies(input.runType);
    if (dependencies.length === 1) {
      return `Waiting for ${dependencies[0].replace(/_/g, " ")} to finish before this run can start.`;
    }

    return `Waiting for upstream data preparation before ${input.runType.replace(/_/g, " ")} can start.`;
  }

  return input.runType === "backfill"
    ? `Initial backfill window queued for ${bundle.project.initialBackfillDays} days.`
    : `${input.runType.replace(/_/g, " ")} queued from the admin control plane.`;
}

function buildBackfillContinuationRun(
  bundle: AnalyticsProjectBundle,
  currentRun: AnalyticsSyncRunRecord
) {
  if (currentRun.runType !== "backfill" || !currentRun.windowTo) {
    return null;
  }

  const requestedWindowTo =
    typeof currentRun.payload.backfillRequestedWindowTo === "string"
      ? currentRun.payload.backfillRequestedWindowTo
      : currentRun.windowTo;

  if (compareIsoDates(currentRun.windowTo, requestedWindowTo) >= 0) {
    return null;
  }

  const nextChunk = resolveChunkedBackfillWindow(
    bundle,
    addDaysToIsoDate(currentRun.windowTo, 1),
    requestedWindowTo
  );
  const requiredSources = requiredSourceStatusesForRun(bundle, "backfill");
  const missing = requiredSources.filter((sourceType) => {
    const source = bundle.sources.find((entry) => entry.sourceType === sourceType);
    return !source || source.status !== "ready";
  });
  const blockingRun =
    activeProjectRuns(bundle).find((run) => activeRunBlocksCandidate(run, "backfill")) ?? null;
  const status: AnalyticsRunStatus =
    missing.length > 0 ? "waiting_credentials" : blockingRun ? "blocked" : "queued";

  return {
    id: randomUUID(),
    projectId: bundle.project.id,
    runType: "backfill" as const,
    triggerKind: currentRun.triggerKind,
    sourceType: requiredSources[0] ?? null,
    status,
    requestedBy: currentRun.requestedBy,
    requestedAt: new Date(),
    startedAt: null,
    finishedAt: null,
    windowFrom: nextChunk.windowFrom,
    windowTo: nextChunk.windowTo,
    message:
      status === "queued"
        ? `Backfill continuation queued for ${nextChunk.windowFrom} → ${nextChunk.windowTo}.`
        : status === "waiting_credentials"
          ? `Waiting for ${missing.join(", ")} configuration before backfill continuation can start.`
          : "Waiting for the current data run to release the backfill lane.",
    payload: {
      requiredSources,
      projectSlug: bundle.project.slug,
      dependencies: [],
      ...currentRun.payload,
      ...nextChunk.payload,
      backfillContinuation: true,
    },
  } satisfies AnalyticsSyncRunRecord;
}

function promoteBlockedRuns(
  bundle: AnalyticsProjectBundle,
  runs: AnalyticsSyncRunRecord[]
) {
  const sorted = [...runs].sort((left, right) => left.requestedAt.getTime() - right.requestedAt.getTime());
  const nextRuns = [...sorted];

  for (let index = 0; index < nextRuns.length; index += 1) {
    const candidate = nextRuns[index];
    if (candidate.status !== "blocked") {
      continue;
    }

    const evaluationBundle: AnalyticsProjectBundle = {
      project: bundle.project,
      sources: bundle.sources,
      latestRuns: [...nextRuns].sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime()),
    };

    const activeOtherRuns = evaluationBundle.latestRuns.filter(
      (run) => run.id !== candidate.id && activeRunBlocksCandidate(run, candidate.runType)
    );
    const requiredSources = requiredSourceStatusesForRun(evaluationBundle, candidate.runType);
    const missing = requiredSources.filter((sourceType) => {
      const source = evaluationBundle.sources.find((entry) => entry.sourceType === sourceType);
      return !source || source.status !== "ready";
    });

    if (missing.length > 0) {
      nextRuns[index] = {
        ...candidate,
        status: "waiting_credentials",
        message: `Waiting for ${missing.join(", ")} configuration before this run can start.`,
      };
      continue;
    }

    if (activeOtherRuns.length > 0 || !hasSuccessfulDependency(evaluationBundle, candidate.runType)) {
      continue;
    }

    nextRuns[index] = {
      ...candidate,
      status: "queued",
      message: `${candidate.runType.replace(/_/g, " ")} unblocked and queued automatically.`,
    };
  }

  return nextRuns;
}

export async function requestAnalyticsSync(
  projectId: string,
  input: AnalyticsSyncRequestInput
) {
  await ensurePlatformSchema();
  if (input.runType === "serving_refresh") {
    throw new Error(
      "serving_refresh is no longer a queueable run type. Forecast execution now owns live artifact publication directly."
    );
  }
  const bundle = await getAnalyticsProject(projectId);
  if (!bundle) {
    throw new Error("Project not found.");
  }

  const buildRunRecord = (
    runType: AnalyticsRunType,
    overrides?: Partial<AnalyticsSyncRunRecord>
  ): AnalyticsSyncRunRecord => {
    const requiredSources = requiredSourceStatusesForRun(bundle, runType);
    const missing = requiredSources.filter((sourceType) => {
      const source = bundle.sources.find((entry) => entry.sourceType === sourceType);
      return !source || source.status !== "ready";
    });
    const blockingRun =
      activeProjectRuns(bundle).find((run) => activeRunBlocksCandidate(run, runType)) ?? null;
    const dependencyReady = hasSuccessfulDependency(bundle, runType);
    const status: AnalyticsRunStatus =
      missing.length > 0
        ? "waiting_credentials"
        : blockingRun
          ? "blocked"
          : dependencyReady
            ? "queued"
            : "blocked";

    const chunkedBackfillWindow =
      runType === "backfill"
        ? resolveChunkedBackfillWindow(
            bundle,
            overrides?.windowFrom ?? input.windowFrom ?? null,
            overrides?.windowTo ?? input.windowTo ?? null
          )
        : null;

    return {
      id: randomUUID(),
      projectId: bundle.project.id,
      runType,
      triggerKind: input.triggerKind ?? "manual",
      sourceType: requiredSources[0] ?? null,
      status,
      requestedBy: input.requestedBy,
      requestedAt: new Date(),
      startedAt: null,
      finishedAt: null,
      windowFrom:
        chunkedBackfillWindow?.windowFrom ?? overrides?.windowFrom ?? input.windowFrom ?? null,
      windowTo:
        chunkedBackfillWindow?.windowTo ?? overrides?.windowTo ?? input.windowTo ?? null,
      message: buildRunMessage(bundle, input, status, requiredSources, missing, blockingRun),
      payload: {
        requiredSources,
        projectSlug: bundle.project.slug,
        dependencies: runDependencies(runType),
        ...(chunkedBackfillWindow?.payload ?? {}),
        ...input.payload,
        ...overrides?.payload,
      },
    };
  };

  const runs =
    input.runType === "bootstrap"
      ? [
          buildRunRecord("backfill", {
            message: `Bootstrap queued initial backfill for ${bundle.project.initialBackfillDays} days.`,
            payload: { stage: "bootstrap-1", sequence: "initial-bootstrap" },
          }),
          buildRunRecord("bounds_refresh", {
            status: "blocked",
            message: "Waiting for initial backfill to complete before rebuilding bounds.",
            payload: { stage: "bootstrap-2", sequence: "initial-bootstrap" },
          }),
          buildRunRecord("forecast", {
            status: "blocked",
            message: "Waiting for bounds refresh to complete before forecasting.",
            payload: { stage: "bootstrap-3", sequence: "initial-bootstrap" },
          }),
        ]
      : [buildRunRecord(input.runType)];

  const existingBundleDuplicate = runs
    .map((run) => findEquivalentPendingRun(bundle.latestRuns, run))
    .find((run): run is AnalyticsSyncRunRecord => Boolean(run));
  if (existingBundleDuplicate) {
    if (!useDemoStore() && existingBundleDuplicate.status === "queued") {
      await dispatchAnalyticsRunSafely(existingBundleDuplicate, bundle);
    }
    return existingBundleDuplicate;
  }

  if (useDemoStore()) {
    seedDemoStore();
    const store = getDemoStore();
    const existingDemoDuplicate = runs
      .map((run) =>
        findEquivalentPendingRun(
          store.runs.filter((entry) => entry.projectId === projectId),
          run
        )
      )
      .find((run): run is AnalyticsSyncRunRecord => Boolean(run));
    if (existingDemoDuplicate) {
      return existingDemoDuplicate;
    }
    store.runs = [...[...runs].reverse(), ...store.runs];
    return runs[0];
  }

  const pool = getPostgresPool();
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const queuedRun = await withPgTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [projectId]);

    const liveRuns = (await getPgProjectRuns(client, [projectId])).filter(
      (run) => run.projectId === projectId
    );
    const existingPgDuplicate = runs
      .map((run) => findEquivalentPendingRun(liveRuns, run))
      .find((run): run is AnalyticsSyncRunRecord => Boolean(run));
    if (existingPgDuplicate) {
      return existingPgDuplicate;
    }

    for (const run of runs) {
      await client.query(
        `
          INSERT INTO analytics_sync_runs (
            id,
            project_id,
            run_type,
            trigger_kind,
            source_type,
            status,
            requested_by,
            requested_at,
            started_at,
            finished_at,
            window_from,
            window_to,
            message,
            payload
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, $12, $13::jsonb
          )
        `,
        [
          run.id,
          run.projectId,
          run.runType,
          run.triggerKind,
          run.sourceType,
          run.status,
          run.requestedBy,
          run.startedAt,
          run.finishedAt,
          run.windowFrom,
          run.windowTo,
          run.message,
          JSON.stringify(run.payload),
        ]
      );
    }

    return runs[0];
  });

  if (
    queuedRun.id === runs[0].id &&
    input.runType === "bootstrap" &&
    bundle.project.settings.forecastStrategy.precomputePrimaryForecasts
  ) {
    await seedPrimaryForecastCombinations(bundle.project.id, input.requestedBy, {
      queueRuns: true,
      triggerKind: input.triggerKind ?? "bootstrap",
    });
  }

  if (queuedRun.status === "queued") {
    await dispatchAnalyticsRunSafely(queuedRun, bundle);
  }

  return queuedRun;
}

export async function updateAnalyticsSyncRun(runId: string, patch: AnalyticsRunUpdateInput) {
  await ensurePlatformSchema();

  let promotedRunsToDispatch: AnalyticsSyncRunRecord[] = [];
  let promotedDispatchBundle: AnalyticsProjectBundle | null = null;

  if (useDemoStore()) {
    seedDemoStore();
    const store = getDemoStore();
    const runIndex = store.runs.findIndex((entry) => entry.id === runId);
    if (runIndex === -1) {
      throw new Error("Run not found.");
    }

    const current = store.runs[runIndex];
    const nextRun: AnalyticsSyncRunRecord = {
      ...current,
      status: patch.status ?? current.status,
      sourceType: patch.sourceType ?? current.sourceType,
      message: patch.message ?? current.message,
      startedAt:
        parseOptionalDateTime(patch.startedAt) ??
        (patch.status === "running" && !current.startedAt ? new Date() : current.startedAt),
      finishedAt:
        parseOptionalDateTime(patch.finishedAt) ??
        ((patch.status === "succeeded" || patch.status === "failed") && !current.finishedAt
          ? new Date()
          : current.finishedAt),
      payload: mergeRunPayload(current.payload, patch.payload),
    };
    store.runs[runIndex] = nextRun;
    applyForecastCombinationStatusToDemoStore(store, nextRun);

    const effectiveSourceType = patch.sourceType ?? nextRun.sourceType;
    if (effectiveSourceType) {
      const sourceIndex = store.sources.findIndex(
        (source) =>
          source.projectId === nextRun.projectId && source.sourceType === effectiveSourceType
      );
      if (sourceIndex !== -1) {
        store.sources[sourceIndex] = deriveSourcePatchAfterRun(
          store.sources[sourceIndex],
          nextRun,
          patch
        );
      }
    }

    if (patch.status === "succeeded") {
      const project = store.projects.find((entry) => entry.id === nextRun.projectId);
      if (project) {
        const projectSources = store.sources.filter((source) => source.projectId === nextRun.projectId);
        let projectRuns = store.runs.filter((run) => run.projectId === nextRun.projectId);
        const statusBeforePromotion = new Map(projectRuns.map((run) => [run.id, run.status]));
        const continuationRunsToDispatch: AnalyticsSyncRunRecord[] = [];
        const continuationRun = buildBackfillContinuationRun(
          { project, sources: projectSources, latestRuns: projectRuns },
          nextRun
        );
        if (continuationRun && !findEquivalentPendingRun(projectRuns, continuationRun)) {
          projectRuns = [continuationRun, ...projectRuns];
          store.runs = [continuationRun, ...store.runs];
          if (continuationRun.status === "queued") {
            continuationRunsToDispatch.push(continuationRun);
          }
        }
        const promotedRuns = promoteBlockedRuns(
          { project, sources: projectSources, latestRuns: projectRuns },
          projectRuns
        );
        promotedRunsToDispatch = [
          ...continuationRunsToDispatch,
          ...promotedRuns.filter(
            (run) => run.status === "queued" && statusBeforePromotion.get(run.id) !== "queued"
          ),
        ];
        promotedDispatchBundle = { project, sources: projectSources, latestRuns: promotedRuns };
        const promotedMap = new Map(promotedRuns.map((run) => [run.id, run]));
        store.runs = store.runs.map((run) => promotedMap.get(run.id) ?? run);
      }
    }

    return nextRun;
  }

  const updatedRun = await withPgTransaction(async (client) => {
    const runResult = await client.query(
      `SELECT * FROM analytics_sync_runs WHERE id = $1 LIMIT 1`,
      [runId]
    );
    if (!runResult.rowCount) {
      throw new Error("Run not found.");
    }

    const current = normalizePgRun(runResult.rows[0] as Record<string, unknown>);
    const nextRun: AnalyticsSyncRunRecord = {
      ...current,
      status: patch.status ?? current.status,
      sourceType: patch.sourceType ?? current.sourceType,
      message: patch.message ?? current.message,
      startedAt:
        parseOptionalDateTime(patch.startedAt) ??
        (patch.status === "running" && !current.startedAt ? new Date() : current.startedAt),
      finishedAt:
        parseOptionalDateTime(patch.finishedAt) ??
        ((patch.status === "succeeded" || patch.status === "failed") && !current.finishedAt
          ? new Date()
          : current.finishedAt),
      payload: mergeRunPayload(current.payload, patch.payload),
    };

    await client.query(
      `
        UPDATE analytics_sync_runs
        SET
          status = $2,
          source_type = $3,
          message = $4,
          started_at = $5,
          finished_at = $6,
          payload = $7::jsonb
        WHERE id = $1
      `,
      [
        runId,
        nextRun.status,
        nextRun.sourceType,
        nextRun.message,
        nextRun.startedAt,
        nextRun.finishedAt,
        JSON.stringify(nextRun.payload),
      ]
    );
    await applyForecastCombinationStatusPg(client, nextRun);

    const effectiveSourceType = patch.sourceType ?? nextRun.sourceType;
    if (effectiveSourceType) {
      const sourceResult = await client.query(
        `
          SELECT *
          FROM analytics_project_sources
          WHERE project_id = $1 AND source_type = $2
          LIMIT 1
        `,
        [nextRun.projectId, effectiveSourceType]
      );

      if (sourceResult.rowCount) {
        const currentSource = normalizePgSource(sourceResult.rows[0] as Record<string, unknown>);
        const nextSource = deriveSourcePatchAfterRun(currentSource, nextRun, patch);
        await client.query(
          `
            UPDATE analytics_project_sources
            SET
              status = $3,
              last_sync_at = $4,
              next_sync_at = $5,
              updated_at = NOW()
            WHERE id = $1 AND project_id = $2
          `,
          [
            nextSource.id,
            nextRun.projectId,
            nextSource.status,
            nextSource.lastSyncAt,
            nextSource.nextSyncAt,
          ]
        );
      }
    }

    if (patch.status === "succeeded") {
      const projectResult = await client.query(
        `SELECT * FROM analytics_projects WHERE id = $1 LIMIT 1`,
        [nextRun.projectId]
      );
      if (projectResult.rowCount) {
        const project = normalizePgProject(projectResult.rows[0] as Record<string, unknown>);
        const projectSources = await getPgProjectSources(client, [nextRun.projectId]);
        const projectRunsResult = await client.query(
          `SELECT * FROM analytics_sync_runs WHERE project_id = $1 ORDER BY requested_at DESC`,
          [nextRun.projectId]
        );
        let projectRuns = projectRunsResult.rows.map((row) =>
          normalizePgRun(row as Record<string, unknown>)
        );
        const statusBeforePromotion = new Map(projectRuns.map((run) => [run.id, run.status]));
        const continuationRunsToDispatch: AnalyticsSyncRunRecord[] = [];
        const continuationRun = buildBackfillContinuationRun(
          { project, sources: projectSources, latestRuns: projectRuns },
          nextRun
        );
        if (continuationRun && !findEquivalentPendingRun(projectRuns, continuationRun)) {
          await client.query(
            `
              INSERT INTO analytics_sync_runs (
                id,
                project_id,
                run_type,
                trigger_kind,
                source_type,
                status,
                requested_by,
                requested_at,
                started_at,
                finished_at,
                window_from,
                window_to,
                message,
                payload
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, $12, $13::jsonb
              )
            `,
            [
              continuationRun.id,
              continuationRun.projectId,
              continuationRun.runType,
              continuationRun.triggerKind,
              continuationRun.sourceType,
              continuationRun.status,
              continuationRun.requestedBy,
              continuationRun.startedAt,
              continuationRun.finishedAt,
              continuationRun.windowFrom,
              continuationRun.windowTo,
              continuationRun.message,
              JSON.stringify(continuationRun.payload),
            ]
          );
          projectRuns = [continuationRun, ...projectRuns];
          if (continuationRun.status === "queued") {
            continuationRunsToDispatch.push(continuationRun);
          }
        }
        const promotedRuns = promoteBlockedRuns(
          { project, sources: projectSources, latestRuns: projectRuns },
          projectRuns
        );
        promotedRunsToDispatch = [
          ...continuationRunsToDispatch,
          ...promotedRuns.filter(
            (run) => run.status === "queued" && statusBeforePromotion.get(run.id) !== "queued"
          ),
        ];
        promotedDispatchBundle = { project, sources: projectSources, latestRuns: promotedRuns };
        for (const promotedRun of promotedRuns.filter((run) => run.status !== "blocked")) {
          await client.query(
            `
              UPDATE analytics_sync_runs
              SET
                status = $2,
                message = $3
              WHERE id = $1
            `,
            [promotedRun.id, promotedRun.status, promotedRun.message]
          );
        }
      }
    }

    return nextRun;
  });

  if (promotedDispatchBundle && promotedRunsToDispatch.length > 0) {
    await Promise.allSettled(
      promotedRunsToDispatch.map((run) =>
        dispatchAnalyticsRunSafely(run, promotedDispatchBundle as AnalyticsProjectBundle)
      )
    );
  }

  return updatedRun;
}

export async function claimNextAnalyticsRun(
  projectId: string,
  input?: AnalyticsRunClaimInput
) {
  await ensurePlatformSchema();
  const bundle = await getAnalyticsProject(projectId);
  if (!bundle) {
    throw new Error("Project not found.");
  }

  const resolvedProjectId = bundle.project.id;
  const allowedRunTypes = input?.runTypes?.length ? Array.from(new Set(input.runTypes)) : null;
  const claimMessage =
    normalizeText(input?.message ?? undefined, 500) || "Worker claimed this run for execution.";

  if (useDemoStore()) {
    seedDemoStore();
    const store = getDemoStore();
    const nextRun = store.runs
      .filter(
        (run) =>
          run.projectId === resolvedProjectId &&
          run.status === "queued" &&
          (!allowedRunTypes || allowedRunTypes.includes(run.runType))
      )
      .sort((left, right) => left.requestedAt.getTime() - right.requestedAt.getTime())[0];

    if (!nextRun) {
      return null;
    }

    const claimedRun: AnalyticsSyncRunRecord = {
      ...nextRun,
      status: "running",
      startedAt: nextRun.startedAt ?? new Date(),
      message: claimMessage,
    };

    store.runs = store.runs.map((run) => (run.id === claimedRun.id ? claimedRun : run));
    return claimedRun;
  }

  return withPgTransaction(async (client) => {
    const params: unknown[] = [projectId];
    params[0] = resolvedProjectId;
    let runTypeClause = "";

    if (allowedRunTypes?.length) {
      params.push(allowedRunTypes);
      runTypeClause = `AND run_type = ANY($2::text[])`;
    }

    const runResult = await client.query(
      `
        SELECT *
        FROM analytics_sync_runs
        WHERE project_id = $1
          AND status = 'queued'
          ${runTypeClause}
        ORDER BY requested_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `,
      params
    );

    if (!runResult.rowCount) {
      return null;
    }

    const current = normalizePgRun(runResult.rows[0] as Record<string, unknown>);
    const claimedRun: AnalyticsSyncRunRecord = {
      ...current,
      status: "running",
      startedAt: current.startedAt ?? new Date(),
      message: claimMessage,
    };

    await client.query(
      `
        UPDATE analytics_sync_runs
        SET
          status = 'running',
          started_at = COALESCE(started_at, NOW()),
          message = $2
        WHERE id = $1
      `,
      [claimedRun.id, claimedRun.message]
    );

    return claimedRun;
  });
}

export function buildAnalyticsProjectConfig(bundle: AnalyticsProjectBundle) {
  const appmetrica = bundle.sources.find((source) => source.sourceType === "appmetrica_logs");
  const bigquery = bundle.sources.find((source) => source.sourceType === "bigquery_export");
  const bounds = bundle.sources.find((source) => source.sourceType === "bounds_artifacts");
  const unityAds = bundle.sources.find((source) => source.sourceType === "unity_ads_spend");
  const googleAds = bundle.sources.find((source) => source.sourceType === "google_ads_spend");
  const prewarmPlan = buildForecastPrewarmPlan(bundle);

  const ingestionConfig = {
    provisioning: {
      auto_create_infrastructure: bundle.project.settings.autoProvisionInfrastructure,
      region: bundle.project.settings.provisioningRegion,
      datasets: {
        raw: bundle.project.rawDataset,
        stg: bundle.project.stgDataset,
        mart: bundle.project.martDataset,
      },
      bucket: bundle.project.gcsBucket,
      bounds_path: bundle.project.boundsPath,
    },
    appmetrica: {
      app_ids: Array.isArray(appmetrica?.config.appIds) ? appmetrica?.config.appIds : [],
      event_names: Array.isArray(appmetrica?.config.eventNames) ? appmetrica?.config.eventNames : [],
      lookback_days: bundle.project.lookbackDays,
    },
    gcs: {
      bucket: bounds?.config.bucket || bundle.project.gcsBucket,
      prefix: `raw/${bundle.project.slug}/appmetrica`,
    },
    bigquery: {
      project_id: bundle.project.gcpProjectId,
      raw_dataset: bundle.project.rawDataset,
      stg_dataset: bundle.project.stgDataset,
      events_table: `${bundle.project.slug.replace(/-/g, "_")}_appmetrica_events`,
      installs_table: `${bundle.project.slug.replace(/-/g, "_")}_appmetrica_installs`,
      sessions_table: `${bundle.project.slug.replace(/-/g, "_")}_appmetrica_sessions`,
    },
    spend_sources: {
      unity_ads: unityAds?.config ?? { enabled: false },
      google_ads: googleAds?.config ?? { enabled: false },
    },
    schedule: {
      frequency_hours: bundle.project.refreshIntervalHours,
    },
  };

  const forecastConfig = {
    bigquery: {
      project_id: bundle.project.gcpProjectId,
      mart_dataset: bundle.project.martDataset,
      experiment_daily_table: `${bundle.project.slug.replace(/-/g, "_")}_experiment_daily`,
      forecast_table: `${bundle.project.slug.replace(/-/g, "_")}_forecast_points`,
    },
    forecast: {
      horizon_days: bundle.project.forecastHorizonDays,
      min_history_days: bundle.project.defaultGranularityDays * 2,
      engine: "auto",
      confidence_interval: 0.8,
      bounds_bucket: bounds?.config.bucket || bundle.project.gcsBucket,
      bounds_prefix: bounds?.config.prefix || `bounds/${bundle.project.slug}/`,
      strategy: bundle.project.settings.forecastStrategy,
      prewarm_plan: prewarmPlan,
    },
    schedule: {
      frequency_hours: bundle.project.forecastIntervalHours,
      bounds_refresh_hours: bundle.project.boundsIntervalHours,
    },
  };

  return {
    ingestionConfig,
    forecastConfig,
    operatingPlan: [
      `1. Admin creates project ${bundle.project.displayName} in Settings → Projects.`,
      "2. Warehouse datasets and the GCS bucket are auto-derived from project slug + GCP project and should be auto-created remotely when the worker first runs.",
      "3. AppMetrica, BigQuery export, Unity Ads spend, and Google Ads spend are configured in connector settings.",
      "4. Bounds artifacts point to a GCS bucket/prefix where interval manifests are published.",
      "5. Create-project flow automatically queues bootstrap: backfill → bounds refresh → forecast.",
      "6. Forecast strategy precomputes a project-level matrix across baseline segments, countries, spend sources, and platforms, remembers recent combinations, and falls back to on-demand calculation when the selection is cold.",
    ],
    notebookParity: {
      defaultGranularityDays: bundle.project.defaultGranularityDays,
      bigRangeSupport: true,
      notes: [
        "run_date_freq from notebooks maps to the dashboard granularity selector.",
        "Bounds artifacts move from Google Drive-style storage into GCS manifests.",
        "ROAS / payback / retention / session quality stay grouped in the same serving surface.",
      ],
    },
    sourceRegistry: {
      appmetrica: {
        appIds: Array.isArray(appmetrica?.config.appIds) ? appmetrica?.config.appIds : [],
        eventNames: Array.isArray(appmetrica?.config.eventNames) ? appmetrica?.config.eventNames : [],
        tokenPresent: appmetrica?.secretPresent ?? false,
      },
      bigquery: {
        sourceProjectId: bigquery?.config.sourceProjectId ?? "",
        sourceDataset: bigquery?.config.sourceDataset ?? "",
        serviceAccountPresent: bigquery?.secretPresent ?? false,
      },
      bounds: {
        bucket: bounds?.config.bucket ?? "",
        prefix: bounds?.config.prefix ?? "",
      },
      unityAds: {
        ...(unityAds?.config ?? {}),
        secretPresent: unityAds?.secretPresent ?? false,
      },
      googleAds: {
        ...(googleAds?.config ?? {}),
        secretPresent: googleAds?.secretPresent ?? false,
      },
      projectSettings: bundle.project.settings,
      forecastPrewarmPlan: prewarmPlan,
      controlPlane: {
        forecastCombinationsPath: `/api/projects/by-key/${bundle.project.slug}/forecast-combinations`,
      },
    },
  };
}

export async function getAnalyticsProjectConfig(projectId: string) {
  const bundle = await getAnalyticsProject(projectId);
  if (!bundle) {
    throw new Error("Project not found.");
  }

  return buildAnalyticsProjectConfig(bundle);
}

export async function getAnalyticsSettingsSnapshot() {
  const bundles = await listAnalyticsProjects();

  return {
    projects: bundles,
    sourceRegistry: bundles.flatMap((bundle) =>
      bundle.sources.map((source) => ({
        source: source.label,
        project: bundle.project.displayName,
        deliveryMode: source.deliveryMode,
        status: source.status,
        lastSyncAt: source.lastSyncAt,
        nextSyncAt: source.nextSyncAt,
        notes:
          source.sourceType === "bounds_artifacts"
            ? "Stores notebook-style confidence interval manifests and published bounds."
            : source.sourceType === "appmetrica_logs"
              ? "Logs API source for D+1 backfills and scheduled refresh."
              : source.sourceType === "unity_ads_spend"
                ? "Spend connector for Unity Ads, using either a BigQuery mirror or direct API mode."
                : source.sourceType === "google_ads_spend"
                  ? "Spend connector for Google Ads, using either a BigQuery mirror or direct API mode."
              : "Warehouse source for serving marts and cohort joins.",
      }))
    ),
    metricCatalog: metricCatalogPreview(),
  };
}
