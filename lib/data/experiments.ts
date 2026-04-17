import type {
  Experiment,
  ExperimentDetail,
  ExperimentVariant,
} from "@/lib/mock-data";
import type {
  DashboardProjectKey,
  DashboardSegmentKey,
} from "@/lib/dashboard-filters";
import type { ComparisonConfidenceChartData } from "@/lib/data/acquisition";
import type { SavedUserSegment } from "@/lib/segments";

export type ExperimentsFilter = {
  projectKey?: DashboardProjectKey;
};

export type ExperimentAnalysisSearchParams = {
  experimentId: string;
  segmentKey: DashboardSegmentKey;
  variantLeft: string;
  variantRight: string;
};

export type ExperimentVariantSnapshot = {
  label: string;
  users: number;
  primaryMetricValue: number;
  revenuePerUser: number;
  lift: number;
};

export type ExperimentSegmentRow = {
  segmentKey: DashboardSegmentKey;
  segmentLabel: string;
  users: number;
  leftPrimaryMetric: number;
  rightPrimaryMetric: number;
  primaryDelta: number;
  revenueDelta: number;
};

export type ExperimentAnalysisData = {
  experiment: Experiment;
  detail: ExperimentDetail;
  selectedSegmentKey: DashboardSegmentKey;
  selectedSegmentLabel: string;
  primaryMetricLabel: string;
  primaryMetricUnit: "%" | "$";
  primaryMetricDeltaLabel: string;
  variants: ExperimentVariant[];
  leftVariant: ExperimentVariantSnapshot;
  rightVariant: ExperimentVariantSnapshot;
  charts: ComparisonConfidenceChartData[];
  segmentRows: ExperimentSegmentRow[];
  segmentOptions: Array<{ value: string; label: string }>;
  summary: {
    primaryMetricDelta: number;
    revenueDelta: number;
    exposureDelta: number;
  };
};

function readSingleParam(
  raw: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string
) {
  if (raw instanceof URLSearchParams) {
    return raw.get(key) ?? undefined;
  }

  const value = raw[key];
  return Array.isArray(value) ? value[0] : value;
}

export async function getExperiments(_filters?: ExperimentsFilter): Promise<Experiment[]> {
  return [];
}

export async function getExperimentById(_id: string): Promise<{ experiment: Experiment; detail: ExperimentDetail } | null> {
  return null;
}

export function parseExperimentAnalysisSearchParams(
  raw: URLSearchParams | Record<string, string | string[] | undefined>
): ExperimentAnalysisSearchParams {
  return {
    experimentId: readSingleParam(raw, "experimentId") ?? "",
    segmentKey: readSingleParam(raw, "experimentSegment") ?? "all",
    variantLeft: readSingleParam(raw, "variantLeft") ?? "",
    variantRight: readSingleParam(raw, "variantRight") ?? "",
  };
}

export async function getExperimentAnalysisData(
  _experimentId: string | null,
  _rawFilters: ExperimentAnalysisSearchParams,
  _savedSegments: SavedUserSegment[] = [],
  _projectKey: DashboardProjectKey = "all"
): Promise<ExperimentAnalysisData | null> {
  return null;
}
