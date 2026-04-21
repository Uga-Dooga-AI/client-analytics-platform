import "server-only";

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type {
  AcquisitionBreakdownRow,
  CohortMatrixRow,
  ComparisonConfidenceChartData,
  ConfidenceSeriesPoint,
  RevenueModeKey,
} from "@/lib/data/acquisition";
import {
  DEFAULT_FORECAST_HORIZON_DAYS,
  type ForecastHorizonDay,
} from "@/lib/data/forecast-horizons";
import type {
  DashboardFilters,
  DashboardGroupByKey,
  DashboardPlatformKey,
} from "@/lib/dashboard-filters";
import {
  executeBigQuery,
  getAccessToken,
  loadBigQueryContexts,
  type BigQueryQueryParam,
  type ProjectQueryContext,
} from "@/lib/live-warehouse";
import type { AnalyticsProjectBundle, AnalyticsSourceRecord } from "@/lib/platform/store";
import type { SliceOption } from "@/lib/slice-catalog";

export type ForecastNotebookSelection = {
  revenueMode: RevenueModeKey;
  country: string;
  source: string;
  company: string;
  campaign: string;
  creative: string;
};

export type ForecastNotebookSummary = {
  spend: number;
  installs: number;
  cpi: number;
  d30Roas: number;
  d60Roas: number;
  d120Roas: number;
  paybackDays: number;
  cohortCount: number;
  confidence: string;
};

export type ForecastNotebookData = {
  summary: ForecastNotebookSummary;
  horizonCharts: ComparisonConfidenceChartData[];
  paybackChart: ComparisonConfidenceChartData;
  breakdownRows: AcquisitionBreakdownRow[];
  cohortMatrix: CohortMatrixRow[];
  notes: string[];
};

export type ForecastNotebookCatalog = {
  countries: SliceOption[];
  sources: SliceOption[];
  companies: SliceOption[];
  campaigns: SliceOption[];
  creatives: SliceOption[];
};

export type ForecastNotebookSurface = {
  catalog: ForecastNotebookCatalog;
  data: ForecastNotebookData;
  diagnostics: ForecastNotebookDiagnostics;
};

export type ForecastHistoryChartGroup = {
  label: string;
  series: ConfidenceSeriesPoint[];
};

export type ForecastHistoryChartSnapshot = {
  cutoffDay: number;
  groups: ForecastHistoryChartGroup[];
  visiblePointCount: number;
};

export type ForecastNotebookSpendDebugSource = {
  sourceType: string;
  label: string;
  sourceProjectId: string;
  sourceDataset: string;
  tableNames: string[];
  totalRows: number;
  filteredRows: number;
  totalSpend: number;
  filteredSpend: number;
  totalInstalls: number;
  filteredInstalls: number;
  filteredCountries: Array<{ value: string; spend: number; rows: number }>;
  filteredStores: Array<{ value: string; spend: number; rows: number }>;
};

export type ForecastNotebookSpendDebug = {
  contextStatus: ForecastNotebookDiagnostics["contextStatus"];
  message: string | null;
  filters: DashboardFilters;
  selection: ForecastNotebookSelection;
  sources: ForecastNotebookSpendDebugSource[];
};

export type ForecastNotebookDiagnostics = {
  contextStatus: "ready" | "missing_credentials" | "query_failed";
  errorMessage: string | null;
  descriptorRowCount: number;
  selectedDescriptorRowCount: number;
  cohortSizeRowCount: number;
  revenueRowCount: number;
  spendRowCount: number;
  corruptedDayCount: number;
  rawCohortCount: number;
  processedCohortCount: number;
  visibleLineCount: number;
  visibleCohortCount: number;
  emptyReason: string | null;
  boundsArtifactFallbackUsed: boolean;
  boundsArtifactIssue: string | null;
  boundsArtifactPath: string | null;
  boundsArtifactSourceStatus: string | null;
  boundsArtifactSourceLastSyncAt: string | null;
  boundsArtifactSourceNextSyncAt: string | null;
  boundsArtifactExpectedSizeCount: number;
  boundsArtifactLoadedSizeCount: number;
  boundsArtifactLoadedSizes: number[];
  boundsArtifactMissingSizes: number[];
  boundsArtifactIssueSamples: string[];
  boundsArtifactLoadedChartableCohortCount: number;
  boundsArtifactLoadedZeroSpendCohortCount: number;
  boundsArtifactMissingChartableCohortCount: number;
  boundsArtifactMissingZeroSpendCohortCount: number;
  boundsCoverage: ForecastNotebookBoundsCoverageRow[];
};

export type ForecastNotebookBoundsCoverageRow = {
  cohortSize: number;
  sliceCohorts: number;
  source: "artifact" | "live_fallback" | "missing";
  tableKeyCount: number;
  smoothedTrainingRecords: number;
  minTrainingCohortSize: number | null;
  maxTrainingCohortSize: number | null;
  minHistoryDay: number | null;
  maxHistoryDay: number | null;
  minPredictionDay: number | null;
  maxPredictionDay: number | null;
};

type ForecastNotebookInput = {
  bundle: AnalyticsProjectBundle;
  projectLabel: string;
  filters: DashboardFilters;
  selection: ForecastNotebookSelection;
  horizonDays?: ForecastHorizonDay[];
  loadData?: boolean;
};

type StorageScope = {
  bucket: string;
  prefix: string;
};

type NotebookBoundsArtifactLoadResult = {
  tables: Map<number, Map<string, readonly [number, number]>>;
  scopeUri: string | null;
  sourceStatus: string | null;
  sourceLastSyncAt: string | null;
  sourceNextSyncAt: string | null;
  expectedSizes: number[];
  loadedSizes: number[];
  missingSizes: number[];
  issueSamples: string[];
  fallbackUsed: boolean;
  issue: string | null;
};

type NotebookBoundsArtifactManifest = {
  artifactExpectedSizeCount: number | null;
  artifactGeneratedSizeCount: number | null;
  artifactOmittedSizeCount: number | null;
  artifactOmittedForCoverageCount: number | null;
  artifactOmittedForEmptyTableCount: number | null;
  artifactMinPredictionsRequired: number | null;
  artifactSizeSmoothCoeff: number | null;
  artifactOmittedSizeRanges: Array<{ from: number; to: number }>;
};

type DecodedNotebookBoundsArtifact = {
  table: Map<string, readonly [number, number]>;
  filteredPlaceholderCount: number;
  totalEntryCount: number;
};

type BoundsCoverageSummary = {
  rows: ForecastNotebookBoundsCoverageRow[];
  prebuiltFallbackTables: Map<number, Map<string, readonly [number, number]>>;
};

type PredictionRuntimeArtifacts = {
  notebookArtifactBounds: Map<number, Map<string, readonly [number, number]>>;
  trainingRecords: BoundsTrainingRecord[];
  estimatedCurves: Map<string, number[] | null>;
  historyDays: number[];
  predictionPeriods: number[];
  maxRequiredHorizon: number;
};

type InstallDescriptorRow = {
  platform: string | null;
  country: string | null;
  source: string | null;
  company: string | null;
  campaign: string | null;
  creative: string | null;
  count: number | null;
  first_seen: string | null;
  last_seen: string | null;
};

type CohortSizeRow = {
  cohort_date: string | null;
  platform: string | null;
  country: string | null;
  source: string | null;
  company: string | null;
  campaign: string | null;
  creative: string | null;
  cohort_size: number | null;
};

type RevenueRow = {
  cohort_date: string | null;
  platform: string | null;
  country: string | null;
  source: string | null;
  company: string | null;
  campaign: string | null;
  creative: string | null;
  event_date: string | null;
  lifetime_day: number | null;
  revenue: number | null;
};

type EventDayCountRow = {
  event_date: string | null;
  event_count: number | null;
};

type MirrorSchemaRow = {
  table_name: string | null;
  column_name: string | null;
};

type TableColumnRow = {
  column_name: string | null;
};

type MirrorSpendRow = {
  cohort_date: string | null;
  source: string | null;
  company: string | null;
  country: string | null;
  store: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  creative_id: string | null;
  creative_name: string | null;
  spend: number | null;
  installs: number | null;
};

type RawCohortRecord = {
  cohortDate: string;
  groupValue: string;
  country: string;
  source: string;
  company: string;
  campaign: string;
  creative: string;
  store: string;
  cohortSize: number;
  spend: number;
  installs: number;
  dailyRevenue: Map<number, number>;
};

type ProcessedCohort = {
  cohortDate: string;
  groupValue: string;
  spend: number;
  installs: number;
  cohortSize: number;
  cohortNumDays: number;
  cohortLifetime: number;
  isCorrupted: number;
  totalRevenue: number[];
};

type PredictedPoint = {
  predictedRevenue: number | null;
  lowerRevenue: number | null;
  upperRevenue: number | null;
  actual: number | null;
};

type CurvePrediction = {
  trueRevenue: number[];
  predictedFor: Map<number, number>;
  points: Map<number, PredictedPoint>;
};

type BoundsTrainingRecord = {
  cohortDate: string;
  cohortSize: number;
  trueRevenue: number[];
  trueFor: Map<number, number>;
  predictedForByCutoff: Map<string, number>;
  badByCutoff: Set<number>;
};

type GroupedLine = {
  value: string;
  label: string;
  cohorts: ProcessedCohort[];
};

type LinePredictionResources = {
  predictionsByCohortDate: Map<string, CurvePrediction>;
  boundsByCohortSize: Map<number, Map<string, readonly [number, number]>>;
  trainingPredictionCount: number;
};

type RepairedRevenueSeries = {
  daily: number[];
  isCorrupted: number;
};

type InstallSqlConfig = {
  sourceSql: string;
  campaignSql: string;
  creativeSql: string;
  companySql: string;
  profileKeySql: string;
  deviceKeySql: string;
  userKeySql: string;
};

type AggregatedPoint = {
  predicted: number | null;
  lower: number | null;
  upper: number | null;
  actual: number | null;
};

type ForecastCatalogAliases = {
  campaigns: Map<string, string>;
  creatives: Map<string, string>;
};

type CurveEstimateTask = {
  id: string;
  totalRevenue: number[];
  cutoff: number;
  horizon: number;
};

const PAYBACK_CURVE_POINTS = [1, 3, 7, 14, 21, 30, 45, 60, 90, 120, 180, 240, 270, 360, 720] as const;
const PAYBACK_CURVE_POINTS_WITH_ZERO = [0, ...PAYBACK_CURVE_POINTS] as const;
const GROUP_COLORS = ["#2563eb", "#d97706", "#059669", "#dc2626", "#7c3aed", "#0891b2", "#ea580c", "#4f46e5"];
const NOTEBOOK_HISTORY_MIN_DAY = 4;
const BOUNDS_MAX_CUTOFF = 91;
const BOUNDS_MIN_PREDICTIONS = 10;
const BOUNDS_SIZE_SMOOTH_COEFF = 1.2;
const BOUNDS_SMALL_COHORT_NEAREST_FILL_MAX_SIZE = 100;
const BOUNDS_LOWER_QUANTILE = 0.05;
const BOUNDS_UPPER_QUANTILE = 0.95;
const NOTEBOOK_BOUNDS_MIN_COHORT_SIZE = 1;
const NOTEBOOK_BOUNDS_MAX_COHORT_SIZE = 1000;
const NOTEBOOK_FALLBACK_CUTOFF = 6;
const NOTEBOOK_YOUNG_FALLBACK_MIN_HISTORY = 2;
const NOTEBOOK_YOUNG_FALLBACK_TARGET_HISTORY = 4;
const NOTEBOOK_BOUNDS_HISTORY_DAYS = [
  4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  35, 42, 49, 56, 63, 70, 77, 84, 91,
] as const;
const NOTEBOOK_BOUNDS_PREDICTION_PERIODS = [
  7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 40,
  50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340, 360,
] as const;
export const FORECAST_HISTORY_CUTOFF_DAYS = [7, 10, 14, 18, 24, 30, 45, 60, 90] as const;

const MIRROR_CAMPAIGN_ID_COLUMN_CANDIDATES = ["campaign_id", "campaignid", "campaign"];
const MIRROR_CAMPAIGN_NAME_COLUMN_CANDIDATES = [
  "campaign_name",
  "campaign",
  "campaign_name_1",
  "campaignname",
];
const MIRROR_CREATIVE_ID_COLUMN_CANDIDATES = [
  "creative_pack_id",
  "creative_id",
  "ad_group_ad_ad_id",
  "creative",
];
const MIRROR_CREATIVE_NAME_COLUMN_CANDIDATES = [
  "creative_pack_name",
  "creative_name",
  "creative",
  "ad_name",
  "asset_name",
  "ad_group_ad_ad_name",
];
const MIRROR_DATE_COLUMN_CANDIDATES = ["date", "run_date", "segments_date", "day"];
const MIRROR_COUNTRY_COLUMN_CANDIDATES = [
  "country",
  "country_code",
  "country_iso_code",
  "country_name",
  "country_code_1",
];
const MIRROR_STORE_COLUMN_CANDIDATES = ["store", "platform", "os_name", "source_app_store"];
const MIRROR_SPEND_COLUMN_CANDIDATES = ["spend", "cost", "cost_micros", "amount_micros"];
const PLACEHOLDER_BOUNDS_PAIR = [-15, 15] as const;
const PLACEHOLDER_BOUNDS_EPSILON = 1e-9;
const MIRROR_INSTALLS_COLUMN_CANDIDATES = ["installs", "all_conversions", "conversions"];
const NOTEBOOK_BOUNDS_ARTIFACT_CACHE = new Map<
  string,
  Promise<{ artifact: Map<string, readonly [number, number]> | null; issue: string | null }>
>();
const NOTEBOOK_BOUNDS_MANIFEST_CACHE = new Map<
  string,
  Promise<NotebookBoundsArtifactManifest | null>
>();

const STORE_SQL = `
  CASE
    WHEN LOWER(CAST(os_name AS STRING)) = 'android' THEN 'google'
    WHEN LOWER(CAST(os_name AS STRING)) = 'ios' THEN 'apple'
    ELSE LOWER(CAST(os_name AS STRING))
  END
`;

export async function getForecastNotebookSurface({
  bundle,
  projectLabel,
  filters,
  selection,
  horizonDays = [...DEFAULT_FORECAST_HORIZON_DAYS],
  loadData = true,
}: ForecastNotebookInput): Promise<ForecastNotebookSurface> {
  const contexts = await loadBigQueryContexts([bundle]);
  const context = contexts.get(bundle.project.id);
  if (!context) {
    return {
      catalog: buildEmptyCatalog(),
      data: buildEmptyData("BigQuery credentials are unavailable for this project."),
      diagnostics: buildEmptyDiagnostics("missing_credentials", "BigQuery credentials are unavailable for this project."),
    };
  }
  try {
    const installSql = await discoverInstallSqlConfig(context);
    const [descriptorRows, spendRows] = await Promise.all([
      loadInstallDescriptors(context, filters, installSql),
      loadSpendRows(context, filters, selection),
    ]);
    const catalogAliases = buildForecastCatalogAliases(spendRows);

    const catalog = buildCatalog(
      descriptorRows,
      {
        platform: filters.platform,
        country: selection.country,
        source: selection.source,
        company: selection.company,
        campaign: selection.campaign,
        creative: selection.creative,
      },
      catalogAliases
    );

    const groupBy = supportedGroupBy(filters.groupBy);
    const selectedDescriptorRows = applySelectionToDescriptors(descriptorRows, {
      platform: filters.platform,
      country: selection.country,
      source: selection.source,
      company: selection.company,
      campaign: selection.campaign,
      creative: selection.creative,
    });
    const notes = buildCatalogNotes(descriptorRows, selectedDescriptorRows, spendRows, selection);

    if (!loadData) {
      return {
        catalog,
        data: buildIdleData(
          notes[0] ??
            `Forecast data for ${projectLabel} is not loaded yet. Apply the current slice to run the live cohort queries.`
        ),
        diagnostics: buildIdleDiagnostics({
          descriptorRowCount: descriptorRows.length,
          selectedDescriptorRowCount: selectedDescriptorRows.length,
          spendRowCount: spendRows.length,
        }),
      };
    }

    const [cohortSizeRows, revenueRows, corruptedDayRows] = await Promise.all([
      loadCohortSizes(context, filters, selection, installSql),
      loadRevenueRows(context, filters, selection, horizonDays, installSql),
      loadCorruptedDayCounts(context, filters, selection, horizonDays),
    ]);

    const rawCohorts = buildRawCohorts({
      cohortSizeRows,
      revenueRows,
      spendRows,
      filters,
      selection,
      groupBy,
    });

    const processedCohorts = processRawCohorts(
      rawCohorts,
      filters.from,
      filters.to,
      filters.granularityDays,
      new Set(corruptedDayRows)
    );

    const allRequestedHorizons = uniqueSortedNonNegativeNumbers([
      ...horizonDays,
      ...PAYBACK_CURVE_POINTS_WITH_ZERO,
      30,
      60,
      120,
      240,
      360,
      720,
    ]);
    const groupedLines = buildGroupedLines(processedCohorts, groupBy);
    const predictionResourcesResult = await buildPredictionResources(
      groupedLines,
      allRequestedHorizons,
      filters.granularityDays,
      context
    );
    const boundsArtifactCohortImpact = summarizeBoundsArtifactCohortImpact(
      groupedLines.flatMap((line) => line.cohorts),
      predictionResourcesResult.boundsArtifacts.loadedSizes,
      predictionResourcesResult.boundsArtifacts.missingSizes
    );
    const predictionResources = predictionResourcesResult.resources;
    const visibleCohortCount = groupedLines
      .flatMap((line) => line.cohorts)
      .filter((cohort) => cohort.cohortSize > 0).length;

    const data = buildNotebookData({
      projectLabel,
      filters,
      selection,
      horizonDays,
      lines: groupedLines,
      notes,
      predictionResources,
    });

    return {
      catalog,
      data,
      diagnostics: {
        contextStatus: "ready",
        errorMessage: null,
        descriptorRowCount: descriptorRows.length,
        selectedDescriptorRowCount: selectedDescriptorRows.length,
        cohortSizeRowCount: cohortSizeRows.length,
        revenueRowCount: revenueRows.length,
        spendRowCount: spendRows.length,
        corruptedDayCount: corruptedDayRows.length,
        rawCohortCount: rawCohorts.size,
        processedCohortCount: processedCohorts.length,
        visibleLineCount: groupedLines.length,
        visibleCohortCount,
        emptyReason: inferNotebookEmptyReason({
          selectedDescriptorRowCount: selectedDescriptorRows.length,
          cohortSizeRowCount: cohortSizeRows.length,
          revenueRowCount: revenueRows.length,
          rawCohortCount: rawCohorts.size,
          visibleCohortCount,
          spendRowCount: spendRows.length,
        }),
        boundsArtifactFallbackUsed: predictionResourcesResult.boundsArtifacts.fallbackUsed,
        boundsArtifactIssue: predictionResourcesResult.boundsArtifacts.issue,
        boundsArtifactPath: predictionResourcesResult.boundsArtifacts.scopeUri,
        boundsArtifactSourceStatus: predictionResourcesResult.boundsArtifacts.sourceStatus,
        boundsArtifactSourceLastSyncAt: predictionResourcesResult.boundsArtifacts.sourceLastSyncAt,
        boundsArtifactSourceNextSyncAt: predictionResourcesResult.boundsArtifacts.sourceNextSyncAt,
        boundsArtifactExpectedSizeCount: predictionResourcesResult.boundsArtifacts.expectedSizes.length,
        boundsArtifactLoadedSizeCount: predictionResourcesResult.boundsArtifacts.loadedSizes.length,
        boundsArtifactLoadedSizes: predictionResourcesResult.boundsArtifacts.loadedSizes,
        boundsArtifactMissingSizes: predictionResourcesResult.boundsArtifacts.missingSizes,
        boundsArtifactIssueSamples: predictionResourcesResult.boundsArtifacts.issueSamples,
        boundsArtifactLoadedChartableCohortCount:
          boundsArtifactCohortImpact.loadedChartableCohortCount,
        boundsArtifactLoadedZeroSpendCohortCount:
          boundsArtifactCohortImpact.loadedZeroSpendCohortCount,
        boundsArtifactMissingChartableCohortCount:
          boundsArtifactCohortImpact.missingChartableCohortCount,
        boundsArtifactMissingZeroSpendCohortCount:
          boundsArtifactCohortImpact.missingZeroSpendCohortCount,
        boundsCoverage: predictionResourcesResult.boundsCoverage,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown forecast runtime error";
    return {
      catalog: buildEmptyCatalog(),
      data: buildEmptyData(`Forecast live query failed: ${message}`),
      diagnostics: buildEmptyDiagnostics("query_failed", message),
    };
  }
}

export function getForecastHistoryCutoffDays(horizonDay: number) {
  return FORECAST_HISTORY_CUTOFF_DAYS.filter((cutoffDay) => cutoffDay < horizonDay);
}

export async function* streamForecastNotebookHistorySnapshots({
  bundle,
  filters,
  selection,
  horizonDay,
}: Omit<ForecastNotebookInput, "horizonDays" | "loadData" | "projectLabel"> & {
  horizonDay: number;
}) {
  const contexts = await loadBigQueryContexts([bundle]);
  const context = contexts.get(bundle.project.id);
  if (!context) {
    throw new Error("BigQuery credentials are unavailable for this project.");
  }

  const installSql = await discoverInstallSqlConfig(context);
  const groupBy = supportedGroupBy(filters.groupBy);
  const [spendRows, cohortSizeRows, revenueRows, corruptedDayRows] = await Promise.all([
    loadSpendRows(context, filters, selection),
    loadCohortSizes(context, filters, selection, installSql),
    loadRevenueRows(context, filters, selection, [horizonDay], installSql),
    loadCorruptedDayCounts(context, filters, selection, [horizonDay]),
  ]);

  const rawCohorts = buildRawCohorts({
    cohortSizeRows,
    revenueRows,
    spendRows,
    filters,
    selection,
    groupBy,
  });
  const processedCohorts = processRawCohorts(
    rawCohorts,
    filters.from,
    filters.to,
    filters.granularityDays,
    new Set(corruptedDayRows)
  );
  const groupedLines = buildGroupedLines(processedCohorts, groupBy);
  const predictionResourcesResult = await buildPredictionResources(
    groupedLines,
    uniqueSortedNonNegativeNumbers([horizonDay, 30, 60, 120, 240, 360, 720]),
    filters.granularityDays,
    context
  );
  const requestedCutoffs = getForecastHistoryCutoffDays(horizonDay);
  const boundsCache = new Map<number, Map<string, readonly [number, number]>>();

  for (const cutoffDay of requestedCutoffs) {
    yield buildHistoricalForecastChartSnapshot(
      groupedLines,
      horizonDay,
      cutoffDay,
      predictionResourcesResult.artifacts,
      boundsCache
    );
  }
}

export async function debugForecastNotebookSpendSelection({
  bundle,
  projectLabel: _projectLabel,
  filters,
  selection,
}: ForecastNotebookInput): Promise<ForecastNotebookSpendDebug> {
  const contexts = await loadBigQueryContexts([bundle]);
  const context = contexts.get(bundle.project.id);
  if (!context) {
    return {
      contextStatus: "missing_credentials",
      message: "BigQuery credentials are unavailable for this project.",
      filters,
      selection,
      sources: [],
    };
  }

  try {
    const mirrorSources = context.bundle.sources.filter(
      (source) =>
        (source.sourceType === "unity_ads_spend" || source.sourceType === "google_ads_spend") &&
        source.config.enabled === true &&
        source.config.mode === "bigquery"
    );

    const settled = await Promise.allSettled(
      mirrorSources.map(async (source) => {
        const schema = await discoverMirrorSpendSchema(context, source, filters);
        if (!schema) {
          return null;
        }

        const rows = await executeBigQuery<MirrorSpendRow>(
          context,
          `
            ${schema.query}
          `,
          [
            { name: "from", type: "DATE", value: filters.from },
            { name: "to", type: "DATE", value: filters.to },
          ]
        );
        const filteredRows = rows.filter((row) =>
          spendRowMatchesSelection(row, filters.platform, selection)
        );

        return {
          sourceType: source.sourceType,
          label: source.label,
          sourceProjectId: schema.sourceProjectId,
          sourceDataset: schema.sourceDataset,
          tableNames: schema.tableNames,
          totalRows: rows.length,
          filteredRows: filteredRows.length,
          totalSpend: roundDebugMetric(rows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0)),
          filteredSpend: roundDebugMetric(
            filteredRows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0)
          ),
          totalInstalls: roundDebugMetric(
            rows.reduce((sum, row) => sum + Number(row.installs ?? 0), 0)
          ),
          filteredInstalls: roundDebugMetric(
            filteredRows.reduce((sum, row) => sum + Number(row.installs ?? 0), 0)
          ),
          filteredCountries: summarizeSpendDebugDimension(
            filteredRows,
            (row) => row.country ?? "UNKNOWN"
          ),
          filteredStores: summarizeSpendDebugDimension(
            filteredRows,
            (row) => row.store ?? "unknown"
          ),
        } satisfies ForecastNotebookSpendDebugSource;
      })
    );

    return {
      contextStatus: "ready",
      message: null,
      filters,
      selection,
      sources: settled
        .flatMap((entry) => (entry.status === "fulfilled" && entry.value ? [entry.value] : []))
        .sort((left, right) => right.filteredSpend - left.filteredSpend),
    };
  } catch (error) {
    return {
      contextStatus: "query_failed",
      message: error instanceof Error ? error.message : "Unknown forecast debug runtime error",
      filters,
      selection,
      sources: [],
    };
  }
}

