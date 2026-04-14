import type { ComparisonConfidenceChartData } from "@/lib/data/acquisition";
import {
  matchesProject,
  type DashboardProjectKey,
  type DashboardSegmentKey,
} from "@/lib/dashboard-filters";
import {
  getSegmentBehavior,
  getSegmentLabel,
  getSegmentOptions,
  type SavedUserSegment,
} from "@/lib/segments";
import {
  MOCK_EXPERIMENTS,
  MOCK_EXPERIMENT_DETAILS,
  type Experiment,
  type ExperimentDetail,
  type ExperimentVariant,
} from "@/lib/mock-data";

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

const GROUP_COLORS = ["#2563eb", "#d97706", "#059669"];
const WEEK_LABELS = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"];

export async function getExperiments(filters?: ExperimentsFilter): Promise<Experiment[]> {
  const projectKey = filters?.projectKey;
  if (!projectKey) return MOCK_EXPERIMENTS;
  return MOCK_EXPERIMENTS.filter((experiment) => matchesProject(experiment.project, projectKey));
}

export async function getExperimentById(
  id: string
): Promise<{ experiment: Experiment; detail: ExperimentDetail } | null> {
  const experiment = MOCK_EXPERIMENTS.find((candidate) => candidate.id === id);
  if (!experiment) return null;
  const detail = MOCK_EXPERIMENT_DETAILS[experiment.id];
  if (!detail) return null;
  return { experiment, detail };
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
  experimentId: string | null,
  rawFilters: ExperimentAnalysisSearchParams,
  savedSegments: SavedUserSegment[] = [],
  projectKey: DashboardProjectKey = "all"
): Promise<ExperimentAnalysisData | null> {
  if (!experimentId) {
    return null;
  }

  const result = await getExperimentById(experimentId);
  if (!result) {
    return null;
  }

  const { experiment, detail } = result;
  const segmentOptions = getSegmentOptions(savedSegments, projectKey).map((segment) => ({
    value: segment.key,
    label: segment.label,
  }));
  const selectedSegmentKey = segmentOptions.some((segment) => segment.value === rawFilters.segmentKey)
    ? rawFilters.segmentKey
    : "all";
  const selectedSegmentLabel = getSegmentLabel(selectedSegmentKey, savedSegments, projectKey);
  const leftVariantBase =
    detail.variants.find((variant) => variant.label === rawFilters.variantLeft) ?? detail.variants[0];
  const rightVariantBase =
    detail.variants.find(
      (variant) => variant.label === rawFilters.variantRight && variant.label !== leftVariantBase?.label
    ) ?? detail.variants.find((variant) => variant.label !== leftVariantBase?.label) ?? detail.variants[0];

  const primaryMetric = getPrimaryMetricDefinition(detail);
  const leftVariant = buildVariantSnapshot(experiment.id, leftVariantBase, selectedSegmentKey, savedSegments, primaryMetric);
  const rightVariant = buildVariantSnapshot(experiment.id, rightVariantBase, selectedSegmentKey, savedSegments, primaryMetric);

  return {
    experiment,
    detail,
    selectedSegmentKey,
    selectedSegmentLabel,
    primaryMetricLabel: primaryMetric.label,
    primaryMetricUnit: primaryMetric.unit,
    primaryMetricDeltaLabel: formatPrimaryMetricDelta(
      leftVariant.primaryMetricValue - rightVariant.primaryMetricValue,
      primaryMetric.unit
    ),
    variants: detail.variants,
    leftVariant,
    rightVariant,
    charts: buildExperimentCharts(experiment.id, detail, leftVariant, rightVariant, primaryMetric),
    segmentOptions,
    segmentRows: buildSegmentRows(experiment, detail, leftVariantBase, rightVariantBase, savedSegments, projectKey, primaryMetric),
    summary: {
      primaryMetricDelta: Number((leftVariant.primaryMetricValue - rightVariant.primaryMetricValue).toFixed(2)),
      revenueDelta: Number((leftVariant.revenuePerUser - rightVariant.revenuePerUser).toFixed(2)),
      exposureDelta: leftVariant.users - rightVariant.users,
    },
  };
}

function buildExperimentCharts(
  experimentId: string,
  detail: ExperimentDetail,
  leftVariant: ExperimentVariantSnapshot,
  rightVariant: ExperimentVariantSnapshot,
  primaryMetric: ReturnType<typeof getPrimaryMetricDefinition>
): ComparisonConfidenceChartData[] {
  return [
    {
      id: `${experimentId}-primary-metric`,
      title: `${primaryMetric.label} by exposure week`,
      subtitle: "Variant-vs-variant trend for the selected segment. Hover every point to see exact weekly values.",
      unit: primaryMetric.unit,
      groups: [
        buildVariantSeries(experimentId, leftVariant, primaryMetric.unit, GROUP_COLORS[0]),
        buildVariantSeries(experimentId, rightVariant, primaryMetric.unit, GROUP_COLORS[1]),
      ],
    },
    {
      id: `${experimentId}-revenue-per-user`,
      title: "Revenue per user by exposure week",
      subtitle: "Monetization cut for the same segment and selected variants.",
      unit: "$",
      groups: [
        buildVariantSeries(experimentId, { ...leftVariant, primaryMetricValue: leftVariant.revenuePerUser }, "$", GROUP_COLORS[0]),
        buildVariantSeries(experimentId, { ...rightVariant, primaryMetricValue: rightVariant.revenuePerUser }, "$", GROUP_COLORS[1]),
      ],
    },
    {
      id: `${experimentId}-users`,
      title: "Accumulated exposed users",
      subtitle: "Exposure balance by week. Useful when lift exists but traffic split is uneven.",
      unit: "",
      groups: [
        buildVariantSeries(experimentId, { ...leftVariant, primaryMetricValue: leftVariant.users }, "", GROUP_COLORS[0]),
        buildVariantSeries(experimentId, { ...rightVariant, primaryMetricValue: rightVariant.users }, "", GROUP_COLORS[1]),
      ],
    },
  ];
}

