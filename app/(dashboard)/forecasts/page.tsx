import Link from "next/link";
import { ComparisonConfidenceChart } from "@/components/comparison-confidence-chart";
import { CohortMatrixTable } from "@/components/cohort-matrix-table";
import { ForecastCombinationTracker } from "@/components/forecast-combination-tracker";
import { ForecastHistoryChart } from "@/components/forecast-history-chart";
import { ForecastSelectionWorkbench } from "@/components/forecast-selection-workbench";
import { TopFilterRail } from "@/components/top-filter-rail";
import {
  flattenRuns,
  formatDateTime,
  formatRelativeTime,
  runStatusTone,
  scopeBundles,
} from "@/lib/dashboard-live";
import {
  parseAcquisitionSearchParams,
  type RevenueModeKey,
} from "@/lib/data/acquisition";
import {
  buildForecastPipelineSnapshot,
  type ForecastPipelineStage,
} from "@/lib/data/forecast-progress";
import {
  getForecastNotebookSurface,
  buildForecastNotebookTrackingPayload,
} from "@/lib/data/forecast-notebook";
import { normalizeForecastHorizonDays } from "@/lib/data/forecast-horizons";
import {
  getProjectLabel,
  parseDashboardSearchParams,
  serializeDashboardFilters,
  type DashboardGroupByKey,
} from "@/lib/dashboard-filters";
import {
  buildForecastCombinationKey,
  listAnalyticsProjects,
  listForecastCombinations,
} from "@/lib/platform/store";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

function readSingleParam(raw: Record<string, string | string[] | undefined>, key: string) {
  const value = raw[key];
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function readHorizonDaysParam(raw: Record<string, string | string[] | undefined>) {
  const value = raw.horizonDays;
  if (Array.isArray(value)) {
    return normalizeForecastHorizonDays(value);
  }

  return normalizeForecastHorizonDays(value);
}

function getForecastAllowedGroupByKeys(): DashboardGroupByKey[] {
  return ["none", "platform", "country", "source", "company", "campaign", "creative"];
}

const FORECAST_URL_PARAM_KEYS = [
  "revenueMode",
  "country",
  "source",
  "company",
  "campaign",
  "creative",
  "horizonDays",
] as const;
const BOUNDS_COVERAGE_PAGE_SIZE = 12;

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function isRevenueModeKey(value: unknown): value is RevenueModeKey {
  return value === "total" || value === "ads" || value === "iap";
}

function readStoredForecastValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : "all";
}

function hasAppliedForecastSelection(
  raw: Record<string, string | string[] | undefined>
) {
  if (readSingleParam(raw, "forecastView") === "1") {
    return true;
  }

  return FORECAST_URL_PARAM_KEYS.some((key) => readSingleParam(raw, key) !== undefined);
}

function readPositivePageParam(
  raw: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = Number.parseInt(readSingleParam(raw, key) ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function buildSearchParams(
  raw: Record<string, string | string[] | undefined>
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (typeof entry === "string") {
          params.append(key, entry);
        }
      });
      continue;
    }

    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  return params;
}

function buildForecastPageHref(
  raw: Record<string, string | string[] | undefined>,
  updates: Record<string, string | null>
) {
  const params = buildSearchParams(raw);

  for (const [key, value] of Object.entries(updates)) {
    params.delete(key);
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `/forecasts?${query}` : "/forecasts";
}

function isActiveRunStatus(status: string) {
  return (
    status === "queued" ||
    status === "blocked" ||
    status === "running" ||
    status === "waiting_credentials"
  );
}

function deriveHistoricalForecastDraft(
  combination: Awaited<ReturnType<typeof listForecastCombinations>>[number] | null
) {
  if (!combination) {
    return null;
  }

  const filters = combination.filters ?? {};
  const storedHorizonDays =
    Array.isArray(filters.horizonDays) || typeof filters.horizonDays === "string"
      ? filters.horizonDays
      : undefined;
  return {
    selection: {
      revenueMode: isRevenueModeKey(filters.revenueMode) ? filters.revenueMode : "total",
      country: readStoredForecastValue(filters.country),
      source: readStoredForecastValue(filters.source),
      company: readStoredForecastValue(filters.company),
      campaign: readStoredForecastValue(filters.campaign),
      creative: readStoredForecastValue(filters.creative),
    },
    horizonDays: normalizeForecastHorizonDays(storedHorizonDays),
  };
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-950)" }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-ink-500)" }}>{subtitle}</div>
    </div>
  );
}

function InfoCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div style={{ background: "var(--color-panel-base)", padding: "18px 20px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-ink-500)", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--color-ink-500)" }}>{sub}</div>
    </div>
  );
}

function formatRevenueModeLabel(value: RevenueModeKey) {
  if (value === "ads") {
    return "Ads-only";
  }

  if (value === "iap") {
    return "IAP-only";
  }

  return "Total";
}

