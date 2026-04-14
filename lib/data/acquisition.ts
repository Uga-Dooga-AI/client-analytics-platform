import {
  getProjectLabel,
  type DashboardFilters,
  type DashboardGroupByKey,
  type DashboardProjectKey,
  type DashboardSegmentKey,
  type DashboardTagKey,
} from "@/lib/dashboard-filters";
import {
  getSegmentBehavior,
  getSegmentLabel,
  getSegmentOptions,
  type SavedUserSegment,
} from "@/lib/segments";

export type AcquisitionCompareByKey =
  | "platform"
  | "country"
  | "company"
  | "source"
  | "campaign"
  | "creative"
  | "segment";

export type RevenueModeKey = "total" | "ads" | "iap";

export type AcquisitionLocalFilters = {
  country: string;
  company: string;
  source: string;
  campaign: string;
  creative: string;
  revenueMode: RevenueModeKey;
  compareBy: AcquisitionCompareByKey;
  compareLeft: string;
  compareRight: string;
};

export type AcquisitionOption = {
  value: string;
  label: string;
  count: number;
};

export type ConfidenceSeriesPoint = {
  label: string;
  value: number;
  lower: number;
  upper: number;
  actual?: number | null;
};

export type ComparisonChartGroup = {
  label: string;
  color: string;
  actualColor?: string;
  series: ConfidenceSeriesPoint[];
};

export type ComparisonConfidenceChartData = {
  id: string;
  title: string;
  subtitle: string;
  unit: string;
  groups: ComparisonChartGroup[];
};

export type AcquisitionSummary = {
  project: string;
  revenueMode: RevenueModeKey;
  spend: number;
  installs: number;
  cpi: number;
  adShare: number;
  d30Roas: number;
  d60Roas: number;
  d120Roas: number;
  totalRevenuePerUser: number;
  adRevenuePerUser: number;
  iapRevenuePerUser: number;
  d1Retention: number;
  d7Retention: number;
  d30Retention: number;
  sessionMinutes: number;
  paybackDays: number;
  cohortCount: number;
  sliceCount: number;
  confidence: string;
};

export type AcquisitionBreakdownRow = {
  label: string;
  dimension: DashboardGroupByKey;
  platform: "iOS" | "Android" | "Mixed";
  spend: number;
  installs: number;
  cohorts: number;
  cpi: number;
  revenuePerUser: number;
  d30Roas: number;
  d60Roas: number;
  d120Roas: number;
  d7Retention: number;
  d30Retention: number;
  sessionMinutes: number;
  adShare: number;
  paybackDays: number;
  confidence: string;
};

export type CohortMatrixCell = {
  label: string;
  value: number;
  lower: number;
  upper: number;
  actual?: number | null;
};

export type CohortMatrixRow = {
  cohortDate: string;
  spend: number;
  installs: number;
  cpi: number;
  cells: CohortMatrixCell[];
};

export type AcquisitionComparisonSummary = {
  leftLabel: string;
  rightLabel: string;
  d60Lift: number;
  paybackDeltaDays: number;
  spendDelta: number;
};

export type MetricComparisonRow = {
  category: "revenue" | "retention" | "engagement";
  label: string;
  unit: string;
  leftValue: number;
  rightValue: number;
  delta: number;
  preferredDirection: "higher" | "lower";
};

export type AcquisitionFilterOptions = {
  countries: AcquisitionOption[];
  companies: AcquisitionOption[];
  sources: AcquisitionOption[];
  campaigns: AcquisitionOption[];
  creatives: AcquisitionOption[];
  compareValues: AcquisitionOption[];
};

export type SegmentBuilderCatalog = {
  countries: AcquisitionOption[];
  companies: AcquisitionOption[];
  sources: AcquisitionOption[];
  campaigns: AcquisitionOption[];
  creatives: AcquisitionOption[];
};

export type AcquisitionDashboardData = {
  localFilters: AcquisitionLocalFilters;
  options: AcquisitionFilterOptions;
  summary: AcquisitionSummary;
  horizonCharts: ComparisonConfidenceChartData[];
  paybackChart: ComparisonConfidenceChartData;
  compareCharts: ComparisonConfidenceChartData[];
  comparisonSummary: AcquisitionComparisonSummary;
  metricComparisonRows: MetricComparisonRow[];
  breakdownRows: AcquisitionBreakdownRow[];
  cohortMatrix: CohortMatrixRow[];
};

type SliceDescriptor = {
  project: string;
  projectCode: string;
  platform: "iOS" | "Android";
  country: string;
  company: string;
  source: string;
  campaign: string;
  creative: string;
  tags: DashboardTagKey[];
  quality: number;
};

type CampaignDefinition = {
  name: string;
  company: string;
  source: string;
  creativePresets: string[];
  tags: DashboardTagKey[];
  quality: number;
};

type ProjectDefinition = {
  code: string;
  project: string;
  countries: string[];
  platforms: Array<"iOS" | "Android">;
  campaigns: CampaignDefinition[];
};

type MetricEnvelope = {
  predicted: number;
  lower: number;
  upper: number;
  actual: number | null;
};

type CohortSliceMetric = {
  cohortDate: string;
  spend: number;
  installs: number;
  adShare: number;
  d30: MetricEnvelope;
  d60: MetricEnvelope;
  d120: MetricEnvelope;
  d270: MetricEnvelope;
  payback: Record<number, MetricEnvelope>;
  retention: {
    d1: MetricEnvelope;
    d7: MetricEnvelope;
    d30: MetricEnvelope;
  };
  sessionMinutes: MetricEnvelope;
};

const ALL_VALUE = "all";
const COHORT_DAY_POINTS = [7, 14, 30, 60, 90, 120, 180, 270];
const MATRIX_DAY_POINTS = [7, 14, 30, 60, 120, 270];
const HORIZON_CHARTS = [
  { key: "d30" as const, label: "ROAS by install date · D30", unit: "%" },
  { key: "d60" as const, label: "ROAS by install date · D60", unit: "%" },
  { key: "d120" as const, label: "ROAS by install date · D120", unit: "%" },
];
const COMPARE_DIMENSIONS: Array<{ value: AcquisitionCompareByKey; label: string }> = [
  { value: "platform", label: "Platform" },
  { value: "country", label: "Country" },
  { value: "company", label: "Company" },
  { value: "source", label: "Traffic source" },
  { value: "campaign", label: "Campaign" },
  { value: "creative", label: "Creative" },
  { value: "segment", label: "User segment" },
];
const GROUP_COLORS = ["#2563eb", "#d97706", "#059669"];

const REVENUE_MODE_OPTIONS: Array<{ value: RevenueModeKey; label: string }> = [
  { value: "total", label: "Total revenue" },
  { value: "ads", label: "Ad revenue" },
  { value: "iap", label: "IAP revenue" },
];