function buildVariantSeries(
  experimentId: string,
  variant: ExperimentVariantSnapshot,
  unit: "%" | "$" | "",
  color: string
) {
  return {
    label: variant.label,
    color,
    series: WEEK_LABELS.map((label, index) => {
      const progress = (index + 1) / WEEK_LABELS.length;
      const seed = normalizedSeed(`${experimentId}|${variant.label}|${label}|${unit}`);
      const baseline = variant.primaryMetricValue;
      const value =
        unit === ""
          ? Math.round(variant.users * (progress * (0.94 + seed * 0.08)))
          : Number((baseline * (0.92 + progress * 0.08 + (seed - 0.5) * 0.05)).toFixed(2));
      const intervalRatio = clamp(0.16 - progress * 0.08 + seed * 0.03, 0.05, 0.2);
      const actual =
        unit === ""
          ? Math.round(value * (0.99 + seed * 0.03))
          : Number((value * (0.98 + seed * 0.04)).toFixed(2));

      return {
        label,
        value,
        lower: Number((value * (1 - intervalRatio)).toFixed(2)),
        upper: Number((value * (1 + intervalRatio)).toFixed(2)),
        actual,
      };
    }),
  };
}

function buildSegmentRows(
  experiment: Experiment,
  detail: ExperimentDetail,
  leftVariant: ExperimentVariant,
  rightVariant: ExperimentVariant,
  savedSegments: SavedUserSegment[],
  projectKey: DashboardProjectKey,
  primaryMetric: ReturnType<typeof getPrimaryMetricDefinition>
) {
  const options = getSegmentOptions(savedSegments, projectKey)
    .filter((segment) => segment.key !== "all")
    .slice(0, 8);

  return options.map((segment) => {
    const left = buildVariantSnapshot(experiment.id, leftVariant, segment.key, savedSegments, primaryMetric);
    const right = buildVariantSnapshot(experiment.id, rightVariant, segment.key, savedSegments, primaryMetric);

    return {
      segmentKey: segment.key,
      segmentLabel: segment.label,
      users: left.users + right.users,
      leftPrimaryMetric: left.primaryMetricValue,
      rightPrimaryMetric: right.primaryMetricValue,
      primaryDelta: Number((left.primaryMetricValue - right.primaryMetricValue).toFixed(2)),
      revenueDelta: Number((left.revenuePerUser - right.revenuePerUser).toFixed(2)),
    };
  });
}

function buildVariantSnapshot(
  experimentId: string,
  variant: ExperimentVariant,
  segmentKey: DashboardSegmentKey,
  savedSegments: SavedUserSegment[],
  primaryMetric: ReturnType<typeof getPrimaryMetricDefinition>
): ExperimentVariantSnapshot {
  const behavior = getSegmentBehavior(segmentKey, savedSegments);
  const seed = normalizedSeed(`${experimentId}|${variant.label}|${behavior.label}`);
  const users = Math.max(
    90,
    Math.round(variant.users * behavior.narrowingFactor * (0.94 + seed * 0.12))
  );

  const primaryMetricValue =
    primaryMetric.unit === "%"
      ? clamp(
          variant.activationRate * (1 + (behavior.roasMultiplier - 1) * 0.12 + (seed - 0.5) * 0.06),
          0.5,
          99
        )
      : Math.max(
          0.1,
          Number(
            (
              variant.revenuePerUser *
              (1 + (behavior.roasMultiplier - 1) * 0.3 + (seed - 0.5) * 0.08)
            ).toFixed(2)
          )
        );

  const revenuePerUser = Math.max(
    0.08,
    Number(
      (
        variant.revenuePerUser *
        (1 + (behavior.roasMultiplier - 1) * 0.34 + (seed - 0.5) * 0.1)
      ).toFixed(2)
    )
  );
  const lift = Number((variant.lift * (1 + (behavior.roasMultiplier - 1) * 0.14)).toFixed(2));

  return {
    label: variant.label,
    users,
    primaryMetricValue: Number(primaryMetricValue.toFixed(2)),
    revenuePerUser,
    lift,
  };
}

function getPrimaryMetricDefinition(detail: ExperimentDetail) {
  const isRevenueMetric = detail.primaryMetric.toLowerCase().includes("revenue");
  return {
    label: detail.primaryMetric,
    unit: isRevenueMetric ? ("$" as const) : ("%" as const),
  };
}

function formatPrimaryMetricDelta(value: number, unit: "%" | "$") {
  if (unit === "$") {
    return `${value >= 0 ? "+" : ""}$${Math.abs(value).toFixed(2)}`;
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}pp`;
}

function readSingleParam(
  raw: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string
) {
  if (raw instanceof URLSearchParams) {
    return raw.get(key) ?? undefined;
  }

  const value = raw[key];
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0);
}

function normalizedSeed(value: string) {
  return hashString(value) / 4294967295;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