async function discoverInstallSqlConfig(context: ProjectQueryContext): Promise<InstallSqlConfig> {
  const rows = await executeBigQuery<TableColumnRow>(
    context,
    `
      SELECT LOWER(column_name) AS column_name
      FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = @table_name
    `,
    [{ name: "table_name", type: "STRING", value: context.rawInstallsTable }]
  );

  const columns = new Set(
    rows
      .map((row) => row.column_name?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value))
  );

  const clickExpr = columns.has("click_url_parameters")
    ? "CAST(click_url_parameters AS STRING)"
    : "CAST(NULL AS STRING)";
  const trackerExpr = columns.has("tracker_name")
    ? "CAST(tracker_name AS STRING)"
    : "CAST(NULL AS STRING)";
  const trackingIdExpr = columns.has("tracking_id")
    ? "CAST(tracking_id AS STRING)"
    : "CAST(NULL AS STRING)";
  const profileExpr = columns.has("profile_id")
    ? "CAST(profile_id AS STRING)"
    : "CAST(NULL AS STRING)";
  const deviceExpr = columns.has("appmetrica_device_id")
    ? "CAST(appmetrica_device_id AS STRING)"
    : "CAST(NULL AS STRING)";

  const sourceSql = buildSourceSql(clickExpr, trackerExpr);
  const campaignSql = buildCampaignSql(clickExpr, trackerExpr, trackingIdExpr);
  const creativeSql = buildCreativeSql(clickExpr);

  return {
    sourceSql,
    campaignSql,
    creativeSql,
    companySql: buildCompanySql(sourceSql),
    profileKeySql: `NULLIF(${profileExpr}, '')`,
    deviceKeySql: `NULLIF(${deviceExpr}, '')`,
    userKeySql: `COALESCE(NULLIF(${profileExpr}, ''), ${deviceExpr})`,
  };
}

function buildSourceSql(clickExpr: string, trackerExpr: string) {
  const normalizedTrackerExpr = `LOWER(COALESCE(${trackerExpr}, ''))`;
  return `
    CASE
      WHEN ${clickExpr} = 'Google Play' THEN 'organic'
      WHEN ${clickExpr} IN ('Unconfigured AdWords', 'AutocreatedGoogle Ads', 'Autocreated Google Ads') THEN 'google_ads'
      WHEN ${normalizedTrackerExpr} = 'google play' THEN 'organic'
      WHEN ${normalizedTrackerExpr} IN ('unconfigured adwords', 'autocreatedgoogle ads', 'autocreated google ads') THEN 'google_ads'
      WHEN REGEXP_CONTAINS(${normalizedTrackerExpr}, r'unity') THEN 'unity_ads'
      WHEN ${normalizedTrackerExpr} IN ('', 'unknown') THEN 'unknown'
      ELSE ${normalizedTrackerExpr}
    END
  `;
}

function buildCampaignSql(clickExpr: string, trackerExpr: string, trackingIdExpr: string) {
  return `
    CASE
      WHEN ${clickExpr} = 'Google Play' THEN 'organic'
      WHEN ${clickExpr} IN ('Unconfigured AdWords', 'AutocreatedGoogle Ads', 'Autocreated Google Ads') THEN 'google_ads'
      WHEN ${clickExpr} = 'unknown' THEN 'unknown'
      WHEN NULLIF(${clickExpr}, '') IS NOT NULL AND REGEXP_CONTAINS(${clickExpr}, r'gclid=') THEN REGEXP_EXTRACT(${clickExpr}, r'gclid=([^&]+)')
      WHEN NULLIF(${clickExpr}, '') IS NOT NULL AND REGEXP_CONTAINS(${clickExpr}, r'campaign_id=') THEN REGEXP_EXTRACT(${clickExpr}, r'campaign_id=([^&]+)')
      WHEN NULLIF(${clickExpr}, '') IS NOT NULL AND REGEXP_CONTAINS(${clickExpr}, r'c=[^&]+&c_ifa=') THEN REGEXP_EXTRACT(${clickExpr}, r'c=([^&]+)&c_ifa=')
      WHEN NULLIF(${clickExpr}, '') IS NOT NULL AND REGEXP_CONTAINS(${clickExpr}, r'c=[^&]+&campaign_name=') THEN REGEXP_EXTRACT(${clickExpr}, r'c=([^&]+)&campaign_name=')
      WHEN NULLIF(${clickExpr}, '') IS NOT NULL AND REGEXP_CONTAINS(${clickExpr}, r'campaign_name=') THEN REGEXP_EXTRACT(${clickExpr}, r'campaign_name=([^&]+)')
      WHEN NULLIF(${clickExpr}, '') IS NOT NULL AND REGEXP_CONTAINS(${clickExpr}, r'campaign=') THEN REGEXP_EXTRACT(${clickExpr}, r'campaign=([^&]+)')
      WHEN NULLIF(${clickExpr}, '') IS NOT NULL AND REGEXP_CONTAINS(${clickExpr}, r'utm_campaign=') THEN REGEXP_EXTRACT(${clickExpr}, r'utm_campaign=([^&]+)')
      WHEN NULLIF(${clickExpr}, '') IS NOT NULL AND REGEXP_CONTAINS(${clickExpr}, r'appmetrica_tracking_id=') THEN REGEXP_EXTRACT(${clickExpr}, r'appmetrica_tracking_id=([^&]+)')
      WHEN NULLIF(${clickExpr}, '') IS NOT NULL AND REGEXP_CONTAINS(${clickExpr}, r'afpub_id=') THEN REGEXP_EXTRACT(${clickExpr}, r'afpub_id=([^&]+)')
      WHEN NULLIF(${trackingIdExpr}, '') IS NOT NULL THEN ${trackingIdExpr}
      WHEN LOWER(COALESCE(${trackerExpr}, '')) = 'google play' THEN 'organic'
      WHEN LOWER(COALESCE(${trackerExpr}, '')) IN ('unconfigured adwords', 'autocreatedgoogle ads', 'autocreated google ads') THEN 'google_ads'
      ELSE 'unknown'
    END
  `;
}

function buildCreativeSql(clickExpr: string) {
  return `
    CASE
      WHEN ${clickExpr} IN ('Google Play', 'Unconfigured AdWords', 'AutocreatedGoogle Ads', 'Autocreated Google Ads', 'unknown') THEN 'unknown'
      WHEN NULLIF(${clickExpr}, '') IS NULL THEN 'unknown'
      WHEN REGEXP_CONTAINS(${clickExpr}, r'custom_creative_pack_id=') THEN REGEXP_EXTRACT(${clickExpr}, r'custom_creative_pack_id=([^&]+)')
      WHEN REGEXP_CONTAINS(${clickExpr}, r'creative_id=') THEN REGEXP_EXTRACT(${clickExpr}, r'creative_id=([^&]+)')
      WHEN REGEXP_CONTAINS(${clickExpr}, r'creative_pack_name=') THEN REGEXP_EXTRACT(${clickExpr}, r'creative_pack_name=([^&]+)')
      WHEN REGEXP_CONTAINS(${clickExpr}, r'creative_name=') THEN REGEXP_EXTRACT(${clickExpr}, r'creative_name=([^&]+)')
      WHEN REGEXP_CONTAINS(${clickExpr}, r'ad_name=') THEN REGEXP_EXTRACT(${clickExpr}, r'ad_name=([^&]+)')
      ELSE 'unknown'
    END
  `;
}

function buildCompanySql(sourceSql: string) {
  return `
    CASE
      WHEN ${sourceSql} = 'organic' THEN 'Organic'
      WHEN ${sourceSql} = 'unknown' THEN 'Unknown'
      WHEN ${sourceSql} = 'google_ads' OR REGEXP_CONTAINS(${sourceSql}, r'google') THEN 'Google Ads'
      WHEN REGEXP_CONTAINS(${sourceSql}, r'unity') THEN 'Unity Ads'
      ELSE REGEXP_REPLACE(INITCAP(REPLACE(${sourceSql}, '_', ' ')), r'\\bAds\\b', 'Ads')
    END
  `;
}

function buildRevenueJoinConditionSql(installAlias: string, eventAlias: string) {
  return `(
    (${installAlias}.profile_key IS NOT NULL AND ${eventAlias}.profile_key = ${installAlias}.profile_key)
    OR (${installAlias}.device_key IS NOT NULL AND ${eventAlias}.device_key = ${installAlias}.device_key)
  )`;
}

export function buildForecastNotebookTrackingPayload(
  projectLabel: string,
  filters: DashboardFilters,
  selection: ForecastNotebookSelection,
  horizonDays: ForecastHorizonDay[] = [...DEFAULT_FORECAST_HORIZON_DAYS]
) {
  const compactFilters: Record<string, unknown> = {
    granularityDays: filters.granularityDays,
    revenueMode: selection.revenueMode,
    horizonDays,
  };

  if (filters.platform !== "all") {
    compactFilters.platform = filters.platform;
  }
  if (filters.segment !== "all") {
    compactFilters.segment = filters.segment;
  }
  if (filters.groupBy !== "none") {
    compactFilters.groupBy = filters.groupBy;
  }
  if (filters.tag !== "all") {
    compactFilters.tag = filters.tag;
  }
  if (selection.country !== "all") {
    compactFilters.country = selection.country;
  }
  if (selection.source !== "all") {
    compactFilters.source = selection.source;
  }
  if (selection.company !== "all") {
    compactFilters.company = selection.company;
  }
  if (selection.campaign !== "all") {
    compactFilters.campaign = selection.campaign;
  }
  if (selection.creative !== "all") {
    compactFilters.creative = selection.creative;
  }

  const labelParts = [
    projectLabel,
    selection.revenueMode,
    `step ${filters.granularityDays}d`,
    horizonDays.map((day) => `D${day}`).join("/"),
  ];
  if (filters.platform !== "all") {
    labelParts.push(formatPlatformLabel(filters.platform));
  }
  if (selection.country !== "all") {
    labelParts.push(selection.country);
  }
  if (selection.source !== "all") {
    labelParts.push(selection.source);
  }
  if (selection.campaign !== "all") {
    labelParts.push(selection.campaign);
  }
  if (selection.creative !== "all") {
    labelParts.push(selection.creative);
  }

  return {
    label: labelParts.join(" · "),
    filters: compactFilters,
  };
}

async function loadInstallDescriptors(
  context: ProjectQueryContext,
  filters: DashboardFilters,
  installSql: InstallSqlConfig
) {
  return executeBigQuery<InstallDescriptorRow>(
    context,
    `
      WITH installs AS (
        SELECT
          LOWER(CAST(os_name AS STRING)) AS platform,
          COALESCE(NULLIF(UPPER(CAST(country_iso_code AS STRING)), ''), 'UNKNOWN') AS country,
          ${installSql.sourceSql} AS source,
          ${installSql.companySql} AS company,
          ${installSql.campaignSql} AS campaign,
          ${installSql.creativeSql} AS creative,
          DATE(SAFE_CAST(install_datetime AS TIMESTAMP)) AS install_date
        FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawInstallsTable}\`
        WHERE _PARTITIONDATE BETWEEN DATE(@from) AND DATE(@to)
          AND DATE(SAFE_CAST(install_datetime AS TIMESTAMP)) BETWEEN DATE(@from) AND DATE(@to)
          AND (@platform = 'all' OR LOWER(CAST(os_name AS STRING)) = @platform)
      )
      SELECT
        platform,
        country,
        source,
        company,
        campaign,
        creative,
        COUNT(*) AS count,
        CAST(MIN(install_date) AS STRING) AS first_seen,
        CAST(MAX(install_date) AS STRING) AS last_seen
      FROM installs
      GROUP BY 1, 2, 3, 4, 5, 6
    `,
    [
      { name: "from", type: "DATE", value: filters.from },
      { name: "to", type: "DATE", value: filters.to },
      { name: "platform", type: "STRING", value: filters.platform },
    ]
  );
}

async function loadCohortSizes(
  context: ProjectQueryContext,
  filters: DashboardFilters,
  selection: ForecastNotebookSelection,
  installSql: InstallSqlConfig
) {
  return executeBigQuery<CohortSizeRow>(
    context,
    `
      WITH installs AS (
        SELECT
          DATE(SAFE_CAST(install_datetime AS TIMESTAMP)) AS cohort_date,
          LOWER(CAST(os_name AS STRING)) AS platform,
          COALESCE(NULLIF(UPPER(CAST(country_iso_code AS STRING)), ''), 'UNKNOWN') AS country,
          ${installSql.sourceSql} AS source,
          ${installSql.companySql} AS company,
          ${installSql.campaignSql} AS campaign,
          ${installSql.creativeSql} AS creative,
          ${installSql.userKeySql} AS user_key
        FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawInstallsTable}\`
        WHERE _PARTITIONDATE BETWEEN DATE(@from) AND DATE(@to)
          AND DATE(SAFE_CAST(install_datetime AS TIMESTAMP)) BETWEEN DATE(@from) AND DATE(@to)
          AND (@platform = 'all' OR LOWER(CAST(os_name AS STRING)) = @platform)
      )
      SELECT
        CAST(cohort_date AS STRING) AS cohort_date,
        platform,
        country,
        source,
        company,
        campaign,
        creative,
        COUNT(DISTINCT user_key) AS cohort_size
      FROM installs
      WHERE (@country = 'all' OR country = @country)
        AND (@source = 'all' OR source = @source)
        AND (@company = 'all' OR company = @company)
        AND (@campaign = 'all' OR campaign = @campaign)
        AND (@creative = 'all' OR creative = @creative)
      GROUP BY 1, 2, 3, 4, 5, 6, 7
    `,
    buildSelectionParams(filters, selection)
  );
}