function sanitizeForecastRunMessage(message: string | null | undefined) {
  const normalized = message?.trim();
  if (!normalized) {
    return "No worker message";
  }

  if (/\bdau\b|\binstalls?\b/i.test(normalized)) {
    return "Legacy run metadata referenced unsupported forecast metrics from an older runtime. The current forecast surface is revenue-only.";
  }

  return normalized;
}

function DiagnosticBanner({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <section
      style={{
        background: "rgba(217, 119, 6, 0.08)",
        border: "1px solid rgba(217, 119, 6, 0.24)",
        borderRadius: 10,
        padding: 18,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#92400e" }}>
        {title}
      </div>
      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, color: "#7c2d12" }}>{body}</div>
    </section>
  );
}

function buildForecastDataDiagnostic({
  selectedProjectLabel,
  cohortCount,
  emptyReason,
  diagnostics,
}: {
  selectedProjectLabel: string;
  cohortCount: number;
  emptyReason: string | null;
  diagnostics: Awaited<ReturnType<typeof getForecastNotebookSurface>>["diagnostics"];
}) {
  if (diagnostics.contextStatus === "missing_credentials") {
    return {
      title: "Why The Page Is Empty",
      body: `${selectedProjectLabel} cannot query BigQuery right now. The project context is missing credentials, so the page has no way to load cohorts, revenue, or spend.`,
    };
  }
  if (diagnostics.contextStatus === "query_failed") {
    return {
      title: "Why The Page Is Empty",
      body: `Forecast live query failed before any chart data could be built. Error: ${diagnostics.errorMessage ?? "Unknown runtime error"}.`,
    };
  }
  if (cohortCount > 0) {
    if (diagnostics.revenueRowCount === 0 && diagnostics.cohortSizeRowCount > 0) {
      return {
        title: "Why Forecast Values Are Missing",
        body: `${selectedProjectLabel} already has install cohorts for this slice, but no live revenue rows matched the same window yet. Installs and spend can still show up while ROAS cells and forecast curves stay blank until AppMetrica revenue events finish loading for the selected dates.`,
      };
    }
    if (diagnostics.spendRowCount === 0 && diagnostics.cohortSizeRowCount > 0) {
      return {
        title: "Why CPI / ROAS Look Incomplete",
        body: `${selectedProjectLabel} already has cohort rows for this slice, but no spend mirror rows matched the same source, campaign, creative, country, and store keys. Forecast cells may remain blank or zero until spend mirrors for the selected slice are available.`,
      };
    }
    return null;
  }
  return {
    title: "Why The Page Is Empty",
    body: emptyReason ?? "The selected slice currently resolves to no visible cohorts.",
  };
}