const PROJECT_DEFINITIONS: Record<string, ProjectDefinition> = {
  "Word Catcher": {
    code: "WC",
    project: "Word Catcher",
    countries: ["US", "DE", "GB", "FR", "BR", "CA"],
    platforms: ["iOS", "Android"],
    campaigns: [
      {
        name: "Spring Puzzle ROAS",
        company: "Google",
        source: "Google Ads",
        creativePresets: ["Hint Stack", "Pattern Board", "Neuro Hook"],
        tags: ["roas", "ua", "monetization"],
        quality: 1.08,
      },
      {
        name: "Storefront Burst",
        company: "Meta",
        source: "Meta Ads",
        creativePresets: ["Video Claim", "Reward Chest", "Static Board"],
        tags: ["roas", "ua", "experiments"],
        quality: 0.98,
      },
      {
        name: "Retention Sweep",
        company: "AppLovin",
        source: "AppLovin",
        creativePresets: ["Voice Over", "Progress Meter", "Coins Loop"],
        tags: ["roas", "ua", "retention"],
        quality: 1.12,
      },
      {
        name: "Creative Refresh",
        company: "Unity Ads",
        source: "Unity Ads",
        creativePresets: ["Marker Motion", "Before After", "Puzzle Burst"],
        tags: ["roas", "ua", "experiments"],
        quality: 0.94,
      },
    ],
  },
  "Words in Word": {
    code: "WIW",
    project: "Words in Word",
    countries: ["US", "GB", "CA", "AU", "RU", "DE"],
    platforms: ["iOS", "Android"],
    campaigns: [
      {
        name: "Vocabulary Scale",
        company: "Google",
        source: "Google Ads",
        creativePresets: ["Auto Hint", "Camp Flower", "Romantic Frame"],
        tags: ["roas", "ua", "retention"],
        quality: 1.14,
      },
      {
        name: "Artifact Journey",
        company: "Meta",
        source: "Meta Ads",
        creativePresets: ["Artifact Base", "Journey Loop", "Nature Frame"],
        tags: ["roas", "ua", "monetization"],
        quality: 1.1,
      },
      {
        name: "Neurologist Hook",
        company: "AppLovin",
        source: "AppLovin",
        creativePresets: ["Doctor Hook", "Vocabulary Voice", "Planet Camp"],
        tags: ["roas", "ua", "experiments"],
        quality: 1.03,
      },
      {
        name: "High Retention Sweep",
        company: "Unity Ads",
        source: "Unity Ads",
        creativePresets: ["Quiz Line", "Frame Static", "Underwater Loop"],
        tags: ["roas", "ua", "retention", "experiments"],
        quality: 1.16,
      },
    ],
  },
  "2PG": {
    code: "2PG",
    project: "2PG",
    countries: ["US", "BR", "MX", "DE", "IN", "GB"],
    platforms: ["Android", "iOS"],
    campaigns: [
      {
        name: "Paywall Test Burst",
        company: "Meta",
        source: "Meta Ads",
        creativePresets: ["Reward Loop", "Chest Motion", "Claim Banner"],
        tags: ["roas", "ua", "experiments"],
        quality: 0.95,
      },
      {
        name: "Installs Scale",
        company: "Google",
        source: "Google Ads",
        creativePresets: ["Level Pack", "Versus Frame", "Quick Start"],
        tags: ["roas", "ua"],
        quality: 0.9,
      },
      {
        name: "Monetization Recovery",
        company: "AppLovin",
        source: "AppLovin",
        creativePresets: ["Combo Reward", "XP Ladder", "Streak Booster"],
        tags: ["roas", "ua", "monetization"],
        quality: 1.01,
      },
      {
        name: "Creative Rotation",
        company: "Unity Ads",
        source: "Unity Ads",
        creativePresets: ["Skill Blast", "Board Race", "Puzzle Duel"],
        tags: ["roas", "ua", "experiments"],
        quality: 0.92,
      },
    ],
  },
};

const DEFAULT_LOCAL_FILTERS: AcquisitionLocalFilters = {
  country: ALL_VALUE,
  company: ALL_VALUE,
  source: ALL_VALUE,
  campaign: ALL_VALUE,
  creative: ALL_VALUE,
  revenueMode: "total",
  compareBy: "country",
  compareLeft: "",
  compareRight: "",
};

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

export function parseAcquisitionSearchParams(
  raw: URLSearchParams | Record<string, string | string[] | undefined>
): AcquisitionLocalFilters {
  const compareByRaw = readSingleParam(raw, "compareBy") as AcquisitionCompareByKey | undefined;
  const compareBy: AcquisitionCompareByKey = COMPARE_DIMENSIONS.some((item) => item.value === compareByRaw)
    ? (compareByRaw as AcquisitionCompareByKey)
    : DEFAULT_LOCAL_FILTERS.compareBy;
  const revenueModeRaw = readSingleParam(raw, "revenueMode") as RevenueModeKey | undefined;
  const revenueMode: RevenueModeKey = REVENUE_MODE_OPTIONS.some((item) => item.value === revenueModeRaw)
    ? (revenueModeRaw as RevenueModeKey)
    : DEFAULT_LOCAL_FILTERS.revenueMode;

  return {
    country: readSingleParam(raw, "country") ?? DEFAULT_LOCAL_FILTERS.country,
    company: readSingleParam(raw, "company") ?? DEFAULT_LOCAL_FILTERS.company,
    source: readSingleParam(raw, "source") ?? DEFAULT_LOCAL_FILTERS.source,
    campaign: readSingleParam(raw, "campaign") ?? DEFAULT_LOCAL_FILTERS.campaign,
    creative: readSingleParam(raw, "creative") ?? DEFAULT_LOCAL_FILTERS.creative,
    revenueMode,
    compareBy,
    compareLeft: readSingleParam(raw, "compareLeft") ?? DEFAULT_LOCAL_FILTERS.compareLeft,
    compareRight: readSingleParam(raw, "compareRight") ?? DEFAULT_LOCAL_FILTERS.compareRight,
  };
}

export function getAcquisitionCompareDimensions() {
  return COMPARE_DIMENSIONS;
}