async function loadRevenueRows(
  context: ProjectQueryContext,
  filters: DashboardFilters,
  selection: ForecastNotebookSelection,
  horizonDays: readonly number[],
  installSql: InstallSqlConfig
) {
  const maxHorizon = Math.max(...PAYBACK_CURVE_POINTS, ...horizonDays, 720);
  const eventsTo = currentDataCutoffIso();
  return executeBigQuery<RevenueRow>(
    context,
    `
      WITH installs AS (
        SELECT
          DATE(SAFE_CAST(install_datetime AS TIMESTAMP)) AS cohort_date,
          LOWER(CAST(os_name AS STRING)) AS platform,
          COALESCE(NULLIF(UPPER(CAST(country_iso_code AS STRING)), ''), 'UNKNOWN') AS country,
          ${STORE_SQL} AS store,
          ${installSql.sourceSql} AS source,
          ${installSql.companySql} AS company,
          ${installSql.campaignSql} AS campaign,
          ${installSql.creativeSql} AS creative,
          ${installSql.profileKeySql} AS profile_key,
          ${installSql.deviceKeySql} AS device_key
        FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawInstallsTable}\`
        WHERE _PARTITIONDATE BETWEEN DATE(@from) AND DATE(@to)
          AND DATE(SAFE_CAST(install_datetime AS TIMESTAMP)) BETWEEN DATE(@from) AND DATE(@to)
          AND (@platform = 'all' OR LOWER(CAST(os_name AS STRING)) = @platform)
      ),
      installs_filtered AS (
        SELECT *
        FROM installs
        WHERE (@country = 'all' OR country = @country)
          AND (@source = 'all' OR source = @source)
          AND (@company = 'all' OR company = @company)
          AND (@campaign = 'all' OR campaign = @campaign)
          AND (@creative = 'all' OR creative = @creative)
      ),
      events AS (
        SELECT
          NULLIF(CAST(profile_id AS STRING), '') AS profile_key,
          NULLIF(CAST(appmetrica_device_id AS STRING), '') AS device_key,
          DATE(SAFE_CAST(event_datetime AS TIMESTAMP)) AS event_date,
          SUM(
            COALESCE(
              SAFE_CAST(JSON_VALUE(event_json, '$.price') AS FLOAT64),
              SAFE_CAST(JSON_VALUE(event_json, '$.revenue') AS FLOAT64),
              SAFE_CAST(JSON_VALUE(event_json, '$.value') AS FLOAT64),
              0
            )
          ) AS revenue
        FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawEventsTable}\`
        WHERE _PARTITIONDATE BETWEEN DATE(@from) AND DATE(@events_to)
          AND DATE(SAFE_CAST(event_datetime AS TIMESTAMP)) BETWEEN DATE(@from) AND DATE(@events_to)
          AND (
            (@revenue_mode = 'ads' AND event_name = 'c_ad_revenue')
            OR (@revenue_mode = 'iap' AND event_name IN ('purchase', 'in_app_purchase', 'subscription_start'))
            OR (@revenue_mode = 'total' AND event_name IN ('c_ad_revenue', 'purchase', 'in_app_purchase', 'subscription_start'))
          )
        GROUP BY 1, 2, 3
      )
      SELECT
        CAST(i.cohort_date AS STRING) AS cohort_date,
        i.platform,
        i.country,
        i.source,
        i.company,
        i.campaign,
        i.creative,
        CAST(e.event_date AS STRING) AS event_date,
        DATE_DIFF(e.event_date, i.cohort_date, DAY) AS lifetime_day,
        SUM(e.revenue) AS revenue
      FROM installs_filtered i
      INNER JOIN events e
        ON ${buildRevenueJoinConditionSql("i", "e")}
       AND e.event_date >= i.cohort_date
       AND e.event_date <= DATE_ADD(i.cohort_date, INTERVAL @max_horizon DAY)
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9
      ORDER BY cohort_date, lifetime_day
    `,
    [
      ...buildSelectionParams(filters, selection),
      { name: "events_to", type: "DATE", value: eventsTo },
      { name: "max_horizon", type: "INT64", value: maxHorizon },
      { name: "revenue_mode", type: "STRING", value: selection.revenueMode },
    ]
  );
}

async function loadCorruptedDayCounts(
  context: ProjectQueryContext,
  filters: DashboardFilters,
  selection: ForecastNotebookSelection,
  horizonDays: readonly number[]
) {
  const maxHorizon = Math.max(...PAYBACK_CURVE_POINTS, ...horizonDays, 720);
  const eventsTo = currentDataCutoffIso();
  const rows = await executeBigQuery<EventDayCountRow>(
    context,
    `
      SELECT
        CAST(DATE(SAFE_CAST(event_datetime AS TIMESTAMP)) AS STRING) AS event_date,
        COUNT(*) AS event_count
      FROM \`${context.warehouseProjectId}.${context.bundle.project.rawDataset}.${context.rawEventsTable}\`
      WHERE _PARTITIONDATE BETWEEN DATE(@from) AND DATE(@events_to)
        AND DATE(SAFE_CAST(event_datetime AS TIMESTAMP)) BETWEEN DATE(@from) AND DATE(@events_to)
        AND (
          (@revenue_mode = 'ads' AND event_name = 'c_ad_revenue')
          OR (@revenue_mode = 'iap' AND event_name IN ('purchase', 'in_app_purchase', 'subscription_start'))
          OR (@revenue_mode = 'total' AND event_name IN ('c_ad_revenue', 'purchase', 'in_app_purchase', 'subscription_start'))
        )
        AND (@platform = 'all' OR LOWER(CAST(os_name AS STRING)) = @platform)
      GROUP BY 1
      ORDER BY event_date
    `,
    [
      { name: "from", type: "DATE", value: filters.from },
      { name: "events_to", type: "DATE", value: eventsTo },
      { name: "platform", type: "STRING", value: filters.platform },
      { name: "revenue_mode", type: "STRING", value: selection.revenueMode },
      { name: "max_horizon", type: "INT64", value: maxHorizon },
    ]
  );

  return detectCorruptedDays(rows, filters.from);
}

async function loadSpendRows(
  context: ProjectQueryContext,
  filters: DashboardFilters,
  selection: ForecastNotebookSelection
) {
  const mirrorSources = context.bundle.sources.filter(
    (source) =>
      (source.sourceType === "unity_ads_spend" || source.sourceType === "google_ads_spend") &&
      source.config.enabled === true &&
      source.config.mode === "bigquery"
  );

  const settled = await Promise.allSettled(
    mirrorSources.map(async (source) => {
      const schema = await discoverMirrorSpendSchema(context, source, filters);
      if (!schema) {
        return [] as MirrorSpendRow[];
      }

      return executeBigQuery<MirrorSpendRow>(
        context,
        `
          ${schema.query}
        `,
        [
          { name: "from", type: "DATE", value: filters.from },
          { name: "to", type: "DATE", value: filters.to },
        ]
      );
    })
  );

  return settled.flatMap((entry) => (entry.status === "fulfilled" ? entry.value : []));
}

function buildSelectionParams(
  filters: DashboardFilters,
  selection: ForecastNotebookSelection
): BigQueryQueryParam[] {
  return [
    { name: "from", type: "DATE", value: filters.from },
    { name: "to", type: "DATE", value: filters.to },
    { name: "platform", type: "STRING", value: filters.platform },
    { name: "country", type: "STRING", value: selection.country },
    { name: "source", type: "STRING", value: selection.source },
    { name: "company", type: "STRING", value: selection.company },
    { name: "campaign", type: "STRING", value: selection.campaign },
    { name: "creative", type: "STRING", value: selection.creative },
  ];
}

async function discoverMirrorSpendSchema(
  context: ProjectQueryContext,
  source: AnalyticsSourceRecord,
  filters: DashboardFilters
) {
  const sourceProjectId =
    typeof source.config.sourceProjectId === "string" ? source.config.sourceProjectId : "";
  const sourceDataset =
    typeof source.config.sourceDataset === "string" ? source.config.sourceDataset : "";
  const tablePattern =
    typeof source.config.tablePattern === "string" ? source.config.tablePattern : "";

  if (!sourceProjectId || !sourceDataset || !tablePattern) {
    return null;
  }

  const rows = await executeBigQuery<MirrorSchemaRow>(
    context,
    `
      SELECT
        table_name,
        LOWER(column_name) AS column_name
      FROM \`${sourceProjectId}.${sourceDataset}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name LIKE @table_pattern
    `,
    [{ name: "table_pattern", type: "STRING", value: tablePattern.replace(/\*/g, "%") }]
  );

  const columnsByTable = rows.reduce<Map<string, Set<string>>>((acc, row) => {
    const tableName = row.table_name?.trim();
    const columnName = row.column_name?.trim().toLowerCase();
    if (!tableName || !columnName) {
      return acc;
    }
    const current = acc.get(tableName) ?? new Set<string>();
    current.add(columnName);
    acc.set(tableName, current);
    return acc;
  }, new Map());

  const tableNames = selectMirrorTables(Array.from(columnsByTable.keys()), filters.from, filters.to);
  if (tableNames.length === 0) {
    return null;
  }

  const sourceCompany = source.sourceType === "google_ads_spend" ? "Google Ads" : "Unity Ads";
  const sourceKey = source.sourceType === "google_ads_spend" ? "google_ads" : "unity_ads";

  const selects = tableNames.flatMap((tableName) => {
    const columns = columnsByTable.get(tableName) ?? new Set<string>();
    const spendColumn = firstExistingCandidate(columns, MIRROR_SPEND_COLUMN_CANDIDATES);
    if (!spendColumn) {
      return [];
    }

    const installsColumn = firstExistingCandidate(columns, MIRROR_INSTALLS_COLUMN_CANDIDATES);
    const countryColumn = firstExistingCandidate(columns, MIRROR_COUNTRY_COLUMN_CANDIDATES);
    const storeColumn = firstExistingCandidate(columns, MIRROR_STORE_COLUMN_CANDIDATES);
    const dateColumn = firstExistingCandidate(columns, MIRROR_DATE_COLUMN_CANDIDATES);
    const campaignIdColumn = firstExistingCandidate(columns, MIRROR_CAMPAIGN_ID_COLUMN_CANDIDATES);
    const campaignNameColumn = firstExistingCandidate(columns, MIRROR_CAMPAIGN_NAME_COLUMN_CANDIDATES);
    const creativeIdColumn = firstExistingCandidate(columns, MIRROR_CREATIVE_ID_COLUMN_CANDIDATES);
    const creativeNameColumn = firstExistingCandidate(columns, MIRROR_CREATIVE_NAME_COLUMN_CANDIDATES);
    const parsedTableDate = toIsoDateFromKey(parseMirrorTableDate(tableName));
    const tableRef = `\`${sourceProjectId}.${sourceDataset}.${sanitizeTableIdentifier(tableName)}\``;

    const cohortDateExpr = dateColumn
      ? `CAST(SAFE_CAST(${dateColumn} AS DATE) AS STRING)`
      : parsedTableDate
        ? `'${parsedTableDate}'`
        : "CAST(NULL AS STRING)";
    const countryExpr = countryColumn
      ? `COALESCE(NULLIF(UPPER(CAST(${countryColumn} AS STRING)), ''), 'UNKNOWN')`
      : "'UNKNOWN'";
    const storeExpr =
      source.sourceType === "google_ads_spend"
        ? "'google'"
        : storeColumn
          ? `
            CASE
              WHEN LOWER(CAST(${storeColumn} AS STRING)) LIKE '%android%' OR LOWER(CAST(${storeColumn} AS STRING)) = 'google' THEN 'google'
              WHEN LOWER(CAST(${storeColumn} AS STRING)) LIKE '%ios%' OR LOWER(CAST(${storeColumn} AS STRING)) = 'apple' THEN 'apple'
              ELSE LOWER(CAST(${storeColumn} AS STRING))
            END
          `
          : "'unknown'";
    const campaignExpr = campaignIdColumn
      ? `NULLIF(TRIM(CAST(${campaignIdColumn} AS STRING)), '')`
      : campaignNameColumn
        ? `NULLIF(TRIM(CAST(${campaignNameColumn} AS STRING)), '')`
        : "'unknown'";
    const campaignNameExpr = campaignNameColumn
      ? `NULLIF(TRIM(CAST(${campaignNameColumn} AS STRING)), '')`
      : campaignIdColumn
        ? `NULLIF(TRIM(CAST(${campaignIdColumn} AS STRING)), '')`
        : "'unknown'";
    const creativeExpr = creativeIdColumn
      ? `NULLIF(TRIM(CAST(${creativeIdColumn} AS STRING)), '')`
      : creativeNameColumn
        ? `NULLIF(TRIM(CAST(${creativeNameColumn} AS STRING)), '')`
        : "'unknown'";
    const creativeNameExpr = creativeNameColumn
      ? `NULLIF(TRIM(CAST(${creativeNameColumn} AS STRING)), '')`
      : creativeIdColumn
        ? `NULLIF(TRIM(CAST(${creativeIdColumn} AS STRING)), '')`
        : "'unknown'";
    const spendExpr =
      spendColumn.includes("micros")
        ? `SAFE_CAST(${spendColumn} AS FLOAT64) / 1000000`
        : `SAFE_CAST(${spendColumn} AS FLOAT64)`;
    const installsExpr = installsColumn
      ? `SAFE_CAST(${installsColumn} AS FLOAT64)`
      : "0";

    return [
      `
        SELECT
          ${cohortDateExpr} AS cohort_date,
          '${sourceKey}' AS source,
          '${sourceCompany}' AS company,
          ${countryExpr} AS country,
          ${storeExpr} AS store,
          ${campaignExpr} AS campaign_id,
          ${campaignNameExpr} AS campaign_name,
          ${creativeExpr} AS creative_id,
          ${creativeNameExpr} AS creative_name,
          SUM(COALESCE(${spendExpr}, 0)) AS spend,
          SUM(COALESCE(${installsExpr}, 0)) AS installs
        FROM ${tableRef}
        WHERE (${cohortDateExpr}) BETWEEN CAST(@from AS STRING) AND CAST(@to AS STRING)
        GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9
      `,
    ];
  });

  if (selects.length === 0) {
    return null;
  }

  return {
    query: `
      WITH raw_spend AS (
        ${selects.join("\nUNION ALL\n")}
      )
      SELECT
        cohort_date,
        source,
        company,
        country,
        store,
        campaign_id,
        campaign_name,
        creative_id,
        creative_name,
        SUM(spend) AS spend,
        SUM(installs) AS installs
      FROM raw_spend
      WHERE cohort_date IS NOT NULL
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9
    `,
    company: sourceCompany,
    source: sourceKey,
    sourceProjectId,
    sourceDataset,
    tableNames,
  };
}

function buildCatalog(
  rows: InstallDescriptorRow[],
  selection: {
    platform: string;
    country: string;
    source: string;
    company: string;
    campaign: string;
    creative: string;
  },
  aliases: ForecastCatalogAliases
): ForecastNotebookCatalog {
  const normalized = rows.map((row) => ({
    platform: row.platform ?? "unknown",
    country: row.country ?? "UNKNOWN",
    source: row.source ?? "unknown",
    company: row.company ?? "Unknown",
    campaign: row.campaign ?? "unknown",
    creative: row.creative ?? "unknown",
    count: Number(row.count ?? 0),
  }));

  const filteredCountries = normalized.filter(
    (row) =>
      (selection.platform === "all" || row.platform === selection.platform) &&
      (selection.source === "all" || row.source === selection.source) &&
      (selection.company === "all" || row.company === selection.company) &&
      (selection.campaign === "all" || row.campaign === selection.campaign) &&
      (selection.creative === "all" || row.creative === selection.creative)
  );
  const filteredSources = normalized.filter(
    (row) =>
      (selection.platform === "all" || row.platform === selection.platform) &&
      (selection.country === "all" || row.country === selection.country) &&
      (selection.company === "all" || row.company === selection.company) &&
      (selection.campaign === "all" || row.campaign === selection.campaign) &&
      (selection.creative === "all" || row.creative === selection.creative)
  );
  const filteredCompanies = normalized.filter(
    (row) =>
      (selection.platform === "all" || row.platform === selection.platform) &&
      (selection.country === "all" || row.country === selection.country) &&
      (selection.source === "all" || row.source === selection.source) &&
      (selection.campaign === "all" || row.campaign === selection.campaign) &&
      (selection.creative === "all" || row.creative === selection.creative)
  );
  const filteredCampaigns = normalized.filter(
    (row) =>
      (selection.platform === "all" || row.platform === selection.platform) &&
      (selection.country === "all" || row.country === selection.country) &&
      (selection.source === "all" || row.source === selection.source) &&
      (selection.company === "all" || row.company === selection.company) &&
      (selection.creative === "all" || row.creative === selection.creative)
  );
  const filteredCreatives = normalized.filter(
    (row) =>
      (selection.platform === "all" || row.platform === selection.platform) &&
      (selection.country === "all" || row.country === selection.country) &&
      (selection.source === "all" || row.source === selection.source) &&
      (selection.company === "all" || row.company === selection.company) &&
      (selection.campaign === "all" || row.campaign === selection.campaign)
  );

  return {
    countries: buildOptions(filteredCountries, "country", "All countries", formatCountryLabel),
    sources: buildOptions(filteredSources, "source", "All traffic sources", formatSourceLabel),
    companies: buildOptions(filteredCompanies, "company", "All companies", (value) => value),
    campaigns: buildOptions(
      filteredCampaigns,
      "campaign",
      "All campaigns",
      (value) => aliases.campaigns.get(value) ?? formatMirrorLabel(value)
    ),
    creatives: buildOptions(
      filteredCreatives,
      "creative",
      "All creatives",
      (value) => aliases.creatives.get(value) ?? formatMirrorLabel(value)
    ),
  };
}

function buildForecastCatalogAliases(spendRows: MirrorSpendRow[]): ForecastCatalogAliases {
  return {
    campaigns: buildMirrorAliasMap(
      spendRows.map((row) => ({
        id: row.campaign_id,
        name: row.campaign_name,
      }))
    ),
    creatives: buildMirrorAliasMap(
      spendRows.map((row) => ({
        id: row.creative_id,
        name: row.creative_name,
      }))
    ),
  };
}

function buildMirrorAliasMap(
  rows: Array<{ id: string | null; name: string | null }>
) {
  const votesById = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const id = row.id?.trim();
    const name = row.name?.trim();
    if (!id || !name || id === "unknown" || name.toLowerCase() === "unknown") {
      continue;
    }

    const votes = votesById.get(id) ?? new Map<string, number>();
    votes.set(name, (votes.get(name) ?? 0) + 1);
    votesById.set(id, votes);
  }

  const aliases = new Map<string, string>();
  for (const [id, votes] of votesById.entries()) {
    const winner = Array.from(votes.entries()).sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })[0]?.[0];

    if (winner) {
      aliases.set(id, winner);
    }
  }

  return aliases;
}

function applySelectionToDescriptors(
  rows: InstallDescriptorRow[],
  selection: {
    platform: string;
    country: string;
    source: string;
    company: string;
    campaign: string;
    creative: string;
  }
) {
  return rows.filter((row) => {
    const platform = row.platform ?? "unknown";
    const country = row.country ?? "UNKNOWN";
    const source = row.source ?? "unknown";
    const company = row.company ?? "Unknown";
    const campaign = row.campaign ?? "unknown";
    const creative = row.creative ?? "unknown";

    if (selection.platform !== "all" && platform !== selection.platform) {
      return false;
    }
    if (selection.country !== "all" && country !== selection.country) {
      return false;
    }
    if (selection.source !== "all" && source !== selection.source) {
      return false;
    }
    if (selection.company !== "all" && company !== selection.company) {
      return false;
    }
    if (selection.campaign !== "all" && campaign !== selection.campaign) {
      return false;
    }
    if (selection.creative !== "all" && creative !== selection.creative) {
      return false;
    }

    return true;
  });
}

function buildCatalogNotes(
  allRows: InstallDescriptorRow[],
  selectedRows: InstallDescriptorRow[],
  spendRows: MirrorSpendRow[],
  selection: ForecastNotebookSelection
) {
  const notes: string[] = [];
  if (allRows.length === 0) {
    notes.push("No AppMetrica install rows were found for the selected date window.");
  }
  if (selectedRows.length === 0) {
    notes.push("The selected slice has no AppMetrica cohort rows in the current date window.");
  }
  if (spendRows.length === 0) {
    notes.push("No paid spend rows were found in the configured spend mirrors for this window. ROAS will stay at 0 where spend is absent.");
  }
  if (selection.campaign !== "all" || selection.creative !== "all") {
    notes.push("Campaign and creative filters are now driven by AppMetrica install attributes, not synthetic mirror-only labels.");
  }
  return notes;
}

