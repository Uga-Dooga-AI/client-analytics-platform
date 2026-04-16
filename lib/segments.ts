import {
  SEGMENT_OPTIONS,
  type DashboardPlatformKey,
  type DashboardProjectKey,
  type DashboardSegmentKey,
  type DashboardSegmentPresetKey,
  type DashboardTagKey,
} from "@/lib/dashboard-filters";

export const SAVED_SEGMENTS_COOKIE = "cap_saved_segments";
const MAX_SAVED_SEGMENTS = 18;

export type SavedSegmentEventOperator = "did" | "did_not";

export type SavedSegmentEventRule = {
  eventName: string;
  operator: SavedSegmentEventOperator;
  withinDays: number;
  minCount: number;
};

export type SavedUserSegmentRules = {
  projectKey: DashboardProjectKey;
  platform: DashboardPlatformKey;
  country: string;
  company: string;
  source: string;
  campaign: string;
  creative: string;
  tag: DashboardTagKey;
  eventRules: SavedSegmentEventRule[];
};

export type SavedUserSegment = {
  id: string;
  label: string;
  description: string;
  profileKey: Exclude<DashboardSegmentPresetKey, "all">;
  rules: SavedUserSegmentRules;
  createdAt: string;
};

export type SegmentOption = {
  key: DashboardSegmentKey;
  label: string;
  kind: "builtin" | "saved";
  description?: string;
};

export type SavedSegmentInput = {
  label?: string;
  description?: string;
  profileKey?: string;
  rules?: Partial<SavedUserSegmentRules>;
};

export type SegmentBehavior = {
  label: string;
  kind: "builtin" | "saved";
  profileKey: DashboardSegmentPresetKey;
  spendMultiplier: number;
  installsMultiplier: number;
  roasMultiplier: number;
  varianceMultiplier: number;
  narrowingFactor: number;
  savedSegment?: SavedUserSegment;
};

const DEFAULT_RULES: SavedUserSegmentRules = {
  projectKey: "all",
  platform: "all",
  country: "all",
  company: "all",
  source: "all",
  campaign: "all",
  creative: "all",
  tag: "all",
  eventRules: [],
};

const PROFILE_BEHAVIOR: Record<DashboardSegmentPresetKey, Omit<SegmentBehavior, "label" | "kind" | "savedSegment">> = {
  all: {
    profileKey: "all",
    spendMultiplier: 1,
    installsMultiplier: 1,
    roasMultiplier: 1,
    varianceMultiplier: 1,
    narrowingFactor: 1,
  },
  "new-users": {
    profileKey: "new-users",
    spendMultiplier: 1.02,
    installsMultiplier: 1.08,
    roasMultiplier: 0.91,
    varianceMultiplier: 1.06,
    narrowingFactor: 0.94,
  },
  returning: {
    profileKey: "returning",
    spendMultiplier: 0.72,
    installsMultiplier: 0.66,
    roasMultiplier: 1.14,
    varianceMultiplier: 0.94,
    narrowingFactor: 0.88,
  },
  payers: {
    profileKey: "payers",
    spendMultiplier: 0.58,
    installsMultiplier: 0.44,
    roasMultiplier: 1.27,
    varianceMultiplier: 0.88,
    narrowingFactor: 0.74,
  },
  "high-value": {
    profileKey: "high-value",
    spendMultiplier: 0.46,
    installsMultiplier: 0.31,
    roasMultiplier: 1.39,
    varianceMultiplier: 0.85,
    narrowingFactor: 0.62,
  },
  "paid-ua": {
    profileKey: "paid-ua",
    spendMultiplier: 1,
    installsMultiplier: 1,
    roasMultiplier: 1.03,
    varianceMultiplier: 1,
    narrowingFactor: 0.92,
  },
};

export function isBuiltinSegmentKey(value: string): value is DashboardSegmentPresetKey {
  return SEGMENT_OPTIONS.some((option) => option.key === value);
}

export function getBuiltinSegmentOptions(): SegmentOption[] {
  return SEGMENT_OPTIONS.map((option) => ({
    key: option.key,
    label: option.label,
    kind: "builtin" as const,
  }));
}

export function parseSavedSegmentsCookie(rawValue?: string | null): SavedUserSegment[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => normalizeSavedSegment(entry))
      .filter((entry): entry is SavedUserSegment => Boolean(entry));
  } catch {
    return [];
  }
}

export function serializeSavedSegmentsCookie(savedSegments: SavedUserSegment[]) {
  return JSON.stringify(savedSegments.slice(0, MAX_SAVED_SEGMENTS));
}

export function filterSavedSegmentsForProject(
  savedSegments: SavedUserSegment[],
  projectKey: DashboardProjectKey
) {
  if (projectKey === "all") {
    return savedSegments;
  }

  return savedSegments.filter(
    (segment) => segment.rules.projectKey === "all" || segment.rules.projectKey === projectKey
  );
}

export function getSegmentOptions(
  savedSegments: SavedUserSegment[],
  projectKey: DashboardProjectKey
): SegmentOption[] {
  const scopedSavedSegments = filterSavedSegmentsForProject(savedSegments, projectKey).map((segment) => ({
    key: segment.id,
    label: segment.label,
    kind: "saved" as const,
    description: segment.description,
  }));

  return [...getBuiltinSegmentOptions(), ...scopedSavedSegments];
}

export function getSegmentLabel(
  segmentKey: DashboardSegmentKey,
  savedSegments: SavedUserSegment[],
  projectKey: DashboardProjectKey = "all"
) {
  const match = getSegmentOptions(savedSegments, projectKey).find((option) => option.key === segmentKey);
  if (match) {
    return match.label;
  }

  return segmentKey === "all" ? "All users" : segmentKey;
}