function buildBoundsArtifactDiagnostic({
  selectedProjectLabel,
  diagnostics,
}: {
  selectedProjectLabel: string;
  diagnostics: Awaited<ReturnType<typeof getForecastNotebookSurface>>["diagnostics"];
}) {
  if (!diagnostics.boundsArtifactFallbackUsed || !diagnostics.boundsArtifactIssue) {
    return null;
  }

  const missingPreview =
    diagnostics.boundsArtifactMissingSizes.length > 0
      ? diagnostics.boundsArtifactMissingSizes.slice(0, 8).join(", ")
      : "unknown";
  const missingSuffix =
    diagnostics.boundsArtifactMissingSizes.length > 8
      ? `, +${diagnostics.boundsArtifactMissingSizes.length - 8} more`
      : "";
  const sourceStatus = diagnostics.boundsArtifactSourceStatus ?? "unknown";
  const lastSync = diagnostics.boundsArtifactSourceLastSyncAt
    ? formatDateTime(new Date(diagnostics.boundsArtifactSourceLastSyncAt))
    : "never";
  const nextSync = diagnostics.boundsArtifactSourceNextSyncAt
    ? formatDateTime(new Date(diagnostics.boundsArtifactSourceNextSyncAt))
    : "not scheduled";
  const issueSamples =
    diagnostics.boundsArtifactIssueSamples.length > 0
      ? ` Sample issues: ${diagnostics.boundsArtifactIssueSamples.join(" | ")}.`
      : "";
  const cohortImpactNote = [
    diagnostics.boundsArtifactMissingChartableCohortCount > 0
      ? `${diagnostics.boundsArtifactMissingChartableCohortCount} spend-positive cohort(s) in the current slice map to missing artifact sizes, so their forecast points stay blank.`
      : null,
    diagnostics.boundsArtifactLoadedChartableCohortCount > 0
      ? `${diagnostics.boundsArtifactLoadedChartableCohortCount} spend-positive cohort(s) still map to loaded artifact sizes and can render bounds.`
      : null,
    diagnostics.boundsArtifactLoadedChartableCohortCount === 0 &&
    diagnostics.boundsArtifactLoadedZeroSpendCohortCount > 0
      ? `Loaded artifact sizes currently exist only on ${diagnostics.boundsArtifactLoadedZeroSpendCohortCount} zero-spend cohort(s), so they do not produce ROAS points on the chart.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title: "Notebook Bounds Are Missing",
    body: `${selectedProjectLabel} could not load notebook artifact bounds for part of this slice, so affected forecast intervals stay blank instead of falling back to synthetic bands. ${diagnostics.boundsArtifactIssue} Expected cohort-size files: ${diagnostics.boundsArtifactExpectedSizeCount}, loaded: ${diagnostics.boundsArtifactLoadedSizeCount}, missing sizes: ${missingPreview}${missingSuffix}. ${cohortImpactNote ? `${cohortImpactNote} ` : ""}Bounds path: ${diagnostics.boundsArtifactPath ?? "not configured"}. Bounds source status: ${sourceStatus}. Last successful artifact sync: ${lastSync}. Next scheduled sync: ${nextSync}. Fix the artifact publication under that GCS prefix and rerun bounds refresh / forecast if this slice must stay 1:1 with the notebook.${issueSamples}`,
  };
}

function formatStageTone(stage: ForecastPipelineStage) {
  switch (stage.status) {
    case "ready":
      return { label: "Ready", color: "var(--color-success)", background: "#dcfce7" };
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

function formatBoundsCoverageSource(source: "artifact" | "live_fallback" | "missing") {
  switch (source) {
    case "artifact":
      return { label: "Artifact", color: "var(--color-success)", background: "#dcfce7" };
    case "live_fallback":
      return { label: "Live-built only", color: "var(--color-signal-blue)", background: "var(--color-signal-blue-surface)" };
    default:
      return { label: "Missing", color: "var(--color-danger)", background: "#fee2e2" };
  }
}

function formatBoundsCoverageRange(minValue: number | null, maxValue: number | null, prefix: string) {
  if (minValue == null || maxValue == null) {
    return "—";
  }
  if (minValue === maxValue) {
    return `${prefix}${minValue}`;
  }
  return `${prefix}${minValue}–${prefix}${maxValue}`;
}

function MethodologyPanel() {
  return (
    <details
      style={{
        background: "var(--color-panel-base)",
        border: "1px solid var(--color-border-soft)",
        borderRadius: 10,
        padding: 18,
      }}
    >
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          listStyle: "none",
          fontSize: 14,
          fontWeight: 600,
          color: "var(--color-ink-950)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 20,
            height: 20,
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--color-panel-soft)",
            border: "1px solid var(--color-border-soft)",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--color-ink-600)",
          }}
        >
          i
        </span>
        Forecast Methodology
      </summary>

      <div style={{ marginTop: 14, display: "grid", gap: 14, fontSize: 12.5, lineHeight: 1.65, color: "var(--color-ink-600)" }}>
        <div>
          <strong style={{ color: "var(--color-ink-950)" }}>Input data:</strong> this page now reads live AppMetrica installs and events plus live spend mirrors. Country, traffic source, company, campaign, and creative filters all apply directly to the cohort set on this page.
        </div>
        <div>
          <strong style={{ color: "var(--color-ink-950)" }}>Curve methodology:</strong> cohorts are aggregated by cohort date and selected slice, corrupted revenue days are repaired before fitting, cumulative cohort revenue is fitted with the same notebook-style decay curve, and already realized horizons collapse to the realized ROAS instead of staying forecast-only.
        </div>
        <div>
          <strong style={{ color: "var(--color-ink-950)" }}>Bounds:</strong> the interval is built from empirical historical forecast errors, not from a generic time-series model. Errors are grouped by cohort size, cutoff day, and horizon; then nearby samples are used to derive lower and upper bounds. Mature cohorts that already reached the chosen horizon collapse to the actual value.
        </div>
        <div>
          <strong style={{ color: "var(--color-ink-950)" }}>Spend logic:</strong> ROAS is calculated only from cohorts that have matched paid spend. If spend is missing for a slice, ROAS stays at `0%` for that cohort instead of inventing CPI or synthetic spend.
        </div>
      </div>
    </details>
  );
}

export default async function ForecastsPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const rawSearchParams = await searchParams;
  const requestedBoundsCoveragePage = readPositivePageParam(rawSearchParams, "boundsPage");
  const filters = parseDashboardSearchParams(rawSearchParams, "/forecasts");
  const localFilters = parseAcquisitionSearchParams(rawSearchParams);
  const bundles = await listAnalyticsProjects();
  const scopedBundles = scopeBundles(bundles, filters.projectKey);
  const selectedBundle = scopedBundles[0] ?? null;
  const selectedProjectLabel = getProjectLabel(filters.projectKey);

  const notebookSelection = {
    revenueMode: localFilters.revenueMode,
    country: readSingleParam(rawSearchParams, "country") ?? "all",
    source: readSingleParam(rawSearchParams, "source") ?? "all",
    company: readSingleParam(rawSearchParams, "company") ?? "all",
    campaign: readSingleParam(rawSearchParams, "campaign") ?? "all",
    creative: readSingleParam(rawSearchParams, "creative") ?? "all",
  };
  const selectedHorizonDays = readHorizonDaysParam(rawSearchParams);
  const hasAppliedSelection = hasAppliedForecastSelection(rawSearchParams);

  if (!selectedBundle) {
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <TopFilterRail title="Forecasts" allowedGroupByKeys={getForecastAllowedGroupByKeys()} />
        <main
          style={{
            padding: 32,
            display: "flex",
            flexDirection: "column",
            gap: 24,
            overflowY: "auto",
            flex: 1,
          }}
        >
          <section
            style={{
              background: "var(--color-panel-base)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              padding: 20,
              fontSize: 13,
              color: "var(--color-ink-500)",
            }}
          >
            {filters.projectKey === "all"
              ? "No live project matched the selected forecast scope. Open Settings and create a project first."
              : `The selected project key "${filters.projectKey}" is not configured in the control plane. Forecasts cannot load until that project exists and has runtime sources attached.`}
          </section>
        </main>
      </div>
    );
  }

  const [manualCombinations, combinations] = await Promise.all([
    listForecastCombinations(selectedBundle.project.id, 20),
    listForecastCombinations(selectedBundle.project.id, 20, { includeSystem: true }),
  ]);
  const showBoundsHistory = selectedBundle.project.boundsIntervalHours > 0;
  const recentRuns = flattenRuns(scopedBundles).filter(({ run }) =>
    run.runType === "forecast" ||
    (run.runType === "bounds_refresh" &&
      (showBoundsHistory || isActiveRunStatus(run.status)))
  );
  const latestHistoricalCombination = manualCombinations[0] ?? combinations[0] ?? null;
  const historicalDraft = deriveHistoricalForecastDraft(latestHistoricalCombination);
  const draftSelection = hasAppliedSelection
    ? notebookSelection
    : historicalDraft?.selection ?? notebookSelection;
  const draftHorizonDays = hasAppliedSelection
    ? selectedHorizonDays
    : historicalDraft?.horizonDays ?? selectedHorizonDays;
  const notebookSurface = await getForecastNotebookSurface({
    bundle: selectedBundle,
    projectLabel: selectedProjectLabel,
    filters,
    selection: draftSelection,
    horizonDays: draftHorizonDays,
    loadData: hasAppliedSelection,
  });
  const notebookData = notebookSurface.data;
  const trackerPayload = hasAppliedSelection
    ? buildForecastNotebookTrackingPayload(
        selectedProjectLabel,
        filters,
        notebookSelection,
        selectedHorizonDays
      )
    : null;
  const combinationKey = trackerPayload
    ? buildForecastCombinationKey(trackerPayload.filters as Record<string, unknown>)
    : null;
  const selectedCombination = combinationKey
    ? combinations.find((entry) => entry.combinationKey === combinationKey) ?? null
    : null;
  const pipelineSnapshot =
    hasAppliedSelection
      ? buildForecastPipelineSnapshot(selectedBundle, selectedCombination)
      : null;
  const forecastDataDiagnostic = hasAppliedSelection
    ? buildForecastDataDiagnostic({
        selectedProjectLabel,
        cohortCount: notebookData.summary.cohortCount,
        emptyReason: notebookSurface.diagnostics.emptyReason,
        diagnostics: notebookSurface.diagnostics,
      })
    : null;
  const boundsArtifactDiagnostic = hasAppliedSelection
    ? buildBoundsArtifactDiagnostic({
        selectedProjectLabel,
        diagnostics: notebookSurface.diagnostics,
      })
    : null;
  const strategy = selectedBundle.project.settings.forecastStrategy ?? null;
  const strategyToggleValue = (enabled: boolean | undefined) => (enabled ? "On" : "Off");
  const boundsCoverageRows = notebookSurface.diagnostics.boundsCoverage;
  const boundsCoveragePageCount = Math.max(
    1,
    Math.ceil(boundsCoverageRows.length / BOUNDS_COVERAGE_PAGE_SIZE)
  );
  const boundsCoveragePage = Math.min(requestedBoundsCoveragePage, boundsCoveragePageCount);
  const boundsCoveragePageStart = (boundsCoveragePage - 1) * BOUNDS_COVERAGE_PAGE_SIZE;
  const visibleBoundsCoverageRows = boundsCoverageRows.slice(
    boundsCoveragePageStart,
    boundsCoveragePageStart + BOUNDS_COVERAGE_PAGE_SIZE
  );
  const historyBaseQuery = hasAppliedSelection
    ? (() => {
        const params = serializeDashboardFilters({
          ...filters,
          projectKey: selectedBundle.project.slug,
        });
        params.set("revenueMode", notebookSelection.revenueMode);
        params.set("country", notebookSelection.country);
        params.set("source", notebookSelection.source);
        params.set("company", notebookSelection.company);
        params.set("campaign", notebookSelection.campaign);
        params.set("creative", notebookSelection.creative);
        return params.toString();
      })()
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Forecasts" allowedGroupByKeys={getForecastAllowedGroupByKeys()} />

      <main
        style={{
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 24,
          overflowY: "auto",
          flex: 1,
          minWidth: 0,
        }}
      >
        {hasAppliedSelection ? (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 1,
              background: "var(--color-border-soft)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <InfoCard label="Selected project" value={selectedProjectLabel} sub="Current forecast slice and control-plane scope" />
            <InfoCard label="Revenue view" value={formatRevenueModeLabel(notebookSelection.revenueMode)} sub="Revenue selection applied directly to live cohort revenue" />
            <InfoCard label="Day step" value={`${filters.granularityDays}d`} sub="Cohort-date bucketing interval used for the charts and matrix" />
            <InfoCard label="D30 ROAS" value={formatPercent(notebookData.summary.d30Roas)} sub="Live cohort-derived D30 ROAS for the current slice" />
            <InfoCard label="D60 ROAS" value={formatPercent(notebookData.summary.d60Roas)} sub="Live cohort-derived D60 ROAS for the current slice" />
            <InfoCard label="D120 ROAS" value={formatPercent(notebookData.summary.d120Roas)} sub="Live cohort-derived D120 ROAS for the current slice" />
            <InfoCard label="Payback" value={`D${notebookData.summary.paybackDays}`} sub="First lifetime day where cumulative ROAS reaches 100%" />
            <InfoCard label="Cohorts in scope" value={notebookData.summary.cohortCount.toString()} sub="Visible cohort-date points after applying the custom day step" />
          </section>
        ) : (
          <DiagnosticBanner
            title="Load Forecast Data Explicitly"
            body={
              latestHistoricalCombination
                ? `The latest saved slice for ${selectedProjectLabel} is preselected: ${latestHistoricalCombination.label}. Click "Display Data For Current Settings" when you actually want this slice to render and, if needed, queue missing forecast stages.`
                : `No forecast slice is loaded yet for ${selectedProjectLabel}. Pick the settings you want and click "Display Data For Current Settings" to render only that slice.`
            }
          />
        )}

        <MethodologyPanel />

        <ForecastSelectionWorkbench
          projectKey={selectedBundle.project.slug}
          appliedSelection={notebookSelection}
          appliedHorizonDays={selectedHorizonDays}
          initialDraftSelection={draftSelection}
          initialDraftHorizonDays={draftHorizonDays}
          hasAppliedSelection={hasAppliedSelection}
          countries={notebookSurface.catalog.countries}
          sources={notebookSurface.catalog.sources}
          companies={notebookSurface.catalog.companies}
          campaigns={notebookSurface.catalog.campaigns}
          creatives={notebookSurface.catalog.creatives}
          notes={notebookData.notes}
          showMirrorFilters={true}
          latestHistoryLabel={latestHistoricalCombination?.label ?? null}
          latestHistoryViewedAt={latestHistoricalCombination?.lastViewedAt.toISOString() ?? null}
        />

        {hasAppliedSelection && trackerPayload && combinationKey && pipelineSnapshot ? (
          <ForecastCombinationTracker
            projectKey={selectedBundle.project.slug}
            combinationKey={combinationKey}
            label={trackerPayload.label}
            sourcePage="forecasts"
            filters={trackerPayload.filters}
            initialSnapshot={pipelineSnapshot}
          />
        ) : null}

        {hasAppliedSelection && forecastDataDiagnostic ? (
          <DiagnosticBanner title={forecastDataDiagnostic.title} body={forecastDataDiagnostic.body} />
        ) : null}

        {hasAppliedSelection && boundsArtifactDiagnostic ? (
          <DiagnosticBanner title={boundsArtifactDiagnostic.title} body={boundsArtifactDiagnostic.body} />
        ) : null}

        {hasAppliedSelection && pipelineSnapshot ? (
          <>
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.15fr 0.85fr",
            gap: 20,
          }}
        >
          <div
            style={{
              background: "var(--color-panel-base)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              padding: 18,
            }}
          >
            <SectionHeader
              title="Live Data Diagnostics"
              subtitle="Counts from the live query path for the exact filters selected on this page."
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              {[
                ["Install descriptors", notebookSurface.diagnostics.descriptorRowCount],
                ["Slice descriptors", notebookSurface.diagnostics.selectedDescriptorRowCount],
                ["Cohort rows", notebookSurface.diagnostics.cohortSizeRowCount],
                ["Revenue rows", notebookSurface.diagnostics.revenueRowCount],
                ["Spend rows", notebookSurface.diagnostics.spendRowCount],
                ["Corrupted days", notebookSurface.diagnostics.corruptedDayCount],
                ["Raw cohorts", notebookSurface.diagnostics.rawCohortCount],
                ["Visible cohorts", notebookSurface.diagnostics.visibleCohortCount],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  style={{
                    border: "1px solid var(--color-border-soft)",
                    borderRadius: 8,
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)" }}>
                    {label}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: "var(--color-ink-950)" }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: "var(--color-panel-base)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 18 }}>
              <SectionHeader
                title="Current Stage Snapshot"
                subtitle="Server-side snapshot for the current slice before client polling updates it."
              />
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Stage", "Status", "Message"].map((column) => (
                    <th
                      key={column}
                      style={{
                        padding: "10px 18px",
                        textAlign: "left",
                        fontSize: 10.5,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--color-ink-500)",
                        background: "var(--color-panel-soft)",
                        borderBottom: "1px solid var(--color-border-soft)",
                      }}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pipelineSnapshot.stages.map((stage, index) => {
                  const tone = formatStageTone(stage);
                  return (
                    <tr
                      key={stage.key}
                      style={{
                        borderBottom:
                          index < pipelineSnapshot.stages.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                      }}
                    >
                      <td style={{ padding: "14px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--color-ink-950)" }}>
                        {stage.label}
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: tone.background,
                            color: tone.color,
                            fontSize: 11.5,
                            fontWeight: 600,
                          }}
                        >
                          {tone.label}
                        </span>
                      </td>
                      <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                        {stage.message}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <ComparisonConfidenceChart chart={notebookData.paybackChart} />

        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <SectionHeader
            title="Forecast curves by cohort date"
            subtitle="Notebook-style forecast curves for the selected slice, split by horizon and plotted against cohort dates."
          />

          {notebookData.horizonCharts.length > 0 ? (
            notebookData.horizonCharts.map((chart) => (
              <ForecastHistoryChart
                key={chart.id}
                chart={chart}
                projectKey={selectedBundle.project.slug}
                historyBaseQuery={historyBaseQuery ?? ""}
              />
            ))
          ) : (
            <div style={{ fontSize: 12.5, color: "var(--color-ink-500)" }}>
              No cohort-date forecast charts are available for the current slice yet.
            </div>
          )}
        </section>

        <section
          style={{
            background: "var(--color-panel-base)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 18 }}>
            <SectionHeader
              title="Grouped ROAS"
              subtitle={
                filters.groupBy === "none"
                  ? "Current live slice summarized without additional grouping."
                  : `Current live cohort metrics grouped by ${filters.groupBy}.`
              }
            />
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Slice", "Spend", "Installs", "D30", "D60", "D120", "Payback"].map((column) => (
                  <th
                    key={column}
                    style={{
                      padding: "10px 18px",
                      textAlign: "left",
                      fontSize: 10.5,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--color-ink-500)",
                      background: "var(--color-panel-soft)",
                      borderBottom: "1px solid var(--color-border-soft)",
                    }}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notebookData.breakdownRows.map((row, index) => (
                <tr
                  key={`${row.dimension}-${row.label}`}
                  style={{
                    borderBottom:
                      index < notebookData.breakdownRows.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                  }}
                >
                  <td style={{ padding: "14px 18px", fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                    {row.label}
                  </td>
                  <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                    ${row.spend.toLocaleString()}
                  </td>
                  <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                    {row.installs.toLocaleString()}
                  </td>
                  <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                    {formatPercent(row.d30Roas)}
                  </td>
                  <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                    {formatPercent(row.d60Roas)}
                  </td>
                  <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                    {formatPercent(row.d120Roas)}
                  </td>
                  <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                    D{row.paybackDays}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <CohortMatrixTable rows={notebookData.cohortMatrix} />
          </>
        ) : null}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "0.95fr 1.05fr",
            gap: 20,
          }}
        >
          <div
            style={{
              background: "var(--color-panel-base)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              padding: 18,
            }}
          >
            <SectionHeader
              title="Forecast strategy"
              subtitle="Stored control-plane settings that govern notebook-surface prewarm and cold-selection queueing."
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                ["Default day step", `${selectedBundle.project.defaultGranularityDays}d`],
                ["Forecast horizon", `${selectedBundle.project.forecastHorizonDays}d`],
                ["Precompute primary", strategyToggleValue(strategy?.precomputePrimaryForecasts)],
                ["On-demand", strategyToggleValue(strategy?.enableOnDemandForecasts)],
                ["Recent combination cap", strategy?.recentCombinationLimit?.toString() ?? "—"],
                [
                  "Bounds interval",
                  selectedBundle.project.boundsIntervalHours > 0
                    ? `${selectedBundle.project.boundsIntervalHours}h`
                    : "Manual only",
                ],
                ["Forecast interval", `${selectedBundle.project.forecastIntervalHours}h`],
                ["Bounds path", selectedBundle.project.boundsPath || "Not set"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    border: "1px solid var(--color-border-soft)",
                    borderRadius: 8,
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)" }}>
                    {label}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: "var(--color-panel-base)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 18 }}>
              <SectionHeader
                title="Combination registry"
                subtitle="Stored forecast combinations now keyed by slice + revenue view + day step so different notebook selections do not collide."
              />
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Label", "Source", "Views", "Last viewed", "Last forecast"].map((column) => (
                    <th
                      key={column}
                      style={{
                        padding: "10px 18px",
                        textAlign: "left",
                        fontSize: 10.5,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--color-ink-500)",
                        background: "var(--color-panel-soft)",
                        borderBottom: "1px solid var(--color-border-soft)",
                      }}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {combinations.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 18, fontSize: 13, color: "var(--color-ink-500)" }}>
                      No forecast combinations have been recorded yet.
                    </td>
                  </tr>
                ) : (
                  combinations.map((combination, index) => {
                    const tone = combination.lastForecastStatus
                      ? runStatusTone(combination.lastForecastStatus)
                      : null;

                    return (
                      <tr
                        key={combination.id}
                        style={{
                          borderBottom:
                            index < combinations.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                        }}
                      >
                        <td style={{ padding: "14px 18px" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                            {combination.label}
                          </div>
                          <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                            {combination.combinationKey}
                          </div>
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                          {combination.sourcePage ?? "manual"}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                          {combination.viewCount}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-500)" }}>
                          <div>{formatDateTime(combination.lastViewedAt)}</div>
                          <div style={{ marginTop: 2 }}>{formatRelativeTime(combination.lastViewedAt)}</div>
                        </td>
                        <td style={{ padding: "14px 18px" }}>
                          {tone ? (
                            <span
                              style={{
                                display: "inline-flex",
                                padding: "3px 8px",
                                borderRadius: 999,
                                background: tone.background,
                                color: tone.color,
                                fontSize: 11.5,
                                fontWeight: 600,
                              }}
                            >
                              {tone.label}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: "var(--color-ink-500)" }}>No run yet</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section
          style={{
            background: "var(--color-panel-base)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 18 }}>
            <SectionHeader
              title="Forecast-related run history"
              subtitle={
                showBoundsHistory
                  ? "Bounds refresh and forecast job attempts from the live control plane."
                  : "Forecast job attempts from the live control plane. Bounds rebuilds are manual-only here and stay hidden unless one is actively running."
              }
            />
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Run", "Status", "Window", "Updated", "Message"].map((column) => (
                  <th
                    key={column}
                    style={{
                      padding: "10px 18px",
                      textAlign: "left",
                      fontSize: 10.5,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--color-ink-500)",
                      background: "var(--color-panel-soft)",
                      borderBottom: "1px solid var(--color-border-soft)",
                    }}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentRuns.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 18, fontSize: 13, color: "var(--color-ink-500)" }}>
                    {showBoundsHistory
                      ? "No forecast or bounds runs have been recorded yet."
                      : "No forecast runs have been recorded yet."}
                  </td>
                </tr>
              ) : (
                recentRuns.slice(0, 100).map(({ run }, index) => {
                  const tone = runStatusTone(run.status);
                  const updatedAt = run.finishedAt ?? run.startedAt ?? run.requestedAt;
                  return (
                    <tr
                      key={run.id}
                      style={{
                        borderBottom:
                          index < Math.min(recentRuns.length, 100) - 1 ? "1px solid var(--color-border-soft)" : "none",
                      }}
                    >
                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                          {run.runType}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                          {run.id.slice(0, 8)}
                        </div>
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: tone.background,
                            color: tone.color,
                            fontSize: 11.5,
                            fontWeight: 600,
                          }}
                        >
                          {tone.label}
                        </span>
                      </td>
                      <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                        {run.windowFrom && run.windowTo ? `${run.windowFrom} → ${run.windowTo}` : "No explicit window"}
                      </td>
                      <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-500)" }}>
                        <div>{formatDateTime(updatedAt)}</div>
                        <div style={{ marginTop: 2 }}>{formatRelativeTime(updatedAt)}</div>
                      </td>
                      <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                        {sanitizeForecastRunMessage(run.message)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        {hasAppliedSelection ? (
          <section
            style={{
              background: "var(--color-panel-base)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 18 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <SectionHeader
                  title="Bounds Coverage"
                  subtitle="Diagnostic view of normalized cohort-size bounds tables. Only clean artifact bounds are chart-eligible; live-built diagnostics never render on charts."
                />

                {boundsCoverageRows.length > 0 ? (
                  <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                    <div style={{ fontSize: 11.5, color: "var(--color-ink-500)" }}>
                      Showing {boundsCoveragePageStart + 1}-
                      {Math.min(
                        boundsCoveragePageStart + visibleBoundsCoverageRows.length,
                        boundsCoverageRows.length
                      )}{" "}
                      of {boundsCoverageRows.length}
                    </div>

                    {boundsCoveragePageCount > 1 ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {boundsCoveragePage > 1 ? (
                          <Link
                            href={buildForecastPageHref(rawSearchParams, {
                              boundsPage:
                                boundsCoveragePage - 1 > 1
                                  ? String(boundsCoveragePage - 1)
                                  : null,
                            })}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minHeight: 32,
                              padding: "0 12px",
                              borderRadius: 999,
                              border: "1px solid var(--color-border-soft)",
                              background: "var(--color-panel-base)",
                              color: "var(--color-ink-700)",
                              fontSize: 12,
                              fontWeight: 600,
                              textDecoration: "none",
                            }}
                          >
                            Previous
                          </Link>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minHeight: 32,
                              padding: "0 12px",
                              borderRadius: 999,
                              border: "1px solid var(--color-border-soft)",
                              background: "var(--color-panel-soft)",
                              color: "var(--color-ink-400)",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            Previous
                          </span>
                        )}

                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink-600)" }}>
                          Page {boundsCoveragePage} / {boundsCoveragePageCount}
                        </span>

                        {boundsCoveragePage < boundsCoveragePageCount ? (
                          <Link
                            href={buildForecastPageHref(rawSearchParams, {
                              boundsPage: String(boundsCoveragePage + 1),
                            })}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minHeight: 32,
                              padding: "0 12px",
                              borderRadius: 999,
                              border: "1px solid var(--color-border-soft)",
                              background: "var(--color-panel-base)",
                              color: "var(--color-ink-700)",
                              fontSize: 12,
                              fontWeight: 600,
                              textDecoration: "none",
                            }}
                          >
                            Next
                          </Link>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minHeight: 32,
                              padding: "0 12px",
                              borderRadius: 999,
                              border: "1px solid var(--color-border-soft)",
                              background: "var(--color-panel-soft)",
                              color: "var(--color-ink-400)",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            Next
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div style={{ marginTop: 4, fontSize: 11.5, lineHeight: 1.55, color: "var(--color-ink-500)" }}>
                `Artifact` means a cleaned notebook bounds table loaded from GCS and eligible for chart rendering.
                `Live-built only` means runtime diagnostics rebuilt a table locally, but those intervals stay hidden on
                charts. `Missing` means neither a usable artifact table nor a diagnostic table exists for that cohort
                size.
              </div>
            </div>

            {boundsCoverageRows.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Cohort size", "Slice cohorts", "Source", "Training records", "History days", "Prediction days", "Table keys"].map((column) => (
                      <th
                        key={column}
                        style={{
                          padding: "10px 18px",
                          textAlign: "left",
                          fontSize: 10.5,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--color-ink-500)",
                          background: "var(--color-panel-soft)",
                          borderBottom: "1px solid var(--color-border-soft)",
                        }}
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleBoundsCoverageRows.map((row, index) => {
                    const tone = formatBoundsCoverageSource(row.source);
                    return (
                      <tr
                        key={`bounds-${row.cohortSize}`}
                        style={{
                          borderBottom:
                            index < visibleBoundsCoverageRows.length - 1
                              ? "1px solid var(--color-border-soft)"
                              : "none",
                        }}
                      >
                        <td style={{ padding: "14px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--color-ink-950)" }}>
                          {row.cohortSize}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                          {row.sliceCohorts}
                        </td>
                        <td style={{ padding: "14px 18px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              padding: "3px 8px",
                              borderRadius: 999,
                              background: tone.background,
                              color: tone.color,
                              fontSize: 11.5,
                              fontWeight: 600,
                            }}
                          >
                            {tone.label}
                          </span>
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                          {row.smoothedTrainingRecords}
                          {row.minTrainingCohortSize != null && row.maxTrainingCohortSize != null ? (
                            <div style={{ marginTop: 2, fontSize: 11, color: "var(--color-ink-500)" }}>
                              window {row.minTrainingCohortSize}-{row.maxTrainingCohortSize}
                            </div>
                          ) : null}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                          {formatBoundsCoverageRange(row.minHistoryDay, row.maxHistoryDay, "D")}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                          {formatBoundsCoverageRange(row.minPredictionDay, row.maxPredictionDay, "D")}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                          {row.tableKeyCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 18, fontSize: 12.5, color: "var(--color-ink-500)" }}>
                No cohort sizes requested bounds for the current slice yet.
              </div>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