function buildRawCohorts({
  cohortSizeRows,
  revenueRows,
  spendRows,
  filters,
  selection,
  groupBy,
}: {
  cohortSizeRows: CohortSizeRow[];
  revenueRows: RevenueRow[];
  spendRows: MirrorSpendRow[];
  filters: DashboardFilters;
  selection: ForecastNotebookSelection;
  groupBy: DashboardGroupByKey;
}) {
  const raw = new Map<string, RawCohortRecord>();

  for (const row of cohortSizeRows) {
    const cohortDate = row.cohort_date ?? filters.from;
    const source = row.source ?? "unknown";
    const company = row.company ?? "Unknown";
    const campaign = row.campaign ?? "unknown";
    const creative = row.creative ?? "unknown";
    const country = row.country ?? "UNKNOWN";
    const platform = row.platform ?? "unknown";
    const store = platform === "ios" ? "apple" : platform === "android" ? "google" : platform;
    const groupValue = resolveGroupValue(groupBy, {
      platform,
      country,
      source,
      company,
      campaign,
      creative,
    });
    const record = ensureRawCohort(raw, {
      cohortDate,
      groupValue,
      country,
      source,
      company,
      campaign,
      creative,
      store,
    });
    record.cohortSize += Number(row.cohort_size ?? 0);
  }

  for (const row of revenueRows) {
    if (row.lifetime_day == null || row.lifetime_day < 0) {
      continue;
    }

    const cohortDate = row.cohort_date ?? filters.from;
    const source = row.source ?? "unknown";
    const company = row.company ?? "Unknown";
    const campaign = row.campaign ?? "unknown";
    const creative = row.creative ?? "unknown";
    const country = row.country ?? "UNKNOWN";
    const platform = row.platform ?? "unknown";
    const store = platform === "ios" ? "apple" : platform === "android" ? "google" : platform;
    const groupValue = resolveGroupValue(groupBy, {
      platform,
      country,
      source,
      company,
      campaign,
      creative,
    });
    const record = ensureRawCohort(raw, {
      cohortDate,
      groupValue,
      country,
      source,
      company,
      campaign,
      creative,
      store,
    });
    record.dailyRevenue.set(
      row.lifetime_day,
      (record.dailyRevenue.get(row.lifetime_day) ?? 0) + Number(row.revenue ?? 0)
    );
  }

  allocateSpendToRawCohorts(
    raw.values(),
    spendRows.filter((row) => spendRowMatchesSelection(row, filters.platform, selection))
  );

  for (const record of raw.values()) {
    if (record.installs <= 0) {
      record.installs = record.cohortSize;
    }
  }

  return raw;
}

function allocateSpendToRawCohorts(
  rawCohorts: Iterable<RawCohortRecord>,
  spendRows: MirrorSpendRow[]
) {
  const records = Array.from(rawCohorts);

  for (const row of spendRows) {
    const spend = Number(row.spend ?? 0);
    const installs = Number(row.installs ?? 0);
    if (spend === 0 && installs === 0) {
      continue;
    }

    const candidates = selectSpendAllocationCandidates(records, {
      cohortDate: row.cohort_date ?? "",
      source: row.source ?? "unknown",
      country: row.country ?? "UNKNOWN",
      store: row.store ?? "unknown",
      company: row.company ?? "Unknown",
      campaign: row.campaign_id ?? "unknown",
      campaignName: row.campaign_name ?? "unknown",
      creative: row.creative_id ?? "unknown",
      creativeName: row.creative_name ?? "unknown",
    });
    if (candidates.length === 0) {
      continue;
    }

    const totalWeight = candidates.reduce(
      (sum, record) => sum + Math.max(1, Number(record.cohortSize ?? 0)),
      0
    );
    if (totalWeight <= 0) {
      continue;
    }

    for (const record of candidates) {
      const weight = Math.max(1, Number(record.cohortSize ?? 0));
      const share = weight / totalWeight;
      record.spend += spend * share;
      record.installs += installs * share;
    }
  }
}

function processRawCohorts(
  rawCohorts: Map<string, RawCohortRecord>,
  from: string,
  to: string,
  stepDays: number,
  corruptedDays: Set<string>
) {
  const groupedByLine = new Map<string, RawCohortRecord[]>();
  for (const cohort of rawCohorts.values()) {
    const current = groupedByLine.get(cohort.groupValue) ?? [];
    current.push(cohort);
    groupedByLine.set(cohort.groupValue, current);
  }

  const processed: ProcessedCohort[] = [];
  const todayIso = currentDataCutoffIso();

  for (const [groupValue, cohorts] of groupedByLine.entries()) {
    const ratios = calculateRevenueRatios(cohorts);
    const repaired = cohorts.map((cohort) => {
      const repairedRevenue = repairCohortRevenue(cohort, corruptedDays, todayIso, ratios);
      return {
        ...cohort,
        repairedDaily: repairedRevenue.daily,
        repairedDailyCorrupted: repairedRevenue.isCorrupted,
      };
    });

    const buckets = bucketDates(from, to, stepDays);
    const byBucket = new Map<string, Array<(typeof repaired)[number]>>();
    for (const bucket of buckets) {
      byBucket.set(bucket, []);
    }

    for (const cohort of repaired) {
      const bucket = alignToBucket(cohort.cohortDate, from, stepDays);
      const current = byBucket.get(bucket) ?? [];
      current.push(cohort);
      byBucket.set(bucket, current);
    }

    for (const bucket of buckets) {
      const bucketCohorts = byBucket.get(bucket) ?? [];
      if (bucketCohorts.length === 0) {
        processed.push({
          cohortDate: bucket,
          groupValue,
          spend: 0,
          installs: 0,
          cohortSize: 0,
          cohortNumDays: 0,
          cohortLifetime: dayDiff(bucket, todayIso),
          isCorrupted: 0,
          totalRevenue: [],
        });
        continue;
      }

      const minLifetime = Math.min(...bucketCohorts.map((cohort) => cohort.repairedDaily.length - 1));
      const revenueByDay = new Array(
        Math.max(0, ...bucketCohorts.map((cohort) => cohort.repairedDaily.length))
      ).fill(0);
      let spend = 0;
      let installs = 0;
      let cohortSize = 0;
      let isCorrupted = 0;

      for (const cohort of bucketCohorts) {
        spend += cohort.spend;
        installs += cohort.installs;
        cohortSize += cohort.cohortSize;
        isCorrupted += cohort.repairedDailyCorrupted;
        cohort.repairedDaily.forEach((value, index) => {
          revenueByDay[index] += value;
        });
      }

      const totalRevenue: number[] = [];
      let running = 0;
      for (const value of revenueByDay) {
        running += value;
        totalRevenue.push(running);
      }

      processed.push({
        cohortDate: bucket,
        groupValue,
        spend,
        installs,
        cohortSize,
        cohortNumDays: bucketCohorts.length,
        cohortLifetime: minLifetime,
        isCorrupted,
        totalRevenue,
      });
    }
  }

  return processed;
}

function buildGroupedLines(
  cohorts: ProcessedCohort[],
  groupBy: DashboardGroupByKey
): GroupedLine[] {
  const byGroup = new Map<string, ProcessedCohort[]>();
  for (const cohort of cohorts) {
    const current = byGroup.get(cohort.groupValue) ?? [];
    current.push(cohort);
    byGroup.set(cohort.groupValue, current);
  }

  if (byGroup.size === 0) {
    return [];
  }

  return Array.from(byGroup.entries())
    .map(([value, groupCohorts]) => ({
      value,
      label: formatGroupLabel(groupBy, value),
      cohorts: groupCohorts.sort((left, right) => left.cohortDate.localeCompare(right.cohortDate)),
    }))
    .sort((left, right) => {
      const leftSpend = left.cohorts.reduce((sum, cohort) => sum + cohort.spend, 0);
      const rightSpend = right.cohorts.reduce((sum, cohort) => sum + cohort.spend, 0);
      if (rightSpend !== leftSpend) {
        return rightSpend - leftSpend;
      }
      return left.label.localeCompare(right.label);
    })
    .slice(0, groupBy === "none" ? 1 : 8);
}

async function buildPredictionResources(
  lines: GroupedLine[],
  horizons: number[],
  runDateFreq: number,
  context: ProjectQueryContext
) {
  const resources = new Map<string, LinePredictionResources>();
  const requiredHorizons = uniqueSortedNonNegativeNumbers(horizons);
  const allCohorts = lines.flatMap((line) => line.cohorts);
  const maxRequiredHorizon = Math.max(90, ...requiredHorizons);
  const predictionPeriods = [...NOTEBOOK_BOUNDS_PREDICTION_PERIODS];
  const historyDays = [...NOTEBOOK_BOUNDS_HISTORY_DAYS];
  const curveTasks: CurveEstimateTask[] = [];
  const notebookArtifactBounds = await loadNotebookBoundsArtifacts(
    context,
    allCohorts.map((cohort) => cohort.cohortSize)
  );

  for (const cohort of allCohorts) {
    const canEstimateCurve =
      cohort.cohortSize > 0 &&
      cohort.cohortNumDays > 0 &&
      cohort.isCorrupted === 0 &&
      cohort.cohortLifetime >= NOTEBOOK_HISTORY_MIN_DAY &&
      cohort.totalRevenue.length >= NOTEBOOK_HISTORY_MIN_DAY;

    if (canEstimateCurve) {
      curveTasks.push({
        id: `live:${cohort.groupValue}:${cohort.cohortDate}`,
        totalRevenue: cohort.totalRevenue,
        cutoff: cohort.cohortLifetime,
        horizon: maxRequiredHorizon,
      });
    }

    if (
      cohort.cohortNumDays !== runDateFreq ||
      cohort.cohortSize <= 0 ||
      cohort.isCorrupted !== 0 ||
      cohort.cohortLifetime < NOTEBOOK_HISTORY_MIN_DAY ||
      cohort.totalRevenue.length < NOTEBOOK_HISTORY_MIN_DAY
    ) {
      continue;
    }

    for (const cutoff of historyDays) {
      if (cutoff < cohort.totalRevenue.length) {
        curveTasks.push({
          id: `train:${cohort.groupValue}:${cohort.cohortDate}:${cutoff}`,
          totalRevenue: cohort.totalRevenue,
          cutoff,
          horizon: Math.max(360, maxRequiredHorizon, 90),
        });
      }
    }
  }

  const estimatedCurves = estimateCurvesWithNotebook(curveTasks);
  const trainingRecords = buildBoundsTrainingRecords(
    allCohorts,
    historyDays,
    predictionPeriods,
    maxRequiredHorizon,
    runDateFreq,
    estimatedCurves
  );
  const boundsCoverage = buildBoundsCoverageSummary(
    allCohorts,
    trainingRecords,
    maxRequiredHorizon,
    historyDays,
    predictionPeriods,
    notebookArtifactBounds.tables
  );

  for (const line of lines) {
    resources.set(
      line.value,
      await buildLinePredictionResources(
        line.cohorts,
        requiredHorizons,
        runDateFreq,
        historyDays,
        predictionPeriods,
        maxRequiredHorizon,
        notebookArtifactBounds.tables,
        trainingRecords,
        estimatedCurves
      )
    );
  }
  return {
    resources,
    boundsArtifacts: notebookArtifactBounds,
    boundsCoverage: boundsCoverage.rows,
    artifacts: {
      notebookArtifactBounds: notebookArtifactBounds.tables,
      trainingRecords,
      estimatedCurves,
      historyDays,
      predictionPeriods,
      maxRequiredHorizon,
    },
  };
}

async function buildLinePredictionResources(
  cohorts: ProcessedCohort[],
  requiredHorizons: number[],
  runDateFreq: number,
  historyDays: readonly number[],
  predictionPeriods: readonly number[],
  maxRequiredHorizon: number,
  notebookArtifactBounds: Map<number, Map<string, readonly [number, number]>>,
  trainingRecords: BoundsTrainingRecord[],
  estimatedCurves: Map<string, number[] | null>
): Promise<LinePredictionResources> {
  const liveBoundsByCohortSize = new Map<number, Map<string, readonly [number, number]>>();
  const predictionsByCohortDate = new Map<string, CurvePrediction>();
  const history: CurvePrediction[] = [];

  for (const cohort of cohorts) {
    const points = new Map<number, PredictedPoint>();
    const predictedFor = new Map<number, number>();
    const cacheEntry: CurvePrediction = {
      trueRevenue: cohort.totalRevenue,
      predictedFor,
      points,
    };

    const canEstimateCurve =
      cohort.cohortSize > 0 &&
      cohort.cohortNumDays > 0 &&
      cohort.isCorrupted === 0 &&
      cohort.cohortLifetime >= NOTEBOOK_HISTORY_MIN_DAY &&
      cohort.totalRevenue.length >= NOTEBOOK_HISTORY_MIN_DAY;
    const predictedCurve = canEstimateCurve
      ? getUsableEstimatedCurve(estimatedCurves.get(`live:${cohort.groupValue}:${cohort.cohortDate}`))
      : null;
    const curveAllowed = predictedCurve !== null;
    const canUseYoungFallback =
      !canEstimateCurve &&
      cohort.cohortNumDays > 0 &&
      cohort.isCorrupted === 0 &&
      history.length >= NOTEBOOK_YOUNG_FALLBACK_MIN_HISTORY;
    const shouldAppendToHistory = Boolean(curveAllowed) || canUseYoungFallback;

    for (const horizon of requiredHorizons) {
      const actual =
        cohort.cohortLifetime >= horizon && cohort.totalRevenue[horizon] != null
          ? cohort.totalRevenue[horizon] ?? 0
          : null;

      if (cohort.cohortSize <= 0 || cohort.cohortNumDays <= 0) {
        points.set(horizon, {
          predictedRevenue: 0,
          lowerRevenue: 0,
          upperRevenue: 0,
          actual,
        });
        continue;
      }

      if (cohort.isCorrupted !== 0) {
        points.set(horizon, {
          predictedRevenue: null,
          lowerRevenue: null,
          upperRevenue: null,
          actual,
        });
        continue;
      }

      let predictedRevenue: number | null = null;
      let cutoffToLook = NOTEBOOK_FALLBACK_CUTOFF;
      let allowBounds = false;
      const historicalCutoffForMaturePoint =
        actual != null && horizon > NOTEBOOK_HISTORY_MIN_DAY
          ? nearestHistoryDay(Math.min(cohort.cohortLifetime, horizon - 1))
          : null;

      if (curveAllowed) {
        if (historicalCutoffForMaturePoint != null && historicalCutoffForMaturePoint < horizon) {
          const historicalCurve = getUsableEstimatedCurve(
            estimatedCurves.get(
              `train:${cohort.groupValue}:${cohort.cohortDate}:${historicalCutoffForMaturePoint}`
            ) ?? estimateCurveFallback(cohort.totalRevenue, historicalCutoffForMaturePoint, maxRequiredHorizon)
          );

          if (historicalCurve && horizon < historicalCurve.length) {
            predictedRevenue = historicalCurve[horizon] ?? null;
            cutoffToLook = historicalCutoffForMaturePoint;
            allowBounds = predictedRevenue !== null;
          }
        }

        if (predictedRevenue == null && horizon < predictedCurve.length) {
          predictedRevenue = predictedCurve[horizon] ?? 0;
          cutoffToLook = nearestHistoryDay(cohort.cohortLifetime);
          allowBounds = true;
        }
      }

      if (canUseYoungFallback) {
        predictedRevenue = fallbackYoungCohortPrediction(
          cohort.totalRevenue,
          cohort.cohortLifetime,
          horizon,
          history
        );
        cutoffToLook = NOTEBOOK_FALLBACK_CUTOFF;
        allowBounds = predictedRevenue !== null;
      }

      const bounds = allowBounds
        ? getNotebookBounds(
            liveBoundsByCohortSize,
            trainingRecords,
            cohort.cohortSize,
            cutoffToLook,
            horizon,
            maxRequiredHorizon,
            historyDays,
            predictionPeriods,
            notebookArtifactBounds,
            { allowLiveFallback: false }
          )
        : null;
      const lowerRevenue =
        predictedRevenue == null || bounds == null
          ? null
          : Math.max(0, predictedRevenue + (predictedRevenue * bounds[0]) / 100);
      const upperRevenue =
        predictedRevenue == null || bounds == null
          ? null
          : Math.max(lowerRevenue ?? 0, predictedRevenue + (predictedRevenue * bounds[1]) / 100);
      points.set(horizon, {
        predictedRevenue,
        lowerRevenue,
        upperRevenue,
        actual,
      });
      if (predictedRevenue !== null) {
        predictedFor.set(horizon, predictedRevenue);
      }
    }

    predictionsByCohortDate.set(cohort.cohortDate, cacheEntry);
    if (shouldAppendToHistory) {
      history.push(cacheEntry);
    }
  }

  return {
    predictionsByCohortDate,
    boundsByCohortSize: liveBoundsByCohortSize,
    trainingPredictionCount: trainingRecords.length,
  };
}

function buildBoundsTrainingRecords(
  cohorts: ProcessedCohort[],
  historyDays: readonly number[],
  predictionPeriods: readonly number[],
  maxRequiredHorizon: number,
  runDateFreq: number,
  estimatedCurves: Map<string, number[] | null>
) {
  const records: BoundsTrainingRecord[] = [];

  for (const cohort of cohorts) {
    if (
      cohort.cohortNumDays !== runDateFreq ||
      cohort.cohortSize <= 0 ||
      cohort.isCorrupted !== 0 ||
      cohort.cohortLifetime < NOTEBOOK_HISTORY_MIN_DAY ||
      cohort.totalRevenue.length < NOTEBOOK_HISTORY_MIN_DAY
    ) {
      continue;
    }

    const trueFor = new Map<number, number>();
    const predictedForByCutoff = new Map<string, number>();
    const badByCutoff = new Set<number>();

    for (const period of predictionPeriods) {
      if (cohort.totalRevenue.length > period && cohort.totalRevenue[period] != null) {
        trueFor.set(period, cohort.totalRevenue[period] ?? 0);
      }
    }

    for (const cutoff of historyDays) {
      if (cutoff >= cohort.totalRevenue.length) {
        continue;
      }
      const predictedCurve =
        estimatedCurves.get(`train:${cohort.groupValue}:${cohort.cohortDate}:${cutoff}`) ?? null;
      if (!predictedCurve) {
        continue;
      }
      if (predictedCurve[predictedCurve.length - 1]! < predictedCurve[predictedCurve.length - 2]!) {
        continue;
      }
      if ((predictedCurve[60] ?? 0) > (predictedCurve[90] ?? Number.POSITIVE_INFINITY)) {
        badByCutoff.add(cutoff);
      }
      for (const period of predictionPeriods) {
        if (cutoff < period && period < predictedCurve.length) {
          predictedForByCutoff.set(boundsKey(period, cutoff), predictedCurve[period] ?? 0);
        }
      }
    }

    if (predictedForByCutoff.size === 0) {
      continue;
    }

    records.push({
      cohortDate: cohort.cohortDate,
      cohortSize: cohort.cohortSize,
      trueRevenue: cohort.totalRevenue,
      trueFor,
      predictedForByCutoff,
      badByCutoff,
    });
  }

  return records;
}

function fallbackYoungCohortPrediction(
  totalRevenue: number[],
  cohortLifetime: number,
  horizon: number,
  history: CurvePrediction[]
) {
  const currentRevenue = totalRevenue[cohortLifetime] ?? 0;
  if (history.length < NOTEBOOK_YOUNG_FALLBACK_MIN_HISTORY) {
    return null;
  }

  const collectedPredictions: number[] = [];
  const collectedRevenues: number[] = [];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const previous = history[index];
    if (!previous || previous.trueRevenue.length <= 4) {
      continue;
    }

    if (previous.trueRevenue.length <= cohortLifetime) {
      continue;
    }

    const predicted = previous.predictedFor.get(horizon);
    if (predicted == null) {
      if (previous.trueRevenue.length > horizon) {
        const realizedAtCurrentLifetime = previous.trueRevenue[cohortLifetime] ?? 0;
        collectedPredictions.push(previous.trueRevenue[horizon] ?? 0);
        collectedRevenues.push(realizedAtCurrentLifetime);
      }
      continue;
    }

    const realizedAtCurrentLifetime = previous.trueRevenue[cohortLifetime] ?? 0;
    collectedPredictions.push(predicted);
    collectedRevenues.push(realizedAtCurrentLifetime);
    if (collectedPredictions.length >= NOTEBOOK_YOUNG_FALLBACK_TARGET_HISTORY) {
      break;
    }
  }

  if (collectedPredictions.length < NOTEBOOK_YOUNG_FALLBACK_MIN_HISTORY) {
    return null;
  }

  const denominator = collectedRevenues.reduce((sum, value) => sum + value, 0);
  if (denominator <= 0) {
    return null;
  }

  const coefficient = collectedPredictions.reduce((sum, value) => sum + value, 0) / denominator;
  return currentRevenue * coefficient;
}