export function findSavedSegment(
  savedSegments: SavedUserSegment[],
  segmentKey: DashboardSegmentKey
) {
  return savedSegments.find((segment) => segment.id === segmentKey);
}

export function getSegmentBehavior(
  segmentKey: DashboardSegmentKey,
  savedSegments: SavedUserSegment[]
): SegmentBehavior {
  const savedSegment = findSavedSegment(savedSegments, segmentKey);
  const base = PROFILE_BEHAVIOR[savedSegment?.profileKey ?? (isBuiltinSegmentKey(segmentKey) ? segmentKey : "all")];

  if (!savedSegment) {
    return {
      label: getSegmentLabel(segmentKey, savedSegments),
      kind: "builtin",
      ...base,
    };
  }

  const activeRulesCount = Object.entries(savedSegment.rules).filter(
    ([key, value]) => key !== "projectKey" && key !== "eventRules" && value !== "all"
  ).length + (savedSegment.rules.projectKey !== "all" ? 1 : 0) + savedSegment.rules.eventRules.length;

  return {
    label: savedSegment.label,
    kind: "saved",
    savedSegment,
    ...base,
    narrowingFactor: clamp(base.narrowingFactor - activeRulesCount * 0.08, 0.36, 0.96),
  };
}

export function createSavedSegment(
  input: SavedSegmentInput,
  existingSegments: SavedUserSegment[]
) {
  const label = normalizeLabel(input.label);
  if (!label) {
    return { error: "Segment label is required." as const };
  }

  if (existingSegments.length >= MAX_SAVED_SEGMENTS) {
    return { error: `Only ${MAX_SAVED_SEGMENTS} saved segments are allowed right now.` as const };
  }

  const profileKey = isEditableProfileKey(input.profileKey) ? input.profileKey : "paid-ua";
  const rules = normalizeRules(input.rules);
  const id = `segment-${slugify(label)}-${Date.now().toString(36)}`;

  return {
    segment: {
      id,
      label,
      description: normalizeDescription(input.description),
      profileKey,
      rules,
      createdAt: new Date().toISOString(),
    } satisfies SavedUserSegment,
  };
}

export function deleteSavedSegment(savedSegments: SavedUserSegment[], id: string) {
  return savedSegments.filter((segment) => segment.id !== id);
}

function normalizeSavedSegment(entry: unknown): SavedUserSegment | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const candidate = entry as Partial<SavedUserSegment>;
  const label = normalizeLabel(candidate.label);
  const profileKey = isEditableProfileKey(candidate.profileKey) ? candidate.profileKey : null;
  if (!label || !profileKey || typeof candidate.id !== "string") {
    return null;
  }

  return {
    id: candidate.id,
    label,
    description: normalizeDescription(candidate.description),
    profileKey,
    rules: normalizeRules(candidate.rules),
    createdAt:
      typeof candidate.createdAt === "string" && candidate.createdAt.length > 0
        ? candidate.createdAt
        : new Date(0).toISOString(),
  };
}

function normalizeRules(rules?: Partial<SavedUserSegmentRules>): SavedUserSegmentRules {
  return {
    projectKey: isAllowedProjectKey(rules?.projectKey) ? rules?.projectKey : DEFAULT_RULES.projectKey,
    platform: isAllowedPlatformKey(rules?.platform) ? rules?.platform : DEFAULT_RULES.platform,
    country: normalizeFilterValue(rules?.country),
    company: normalizeFilterValue(rules?.company),
    source: normalizeFilterValue(rules?.source),
    campaign: normalizeFilterValue(rules?.campaign),
    creative: normalizeFilterValue(rules?.creative),
    tag: isAllowedTagKey(rules?.tag) ? rules?.tag : DEFAULT_RULES.tag,
    eventRules: normalizeEventRules(rules?.eventRules),
  };
}

function normalizeEventRules(rules?: SavedSegmentEventRule[]) {
  if (!Array.isArray(rules)) {
    return [];
  }

  return rules
    .map((rule) => {
      const eventName = normalizeFilterValue(rule?.eventName);
      if (eventName === "all") {
        return null;
      }

      return {
        eventName,
        operator: rule?.operator === "did_not" ? "did_not" : "did",
        withinDays: clamp(Number(rule?.withinDays) || 30, 1, 365),
        minCount: clamp(Number(rule?.minCount) || 1, 1, 99),
      } satisfies SavedSegmentEventRule;
    })
    .filter((rule): rule is SavedSegmentEventRule => Boolean(rule))
    .slice(0, 4);
}

function normalizeLabel(value?: string) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 64);
}

function normalizeDescription(value?: string) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 180);
}

function normalizeFilterValue(value?: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "all";
  }

  return value.trim().slice(0, 96);
}

function isAllowedProjectKey(value?: string): value is DashboardProjectKey {
  return typeof value === "string" && value.trim().length > 0;
}

function isAllowedPlatformKey(value?: string): value is DashboardPlatformKey {
  return ["all", "ios", "android", "web"].includes(value ?? "");
}

function isAllowedTagKey(value?: string): value is DashboardTagKey {
  return ["all", "roas", "monetization", "retention", "ua", "experiments"].includes(value ?? "");
}

function isEditableProfileKey(value?: string): value is Exclude<DashboardSegmentPresetKey, "all"> {
  return ["new-users", "returning", "payers", "high-value", "paid-ua"].includes(value ?? "");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