export function getRevenueModeOptions() {
  return REVENUE_MODE_OPTIONS;
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

function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function formatIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatLabelDate(value: Date) {
  return value.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
}

function diffInDays(later: Date, earlier: Date) {
  return Math.floor((later.getTime() - earlier.getTime()) / 86400000);
}

function interpolateMetric(
  targetDay: number,
  anchors: Record<number, number>,
  actualDays: number
) {
  const anchorDays = Object.keys(anchors)
    .map((key) => Number(key))
    .sort((left, right) => left - right);

  if (targetDay <= anchorDays[0]) {
    const value = anchors[anchorDays[0]] * (targetDay / anchorDays[0]);
    return clamp(value, 0, 320);
  }

  for (let index = 0; index < anchorDays.length - 1; index += 1) {
    const left = anchorDays[index];
    const right = anchorDays[index + 1];
    if (targetDay >= left && targetDay <= right) {
      const share = (targetDay - left) / (right - left);
      const value = anchors[left] + (anchors[right] - anchors[left]) * share;
      return clamp(value, 0, 320);
    }
  }

  const last = anchorDays[anchorDays.length - 1];
  return anchors[last];
}

function buildSliceCatalog(project: string) {
  const definition = PROJECT_DEFINITIONS[project];
  if (!definition) {
    return [] as SliceDescriptor[];
  }

  return definition.campaigns.flatMap((campaign) =>
    definition.countries.flatMap((country) =>
      definition.platforms.flatMap((platform) =>
        campaign.creativePresets.map((creative) => ({
          project: definition.project,
          projectCode: definition.code,
          platform,
          country,
          company: campaign.company,
          source: campaign.source,
          campaign: campaign.name,
          creative: `${definition.code} · ${creative}`,
          tags: campaign.tags,
          quality: campaign.quality,
        }))
      )
    )
  );
}

function applyDescriptorFilters(
  descriptors: SliceDescriptor[],
  filters: DashboardFilters,
  local: AcquisitionLocalFilters,
  omitDimension?: AcquisitionCompareByKey
) {
  return descriptors.filter((descriptor) => {
    if (
      omitDimension !== "platform" &&
      filters.platform !== "all" &&
      descriptor.platform.toLowerCase() !== filters.platform
    ) {
      return false;
    }

    if (filters.tag !== "all" && !descriptor.tags.includes(filters.tag)) {
      return false;
    }

    if (omitDimension !== "country" && local.country !== ALL_VALUE && descriptor.country !== local.country) {
      return false;
    }

    if (omitDimension !== "company" && local.company !== ALL_VALUE && descriptor.company !== local.company) {
      return false;
    }

    if (omitDimension !== "source" && local.source !== ALL_VALUE && descriptor.source !== local.source) {
      return false;
    }

    if (omitDimension !== "campaign" && local.campaign !== ALL_VALUE && descriptor.campaign !== local.campaign) {
      return false;
    }

    if (omitDimension !== "creative" && local.creative !== ALL_VALUE && descriptor.creative !== local.creative) {
      return false;
    }

    return true;
  });
}

function buildOptions<T extends string>(
  descriptors: SliceDescriptor[],
  selector: (descriptor: SliceDescriptor) => T
) {
  const counts = new Map<string, number>();
  descriptors.forEach((descriptor) => {
    const value = selector(descriptor);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return [
    { value: ALL_VALUE, label: "All", count: descriptors.length },
    ...Array.from(counts.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([value, count]) => ({ value, label: value, count })),
  ];
}

function applySavedSegmentRules(
  descriptors: SliceDescriptor[],
  segment: SavedUserSegment
) {
  return descriptors.filter((descriptor) => {
    if (segment.rules.projectKey !== "all") {
      const expectedProject = getProjectLabel(segment.rules.projectKey);
      if (descriptor.project !== expectedProject) {
        return false;
      }
    }

    if (segment.rules.platform !== "all" && descriptor.platform.toLowerCase() !== segment.rules.platform) {
      return false;
    }

    if (segment.rules.tag !== "all" && !descriptor.tags.includes(segment.rules.tag)) {
      return false;
    }

    if (segment.rules.country !== "all" && descriptor.country !== segment.rules.country) {
      return false;
    }

    if (segment.rules.company !== "all" && descriptor.company !== segment.rules.company) {
      return false;
    }

    if (segment.rules.source !== "all" && descriptor.source !== segment.rules.source) {
      return false;
    }

    if (segment.rules.campaign !== "all" && descriptor.campaign !== segment.rules.campaign) {
      return false;
    }

    if (segment.rules.creative !== "all" && descriptor.creative !== segment.rules.creative) {
      return false;
    }

    return true;
  });
}

function resolveSegmentSlice(
  descriptors: SliceDescriptor[],
  segmentKey: DashboardSegmentKey,
  savedSegments: SavedUserSegment[]
) {
  const behavior = getSegmentBehavior(segmentKey, savedSegments);
  const scopedDescriptors = behavior.savedSegment
    ? applySavedSegmentRules(descriptors, behavior.savedSegment)
    : descriptors;

  return {
    descriptors: scopedDescriptors,
    behavior,
  };
}

function resolveLocalFilters(
  descriptors: SliceDescriptor[],
  filters: DashboardFilters,
  rawLocal: AcquisitionLocalFilters,
  savedSegments: SavedUserSegment[]
) {
  const local: AcquisitionLocalFilters = { ...rawLocal };

  const countries = buildOptions(
    applyDescriptorFilters(descriptors, filters, local, "country"),
    (descriptor) => descriptor.country
  );
  if (!countries.some((option) => option.value === local.country)) {
    local.country = ALL_VALUE;
  }

  const companies = buildOptions(
    applyDescriptorFilters(descriptors, filters, local, "company"),
    (descriptor) => descriptor.company
  );
  if (!companies.some((option) => option.value === local.company)) {
    local.company = ALL_VALUE;
  }

  const sources = buildOptions(
    applyDescriptorFilters(descriptors, filters, local, "source"),
    (descriptor) => descriptor.source
  );
  if (!sources.some((option) => option.value === local.source)) {
    local.source = ALL_VALUE;
  }

  const campaigns = buildOptions(
    applyDescriptorFilters(descriptors, filters, local, "campaign"),
    (descriptor) => descriptor.campaign
  );
  if (!campaigns.some((option) => option.value === local.campaign)) {
    local.campaign = ALL_VALUE;
  }

  const creatives = buildOptions(
    applyDescriptorFilters(descriptors, filters, local, "creative"),
    (descriptor) => descriptor.creative
  );
  if (!creatives.some((option) => option.value === local.creative)) {
    local.creative = ALL_VALUE;
  }

  const compareCandidates =
    local.compareBy === "segment"
      ? getSegmentOptions(savedSegments, filters.projectKey)
          .filter((segment) => segment.key !== "all")
          .map((segment) => ({ value: segment.key, label: segment.label, count: descriptors.length }))
      : buildOptions(
          applyDescriptorFilters(descriptors, filters, local, local.compareBy),
          (descriptor) => valueForDimension(descriptor, local.compareBy)
        ).filter((option) => option.value !== ALL_VALUE);

  if (!compareCandidates.some((option) => option.value === local.compareLeft)) {
    local.compareLeft = compareCandidates[0]?.value ?? "";
  }

  const rightFallback =
    compareCandidates.find((option) => option.value !== local.compareLeft)?.value ?? local.compareLeft;
  if (
    !compareCandidates.some((option) => option.value === local.compareRight) ||
    local.compareRight === local.compareLeft
  ) {
    local.compareRight = rightFallback;
  }

  return {
    localFilters: local,
    options: {
      countries,
      companies,
      sources,
      campaigns,
      creatives,
      compareValues: compareCandidates,
    },
  };
}

function buildCohortDates(filters: DashboardFilters) {
  const from = parseIsoDate(filters.from);
  const to = parseIsoDate(filters.to);
  const spanDays = Math.max(diffInDays(to, from), 14);
  const targetPoints = 8;
  const stepDays = Math.max(3, Math.floor(spanDays / targetPoints));
  const dates: Date[] = [];

  for (let cursor = new Date(from); cursor <= to; cursor = new Date(cursor.getTime() + stepDays * 86400000)) {
    dates.push(new Date(cursor));
  }

  if (dates.length === 0 || formatIsoDate(dates[dates.length - 1]) !== formatIsoDate(to)) {
    dates.push(to);
  }

  return dates.slice(-10);
}

function synthesizeCohortMetric(
  descriptor: SliceDescriptor,
  cohortDate: Date,
  segmentBehavior: ReturnType<typeof getSegmentBehavior>,
  now: Date
): CohortSliceMetric {
  const cohortKey = `${descriptor.project}|${descriptor.country}|${descriptor.company}|${descriptor.source}|${descriptor.campaign}|${descriptor.creative}|${descriptor.platform}|${formatIsoDate(cohortDate)}`;
  const seed = normalizedSeed(cohortKey);
  const projectSeed = normalizedSeed(descriptor.project);
  const seasonality = 1 + Math.sin(cohortDate.getUTCDate() / 2 + seed * 5) * 0.06;
  const segmentProfile = segmentBehavior;
  const platformFactor = descriptor.platform === "iOS" ? 1.08 : 0.93;
  const spend =
    (1700 + normalizedSeed(`${cohortKey}:spend`) * 4600 + descriptor.quality * 420) *
    seasonality *
    segmentProfile.spendMultiplier;
  const cpiBase = 1.78 + normalizedSeed(`${cohortKey}:cpi`) * 1.35 + (descriptor.platform === "iOS" ? 0.32 : 0);
  const installs = Math.max(80, Math.round((spend / cpiBase) * segmentProfile.installsMultiplier));
  const qualityIndex =
    descriptor.quality * 0.72 +
    platformFactor * 0.18 +
    (0.82 + projectSeed * 0.26) * 0.1 +
    segmentProfile.roasMultiplier * 0.12;
  const d30 = clamp(36 + qualityIndex * 24 + seed * 10, 18, 120);
  const d60 = clamp(d30 + 16 + descriptor.quality * 10 + seed * 8, d30 + 4, 165);
  const d120 = clamp(d60 + 14 + descriptor.quality * 8 + seed * 7, d60 + 4, 210);
  const d270 = clamp(d120 + 18 + descriptor.quality * 10 + seed * 8, d120 + 4, 255);
  const adShare = clamp(
    0.38 +
      normalizedSeed(`${cohortKey}:adshare`) * 0.34 +
      (descriptor.platform === "Android" ? 0.08 : -0.04) +
      (segmentBehavior.profileKey === "payers" ? -0.07 : 0) +
      (segmentBehavior.profileKey === "high-value" ? -0.1 : 0),
    0.18,
    0.86
  );
  const d1Retention = clamp(28 + descriptor.quality * 12 + seed * 6 + platformFactor * 3, 14, 62);
  const d7Retention = clamp(d1Retention * (0.48 + descriptor.quality * 0.14), 8, 42);
  const d30Retention = clamp(d7Retention * (0.42 + descriptor.quality * 0.12), 3, 24);
  const sessionMinutesValue = clamp(
    7.5 +
      descriptor.quality * 3.8 +
      normalizedSeed(`${cohortKey}:session`) * 4.5 +
      (segmentBehavior.profileKey === "returning" ? 1.9 : 0) +
      (segmentBehavior.profileKey === "high-value" ? 2.4 : 0),
    3.5,
    22
  );

  const ageInDays = diffInDays(now, cohortDate);
  const anchors = { 7: d30 * 0.34, 14: d30 * 0.62, 30: d30, 60: d60, 90: d60 + (d120 - d60) * 0.55, 120: d120, 180: d120 + (d270 - d120) * 0.5, 270: d270 };

  function envelope(target: number, predicted: number): MetricEnvelope {
    const intervalPct =
      (0.22 + target / 900 - Math.min(installs, 4800) / 32000 + (1 - descriptor.quality) * 0.09) *
      segmentProfile.varianceMultiplier;
    const boundedInterval = clamp(intervalPct, 0.08, 0.32);
    const actualAvailable = ageInDays >= target;
    const realized =
      actualAvailable
        ? predicted * (0.95 + normalizedSeed(`${cohortKey}:actual:${target}`) * 0.1)
        : null;
    return {
      predicted: Number(predicted.toFixed(2)),
      lower: Number((predicted * (1 - boundedInterval)).toFixed(2)),
      upper: Number((predicted * (1 + boundedInterval)).toFixed(2)),
      actual: realized === null ? null : Number(realized.toFixed(2)),
    };
  }

  const payback = Object.fromEntries(
    COHORT_DAY_POINTS.map((dayPoint) => {
      const predicted = interpolateMetric(dayPoint, anchors, ageInDays);
      return [dayPoint, envelope(dayPoint, predicted)];
    })
  ) as Record<number, MetricEnvelope>;

  return {
    cohortDate: formatIsoDate(cohortDate),
    spend: Number(spend.toFixed(2)),
    installs,
    adShare: Number(adShare.toFixed(4)),
    d30: envelope(30, d30),
    d60: envelope(60, d60),
    d120: envelope(120, d120),
    d270: envelope(270, d270),
    payback,
    retention: {
      d1: envelope(1, d1Retention),
      d7: envelope(7, d7Retention),
      d30: envelope(30, d30Retention),
    },
    sessionMinutes: envelope(7, sessionMinutesValue),
  };
}

function weightedAverage(values: Array<{ value: number; weight: number }>) {
  const weightSum = values.reduce((sum, entry) => sum + entry.weight, 0);
  if (weightSum === 0) {
    return 0;
  }
  return values.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / weightSum;
}

function aggregateEnvelope(entries: Array<{ metric: MetricEnvelope; weight: number }>): MetricEnvelope {
  const predicted = weightedAverage(entries.map((entry) => ({ value: entry.metric.predicted, weight: entry.weight })));
  const lower = weightedAverage(entries.map((entry) => ({ value: entry.metric.lower, weight: entry.weight })));
  const upper = weightedAverage(entries.map((entry) => ({ value: entry.metric.upper, weight: entry.weight })));
  const actualEntries = entries.filter((entry) => entry.metric.actual !== null);
  const actual =
    actualEntries.length === 0
      ? null
      : weightedAverage(
          actualEntries.map((entry) => ({ value: entry.metric.actual ?? 0, weight: entry.weight }))
        );

  return {
    predicted: Number(predicted.toFixed(2)),
    lower: Number(lower.toFixed(2)),
    upper: Number(upper.toFixed(2)),
    actual: actual === null ? null : Number(actual.toFixed(2)),
  };
}

function scaleEnvelope(metric: MetricEnvelope, factor: number): MetricEnvelope {
  return {
    predicted: Number((metric.predicted * factor).toFixed(2)),
    lower: Number((metric.lower * factor).toFixed(2)),
    upper: Number((metric.upper * factor).toFixed(2)),
    actual: metric.actual === null ? null : Number((metric.actual * factor).toFixed(2)),
  };
}

function getRevenueFactor(adShare: number, revenueMode: RevenueModeKey) {
  if (revenueMode === "ads") {
    return adShare;
  }

  if (revenueMode === "iap") {
    return 1 - adShare;
  }

  return 1;
}

function applyRevenueMode(metric: MetricEnvelope, adShare: number, revenueMode: RevenueModeKey) {
  return scaleEnvelope(metric, getRevenueFactor(adShare, revenueMode));
}

function getRevenueModeLabel(revenueMode: RevenueModeKey) {
  return REVENUE_MODE_OPTIONS.find((option) => option.value === revenueMode)?.label ?? "Total revenue";
}

function aggregateMetrics(
  descriptors: SliceDescriptor[],
  cohortDates: Date[],
  segmentKey: DashboardSegmentKey,
  savedSegments: SavedUserSegment[],
  now: Date
) {
  const segmentBehavior = getSegmentBehavior(segmentKey, savedSegments);
  return cohortDates.map((cohortDate) => {
    const metrics = descriptors.map((descriptor) =>
      synthesizeCohortMetric(descriptor, cohortDate, segmentBehavior, now)
    );
    const spend = metrics.reduce((sum, metric) => sum + metric.spend, 0);
    const installs = metrics.reduce((sum, metric) => sum + metric.installs, 0);

    return {
      cohortDate: formatIsoDate(cohortDate),
      spend,
      installs,
      adShare: weightedAverage(metrics.map((metric) => ({ value: metric.adShare, weight: metric.spend }))),
      d30: aggregateEnvelope(metrics.map((metric) => ({ metric: metric.d30, weight: metric.spend }))),
      d60: aggregateEnvelope(metrics.map((metric) => ({ metric: metric.d60, weight: metric.spend }))),
      d120: aggregateEnvelope(metrics.map((metric) => ({ metric: metric.d120, weight: metric.spend }))),
      d270: aggregateEnvelope(metrics.map((metric) => ({ metric: metric.d270, weight: metric.spend }))),
      payback: Object.fromEntries(
        COHORT_DAY_POINTS.map((dayPoint) => [
          dayPoint,
          aggregateEnvelope(metrics.map((metric) => ({ metric: metric.payback[dayPoint], weight: metric.spend }))),
        ])
      ) as Record<number, MetricEnvelope>,
      retention: {
        d1: aggregateEnvelope(metrics.map((metric) => ({ metric: metric.retention.d1, weight: metric.installs }))),
        d7: aggregateEnvelope(metrics.map((metric) => ({ metric: metric.retention.d7, weight: metric.installs }))),
        d30: aggregateEnvelope(metrics.map((metric) => ({ metric: metric.retention.d30, weight: metric.installs }))),
      },
      sessionMinutes: aggregateEnvelope(
        metrics.map((metric) => ({ metric: metric.sessionMinutes, weight: metric.installs }))
      ),
    };
  });
}

function inferConfidence(d60: MetricEnvelope) {
  const spread = Math.max(0, d60.upper - d60.lower);
  if (spread <= 16) {
    return "Tight";
  }
  if (spread <= 28) {
    return "Medium";
  }
  return "Wide";
}

function inferPaybackDay(payback: Record<number, MetricEnvelope>) {
  const ordered = COHORT_DAY_POINTS.map((dayPoint) => ({
    dayPoint,
    value: payback[dayPoint].predicted,
  }));

  const exact = ordered.find((entry) => entry.value >= 100);
  if (exact) {
    return exact.dayPoint;
  }

  const tail = ordered[ordered.length - 1];
  return Math.round(tail.dayPoint + Math.max(0, (100 - tail.value) * 1.6));
}

function summarizeAggregate(
  project: string,
  aggregates: ReturnType<typeof aggregateMetrics>,
  sliceCount: number,
  revenueMode: RevenueModeKey
): AcquisitionSummary {
  const spend = aggregates.reduce((sum, aggregate) => sum + aggregate.spend, 0);
  const installs = aggregates.reduce((sum, aggregate) => sum + aggregate.installs, 0);
  const adShare = weightedAverage(aggregates.map((aggregate) => ({ value: aggregate.adShare, weight: aggregate.spend })));
  const d30Total = aggregateEnvelope(aggregates.map((aggregate) => ({ metric: aggregate.d30, weight: aggregate.spend })));
  const d60Total = aggregateEnvelope(aggregates.map((aggregate) => ({ metric: aggregate.d60, weight: aggregate.spend })));
  const d120Total = aggregateEnvelope(aggregates.map((aggregate) => ({ metric: aggregate.d120, weight: aggregate.spend })));
  const d30 = aggregateEnvelope(
    aggregates.map((aggregate) => ({
      metric: applyRevenueMode(aggregate.d30, aggregate.adShare, revenueMode),
      weight: aggregate.spend,
    }))
  );
  const d60 = aggregateEnvelope(
    aggregates.map((aggregate) => ({
      metric: applyRevenueMode(aggregate.d60, aggregate.adShare, revenueMode),
      weight: aggregate.spend,
    }))
  );
  const d120 = aggregateEnvelope(
    aggregates.map((aggregate) => ({
      metric: applyRevenueMode(aggregate.d120, aggregate.adShare, revenueMode),
      weight: aggregate.spend,
    }))
  );
  const payback = Object.fromEntries(
    COHORT_DAY_POINTS.map((dayPoint) => [
      dayPoint,
      aggregateEnvelope(
        aggregates.map((aggregate) => ({
          metric: applyRevenueMode(aggregate.payback[dayPoint], aggregate.adShare, revenueMode),
          weight: aggregate.spend,
        }))
      ),
    ])
  ) as Record<number, MetricEnvelope>;
  const d1Retention = aggregateEnvelope(
    aggregates.map((aggregate) => ({ metric: aggregate.retention.d1, weight: aggregate.installs }))
  );
  const d7Retention = aggregateEnvelope(
    aggregates.map((aggregate) => ({ metric: aggregate.retention.d7, weight: aggregate.installs }))
  );
  const d30Retention = aggregateEnvelope(
    aggregates.map((aggregate) => ({ metric: aggregate.retention.d30, weight: aggregate.installs }))
  );
  const sessionMinutes = aggregateEnvelope(
    aggregates.map((aggregate) => ({ metric: aggregate.sessionMinutes, weight: aggregate.installs }))
  );
  const totalRevenuePerUser = installs === 0 ? 0 : (spend * d60Total.predicted) / 100 / installs;
  const adRevenuePerUser = totalRevenuePerUser * adShare;
  const iapRevenuePerUser = totalRevenuePerUser * (1 - adShare);

  return {
    project,
    revenueMode,
    spend: Number(spend.toFixed(0)),
    installs: Number(installs.toFixed(0)),
    cpi: installs === 0 ? 0 : Number((spend / installs).toFixed(2)),
    adShare: Number((adShare * 100).toFixed(1)),
    d30Roas: d30.predicted,
    d60Roas: d60.predicted,
    d120Roas: d120.predicted,
    totalRevenuePerUser: Number(totalRevenuePerUser.toFixed(2)),
    adRevenuePerUser: Number(adRevenuePerUser.toFixed(2)),
    iapRevenuePerUser: Number(iapRevenuePerUser.toFixed(2)),
    d1Retention: d1Retention.predicted,
    d7Retention: d7Retention.predicted,
    d30Retention: d30Retention.predicted,
    sessionMinutes: sessionMinutes.predicted,
    paybackDays: inferPaybackDay(payback),
    cohortCount: aggregates.length,
    sliceCount,
    confidence: inferConfidence(d60),
  };
}

function buildHorizonCharts(
  aggregates: ReturnType<typeof aggregateMetrics>,
  revenueMode: RevenueModeKey
): ComparisonConfidenceChartData[] {
  return HORIZON_CHARTS.map((chart) => ({
    id: `horizon-${chart.key}`,
    title: `${chart.label} · ${getRevenueModeLabel(revenueMode)}`,
    subtitle:
      "Notebook-parity cohort-date view with predicted, lower, upper, and realized values when age is sufficient.",
    unit: chart.unit,
    groups: [
      {
        label: "Selected slice",
        color: GROUP_COLORS[0],
        series: aggregates.map((aggregate) => {
          const metric = applyRevenueMode(aggregate[chart.key], aggregate.adShare, revenueMode);
          return {
            label: formatLabelDate(parseIsoDate(aggregate.cohortDate)),
            value: metric.predicted,
            lower: metric.lower,
            upper: metric.upper,
            actual: metric.actual,
          };
        }),
      },
    ],
  }));
}

function buildPaybackChart(
  aggregates: ReturnType<typeof aggregateMetrics>,
  revenueMode: RevenueModeKey
): ComparisonConfidenceChartData {
  const payback = Object.fromEntries(
    COHORT_DAY_POINTS.map((dayPoint) => [
      dayPoint,
      aggregateEnvelope(
        aggregates.map((aggregate) => ({
          metric: applyRevenueMode(aggregate.payback[dayPoint], aggregate.adShare, revenueMode),
          weight: aggregate.spend,
        }))
      ),
    ])
  ) as Record<number, MetricEnvelope>;

  return {
    id: "payback-curve",
    title: `Payback curve by lifetime day · ${getRevenueModeLabel(revenueMode)}`,
    subtitle:
      "Equivalent to notebook cumulative ROAS trajectory, plotted against lifetime rather than cohort date.",
    unit: "%",
    groups: [
      {
        label: "Selected slice",
        color: GROUP_COLORS[0],
        series: COHORT_DAY_POINTS.map((dayPoint) => ({
          label: `D${dayPoint}`,
          value: payback[dayPoint].predicted,
          lower: payback[dayPoint].lower,
          upper: payback[dayPoint].upper,
          actual: payback[dayPoint].actual,
        })),
      },
    ],
  };
}

function valueForDimension(descriptor: SliceDescriptor, dimension: AcquisitionCompareByKey) {
  if (dimension === "segment") {
    return "";
  }
  return descriptor[dimension];
}

function buildComparisonData(
  descriptors: SliceDescriptor[],
  cohortDates: Date[],
  filters: DashboardFilters,
  localFilters: AcquisitionLocalFilters,
  savedSegments: SavedUserSegment[],
  now: Date
) {
  const baseDescriptors = applyDescriptorFilters(descriptors, filters, localFilters, localFilters.compareBy);
  const leftLabel =
    localFilters.compareBy === "segment"
      ? getSegmentLabel(localFilters.compareLeft, savedSegments, filters.projectKey)
      : localFilters.compareLeft;
  const rightLabel =
    localFilters.compareBy === "segment"
      ? getSegmentLabel(localFilters.compareRight, savedSegments, filters.projectKey)
      : localFilters.compareRight;

  const leftDescriptors =
    localFilters.compareBy === "segment"
      ? resolveSegmentSlice(baseDescriptors, localFilters.compareLeft, savedSegments).descriptors
      : baseDescriptors.filter(
          (descriptor) => valueForDimension(descriptor, localFilters.compareBy) === localFilters.compareLeft
        );
  const rightDescriptors =
    localFilters.compareBy === "segment"
      ? resolveSegmentSlice(baseDescriptors, localFilters.compareRight, savedSegments).descriptors
      : baseDescriptors.filter(
          (descriptor) => valueForDimension(descriptor, localFilters.compareBy) === localFilters.compareRight
        );

  const leftSegment =
    localFilters.compareBy === "segment"
      ? localFilters.compareLeft
      : filters.segment;
  const rightSegment =
    localFilters.compareBy === "segment"
      ? localFilters.compareRight
      : filters.segment;

  const leftAggregates = aggregateMetrics(leftDescriptors, cohortDates, leftSegment, savedSegments, now);
  const rightAggregates = aggregateMetrics(rightDescriptors, cohortDates, rightSegment, savedSegments, now);
  const revenueMode = localFilters.revenueMode;

  const horizonCharts = HORIZON_CHARTS.slice(1).map((chart, index) => ({
    id: `compare-${chart.key}`,
    title: `${chart.label} comparison · ${getRevenueModeLabel(revenueMode)}`,
    subtitle: "The same surface is used for stored A/B tests and arbitrary segment comparisons.",
    unit: chart.unit,
    groups: [
      {
        label: leftLabel,
        color: GROUP_COLORS[0],
        series: leftAggregates.map((aggregate) => {
          const metric = applyRevenueMode(aggregate[chart.key], aggregate.adShare, revenueMode);
          return {
            label: formatLabelDate(parseIsoDate(aggregate.cohortDate)),
            value: metric.predicted,
            lower: metric.lower,
            upper: metric.upper,
            actual: metric.actual,
          };
        }),
      },
      {
        label: rightLabel,
        color: GROUP_COLORS[index + 1],
        series: rightAggregates.map((aggregate) => {
          const metric = applyRevenueMode(aggregate[chart.key], aggregate.adShare, revenueMode);
          return {
            label: formatLabelDate(parseIsoDate(aggregate.cohortDate)),
            value: metric.predicted,
            lower: metric.lower,
            upper: metric.upper,
            actual: metric.actual,
          };
        }),
      },
    ],
  }));

  const leftPayback = Object.fromEntries(
    COHORT_DAY_POINTS.map((dayPoint) => [
      dayPoint,
      aggregateEnvelope(
        leftAggregates.map((aggregate) => ({
          metric: applyRevenueMode(aggregate.payback[dayPoint], aggregate.adShare, revenueMode),
          weight: aggregate.spend,
        }))
      ),
    ])
  ) as Record<number, MetricEnvelope>;
  const rightPayback = Object.fromEntries(
    COHORT_DAY_POINTS.map((dayPoint) => [
      dayPoint,
      aggregateEnvelope(
        rightAggregates.map((aggregate) => ({
          metric: applyRevenueMode(aggregate.payback[dayPoint], aggregate.adShare, revenueMode),
          weight: aggregate.spend,
        }))
      ),
    ])
  ) as Record<number, MetricEnvelope>;

  const paybackChart: ComparisonConfidenceChartData = {
    id: "compare-payback",
    title: `Payback comparison by lifetime day · ${getRevenueModeLabel(revenueMode)}`,
    subtitle: "Notebook-style payback curve with confidence bands retained for both compared segments.",
    unit: "%",
    groups: [
      {
        label: leftLabel,
        color: GROUP_COLORS[0],
        series: COHORT_DAY_POINTS.map((dayPoint) => ({
          label: `D${dayPoint}`,
          value: leftPayback[dayPoint].predicted,
          lower: leftPayback[dayPoint].lower,
          upper: leftPayback[dayPoint].upper,
          actual: leftPayback[dayPoint].actual,
        })),
      },
      {
        label: rightLabel,
        color: GROUP_COLORS[1],
        series: COHORT_DAY_POINTS.map((dayPoint) => ({
          label: `D${dayPoint}`,
          value: rightPayback[dayPoint].predicted,
          lower: rightPayback[dayPoint].lower,
          upper: rightPayback[dayPoint].upper,
          actual: rightPayback[dayPoint].actual,
        })),
      },
    ],
  };

  const leftSummary = summarizeAggregate(
    getProjectLabel(filters.projectKey),
    leftAggregates,
    leftDescriptors.length,
    revenueMode
  );
  const rightSummary = summarizeAggregate(
    getProjectLabel(filters.projectKey),
    rightAggregates,
    rightDescriptors.length,
    revenueMode
  );
  const retentionCharts: ComparisonConfidenceChartData[] = [
    {
      id: "compare-retention-d7",
      title: "Retention comparison · D7",
      subtitle: "Compare retention by cohort date on the same filtered slice and group definition.",
      unit: "%",
      groups: [
        {
          label: leftLabel,
          color: GROUP_COLORS[0],
          series: leftAggregates.map((aggregate) => ({
            label: formatLabelDate(parseIsoDate(aggregate.cohortDate)),
            value: aggregate.retention.d7.predicted,
            lower: aggregate.retention.d7.lower,
            upper: aggregate.retention.d7.upper,
            actual: aggregate.retention.d7.actual,
          })),
        },
        {
          label: rightLabel,
          color: GROUP_COLORS[1],
          series: rightAggregates.map((aggregate) => ({
            label: formatLabelDate(parseIsoDate(aggregate.cohortDate)),
            value: aggregate.retention.d7.predicted,
            lower: aggregate.retention.d7.lower,
            upper: aggregate.retention.d7.upper,
            actual: aggregate.retention.d7.actual,
          })),
        },
      ],
    },
    {
      id: "compare-retention-d30",
      title: "Retention comparison · D30",
      subtitle: "Longer-tail retention, useful when comparing acquisition quality rather than only payback speed.",
      unit: "%",
      groups: [
        {
          label: leftLabel,
          color: GROUP_COLORS[0],
          series: leftAggregates.map((aggregate) => ({
            label: formatLabelDate(parseIsoDate(aggregate.cohortDate)),
            value: aggregate.retention.d30.predicted,
            lower: aggregate.retention.d30.lower,
            upper: aggregate.retention.d30.upper,
            actual: aggregate.retention.d30.actual,
          })),
        },
        {
          label: rightLabel,
          color: GROUP_COLORS[1],
          series: rightAggregates.map((aggregate) => ({
            label: formatLabelDate(parseIsoDate(aggregate.cohortDate)),
            value: aggregate.retention.d30.predicted,
            lower: aggregate.retention.d30.lower,
            upper: aggregate.retention.d30.upper,
            actual: aggregate.retention.d30.actual,
          })),
        },
      ],
    },
  ];
  const sessionChart: ComparisonConfidenceChartData = {
    id: "compare-session-minutes",
    title: "Average session length",
    subtitle: "Session duration comparison by cohort date. Useful when monetization moves but engagement quality is uncertain.",
    unit: "m",
    groups: [
      {
        label: leftLabel,
        color: GROUP_COLORS[0],
        series: leftAggregates.map((aggregate) => ({
          label: formatLabelDate(parseIsoDate(aggregate.cohortDate)),
          value: aggregate.sessionMinutes.predicted,
          lower: aggregate.sessionMinutes.lower,
          upper: aggregate.sessionMinutes.upper,
          actual: aggregate.sessionMinutes.actual,
        })),
      },
      {
        label: rightLabel,
        color: GROUP_COLORS[1],
        series: rightAggregates.map((aggregate) => ({
          label: formatLabelDate(parseIsoDate(aggregate.cohortDate)),
          value: aggregate.sessionMinutes.predicted,
          lower: aggregate.sessionMinutes.lower,
          upper: aggregate.sessionMinutes.upper,
          actual: aggregate.sessionMinutes.actual,
        })),
      },
    ],
  };
  const metricRows: MetricComparisonRow[] = [
    {
      category: "revenue",
      label: "D60 ROAS",
      unit: "%",
      leftValue: leftSummary.d60Roas,
      rightValue: rightSummary.d60Roas,
      delta: leftSummary.d60Roas - rightSummary.d60Roas,
      preferredDirection: "higher",
    },
    {
      category: "revenue",
      label: "D120 ROAS",
      unit: "%",
      leftValue: leftSummary.d120Roas,
      rightValue: rightSummary.d120Roas,
      delta: leftSummary.d120Roas - rightSummary.d120Roas,
      preferredDirection: "higher",
    },
    {
      category: "revenue",
      label: "Ad revenue / user",
      unit: "$",
      leftValue: leftSummary.adRevenuePerUser,
      rightValue: rightSummary.adRevenuePerUser,
      delta: leftSummary.adRevenuePerUser - rightSummary.adRevenuePerUser,
      preferredDirection: "higher",
    },
    {
      category: "revenue",
      label: "IAP revenue / user",
      unit: "$",
      leftValue: leftSummary.iapRevenuePerUser,
      rightValue: rightSummary.iapRevenuePerUser,
      delta: leftSummary.iapRevenuePerUser - rightSummary.iapRevenuePerUser,
      preferredDirection: "higher",
    },
    {
      category: "revenue",
      label: "Total revenue / user",
      unit: "$",
      leftValue: leftSummary.totalRevenuePerUser,
      rightValue: rightSummary.totalRevenuePerUser,
      delta: leftSummary.totalRevenuePerUser - rightSummary.totalRevenuePerUser,
      preferredDirection: "higher",
    },
    {
      category: "revenue",
      label: "Payback",
      unit: "d",
      leftValue: leftSummary.paybackDays,
      rightValue: rightSummary.paybackDays,
      delta: leftSummary.paybackDays - rightSummary.paybackDays,
      preferredDirection: "lower",
    },
    {
      category: "retention",
      label: "D1 retention",
      unit: "%",
      leftValue: leftSummary.d1Retention,
      rightValue: rightSummary.d1Retention,
      delta: leftSummary.d1Retention - rightSummary.d1Retention,
      preferredDirection: "higher",
    },
    {
      category: "retention",
      label: "D7 retention",
      unit: "%",
      leftValue: leftSummary.d7Retention,
      rightValue: rightSummary.d7Retention,
      delta: leftSummary.d7Retention - rightSummary.d7Retention,
      preferredDirection: "higher",
    },
    {
      category: "retention",
      label: "D30 retention",
      unit: "%",
      leftValue: leftSummary.d30Retention,
      rightValue: rightSummary.d30Retention,
      delta: leftSummary.d30Retention - rightSummary.d30Retention,
      preferredDirection: "higher",
    },
    {
      category: "engagement",
      label: "Session length",
      unit: "m",
      leftValue: leftSummary.sessionMinutes,
      rightValue: rightSummary.sessionMinutes,
      delta: leftSummary.sessionMinutes - rightSummary.sessionMinutes,
      preferredDirection: "higher",
    },
    {
      category: "engagement",
      label: "Ad share",
      unit: "%",
      leftValue: leftSummary.adShare,
      rightValue: rightSummary.adShare,
      delta: leftSummary.adShare - rightSummary.adShare,
      preferredDirection: "higher",
    },
  ];

  return {
    charts: [...horizonCharts, paybackChart, ...retentionCharts, sessionChart],
    summary: {
      leftLabel,
      rightLabel,
      d60Lift: Number((leftSummary.d60Roas - rightSummary.d60Roas).toFixed(1)),
      paybackDeltaDays: leftSummary.paybackDays - rightSummary.paybackDays,
      spendDelta: Number((leftSummary.spend - rightSummary.spend).toFixed(0)),
    },
    metricRows,
  };
}

function buildBreakdownRows(
  descriptors: SliceDescriptor[],
  cohortDates: Date[],
  filters: DashboardFilters,
  local: AcquisitionLocalFilters,
  savedSegments: SavedUserSegment[],
  now: Date
) {
  const filteredDescriptors = resolveSegmentSlice(
    applyDescriptorFilters(descriptors, filters, local),
    filters.segment,
    savedSegments
  ).descriptors;
  if (filteredDescriptors.length === 0) {
    return [] as AcquisitionBreakdownRow[];
  }

  const dimension = filters.groupBy;
  const groups =
    dimension === "none"
      ? new Map<string, SliceDescriptor[]>([["Selected slice", filteredDescriptors]])
      : filteredDescriptors.reduce((accumulator, descriptor) => {
          const key = descriptor[dimension];
          accumulator.set(key, [...(accumulator.get(key) ?? []), descriptor]);
          return accumulator;
        }, new Map<string, SliceDescriptor[]>());

  return Array.from(groups.entries())
    .map(([label, groupDescriptors]) => {
      const aggregates = aggregateMetrics(groupDescriptors, cohortDates, filters.segment, savedSegments, now);
      const summary = summarizeAggregate(
        getProjectLabel(filters.projectKey),
        aggregates,
        groupDescriptors.length,
        local.revenueMode
      );
      const platformSet = new Set(groupDescriptors.map((descriptor) => descriptor.platform));
      const platform: AcquisitionBreakdownRow["platform"] =
        platformSet.size === 1 ? Array.from(platformSet)[0] : "Mixed";

      return {
        label,
        dimension,
        platform,
        spend: summary.spend,
        installs: summary.installs,
        cohorts: summary.cohortCount,
        cpi: summary.cpi,
        revenuePerUser:
          local.revenueMode === "ads"
            ? summary.adRevenuePerUser
            : local.revenueMode === "iap"
              ? summary.iapRevenuePerUser
              : summary.totalRevenuePerUser,
        d30Roas: summary.d30Roas,
        d60Roas: summary.d60Roas,
        d120Roas: summary.d120Roas,
        d7Retention: summary.d7Retention,
        d30Retention: summary.d30Retention,
        sessionMinutes: summary.sessionMinutes,
        adShare: summary.adShare,
        paybackDays: summary.paybackDays,
        confidence: summary.confidence,
      };
    })
    .sort((left, right) => right.spend - left.spend);
}

function buildCohortMatrix(
  aggregates: ReturnType<typeof aggregateMetrics>,
  revenueMode: RevenueModeKey
): CohortMatrixRow[] {
  return aggregates
    .map((aggregate) => ({
      cohortDate: aggregate.cohortDate,
      spend: Number(aggregate.spend.toFixed(0)),
      installs: Number(aggregate.installs.toFixed(0)),
      cpi: aggregate.installs === 0 ? 0 : Number((aggregate.spend / aggregate.installs).toFixed(2)),
      cells: MATRIX_DAY_POINTS.map((dayPoint) => {
        const metric = applyRevenueMode(aggregate.payback[dayPoint], aggregate.adShare, revenueMode);
        return {
          label: `D${dayPoint}`,
          value: metric.predicted,
          lower: metric.lower,
          upper: metric.upper,
          actual: metric.actual,
        };
      }),
    }))
    .sort((left, right) => left.cohortDate.localeCompare(right.cohortDate));
}

export async function getAcquisitionDashboardData(
  filters: DashboardFilters,
  rawLocalFilters: AcquisitionLocalFilters,
  savedSegments: SavedUserSegment[] = []
): Promise<AcquisitionDashboardData> {
  const project = getProjectLabel(filters.projectKey);
  const descriptors = buildSliceCatalog(project);
  const { localFilters, options } = resolveLocalFilters(descriptors, filters, rawLocalFilters, savedSegments);
  const cohortDates = buildCohortDates(filters);
  const now = new Date();
  const selectedDescriptors = resolveSegmentSlice(
    applyDescriptorFilters(descriptors, filters, localFilters),
    filters.segment,
    savedSegments
  ).descriptors;
  const aggregates = aggregateMetrics(selectedDescriptors, cohortDates, filters.segment, savedSegments, now);
  const comparison = buildComparisonData(descriptors, cohortDates, filters, localFilters, savedSegments, now);

  return {
    localFilters,
    options,
    summary: summarizeAggregate(project, aggregates, selectedDescriptors.length, localFilters.revenueMode),
    horizonCharts: buildHorizonCharts(aggregates, localFilters.revenueMode),
    paybackChart: buildPaybackChart(aggregates, localFilters.revenueMode),
    compareCharts: comparison.charts,
    comparisonSummary: comparison.summary,
    metricComparisonRows: comparison.metricRows,
    breakdownRows: buildBreakdownRows(descriptors, cohortDates, filters, localFilters, savedSegments, now),
    cohortMatrix: buildCohortMatrix(aggregates, localFilters.revenueMode),
  };
}

export function getSegmentBuilderCatalog(projectKey: DashboardProjectKey): SegmentBuilderCatalog {
  const projectNames =
    projectKey === "all"
      ? Object.keys(PROJECT_DEFINITIONS)
      : [getProjectLabel(projectKey)].filter((value) => value in PROJECT_DEFINITIONS);
  const descriptors = projectNames.flatMap((projectName) => buildSliceCatalog(projectName));

  return {
    countries: buildOptions(descriptors, (descriptor) => descriptor.country),
    companies: buildOptions(descriptors, (descriptor) => descriptor.company),
    sources: buildOptions(descriptors, (descriptor) => descriptor.source),
    campaigns: buildOptions(descriptors, (descriptor) => descriptor.campaign),
    creatives: buildOptions(descriptors, (descriptor) => descriptor.creative),
  };
}