function normalizeBoundsCohortSize(cohortSize: number) {
  const lower = Math.floor(cohortSize);
  const upper = Math.ceil(cohortSize);
  const nearest = cohortSize - lower <= upper - cohortSize ? lower : upper;
  return clamp(nearest, NOTEBOOK_BOUNDS_MIN_COHORT_SIZE, NOTEBOOK_BOUNDS_MAX_COHORT_SIZE);
}

function summarizeBoundsArtifactCohortImpact(
  cohorts: ProcessedCohort[],
  loadedSizes: readonly number[],
  missingSizes: readonly number[]
) {
  const loadedSizeSet = new Set(loadedSizes);
  const missingSizeSet = new Set(missingSizes);
  let loadedChartableCohortCount = 0;
  let loadedZeroSpendCohortCount = 0;
  let missingChartableCohortCount = 0;
  let missingZeroSpendCohortCount = 0;

  for (const cohort of cohorts) {
    if (!Number.isFinite(cohort.cohortSize) || cohort.cohortSize <= 0) {
      continue;
    }

    const normalizedSize = normalizeBoundsCohortSize(cohort.cohortSize);
    const hasSpend = cohort.spend > 0;

    if (loadedSizeSet.has(normalizedSize)) {
      if (hasSpend) {
        loadedChartableCohortCount += 1;
      } else {
        loadedZeroSpendCohortCount += 1;
      }
    }

    if (missingSizeSet.has(normalizedSize)) {
      if (hasSpend) {
        missingChartableCohortCount += 1;
      } else {
        missingZeroSpendCohortCount += 1;
      }
    }
  }

  return {
    loadedChartableCohortCount,
    loadedZeroSpendCohortCount,
    missingChartableCohortCount,
    missingZeroSpendCohortCount,
  };
}

function collectBoundsTrainingWindow(
  trainingRecords: BoundsTrainingRecord[],
  cohortSize: number
) {
  const minSize = Math.floor(cohortSize / BOUNDS_SIZE_SMOOTH_COEFF);
  const maxSize = Math.ceil(cohortSize * BOUNDS_SIZE_SMOOTH_COEFF) + 1;
  const records = trainingRecords.filter(
    (record) => record.cohortSize >= minSize && record.cohortSize <= maxSize
  );

  if (
    records.length < BOUNDS_MIN_PREDICTIONS &&
    cohortSize <= BOUNDS_SMALL_COHORT_NEAREST_FILL_MAX_SIZE &&
    records.length < trainingRecords.length
  ) {
    const seen = new Set(records.map((record) => `${record.cohortDate}:${record.cohortSize}`));
    const nearestRecords = [...trainingRecords].sort((left, right) => {
      const leftLogDistance = Math.abs(
        Math.log(Math.max(left.cohortSize, 1)) - Math.log(Math.max(cohortSize, 1))
      );
      const rightLogDistance = Math.abs(
        Math.log(Math.max(right.cohortSize, 1)) - Math.log(Math.max(cohortSize, 1))
      );
      if (leftLogDistance !== rightLogDistance) {
        return leftLogDistance - rightLogDistance;
      }
      const leftAbsoluteDistance = Math.abs(left.cohortSize - cohortSize);
      const rightAbsoluteDistance = Math.abs(right.cohortSize - cohortSize);
      if (leftAbsoluteDistance !== rightAbsoluteDistance) {
        return leftAbsoluteDistance - rightAbsoluteDistance;
      }
      return left.cohortDate.localeCompare(right.cohortDate);
    });

    for (const record of nearestRecords) {
      const key = `${record.cohortDate}:${record.cohortSize}`;
      if (seen.has(key)) {
        continue;
      }
      records.push(record);
      seen.add(key);
      if (records.length >= BOUNDS_MIN_PREDICTIONS) {
        break;
      }
    }
  }

  return {
    minSize,
    maxSize,
    records,
  };
}

function isBoundsArtifactSizeOmitted(
  manifest: NotebookBoundsArtifactManifest | null,
  cohortSize: number
) {
  return (
    manifest?.artifactOmittedSizeRanges.some(
      (range) => cohortSize >= range.from && cohortSize <= range.to
    ) ?? false
  );
}

function summarizeBoundsTable(table: Map<string, readonly [number, number]>) {
  if (table.size === 0) {
    return {
      tableKeyCount: 0,
      minHistoryDay: null,
      maxHistoryDay: null,
      minPredictionDay: null,
      maxPredictionDay: null,
    };
  }

  const historyDays: number[] = [];
  const predictionDays: number[] = [];

  for (const key of table.keys()) {
    const match = /^for_(\d+)_on_(\d+)$/.exec(key);
    if (!match) {
      continue;
    }
    predictionDays.push(Number(match[1]));
    historyDays.push(Number(match[2]));
  }

  return {
    tableKeyCount: table.size,
    minHistoryDay: historyDays.length > 0 ? Math.min(...historyDays) : null,
    maxHistoryDay: historyDays.length > 0 ? Math.max(...historyDays) : null,
    minPredictionDay: predictionDays.length > 0 ? Math.min(...predictionDays) : null,
    maxPredictionDay: predictionDays.length > 0 ? Math.max(...predictionDays) : null,
  };
}

function buildBoundsCoverageSummary(
  cohorts: ProcessedCohort[],
  trainingRecords: BoundsTrainingRecord[],
  maxPredictionHorizon: number,
  historyDays: readonly number[],
  predictionPeriods: readonly number[],
  artifactTables: Map<number, Map<string, readonly [number, number]>>
): BoundsCoverageSummary {
  const requestedSizeCounts = new Map<number, number>();
  for (const cohort of cohorts) {
    if (!Number.isFinite(cohort.cohortSize) || cohort.cohortSize <= 0) {
      continue;
    }
    const normalizedSize = normalizeBoundsCohortSize(cohort.cohortSize);
    requestedSizeCounts.set(normalizedSize, (requestedSizeCounts.get(normalizedSize) ?? 0) + 1);
  }

  const rows: ForecastNotebookBoundsCoverageRow[] = [];
  const prebuiltFallbackTables = new Map<number, Map<string, readonly [number, number]>>();

  for (const cohortSize of Array.from(requestedSizeCounts.keys()).sort((left, right) => left - right)) {
    const artifactTable = artifactTables.get(cohortSize);
    const trainingWindow = collectBoundsTrainingWindow(trainingRecords, cohortSize);
    const liveFallbackTable =
      artifactTable ??
      buildBoundsForCohortSize(
        trainingRecords,
        cohortSize,
        maxPredictionHorizon,
        historyDays,
        predictionPeriods
      );

    if (!artifactTable && liveFallbackTable.size > 0) {
      prebuiltFallbackTables.set(cohortSize, liveFallbackTable);
    }

    const source: ForecastNotebookBoundsCoverageRow["source"] = artifactTable
      ? "artifact"
      : liveFallbackTable.size > 0
        ? "live_fallback"
        : "missing";
    const summary = summarizeBoundsTable(liveFallbackTable);

    rows.push({
      cohortSize,
      sliceCohorts: requestedSizeCounts.get(cohortSize) ?? 0,
      source,
      tableKeyCount: summary.tableKeyCount,
      smoothedTrainingRecords: trainingWindow.records.length,
      minTrainingCohortSize:
        trainingWindow.records.length > 0
          ? Math.min(...trainingWindow.records.map((record) => record.cohortSize))
          : null,
      maxTrainingCohortSize:
        trainingWindow.records.length > 0
          ? Math.max(...trainingWindow.records.map((record) => record.cohortSize))
          : null,
      minHistoryDay: summary.minHistoryDay,
      maxHistoryDay: summary.maxHistoryDay,
      minPredictionDay: summary.minPredictionDay,
      maxPredictionDay: summary.maxPredictionDay,
    });
  }

  return {
    rows,
    prebuiltFallbackTables,
  };
}

function parseGsUri(uri: string): StorageScope | null {
  if (!uri.startsWith("gs://")) {
    return null;
  }

  const remainder = uri.slice("gs://".length);
  const slashIndex = remainder.indexOf("/");
  if (slashIndex < 0) {
    return { bucket: remainder.trim(), prefix: "" };
  }

  const bucket = remainder.slice(0, slashIndex).trim();
  const prefix = remainder.slice(slashIndex + 1).trim().replace(/^\/+|\/+$/g, "");
  if (!bucket) {
    return null;
  }

  return { bucket, prefix };
}

function resolveBoundsArtifactScope(bundle: AnalyticsProjectBundle) {
  const boundsSource = bundle.sources.find((source) => source.sourceType === "bounds_artifacts");
  const bucket =
    typeof boundsSource?.config.bucket === "string" ? boundsSource.config.bucket.trim() : "";
  const prefix =
    typeof boundsSource?.config.prefix === "string" ? boundsSource.config.prefix.trim() : "";

  if (bucket) {
    return {
      bucket,
      prefix: prefix.replace(/^\/+|\/+$/g, ""),
    };
  }

  return parseGsUri(bundle.project.boundsPath);
}

function resolveNotebookPythonBin() {
  const localVenvPython = join(process.cwd(), ".venv", "bin", "python3");
  return process.env.ANALYTICS_NOTEBOOK_PYTHON_BIN ?? (existsSync(localVenvPython) ? localVenvPython : "python3");
}

function buildNotebookPythonEnv() {
  const libraryPathCandidates = [
    "/nix/var/nix/profiles/default/lib",
    "/nix/var/nix/profiles/per-user/root/profile/lib",
    "/root/.nix-profile/lib",
    process.env.LD_LIBRARY_PATH,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  const libraryPaths = libraryPathCandidates.filter((value) => existsSync(value));

  if (libraryPaths.length === 0) {
    return process.env;
  }

  return {
    ...process.env,
    LD_LIBRARY_PATH: libraryPaths.join(":"),
  };
}

function decodeNotebookBoundsArtifact(payload: Buffer) {
  const scriptPath = join(process.cwd(), "scripts", "read_bounds_pickle.py");
  const result = spawnSync(resolveNotebookPythonBin(), [scriptPath], {
    input: payload,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
    env: buildNotebookPythonEnv(),
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `python exited with ${result.status}`);
  }

  const parsed = JSON.parse(result.stdout || "{}") as {
    bounds?: Record<string, [number, number]>;
  };
  const table = new Map<string, readonly [number, number]>();
  let filteredPlaceholderCount = 0;

  for (const [key, bounds] of Object.entries(parsed.bounds ?? {})) {
    const pair = [Number(bounds[0] ?? 0), Number(bounds[1] ?? 0)] as const;
    if (isPlaceholderArtifactBounds(pair)) {
      filteredPlaceholderCount += 1;
      continue;
    }
    table.set(key, pair);
  }

  return {
    table,
    filteredPlaceholderCount,
    totalEntryCount: Object.keys(parsed.bounds ?? {}).length,
  } satisfies DecodedNotebookBoundsArtifact;
}

function normalizeBoundsArtifactManifest(
  value: unknown
): NotebookBoundsArtifactManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const normalizeNumber = (input: unknown) =>
    typeof input === "number" && Number.isFinite(input) ? input : null;
  const normalizeRanges = Array.isArray(record.artifactOmittedSizeRanges)
    ? record.artifactOmittedSizeRanges.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return [];
        }
        const item = entry as Record<string, unknown>;
        const from = normalizeNumber(item.from);
        const to = normalizeNumber(item.to);
        return from !== null && to !== null ? [{ from, to }] : [];
      })
    : [];

  return {
    artifactExpectedSizeCount: normalizeNumber(record.artifactExpectedSizeCount),
    artifactGeneratedSizeCount: normalizeNumber(record.artifactGeneratedSizeCount),
    artifactOmittedSizeCount: normalizeNumber(record.artifactOmittedSizeCount),
    artifactOmittedForCoverageCount: normalizeNumber(record.artifactOmittedForCoverageCount),
    artifactOmittedForEmptyTableCount: normalizeNumber(record.artifactOmittedForEmptyTableCount),
    artifactMinPredictionsRequired: normalizeNumber(record.artifactMinPredictionsRequired),
    artifactSizeSmoothCoeff: normalizeNumber(record.artifactSizeSmoothCoeff),
    artifactOmittedSizeRanges: normalizeRanges,
  };
}

function formatBoundsArtifactRanges(
  ranges: Array<{ from: number; to: number }>,
  limit = 8
) {
  if (ranges.length === 0) {
    return "none";
  }

  const preview = ranges.slice(0, limit);
  const rendered = preview
    .map((range) => (range.from === range.to ? String(range.from) : `${range.from}-${range.to}`))
    .join(", ");
  const suffix = ranges.length > limit ? `, +${ranges.length - limit} more` : "";
  return `${rendered}${suffix}`;
}

function describeBoundsArtifactManifest(
  manifest: NotebookBoundsArtifactManifest | null
) {
  if (!manifest || (manifest.artifactOmittedSizeCount ?? 0) <= 0) {
    return null;
  }

  const parts = [
    `Latest bounds manifest omitted ${manifest.artifactOmittedSizeCount} cohort size file(s).`,
  ];

  if ((manifest.artifactOmittedForCoverageCount ?? 0) > 0) {
    const minPredictions =
      manifest.artifactMinPredictionsRequired !== null
        ? ` (<${manifest.artifactMinPredictionsRequired} smoothed training records)`
        : "";
    const smoothCoeff =
      manifest.artifactSizeSmoothCoeff !== null
        ? ` with smooth coeff ${manifest.artifactSizeSmoothCoeff}`
        : "";
    parts.push(
      `${manifest.artifactOmittedForCoverageCount} were skipped for insufficient smoothed coverage${minPredictions}${smoothCoeff}.`
    );
  }

  if ((manifest.artifactOmittedForEmptyTableCount ?? 0) > 0) {
    parts.push(
      `${manifest.artifactOmittedForEmptyTableCount} were skipped because no empirical bounds keys were produced.`
    );
  }

  if (manifest.artifactOmittedSizeRanges.length > 0) {
    parts.push(
      `Omitted size ranges: ${formatBoundsArtifactRanges(manifest.artifactOmittedSizeRanges)}.`
    );
  }

  return parts.join(" ");
}

async function fetchNotebookBoundsArtifact(
  context: ProjectQueryContext,
  cohortSize: number,
  cacheVersion: string
): Promise<{ artifact: Map<string, readonly [number, number]> | null; issue: string | null }> {
  const scope = resolveBoundsArtifactScope(context.bundle);
  if (!scope?.bucket) {
    return {
      artifact: null,
      issue: "Bounds artifact scope is not configured.",
    };
  }

  if (process.env.NODE_ENV === "test") {
    return {
      artifact: null,
      issue: null,
    };
  }

  const normalizedCohortSize = normalizeBoundsCohortSize(cohortSize);
  const objectPath = [scope.prefix, `${normalizedCohortSize}.pkl`].filter(Boolean).join("/");
  const cacheKey = `${scope.bucket}/${objectPath}#${cacheVersion}`;
  const cached = NOTEBOOK_BOUNDS_ARTIFACT_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    try {
      const token = await getAccessToken(context.serviceAccount);
      const response = await fetch(
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(scope.bucket)}/o/${encodeURIComponent(objectPath)}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "x-goog-user-project": context.warehouseProjectId,
          },
          cache: "no-store",
        }
      );

      if (response.status === 404) {
        return {
          artifact: null,
          issue: `Missing file gs://${scope.bucket}/${objectPath}.`,
        };
      }

      if (!response.ok) {
        throw new Error(`GCS bounds fetch failed: ${response.status} ${await response.text()}`);
      }

      const payload = Buffer.from(await response.arrayBuffer());
      const decoded = decodeNotebookBoundsArtifact(payload);
      if (decoded.table.size === 0 && decoded.filteredPlaceholderCount > 0) {
        return {
          artifact: null,
          issue: `Artifact file gs://${scope.bucket}/${objectPath} contained only placeholder [-15%, +15%] bounds entries and was ignored.`,
        };
      }

      if (decoded.filteredPlaceholderCount > 0) {
        console.warn(
          `[forecast-notebook] filtered ${decoded.filteredPlaceholderCount}/${decoded.totalEntryCount} placeholder artifact bounds entries for ${context.bundle.project.slug} cohort size ${normalizedCohortSize}`
        );
      }

      return {
        artifact: decoded.table,
        issue: null,
      };
    } catch (error) {
      const issue = error instanceof Error ? error.message : "Unknown error";
      console.warn(
        `[forecast-notebook] bounds artifact fallback for ${context.bundle.project.slug} cohort size ${normalizedCohortSize}: ${
          issue
        }`
      );
      return {
        artifact: null,
        issue,
      };
    }
  })();

  NOTEBOOK_BOUNDS_ARTIFACT_CACHE.set(cacheKey, pending);
  return pending;
}

async function fetchNotebookBoundsArtifactManifest(context: ProjectQueryContext) {
  const scope = resolveBoundsArtifactScope(context.bundle);
  if (!scope?.bucket) {
    return null;
  }

  if (process.env.NODE_ENV === "test") {
    return null;
  }

  const objectPaths = [
    [scope.prefix, "bounds-latest.json"].filter(Boolean).join("/"),
    [scope.prefix, "latest.json"].filter(Boolean).join("/"),
  ];

  for (const objectPath of objectPaths) {
    const cacheKey = `${scope.bucket}/${objectPath}`;
    const cached = NOTEBOOK_BOUNDS_MANIFEST_CACHE.get(cacheKey);
    if (cached) {
      const manifest = await cached;
      if (manifest) {
        return manifest;
      }
      continue;
    }

    const pending = (async () => {
      try {
        const token = await getAccessToken(context.serviceAccount);
        const response = await fetch(
          `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(scope.bucket)}/o/${encodeURIComponent(objectPath)}?alt=media`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "x-goog-user-project": context.warehouseProjectId,
            },
            cache: "no-store",
          }
        );

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new Error(
            `GCS bounds manifest fetch failed: ${response.status} ${await response.text()}`
          );
        }

        return normalizeBoundsArtifactManifest((await response.json()) as unknown);
      } catch (error) {
        const issue = error instanceof Error ? error.message : "Unknown error";
        console.warn(
          `[forecast-notebook] bounds manifest fetch failed for ${context.bundle.project.slug}: ${issue}`
        );
        return null;
      }
    })();

    NOTEBOOK_BOUNDS_MANIFEST_CACHE.set(cacheKey, pending);
    const manifest = await pending;
    if (manifest) {
      return manifest;
    }
  }

  return null;
}

async function loadNotebookBoundsArtifacts(
  context: ProjectQueryContext,
  cohortSizes: number[]
): Promise<NotebookBoundsArtifactLoadResult> {
  const uniqueSizes = uniqueSortedNumbers(
    cohortSizes
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => normalizeBoundsCohortSize(value))
  );
  const boundsSource = context.bundle.sources.find((source) => source.sourceType === "bounds_artifacts");
  const scope = resolveBoundsArtifactScope(context.bundle);
  const scopeUri = scope?.bucket ? `gs://${scope.bucket}${scope.prefix ? `/${scope.prefix}` : ""}` : null;
  const manifest = await fetchNotebookBoundsArtifactManifest(context);
  const tables = new Map<number, Map<string, readonly [number, number]>>();
  const loadedSizes: number[] = [];
  const missingSizes: number[] = [];
  const issueSamples: string[] = [];
  const cacheVersion = boundsSource?.lastSyncAt?.toISOString() ?? "unversioned";

  if (process.env.NODE_ENV === "test") {
    return {
      tables,
      scopeUri,
      sourceStatus: boundsSource?.status ?? null,
      sourceLastSyncAt: boundsSource?.lastSyncAt?.toISOString() ?? null,
      sourceNextSyncAt: boundsSource?.nextSyncAt?.toISOString() ?? null,
      expectedSizes: [],
      loadedSizes: [],
      missingSizes: [],
      issueSamples: [],
      fallbackUsed: false,
      issue: null,
    };
  }

  for (const cohortSize of uniqueSizes) {
    if (isBoundsArtifactSizeOmitted(manifest, cohortSize)) {
      missingSizes.push(cohortSize);
      if (issueSamples.length < 5) {
        issueSamples.push(
          `size ${cohortSize}: Latest bounds manifest omitted this cohort size during the last rebuild, so no artifact file is expected for it.`
        );
      }
      continue;
    }

    const result = await fetchNotebookBoundsArtifact(context, cohortSize, cacheVersion);
    if (result.artifact) {
      tables.set(cohortSize, result.artifact);
      loadedSizes.push(cohortSize);
    } else {
      missingSizes.push(cohortSize);
      if (result.issue && issueSamples.length < 5) {
        issueSamples.push(`size ${cohortSize}: ${result.issue}`);
      }
    }
  }

  const fallbackUsed = missingSizes.length > 0;
  let issue: string | null = null;
  if (fallbackUsed) {
    const manifestSummary = describeBoundsArtifactManifest(manifest);
    issue = scopeUri
      ? `Notebook bounds artifacts are missing or unreadable for ${missingSizes.length} of ${uniqueSizes.length} cohort sizes under ${scopeUri}. Forecast intervals stay blank for the missing sizes so the issue remains visible. Live-built fallback tables are computed for diagnostics only.${manifestSummary ? ` ${manifestSummary}` : ""}`
      : `Notebook bounds artifacts are required for strict parity, but boundsPath is not configured. Forecast intervals stay blank until artifact publication is fixed. Live-built fallback tables are computed for diagnostics only.${manifestSummary ? ` ${manifestSummary}` : ""}`;
  }

  return {
    tables,
    scopeUri,
    sourceStatus: boundsSource?.status ?? null,
    sourceLastSyncAt: boundsSource?.lastSyncAt?.toISOString() ?? null,
    sourceNextSyncAt: boundsSource?.nextSyncAt?.toISOString() ?? null,
    expectedSizes: uniqueSizes,
    loadedSizes,
    missingSizes,
    issueSamples,
    fallbackUsed,
    issue,
  };
}

function getNotebookBounds(
  cache: Map<number, Map<string, readonly [number, number]>>,
  trainingRecords: BoundsTrainingRecord[],
  cohortSize: number,
  cutoff: number,
  horizon: number,
  maxPredictionHorizon: number,
  historyDays: readonly number[],
  predictionPeriods: readonly number[],
  artifactCache?: Map<number, Map<string, readonly [number, number]>>,
  options?: {
    allowLiveFallback?: boolean;
  }
) {
  const normalizedCohortSize = normalizeBoundsCohortSize(cohortSize);
  const notebookHorizon = clamp(Math.round(horizon), 7, 365);
  const key = boundsKey(notebookHorizon, nearestHistoryDay(cutoff));
  const artifactBounds = artifactCache?.get(normalizedCohortSize)?.get(key);
  if (artifactBounds && !isPlaceholderArtifactBounds(artifactBounds)) {
    return artifactBounds;
  }

  if (options?.allowLiveFallback === false) {
    return null;
  }

  let boundsTable = cache.get(normalizedCohortSize);
  if (!boundsTable) {
    boundsTable = buildBoundsForCohortSize(
      trainingRecords,
      normalizedCohortSize,
      maxPredictionHorizon,
      historyDays,
      predictionPeriods
    );
    cache.set(normalizedCohortSize, boundsTable);
  }

  const found = boundsTable.get(key);
  if (found) {
    return found;
  }

  return null;
}

function buildBoundsForCohortSize(
  trainingRecords: BoundsTrainingRecord[],
  cohortSize: number,
  maxPredictionHorizon: number,
  historyDays: readonly number[],
  predictionPeriods: readonly number[]
) {
  const trainingWindow = collectBoundsTrainingWindow(trainingRecords, cohortSize);
  const smoothRecords = trainingWindow.records;
  const table = new Map<string, readonly [number, number]>();
  if (smoothRecords.length < BOUNDS_MIN_PREDICTIONS) {
    return table;
  }

  const rawBounds = getErrorBoundsFromRecords(smoothRecords, historyDays, predictionPeriods);
  for (const [key, value] of rawBounds.entries()) {
    table.set(key, value);
  }

  const expandedHistoryMax = Math.min(BOUNDS_MAX_CUTOFF, Math.max(...historyDays));
  for (const period of predictionPeriods) {
    const knownCutoffs = historyDays.filter((cutoff) => cutoff < period && table.has(boundsKey(period, cutoff)));
    if (knownCutoffs.length === 0) {
      continue;
    }

    const lowerValues = knownCutoffs.map((cutoff) => table.get(boundsKey(period, cutoff))?.[0] ?? 0);
    const upperValues = knownCutoffs.map((cutoff) => table.get(boundsKey(period, cutoff))?.[1] ?? 0);
    const daysToExtend = Math.min(expandedHistoryMax, period - 1);
    const expanded = interpolateAcrossHistory(knownCutoffs, lowerValues, upperValues, daysToExtend);

    for (const [historyDay, bounds] of expanded.entries()) {
      const key = boundsKey(period, historyDay);
      if (!table.has(key)) {
        table.set(key, bounds);
      }
    }
  }

  const fullPredictionPeriods = rangeInclusive(7, 365);
  for (const cutoff of rangeInclusive(NOTEBOOK_HISTORY_MIN_DAY, BOUNDS_MAX_CUTOFF)) {
    const knownPeriods = predictionPeriods.filter((period) => cutoff < period && table.has(boundsKey(period, cutoff)));
    if (knownPeriods.length <= 1) {
      continue;
    }

    const lowerValues = knownPeriods.map((period) => table.get(boundsKey(period, cutoff))?.[0] ?? 0);
    const upperValues = knownPeriods.map((period) => table.get(boundsKey(period, cutoff))?.[1] ?? 0);
    const expanded = interpolateAcrossPredictionPeriods(
      knownPeriods,
      lowerValues,
      upperValues,
      fullPredictionPeriods[fullPredictionPeriods.length - 1] ?? 365
    );

    for (const [period, bounds] of expanded.entries()) {
      const key = boundsKey(period, cutoff);
      if (!table.has(key)) {
        table.set(key, bounds);
      }
    }
  }

  return table;
}

function getErrorBoundsFromRecords(
  records: BoundsTrainingRecord[],
  historyDays: readonly number[],
  predictionPeriods: readonly number[]
) {
  const bounds = new Map<string, readonly [number, number]>();

  for (const period of predictionPeriods) {
    for (const cutoff of historyDays) {
      if (cutoff >= period) {
        continue;
      }

      const errors: number[] = [];
      for (const record of records) {
        if (record.badByCutoff.has(cutoff)) {
          continue;
        }
        const actual = record.trueFor.get(period);
        const predicted = record.predictedForByCutoff.get(boundsKey(period, cutoff));
        if (actual == null || predicted == null) {
          continue;
        }
        errors.push(((actual - predicted) / actual) * 100);
      }

      if (errors.length === 0) {
        continue;
      }

      const sorted = errors.sort((left, right) => left - right);
      bounds.set(boundsKey(period, cutoff), [
        quantile(sorted, BOUNDS_LOWER_QUANTILE),
        quantile(sorted, BOUNDS_UPPER_QUANTILE),
      ]);
    }
  }

  return bounds;
}

function interpolateAcrossHistory(
  knownCutoffs: number[],
  lowerValues: number[],
  upperValues: number[],
  daysToExtend: number
) {
  const bounds = new Map<number, readonly [number, number]>();
  const firstCutoff = knownCutoffs[0];
  const lastCutoff = knownCutoffs[knownCutoffs.length - 1];
  if (firstCutoff == null || lastCutoff == null) {
    return bounds;
  }

  const interpolatedLower = new Array(lastCutoff + 1).fill(Number.NaN);
  const interpolatedUpper = new Array(lastCutoff + 1).fill(Number.NaN);
  knownCutoffs.forEach((cutoff, index) => {
    interpolatedLower[cutoff] = lowerValues[index] ?? 0;
    interpolatedUpper[cutoff] = upperValues[index] ?? 0;
  });

  const lowerSeries = interpolateSeries(interpolatedLower.slice(firstCutoff));
  const upperSeries = interpolateSeries(interpolatedUpper.slice(firstCutoff));
  let finalLower = lowerSeries;
  let finalUpper = upperSeries;

  if (daysToExtend > lastCutoff) {
    const extendBy = daysToExtend - lastCutoff;
    const baseWindow = Math.max(1, Math.trunc(lastCutoff / 3));
    finalLower = extrapolateSeries(lowerSeries, baseWindow, extendBy);
    finalUpper = extrapolateSeries(upperSeries, baseWindow, extendBy);
  }

  const historyDays = rangeInclusive(firstCutoff, daysToExtend);
  historyDays.forEach((historyDay, index) => {
    bounds.set(historyDay, [finalLower[index] ?? 0, finalUpper[index] ?? 0]);
  });
  return bounds;
}

function interpolateAcrossPredictionPeriods(
  knownPeriods: number[],
  lowerValues: number[],
  upperValues: number[],
  maxPredictionHorizon: number
) {
  const bounds = new Map<number, readonly [number, number]>();
  const firstPeriod = knownPeriods[0];
  const lastPeriod = knownPeriods[knownPeriods.length - 1];
  if (firstPeriod == null || lastPeriod == null) {
    return bounds;
  }

  const interpolatedLower = new Array(lastPeriod + 1).fill(Number.NaN);
  const interpolatedUpper = new Array(lastPeriod + 1).fill(Number.NaN);
  knownPeriods.forEach((period, index) => {
    interpolatedLower[period] = lowerValues[index] ?? 0;
    interpolatedUpper[period] = upperValues[index] ?? 0;
  });

  const lowerSeries = interpolateSeries(interpolatedLower.slice(firstPeriod));
  const upperSeries = interpolateSeries(interpolatedUpper.slice(firstPeriod));
  let finalLower = lowerSeries;
  let finalUpper = upperSeries;

  if (maxPredictionHorizon > lastPeriod) {
    const extendBy = maxPredictionHorizon - lastPeriod;
    const baseWindow = Math.max(1, Math.trunc(lastPeriod / 3));
    finalLower = extrapolateSeries(lowerSeries, baseWindow, extendBy);
    finalUpper = extrapolateSeries(upperSeries, baseWindow, extendBy);
  }

  const predictionPeriods = rangeInclusive(firstPeriod, maxPredictionHorizon);
  predictionPeriods.forEach((period, index) => {
    bounds.set(period, [finalLower[index] ?? 0, finalUpper[index] ?? 0]);
  });
  return bounds;
}

function boundsKey(period: number, cutoff: number) {
  return `for_${period}_on_${cutoff}`;
}

function nearestHistoryDay(day: number) {
  return clamp(Math.round(day), NOTEBOOK_HISTORY_MIN_DAY, BOUNDS_MAX_CUTOFF);
}

function buildNotebookData({
  projectLabel,
  filters,
  selection,
  horizonDays,
  lines,
  notes,
  predictionResources,
}: {
  projectLabel: string;
  filters: DashboardFilters;
  selection: ForecastNotebookSelection;
  horizonDays: readonly number[];
  lines: GroupedLine[];
  notes: string[];
  predictionResources: Map<string, LinePredictionResources>;
}): ForecastNotebookData {
  if (lines.length === 0) {
    return buildEmptyData(
      notes[0] ?? "No live cohorts matched the selected forecast slice."
    );
  }

  const totalTrainingPredictions = Array.from(predictionResources.values()).reduce(
    (sum, resource) => sum + resource.trainingPredictionCount,
    0
  );
  const horizonCharts = horizonDays.map((horizonDay) =>
    buildHorizonChart(projectLabel, filters, selection, lines, horizonDay, predictionResources)
  );
  const paybackChart = buildPaybackChart(projectLabel, selection, lines, predictionResources);
  const breakdownRows = lines.map((line) => buildBreakdownRow(line, predictionResources));
  const summary = buildSummary(lines, predictionResources);
  const cohortMatrix = buildCohortMatrix(lines, horizonDays, predictionResources);

  const confidenceFromSamples =
    totalTrainingPredictions >= BOUNDS_MIN_PREDICTIONS
      ? `${totalTrainingPredictions} notebook-style historical cohort predictions`
      : "Low historical sample count; notebook bounds are wider";

  return {
    summary: {
      ...summary,
      confidence: confidenceFromSamples,
    },
    horizonCharts,
    paybackChart,
    breakdownRows,
    cohortMatrix,
    notes: [
      `Forecast surface for ${projectLabel} now reads live AppMetrica cohorts and real spend mirrors. Synthetic preview rows were removed.`,
      `Notebook curve fit uses cumulative cohort revenue and empirical bounds from historical forecast error samples in the current product runtime.`,
      `Selected revenue mode: ${selection.revenueMode}. Day step: ${filters.granularityDays}d. Visible horizons: ${horizonDays.map((day) => `D${day}`).join(", ")}.`,
      ...notes,
    ],
  };
}

function buildHorizonChart(
  projectLabel: string,
  filters: DashboardFilters,
  selection: ForecastNotebookSelection,
  lines: GroupedLine[],
  horizonDay: number,
  predictionResources: Map<string, LinePredictionResources>
): ComparisonConfidenceChartData {
  return {
    id: `forecast-horizon-${horizonDay}`,
    title: `ROAS by cohort date · D${horizonDay}`,
    subtitle: `${projectLabel} · ${selection.revenueMode} · notebook-style cohort-date ROAS using live cohort revenue and spend.`,
    unit: "%",
    historyHorizonDay: horizonDay,
    yAxis: {
      min: 0,
      referenceLines: [{ value: 100, label: "100%", color: "rgba(5, 150, 105, 0.6)", dasharray: "6 4" }],
    },
    groups: lines.map((line, index) => ({
      label: line.label,
      color: GROUP_COLORS[index % GROUP_COLORS.length],
      actualColor: GROUP_COLORS[index % GROUP_COLORS.length],
      series: line.cohorts.map((cohort) => {
        const point = getPredictionPoint(cohort, horizonDay, predictionResources);
        return {
          label: formatLabelDate(cohort.cohortDate),
          value: point.predicted,
          lower: point.lower,
          upper: point.upper,
          actual: point.actual,
        };
      }),
    })),
  };
}

function buildHistoricalForecastChartSnapshot(
  lines: GroupedLine[],
  horizonDay: number,
  cutoffDay: number,
  artifacts: PredictionRuntimeArtifacts,
  boundsCache: Map<number, Map<string, readonly [number, number]>>
): ForecastHistoryChartSnapshot {
  let visiblePointCount = 0;

  return {
    cutoffDay,
    groups: lines.map((line) => ({
      label: line.label,
      series: line.cohorts.map((cohort) => {
        const point = getHistoricalPredictionPoint(
          cohort,
          horizonDay,
          cutoffDay,
          artifacts,
          boundsCache
        );

        if (point.predicted != null) {
          visiblePointCount += 1;
        }

        return {
          label: formatLabelDate(cohort.cohortDate),
          value: point.predicted,
          lower: point.lower,
          upper: point.upper,
          actual: point.actual,
        };
      }),
    })),
    visiblePointCount,
  };
}

function buildPaybackChart(
  projectLabel: string,
  selection: ForecastNotebookSelection,
  lines: GroupedLine[],
  predictionResources: Map<string, LinePredictionResources>
): ComparisonConfidenceChartData {
  return {
    id: "forecast-payback-curve",
    title: `Payback curve by lifetime day · ${selection.revenueMode}`,
    subtitle: `${projectLabel} · cumulative ROAS trajectory aggregated from the same live cohorts used for the date charts. Hide lines in the legend to rescale around the buckets you want to inspect.`,
    unit: "%",
    yAxis: {
      min: 0,
      referenceLines: [{ value: 100, label: "100%", color: "rgba(5, 150, 105, 0.6)", dasharray: "6 4" }],
    },
    groups: lines.map((line, index) => ({
      label: line.label,
      color: GROUP_COLORS[index % GROUP_COLORS.length],
      actualColor: GROUP_COLORS[index % GROUP_COLORS.length],
      series: PAYBACK_CURVE_POINTS_WITH_ZERO.map((dayPoint) => {
        const aggregate = aggregatePaybackPoint(line.cohorts, dayPoint, predictionResources);
        return {
          label: `D${dayPoint}`,
          value: aggregate.predicted,
          lower: aggregate.lower,
          upper: aggregate.upper,
          actual: aggregate.actual,
        };
      }),
    })),
  };
}

function buildBreakdownRow(
  line: GroupedLine,
  predictionResources: Map<string, LinePredictionResources>
): AcquisitionBreakdownRow {
  const spend = line.cohorts.reduce((sum, cohort) => sum + cohort.spend, 0);
  const installs = line.cohorts.reduce((sum, cohort) => sum + cohort.cohortSize, 0);
  const d30 = aggregatePaybackPoint(line.cohorts, 30, predictionResources);
  const d60 = aggregatePaybackPoint(line.cohorts, 60, predictionResources);
  const d120 = aggregatePaybackPoint(line.cohorts, 120, predictionResources);
  const resource = predictionResources.get(line.value);

  return {
    label: line.label,
    dimension: "none",
    platform: "Mixed",
    spend: Number(spend.toFixed(0)),
    installs: Number(installs.toFixed(0)),
    cohorts: line.cohorts.filter((cohort) => cohort.cohortSize > 0).length,
    cpi: installs > 0 ? Number((spend / installs).toFixed(2)) : 0,
    revenuePerUser:
      installs > 0
        ? Number((((resolvePointValue(d120) ?? 0) / 100) * spend / installs).toFixed(2))
        : 0,
    d30Roas: Number((resolvePointValue(d30) ?? 0).toFixed(1)),
    d60Roas: Number((resolvePointValue(d60) ?? 0).toFixed(1)),
    d120Roas: Number((resolvePointValue(d120) ?? 0).toFixed(1)),
    d7Retention: 0,
    d30Retention: 0,
    sessionMinutes: 0,
    adShare: 0,
    paybackDays: inferPaybackDayFromCurve(line.cohorts, predictionResources),
    confidence:
      (resource?.trainingPredictionCount ?? 0) >= BOUNDS_MIN_PREDICTIONS
        ? "Empirical bounds"
        : "Low sample",
  };
}

function buildSummary(
  lines: GroupedLine[],
  predictionResources: Map<string, LinePredictionResources>
) {
  const allCohorts = lines.flatMap((line) => line.cohorts);
  const spend = allCohorts.reduce((sum, cohort) => sum + cohort.spend, 0);
  const installs = allCohorts.reduce((sum, cohort) => sum + cohort.cohortSize, 0);
  const d30 = aggregatePaybackPoint(allCohorts, 30, predictionResources);
  const d60 = aggregatePaybackPoint(allCohorts, 60, predictionResources);
  const d120 = aggregatePaybackPoint(allCohorts, 120, predictionResources);

  return {
    spend: Number(spend.toFixed(0)),
    installs: Number(installs.toFixed(0)),
    cpi: installs > 0 ? Number((spend / installs).toFixed(2)) : 0,
    d30Roas: Number((resolvePointValue(d30) ?? 0).toFixed(1)),
    d60Roas: Number((resolvePointValue(d60) ?? 0).toFixed(1)),
    d120Roas: Number((resolvePointValue(d120) ?? 0).toFixed(1)),
    paybackDays: inferPaybackDayFromCurve(allCohorts, predictionResources),
    cohortCount: allCohorts.filter((cohort) => cohort.cohortSize > 0).length,
    confidence: "",
  };
}

function buildCohortMatrix(
  lines: GroupedLine[],
  horizons: readonly number[],
  predictionResources: Map<string, LinePredictionResources>
): CohortMatrixRow[] {
  const selectedLine = lines[0];
  if (!selectedLine) {
    return [];
  }

  return selectedLine.cohorts.map((cohort) => ({
    cohortDate: cohort.cohortDate,
    spend: Number(cohort.spend.toFixed(0)),
    installs: Number(cohort.cohortSize.toFixed(0)),
    cpi: cohort.cohortSize > 0 ? Number((cohort.spend / cohort.cohortSize).toFixed(2)) : 0,
    cells: horizons.map((horizon) => {
      const point = getPredictionPoint(cohort, horizon, predictionResources);
      return {
        label: `D${horizon}`,
        value: point.predicted,
        lower: point.lower,
        upper: point.upper,
        actual: point.actual,
      };
    }),
  }));
}

function getHistoricalPredictionPoint(
  cohort: ProcessedCohort,
  horizon: number,
  cutoffDay: number,
  artifacts: PredictionRuntimeArtifacts,
  boundsCache: Map<number, Map<string, readonly [number, number]>>
): AggregatedPoint {
  if (cohort.spend <= 0) {
    const zeroBucket = cohort.cohortSize <= 0 || cohort.cohortNumDays <= 0;
    return {
      predicted: zeroBucket && cohort.cohortLifetime >= cutoffDay ? 0 : null,
      lower: zeroBucket && cohort.cohortLifetime >= cutoffDay ? 0 : null,
      upper: zeroBucket && cohort.cohortLifetime >= cutoffDay ? 0 : null,
      actual: zeroBucket && cohort.cohortLifetime >= horizon ? 0 : null,
    };
  }

  const prediction = predictHistoricalCohort(
    cohort,
    horizon,
    cutoffDay,
    artifacts,
    boundsCache
  );

  return toRoasPoint(cohort, prediction);
}

function getPredictionPoint(
  cohort: ProcessedCohort,
  horizon: number,
  predictionResources: Map<string, LinePredictionResources>
): AggregatedPoint {
  if (cohort.spend <= 0) {
    const zeroBucket = cohort.cohortSize <= 0 || cohort.cohortNumDays <= 0;
    return {
      predicted: zeroBucket ? 0 : null,
      lower: zeroBucket ? 0 : null,
      upper: zeroBucket ? 0 : null,
      actual: zeroBucket && cohort.cohortLifetime >= horizon ? 0 : null,
    };
  }

  const prediction = predictCohort(cohort, horizon, predictionResources);
  return toRoasPoint(cohort, prediction);
}

function toRoasPoint(cohort: ProcessedCohort, prediction: PredictedPoint): AggregatedPoint {
  const actualRoas =
    prediction.actual == null
      ? null
      : Number(((prediction.actual / cohort.spend) * 100).toFixed(2));
  if (
    prediction.predictedRevenue == null ||
    prediction.lowerRevenue == null ||
    prediction.upperRevenue == null
  ) {
    return {
      predicted: null,
      lower: null,
      upper: null,
      actual: actualRoas,
    };
  }
  return {
    predicted: Number(((prediction.predictedRevenue / cohort.spend) * 100).toFixed(2)),
    lower: Number((prediction.lowerRevenue / cohort.spend * 100).toFixed(2)),
    upper: Number((prediction.upperRevenue / cohort.spend * 100).toFixed(2)),
    actual: actualRoas,
  };
}

function aggregatePaybackPoint(
  cohorts: ProcessedCohort[],
  horizon: number,
  predictionResources: Map<string, LinePredictionResources>
) {
  const totalSpend = cohorts.reduce((sum, cohort) => sum + cohort.spend, 0);
  if (totalSpend <= 0) {
    return { predicted: 0, lower: 0, upper: 0, actual: null };
  }

  let predictedRevenue = 0;
  let lowerRevenue = 0;
  let upperRevenue = 0;
  let predictedSpend = 0;
  let actualRevenue = 0;
  let actualSpend = 0;

  for (const cohort of cohorts) {
    const point = resolvePaybackContribution(cohort, horizon, predictionResources);
    if (!point) {
      continue;
    }

    predictedRevenue += point.predictedRevenue;
    lowerRevenue += point.lowerRevenue;
    upperRevenue += point.upperRevenue;
    predictedSpend += cohort.spend;

    if (point.actualRevenue != null) {
      actualRevenue += point.actualRevenue;
      actualSpend += cohort.spend;
    }
  }

  return {
    predicted: predictedSpend > 0 ? Number(((predictedRevenue / predictedSpend) * 100).toFixed(2)) : null,
    lower: predictedSpend > 0 ? Number(((lowerRevenue / predictedSpend) * 100).toFixed(2)) : null,
    upper: predictedSpend > 0 ? Number(((upperRevenue / predictedSpend) * 100).toFixed(2)) : null,
    actual: actualSpend > 0 ? Number(((actualRevenue / actualSpend) * 100).toFixed(2)) : null,
  };
}

function resolvePaybackContribution(
  cohort: ProcessedCohort,
  horizon: number,
  predictionResources: Map<string, LinePredictionResources>
) {
  const exact = toPaybackContribution(predictCohort(cohort, horizon, predictionResources), true);
  const fallback = findPreviousPaybackContribution(cohort, horizon, predictionResources);

  if (!exact) {
    return fallback;
  }

  if (!fallback) {
    return exact;
  }

  return {
    predictedRevenue: Math.max(exact.predictedRevenue, fallback.predictedRevenue),
    lowerRevenue: Math.max(exact.lowerRevenue, fallback.lowerRevenue),
    upperRevenue: Math.max(exact.upperRevenue, fallback.upperRevenue),
    actualRevenue: exact.actualRevenue,
  };
}

function findPreviousPaybackContribution(
  cohort: ProcessedCohort,
  horizon: number,
  predictionResources: Map<string, LinePredictionResources>
) {
  for (const day of [...PAYBACK_CURVE_POINTS_WITH_ZERO].filter((value) => value < horizon).sort((left, right) => right - left)) {
    const contribution = toPaybackContribution(predictCohort(cohort, day, predictionResources), false);
    if (contribution) {
      return contribution;
    }
  }

  return null;
}

function toPaybackContribution(point: PredictedPoint, includeActualRevenue: boolean) {
  if (point.predictedRevenue == null || point.lowerRevenue == null || point.upperRevenue == null) {
    if (point.actual != null) {
      return {
        predictedRevenue: point.actual,
        lowerRevenue: point.actual,
        upperRevenue: point.actual,
        actualRevenue: includeActualRevenue ? point.actual : null,
      };
    }
    return null;
  }

  return {
    predictedRevenue: point.predictedRevenue,
    lowerRevenue: point.lowerRevenue,
    upperRevenue: point.upperRevenue,
    actualRevenue: includeActualRevenue ? point.actual : null,
  };
}

function predictCohort(
  cohort: ProcessedCohort,
  horizon: number,
  predictionResources: Map<string, LinePredictionResources>
) {
  const resource = predictionResources.get(cohort.groupValue);
  if (!resource) {
    return {
      predictedRevenue: null,
      lowerRevenue: null,
      upperRevenue: null,
      actual: null,
    };
  }

  const cached = resource.predictionsByCohortDate.get(cohort.cohortDate)?.points.get(horizon);
  if (!cached) {
    return {
      predictedRevenue: null,
      lowerRevenue: null,
      upperRevenue: null,
      actual: null,
    };
  }

  return cached;
}

function predictHistoricalCohort(
  cohort: ProcessedCohort,
  horizon: number,
  cutoffDay: number,
  artifacts: PredictionRuntimeArtifacts,
  boundsCache: Map<number, Map<string, readonly [number, number]>>
): PredictedPoint {
  const actual =
    cohort.cohortLifetime >= horizon && cohort.totalRevenue[horizon] != null
      ? cohort.totalRevenue[horizon] ?? 0
      : null;

  if (cutoffDay >= horizon || cohort.cohortLifetime < cutoffDay) {
    return {
      predictedRevenue: null,
      lowerRevenue: null,
      upperRevenue: null,
      actual,
    };
  }

  if (cohort.cohortSize <= 0 || cohort.cohortNumDays <= 0) {
    return {
      predictedRevenue: 0,
      lowerRevenue: 0,
      upperRevenue: 0,
      actual,
    };
  }

  if (cohort.isCorrupted !== 0) {
    return {
      predictedRevenue: null,
      lowerRevenue: null,
      upperRevenue: null,
      actual,
    };
  }

  const predictedCurve = getUsableEstimatedCurve(
    artifacts.estimatedCurves.get(`train:${cohort.groupValue}:${cohort.cohortDate}:${cutoffDay}`) ??
      estimateCurveFallback(cohort.totalRevenue, cutoffDay, artifacts.maxRequiredHorizon)
  );
  const predictedRevenue =
    predictedCurve && horizon < predictedCurve.length ? (predictedCurve[horizon] ?? null) : null;
  const bounds =
    predictedRevenue == null
      ? null
      : getNotebookBounds(
          boundsCache,
          artifacts.trainingRecords,
          cohort.cohortSize,
          cutoffDay,
          horizon,
          artifacts.maxRequiredHorizon,
          artifacts.historyDays,
          artifacts.predictionPeriods,
          artifacts.notebookArtifactBounds,
          { allowLiveFallback: false }
        );

  const lowerRevenue =
    predictedRevenue == null || bounds == null
      ? null
      : Math.max(0, predictedRevenue + (predictedRevenue * bounds[0]) / 100);
  const upperRevenue =
    predictedRevenue == null || bounds == null
      ? null
      : Math.max(lowerRevenue ?? 0, predictedRevenue + (predictedRevenue * bounds[1]) / 100);

  return {
    predictedRevenue,
    lowerRevenue,
    upperRevenue,
    actual,
  };
}

function calculateRevenueRatios(cohorts: RawCohortRecord[]) {
  const ratios12: number[] = [];
  const ratios13: number[] = [];

  for (const cohort of cohorts) {
    const day1 = cohort.dailyRevenue.get(0);
    const day2 = cohort.dailyRevenue.get(1);
    const day3 = cohort.dailyRevenue.get(2);
    if (day1 != null && day2 != null) {
      ratios12.push(day2 / day1);
    }
    if (day1 != null && day3 != null) {
      ratios13.push(day3 / day1);
    }
  }

  return {
    d1d2: safeRatioAggregate(ratios12),
    d1d3: safeRatioAggregate(ratios13),
  };
}

function repairCohortRevenue(
  cohort: RawCohortRecord,
  corruptedDays: Set<string>,
  todayIso: string,
  ratios: { d1d2: number; d1d3: number }
): RepairedRevenueSeries {
  const lifetime = Math.max(0, dayDiff(cohort.cohortDate, todayIso));
  const revenue = new Array(lifetime + 1).fill(0).map((_, day) => {
    const date = addDays(cohort.cohortDate, day);
    return corruptedDays.has(date) ? Number.NaN : cohort.dailyRevenue.get(day) ?? 0;
  });

  let repairedDailyCorrupted = 0;
  if (revenue.every((value) => Number.isNaN(value))) {
    repairedDailyCorrupted = 1;
    return {
      daily: revenue.map(() => 0),
      isCorrupted: repairedDailyCorrupted,
    };
  }

  if (revenue.length > 3) {
    if (Number.isNaN(revenue[0]) && Number.isNaN(revenue[1]) && !Number.isNaN(revenue[2])) {
      revenue[0] = revenue[2] / (ratios.d1d3 || 1);
      revenue[1] = (revenue[2] / (ratios.d1d3 || 1)) * (ratios.d1d2 || 1);
    } else if (Number.isNaN(revenue[0]) && !Number.isNaN(revenue[1])) {
      revenue[0] = revenue[1] / (ratios.d1d2 || 1);
    } else if (Number.isNaN(revenue[1]) && !Number.isNaN(revenue[0])) {
      revenue[1] = revenue[0] * (ratios.d1d2 || 1);
    }

    interpolateInPlace(revenue);
  } else if (revenue.some((value) => Number.isNaN(value))) {
    repairedDailyCorrupted = 1;
  }

  return {
    daily: revenue.map((value) => (Number.isNaN(value) ? 0 : value)),
    isCorrupted: repairedDailyCorrupted,
  };
}

function estimateCurvesWithNotebook(tasks: CurveEstimateTask[]) {
  const output = new Map<string, number[] | null>();
  if (tasks.length === 0) {
    return output;
  }

  const scriptPath = join(process.cwd(), "scripts", "notebook_estimate_curve.py");
  const pythonBin = resolveNotebookPythonBin();

  try {
    const result = spawnSync(pythonBin, [scriptPath], {
      input: JSON.stringify({ tasks }),
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 64,
      env: buildNotebookPythonEnv(),
    });

    if (result.status !== 0) {
      throw new Error(result.stderr?.trim() || result.stdout?.trim() || `python exited with ${result.status}`);
    }

    const parsed = JSON.parse(result.stdout || "{}") as {
      curves?: Record<string, number[] | null>;
    };
    for (const task of tasks) {
      output.set(task.id, parsed.curves?.[task.id] ?? null);
    }
    return output;
  } catch (error) {
    const issue = error instanceof Error ? error.message : "Unknown notebook estimation error";
    console.warn(`[forecast-notebook] notebook curve estimation fallback: ${issue}`);

    for (const task of tasks) {
      output.set(task.id, estimateCurveFallback(task.totalRevenue, task.cutoff, task.horizon));
    }
    return output;
  }
}

function estimateCurveFallback(totalRevenue: number[], cutoff: number, horizon: number) {
  if (cutoff < NOTEBOOK_HISTORY_MIN_DAY || totalRevenue.length < cutoff) {
    return null;
  }

  const observed = totalRevenue.slice(0, cutoff);
  if (observed.length < NOTEBOOK_HISTORY_MIN_DAY) {
    return null;
  }
  if ((observed[0] ?? 0) === 0) {
    return new Array(horizon + 1).fill(0);
  }

  const x = observed.map((_, index) => index + 1);
  const y = observed[0] > 0 ? observed.map((value) => value / observed[0]) : [...observed];
  const weights = x.map((value, index) => {
    const maxValue = Math.max(x[x.length - 1] ?? 15, 15);
    const base = 0.58 + 1.42 * (((maxValue - x[x.length - 1 - index] + 1) / maxValue) ** 2);
    return index === 0 ? 0 : base;
  });

  let bestA = 1;
  let bestB = 0.2;
  let bestC = -0.01;
  let bestScore = Number.POSITIVE_INFINITY;
  let bStart = 0;
  let bEnd = 3;
  let cStart = -3;
  let cEnd = 0;

  for (const refinementStep of [0.2, 0.05, 0.01]) {
    for (let b = bStart; b <= bEnd + 1e-9; b += refinementStep) {
      for (let c = cStart; c <= cEnd + 1e-9; c += refinementStep) {
        const base = x.map((value) => value ** (b * value ** c));
        const ratios = base.map((value, index) => (value === 0 ? 0 : y[index]! / value));
        const a = weightedMedian(
          ratios.filter((value) => Number.isFinite(value)),
          ratios
            .map((value, index) => (Number.isFinite(value) ? Math.max(base[index] * (weights[index] ?? 1), 1e-9) : 0))
            .filter((weight) => weight > 0)
        );

        const score = base.reduce((sum, value, index) => {
          const predicted = a * value;
          return sum + Math.abs(predicted - (y[index] ?? 0)) * (weights[index] ?? 1);
        }, 0);

        if (score < bestScore) {
          bestScore = score;
          bestA = a;
          bestB = b;
          bestC = c;
        }
      }
    }

    bStart = clamp(bestB - refinementStep, 0, 3);
    bEnd = clamp(bestB + refinementStep, 0, 3);
    cStart = clamp(bestC - refinementStep, -3, 0);
    cEnd = clamp(bestC + refinementStep, -3, 0);
  }

  const curve = Array.from({ length: horizon + 1 }, (_, index) => {
    const value = index + 1;
    const base = value ** (bestB * value ** bestC);
    return bestA * base * (observed[0] ?? 0);
  });
  return curve;
}

function getUsableEstimatedCurve(curve: number[] | null | undefined) {
  if (!curve) {
    return null;
  }

  const normalized = [...curve];
  if (normalized.length >= 2 && normalized[normalized.length - 1]! < normalized[normalized.length - 2]!) {
    straightenPrediction(normalized);
  }

  if (isExplodingCurve(normalized)) {
    return null;
  }

  enforceNonDecreasingCurve(normalized);
  return normalized;
}

function isExplodingCurve(curve: number[]) {
  if (curve.length < 3) {
    return false;
  }
  const middle = curve[Math.floor(curve.length / 2)] ?? 0;
  const last = curve[curve.length - 1] ?? 0;
  return middle > 0 && last / middle > 2;
}

function straightenPrediction(curve: number[]) {
  let maxIndex = 0;
  for (let index = 1; index < curve.length; index += 1) {
    if ((curve[index] ?? 0) > (curve[maxIndex] ?? 0)) {
      maxIndex = index;
    }
  }
  for (let index = maxIndex; index < curve.length; index += 1) {
    curve[index] = curve[maxIndex] ?? curve[index] ?? 0;
  }
}

function enforceNonDecreasingCurve(curve: number[]) {
  let floor = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < curve.length; index += 1) {
    const value = curve[index] ?? 0;
    floor = Math.max(floor, value);
    curve[index] = floor;
  }
}

function selectSpendAllocationCandidates(
  records: RawCohortRecord[],
  input: {
    cohortDate: string;
    source: string;
    country: string;
    store: string;
    company: string;
    campaign: string;
    campaignName: string;
    creative: string;
    creativeName: string;
  }
) {
  const base = records.filter(
    (record) =>
      record.cohortDate === input.cohortDate &&
      record.source === input.source &&
      record.company === input.company
  );
  if (base.length === 0) {
    return [];
  }

  const tiers = buildSpendMatchTiers(input);
  for (const tier of tiers) {
    const matched = base.filter((record) => {
      if (tier.country && record.country !== input.country) {
        return false;
      }
      if (tier.store && record.store !== input.store) {
        return false;
      }
      if (
        tier.campaign &&
        !matchesComparableSpendDimension(record.campaign, input.campaign, input.campaignName)
      ) {
        return false;
      }
      if (
        tier.creative &&
        !matchesComparableSpendDimension(record.creative, input.creative, input.creativeName)
      ) {
        return false;
      }
      return true;
    });

    if (matched.length === 0) {
      continue;
    }

    const cohortsWithUsers = matched.filter((record) => record.cohortSize > 0);
    return cohortsWithUsers.length > 0 ? cohortsWithUsers : matched;
  }

  if (isSpecificSpendDimension(input.campaign)) {
    const fallback = base.filter((record) => {
      if (isSpecificSpendDimension(input.country) && record.country !== input.country) {
        return false;
      }
      if (isSpecificSpendDimension(input.store) && record.store !== input.store) {
        return false;
      }

      return isNonAttributableCampaignValue(record.campaign);
    });

    if (fallback.length > 0) {
      const cohortsWithUsers = fallback.filter((record) => record.cohortSize > 0);
      return cohortsWithUsers.length > 0 ? cohortsWithUsers : fallback;
    }
  }

  return [];
}

function spendRowMatchesSelection(
  row: MirrorSpendRow,
  platform: DashboardPlatformKey,
  selection: ForecastNotebookSelection
) {
  const country = row.country ?? "UNKNOWN";
  const source = row.source ?? "unknown";
  const company = row.company ?? "Unknown";
  const campaign = row.campaign_id ?? "unknown";
  const campaignName = row.campaign_name ?? "unknown";
  const creative = row.creative_id ?? "unknown";
  const creativeName = row.creative_name ?? "unknown";
  const store = row.store ?? "unknown";

  if (platform === "android" && store !== "google") {
    return false;
  }
  if (platform === "ios" && store !== "apple") {
    return false;
  }
  if (selection.country !== "all" && country !== selection.country) {
    return false;
  }
  if (selection.source !== "all" && source !== selection.source) {
    return false;
  }
  if (selection.company !== "all" && company !== selection.company) {
    return false;
  }
  if (
    selection.campaign !== "all" &&
    !matchesComparableSpendDimension(selection.campaign, campaign, campaignName)
  ) {
    return false;
  }
  if (
    selection.creative !== "all" &&
    !matchesComparableSpendDimension(selection.creative, creative, creativeName)
  ) {
    return false;
  }

  return true;
}

function summarizeSpendDebugDimension(
  rows: MirrorSpendRow[],
  getValue: (row: MirrorSpendRow) => string
) {
  const aggregates = new Map<string, { spend: number; rows: number }>();
  for (const row of rows) {
    const key = getValue(row);
    const current = aggregates.get(key) ?? { spend: 0, rows: 0 };
    current.spend += Number(row.spend ?? 0);
    current.rows += 1;
    aggregates.set(key, current);
  }

  return Array.from(aggregates.entries())
    .map(([value, aggregate]) => ({
      value,
      spend: roundDebugMetric(aggregate.spend),
      rows: aggregate.rows,
    }))
    .sort((left, right) => right.spend - left.spend || right.rows - left.rows)
    .slice(0, 12);
}

function roundDebugMetric(value: number) {
  return Number(value.toFixed(2));
}

function buildSpendMatchTiers(input: {
  cohortDate: string;
  source: string;
  country: string;
  store: string;
  company: string;
  campaign: string;
  creative: string;
}) {
  const hasCountry = isSpecificSpendDimension(input.country);
  const hasStore = isSpecificSpendDimension(input.store);
  const hasCampaign = isSpecificSpendDimension(input.campaign);
  const hasCreative = isSpecificSpendDimension(input.creative);
  const signatures = new Set<string>();
  const tiers: Array<{
    country: boolean;
    store: boolean;
    campaign: boolean;
    creative: boolean;
  }> = [];

  const register = (tier: {
    country: boolean;
    store: boolean;
    campaign: boolean;
    creative: boolean;
  }) => {
    const signature = `${tier.country}:${tier.store}:${tier.campaign}:${tier.creative}`;
    if (signatures.has(signature)) {
      return;
    }
    signatures.add(signature);
    tiers.push(tier);
  };

  register({
    country: hasCountry,
    store: hasStore,
    campaign: hasCampaign,
    creative: hasCampaign && hasCreative,
  });
  register({
    country: hasCountry,
    store: hasStore,
    campaign: hasCampaign,
    creative: false,
  });

  // Do not let spend rows with an explicit campaign spill into a broader
  // country/store bucket when AppMetrica campaign parsing does not match.
  if (!hasCampaign) {
    register({
      country: hasCountry,
      store: hasStore,
      campaign: false,
      creative: false,
    });
  }

  return tiers;
}

function normalizeComparableSpendDimensionValue(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length === 0) {
    return "";
  }

  const withSpaces = trimmed.replace(/\+/g, " ");
  const decoded = safelyDecodeComparableSpendValue(withSpaces);

  return decoded.trim().toLowerCase();
}

function safelyDecodeComparableSpendValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function matchesComparableSpendDimension(
  recordValue: string | null | undefined,
  ...candidateValues: Array<string | null | undefined>
) {
  const normalizedRecord = normalizeComparableSpendDimensionValue(recordValue);
  if (!normalizedRecord) {
    return false;
  }

  return candidateValues.some((candidateValue) => {
    const normalizedCandidate = normalizeComparableSpendDimensionValue(candidateValue);
    return normalizedCandidate.length > 0 && normalizedCandidate === normalizedRecord;
  });
}

function isNonAttributableCampaignValue(value: string | null | undefined) {
  const normalized = normalizeComparableSpendDimensionValue(value);

  return (
    normalized.length === 0 ||
    normalized === "unknown" ||
    normalized === "*" ||
    /^[0-9]{1,8}$/.test(normalized)
  );
}

function isSpecificSpendDimension(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized !== "" && normalized !== "unknown" && normalized !== "*";
}

function ensureRawCohort(
  map: Map<string, RawCohortRecord>,
  input: {
    cohortDate: string;
    groupValue: string;
    country: string;
    source: string;
    company: string;
    campaign: string;
    creative: string;
    store: string;
  }
) {
  const key = [
    input.cohortDate,
    input.groupValue,
    input.country,
    input.source,
    input.company,
    input.campaign,
    input.creative,
    input.store,
  ].join("|");

  const current = map.get(key);
  if (current) {
    return current;
  }

  const next: RawCohortRecord = {
    cohortDate: input.cohortDate,
    groupValue: input.groupValue,
    country: input.country,
    source: input.source,
    company: input.company,
    campaign: input.campaign,
    creative: input.creative,
    store: input.store,
    cohortSize: 0,
    spend: 0,
    installs: 0,
    dailyRevenue: new Map<number, number>(),
  };
  map.set(key, next);
  return next;
}

function resolveGroupValue(
  groupBy: DashboardGroupByKey,
  row: {
    platform: string;
    country: string;
    source: string;
    company: string;
    campaign: string;
    creative: string;
  }
) {
  switch (groupBy) {
    case "platform":
      return row.platform;
    case "country":
      return row.country;
    case "source":
      return row.source;
    case "company":
      return row.company;
    case "campaign":
      return row.campaign;
    case "creative":
      return row.creative;
    default:
      return "selected_scope";
  }
}

function buildOptions<T extends keyof { [key: string]: string }>(
  rows: Array<Record<T, string> & { count: number }>,
  key: T,
  allLabel: string,
  formatter: (value: string) => string
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row[key], (counts.get(row[key]) ?? 0) + row.count);
  }

  const options = Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: formatter(value),
      count,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.label.localeCompare(right.label);
    });

  return [
    { value: "all", label: allLabel, count: options.reduce((sum, option) => sum + option.count, 0) },
    ...options,
  ] satisfies SliceOption[];
}

function buildEmptyCatalog(): ForecastNotebookCatalog {
  return {
    countries: [{ value: "all", label: "All countries", count: 0 }],
    sources: [{ value: "all", label: "All traffic sources", count: 0 }],
    companies: [{ value: "all", label: "All companies", count: 0 }],
    campaigns: [{ value: "all", label: "All campaigns", count: 0 }],
    creatives: [{ value: "all", label: "All creatives", count: 0 }],
  };
}

function buildEmptyData(note: string): ForecastNotebookData {
  return {
    summary: {
      spend: 0,
      installs: 0,
      cpi: 0,
      d30Roas: 0,
      d60Roas: 0,
      d120Roas: 0,
      paybackDays: 0,
      cohortCount: 0,
      confidence: "No live cohort data",
    },
    horizonCharts: [],
    paybackChart: {
      id: "forecast-payback-curve",
      title: "Payback curve by lifetime day",
      subtitle: note,
      unit: "%",
      groups: [],
      yAxis: {
        min: 0,
        referenceLines: [{ value: 100, label: "100%", color: "rgba(5, 150, 105, 0.6)", dasharray: "6 4" }],
      },
    },
    breakdownRows: [],
    cohortMatrix: [],
    notes: [note],
  };
}

function buildIdleData(note: string): ForecastNotebookData {
  return {
    ...buildEmptyData(note),
    summary: {
      spend: 0,
      installs: 0,
      cpi: 0,
      d30Roas: 0,
      d60Roas: 0,
      d120Roas: 0,
      paybackDays: 0,
      cohortCount: 0,
      confidence: "Waiting for explicit load",
    },
    notes: [
      note,
      "Changing top-level project, range, platform, or day-step filters only updates the slice scope now. Live cohort revenue and bounds stay idle until you explicitly load the current settings.",
    ],
  };
}

function buildEmptyDiagnostics(
  contextStatus: ForecastNotebookDiagnostics["contextStatus"],
  errorMessage: string
): ForecastNotebookDiagnostics {
  return {
    contextStatus,
    errorMessage,
    descriptorRowCount: 0,
    selectedDescriptorRowCount: 0,
    cohortSizeRowCount: 0,
    revenueRowCount: 0,
    spendRowCount: 0,
    corruptedDayCount: 0,
    rawCohortCount: 0,
    processedCohortCount: 0,
    visibleLineCount: 0,
    visibleCohortCount: 0,
    emptyReason: errorMessage,
    boundsArtifactFallbackUsed: false,
    boundsArtifactIssue: null,
    boundsArtifactPath: null,
    boundsArtifactSourceStatus: null,
    boundsArtifactSourceLastSyncAt: null,
    boundsArtifactSourceNextSyncAt: null,
    boundsArtifactExpectedSizeCount: 0,
    boundsArtifactLoadedSizeCount: 0,
    boundsArtifactLoadedSizes: [],
    boundsArtifactMissingSizes: [],
    boundsArtifactIssueSamples: [],
    boundsArtifactLoadedChartableCohortCount: 0,
    boundsArtifactLoadedZeroSpendCohortCount: 0,
    boundsArtifactMissingChartableCohortCount: 0,
    boundsArtifactMissingZeroSpendCohortCount: 0,
    boundsCoverage: [],
  };
}

function buildIdleDiagnostics({
  descriptorRowCount,
  selectedDescriptorRowCount,
  spendRowCount,
}: {
  descriptorRowCount: number;
  selectedDescriptorRowCount: number;
  spendRowCount: number;
}): ForecastNotebookDiagnostics {
  return {
    contextStatus: "ready",
    errorMessage: null,
    descriptorRowCount,
    selectedDescriptorRowCount,
    cohortSizeRowCount: 0,
    revenueRowCount: 0,
    spendRowCount,
    corruptedDayCount: 0,
    rawCohortCount: 0,
    processedCohortCount: 0,
    visibleLineCount: 0,
    visibleCohortCount: 0,
    emptyReason: "Forecast data is idle until the current slice is explicitly applied.",
    boundsArtifactFallbackUsed: false,
    boundsArtifactIssue: null,
    boundsArtifactPath: null,
    boundsArtifactSourceStatus: null,
    boundsArtifactSourceLastSyncAt: null,
    boundsArtifactSourceNextSyncAt: null,
    boundsArtifactExpectedSizeCount: 0,
    boundsArtifactLoadedSizeCount: 0,
    boundsArtifactLoadedSizes: [],
    boundsArtifactMissingSizes: [],
    boundsArtifactIssueSamples: [],
    boundsArtifactLoadedChartableCohortCount: 0,
    boundsArtifactLoadedZeroSpendCohortCount: 0,
    boundsArtifactMissingChartableCohortCount: 0,
    boundsArtifactMissingZeroSpendCohortCount: 0,
    boundsCoverage: [],
  };
}

function inferNotebookEmptyReason({
  selectedDescriptorRowCount,
  cohortSizeRowCount,
  revenueRowCount,
  rawCohortCount,
  visibleCohortCount,
  spendRowCount,
}: {
  selectedDescriptorRowCount: number;
  cohortSizeRowCount: number;
  revenueRowCount: number;
  rawCohortCount: number;
  visibleCohortCount: number;
  spendRowCount: number;
}) {
  if (selectedDescriptorRowCount === 0) {
    return "The selected slice has no AppMetrica installs in the current date window.";
  }
  if (cohortSizeRowCount === 0) {
    return "No cohort rows were built for the selected slice. Installs exist, but cohort aggregation returned nothing.";
  }
  if (revenueRowCount === 0) {
    return "Install cohorts exist, but no monetization events matched the current revenue mode and date window.";
  }
  if (rawCohortCount === 0 || visibleCohortCount === 0) {
    return "Live rows were loaded, but nothing survived the cohort processing pipeline for the current slice.";
  }
  if (spendRowCount === 0) {
    return "Revenue cohorts are present, but spend mirrors returned no rows for this window. ROAS stays at 0 where spend is absent.";
  }
  return null;
}

function detectCorruptedDays(rows: EventDayCountRow[], from: string) {
  const countsByDay = new Map<string, number>();
  for (const row of rows) {
    if (row.event_date) {
      countsByDay.set(row.event_date, Number(row.event_count ?? 0));
    }
  }

  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date();
  const counts: Array<{ date: string; count: number }> = [];

  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    counts.push({ date, count: countsByDay.get(date) ?? 0 });
  }

  return counts
    .filter((entry, index) => {
      const window = counts.slice(Math.max(0, index - 2), Math.min(counts.length, index + 3));
      const mean = window.reduce((sum, item) => sum + item.count, 0) / Math.max(1, window.length);
      return entry.count === 0 || entry.count < mean * 0.3;
    })
    .map((entry) => entry.date);
}

function bucketDates(from: string, to: string, stepDays: number) {
  const domain: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + stepDays)) {
    domain.push(cursor.toISOString().slice(0, 10));
  }
  return domain;
}

function alignToBucket(date: string, from: string, stepDays: number) {
  const delta = Math.max(0, dayDiff(from, date));
  const bucketOffset = Math.floor(delta / stepDays) * stepDays;
  return addDays(from, bucketOffset);
}

function dayDiff(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function interpolateInPlace(values: number[]) {
  let leftIndex = -1;
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isNaN(values[index]!)) {
      leftIndex = index;
      continue;
    }

    let rightIndex = index + 1;
    while (rightIndex < values.length && Number.isNaN(values[rightIndex]!)) {
      rightIndex += 1;
    }

    if (leftIndex === -1 && rightIndex >= values.length) {
      values[index] = 0;
    } else if (leftIndex === -1) {
      values[index] = values[rightIndex] ?? 0;
    } else if (rightIndex >= values.length) {
      values[index] = values[leftIndex] ?? 0;
    } else {
      const span = rightIndex - leftIndex;
      const leftValue = values[leftIndex] ?? 0;
      const rightValue = values[rightIndex] ?? leftValue;
      values[index] = leftValue + ((rightValue - leftValue) * (index - leftIndex)) / span;
    }
  }
}

function interpolateSeries(values: number[]) {
  const interpolated = [...values];
  interpolateInPlace(interpolated);
  return interpolated.map((value) => (Number.isNaN(value) ? 0 : value));
}

function extrapolateSeries(values: number[], historyWindow: number, extendBy: number) {
  if (values.length === 0 || extendBy <= 0) {
    return [...values];
  }

  const safeWindow = Math.max(1, Math.min(historyWindow, values.length));
  const fitValues = values.slice(-safeWindow);
  const baseline = fitValues[0] === 0 ? 1 : fitValues[0];
  const normalized = fitValues.map((value) => value / baseline);
  const xValues = rangeInclusive(1, fitValues.length);

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let index = 0; index < xValues.length; index += 1) {
    const x = xValues[index] ?? 0;
    const y = normalized[index] ?? 0;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const n = xValues.length;
  const denominator = (n * sumXX) - (sumX * sumX);
  const slope = denominator === 0 ? 0 : ((n * sumXY) - (sumX * sumY)) / denominator;
  const intercept = n === 0 ? 0 : (sumY - (slope * sumX)) / n;
  const extended = [...values];

  for (let index = 1; index <= extendBy; index += 1) {
    const x = fitValues.length + index;
    extended.push((baseline * ((slope * x) + intercept)) || 0);
  }

  return extended;
}

function rangeInclusive(start: number, end: number) {
  if (end < start) {
    return [] as number[];
  }
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function currentDataCutoffIso() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function safeRatioAggregate(values: number[]) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length >= 3) {
    const mean = filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
    const std = Math.sqrt(filtered.reduce((sum, value) => sum + (value - mean) ** 2, 0) / filtered.length);
    const bounded = filtered.filter((value) => Math.abs(value - mean) < 2 * std);
    return median(bounded.length > 0 ? bounded : filtered);
  }
  if (filtered.length === 1) {
    return filtered[0] ?? 1;
  }
  if (filtered.length === 0) {
    return 1;
  }
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function weightedMedian(values: number[], weights: number[]) {
  if (values.length === 0 || weights.length === 0) {
    return 1;
  }
  const pairs = values.map((value, index) => ({ value, weight: weights[index] ?? 0 })).sort((left, right) => left.value - right.value);
  const totalWeight = pairs.reduce((sum, pair) => sum + pair.weight, 0);
  let running = 0;
  for (const pair of pairs) {
    running += pair.weight;
    if (running >= totalWeight / 2) {
      return pair.value;
    }
  }
  return pairs[pairs.length - 1]?.value ?? 1;
}

function quantile(sortedValues: number[], q: number) {
  if (sortedValues.length === 0) {
    return 0;
  }
  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sortedValues[lower] ?? 0;
  }
  const weight = position - lower;
  return ((sortedValues[lower] ?? 0) * (1 - weight)) + ((sortedValues[upper] ?? 0) * weight);
}

function inferPaybackDayFromCurve(
  cohorts: ProcessedCohort[],
  predictionResources: Map<string, LinePredictionResources>
) {
  for (const day of PAYBACK_CURVE_POINTS) {
    const point = aggregatePaybackPoint(cohorts, day, predictionResources);
    const paybackValue = point.actual ?? point.predicted;
    if (paybackValue != null && paybackValue >= 100) {
      return day;
    }
  }
  return PAYBACK_CURVE_POINTS[PAYBACK_CURVE_POINTS.length - 1] ?? 0;
}

function resolvePointValue(point: AggregatedPoint) {
  return point.actual ?? point.predicted;
}

function formatCountryLabel(value: string) {
  return value === "UNKNOWN" ? "Unknown country" : value;
}

function formatSourceLabel(value: string) {
  if (value === "organic") {
    return "Organic";
  }
  if (value === "google_ads") {
    return "Google Ads";
  }
  return value
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMirrorLabel(value: string) {
  return value === "unknown" ? "Unknown" : value;
}

function formatPlatformLabel(value: string) {
  if (value === "ios") {
    return "iOS";
  }
  if (value === "android") {
    return "Android";
  }
  return value;
}

export const __testables = {
  aggregatePaybackPoint,
  boundsKey,
  buildLinePredictionResources,
  buildBoundsCoverageSummary,
  buildCampaignSql,
  buildRawCohorts,
  buildRevenueJoinConditionSql,
  buildSummary,
  buildSpendMatchTiers,
  buildSourceSql,
  buildBoundsForCohortSize,
  fallbackYoungCohortPrediction,
  getPredictionPoint,
  getNotebookBounds,
  isPlaceholderArtifactBounds,
  normalizeBoundsCohortSize,
  toRoasPoint,
};

function isPlaceholderArtifactBounds(bounds: readonly [number, number]) {
  return (
    Math.abs(bounds[0] - PLACEHOLDER_BOUNDS_PAIR[0]) <= PLACEHOLDER_BOUNDS_EPSILON &&
    Math.abs(bounds[1] - PLACEHOLDER_BOUNDS_PAIR[1]) <= PLACEHOLDER_BOUNDS_EPSILON
  );
}

function formatGroupLabel(groupBy: DashboardGroupByKey, value: string) {
  if (groupBy === "country") {
    return formatCountryLabel(value);
  }
  if (groupBy === "source") {
    return formatSourceLabel(value);
  }
  if (groupBy === "platform") {
    return formatPlatformLabel(value);
  }
  if (groupBy === "none" && value === "selected_scope") {
    return "Selected scope";
  }
  return value;
}

function formatLabelDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function supportedGroupBy(requested: DashboardGroupByKey) {
  const allowed = new Set<DashboardGroupByKey>(["none", "platform", "country", "source", "company", "campaign", "creative"]);
  return allowed.has(requested) ? requested : "none";
}

function cloneBoundsTables(
  source: Map<number, Map<string, readonly [number, number]>>
) {
  return new Map(
    Array.from(source.entries()).map(([cohortSize, table]) => [cohortSize, new Map(table)])
  );
}

function uniqueSortedNumbers(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value) && value > 0))).sort((left, right) => left - right);
}

function uniqueSortedNonNegativeNumbers(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value) && value >= 0))).sort((left, right) => left - right);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function firstExistingCandidate(columns: Set<string>, candidates: string[]) {
  return candidates.find((candidate) => columns.has(candidate)) ?? null;
}

function sanitizeTableIdentifier(value: string) {
  return value.replace(/[^a-zA-Z0-9_]/g, "");
}

function parseMirrorTableDate(tableName: string) {
  const match = tableName.match(/(\d{8})$/);
  return match ? match[1] : null;
}

function toIsoDateFromKey(dateKey: string | null) {
  if (!dateKey || !/^\d{8}$/.test(dateKey)) {
    return null;
  }
  return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
}

function selectMirrorTables(tableNames: string[], from: string, to: string) {
  const fromKey = from.replace(/-/g, "");
  const toKey = to.replace(/-/g, "");
  const datedTables = tableNames
    .map((tableName) => ({
      tableName,
      dateKey: parseMirrorTableDate(tableName),
    }))
    .filter((entry): entry is { tableName: string; dateKey: string } => Boolean(entry.dateKey))
    .filter((entry) => entry.dateKey >= fromKey && entry.dateKey <= toKey)
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));

  if (datedTables.length > 0) {
    return datedTables.map((entry) => entry.tableName);
  }

  return [...tableNames].sort((left, right) => left.localeCompare(right)).slice(-32);
}
