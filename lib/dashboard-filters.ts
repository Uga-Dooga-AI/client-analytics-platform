export type DashboardProjectKey = string;
export type DashboardRangeKey = "7d" | "30d" | "90d" | "mtd" | "custom";
export type DashboardGranularityKey = "1" | "7" | "14" | "30";
export type DashboardPlatformKey = "all" | "ios" | "android" | "web";
export type DashboardSegmentPresetKey =
  | "all"
  | "new-users"
  | "returning"
  | "payers"
  | "high-value"
  | "paid-ua";
export type DashboardSegmentKey = string;
export type DashboardGroupByKey =
  | "none"
  | "platform"
  | "country"
  | "source"
  | "campaign"
  | "creative"
  | "company";
export type DashboardTagKey =
  | "all"
  | "roas"
  | "monetization"
  | "retention"
  | "ua"
  | "experiments";

export interface DashboardFilters {
  projectKey: DashboardProjectKey;
  rangeKey: DashboardRangeKey;
  granularityKey: DashboardGranularityKey;
  granularityDays: number;
  from: string;
  to: string;
  platform: DashboardPlatformKey;
  segment: DashboardSegmentKey;
  groupBy: DashboardGroupByKey;
  tag: DashboardTagKey;
}

export const DASHBOARD_PROJECTS: Array<{
  key: string;
  label: string;
  shortLabel: string;
}> = [
  { key: "word-catcher", label: "Word Catcher", shortLabel: "WC" },
  { key: "words-in-word", label: "Words in Word", shortLabel: "WIW" },
  { key: "2pg", label: "2PG", shortLabel: "2PG" },
];

export const RANGE_OPTIONS: Array<{ key: DashboardRangeKey; label: string }> = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "mtd", label: "Month to date" },
  { key: "custom", label: "Custom range" },
];

export const GRANULARITY_OPTIONS: Array<{ key: DashboardGranularityKey; label: string; days: number }> = [
  { key: "1", label: "Daily", days: 1 },
  { key: "7", label: "Weekly", days: 7 },
  { key: "14", label: "14 days", days: 14 },
  { key: "30", label: "30 days", days: 30 },
];

export const PLATFORM_OPTIONS: Array<{ key: DashboardPlatformKey; label: string }> = [
  { key: "all", label: "All platforms" },
  { key: "ios", label: "iOS" },
  { key: "android", label: "Android" },
  { key: "web", label: "Web" },
];

export const SEGMENT_OPTIONS: Array<{ key: DashboardSegmentPresetKey; label: string }> = [
  { key: "all", label: "All users" },
  { key: "new-users", label: "New users" },
  { key: "returning", label: "Returning" },
  { key: "payers", label: "Payers" },
  { key: "high-value", label: "High value" },
  { key: "paid-ua", label: "Paid UA" },
];

export const GROUP_BY_OPTIONS: Array<{ key: DashboardGroupByKey; label: string }> = [
  { key: "none", label: "No grouping" },
  { key: "platform", label: "Platform" },
  { key: "country", label: "Country" },
  { key: "source", label: "Traffic source" },
  { key: "campaign", label: "Campaign" },
  { key: "creative", label: "Creative" },
  { key: "company", label: "Company" },
];

export const TAG_OPTIONS: Array<{ key: DashboardTagKey; label: string }> = [
  { key: "all", label: "All tags" },
  { key: "roas", label: "ROAS" },
  { key: "monetization", label: "Monetization" },
  { key: "retention", label: "Retention" },
  { key: "ua", label: "User acquisition" },
  { key: "experiments", label: "Experiments" },
];

const PROJECT_NAME_TO_KEY: Record<string, string> = {
  "Word Catcher": "word-catcher",
  "Words in Word": "words-in-word",
  "2PG": "2pg",
};

function formatDateInput(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftUtcDays(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getRangeDates(rangeKey: DashboardRangeKey, now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (rangeKey === "mtd") {
    return { from: formatDateInput(startOfMonth(end)), to: formatDateInput(end) };
  }

  if (rangeKey === "90d") {
    return { from: formatDateInput(shiftUtcDays(end, -89)), to: formatDateInput(end) };
  }

  if (rangeKey === "7d") {
    return { from: formatDateInput(shiftUtcDays(end, -6)), to: formatDateInput(end) };
  }

  return { from: formatDateInput(shiftUtcDays(end, -29)), to: formatDateInput(end) };
}

function getDefaultProjectForPath(pathname: string): DashboardProjectKey {
  return pathname === "/overview" || pathname === "/segments" ? "all" : "word-catcher";
}

export function getProjectOptions(pathname: string) {
  if (pathname === "/overview" || pathname === "/segments") {
    return [
      { key: "all" as const, label: "Cross-project overview", shortLabel: "All" },
      ...DASHBOARD_PROJECTS,
    ];
  }

  return DASHBOARD_PROJECTS;
}

export function getProjectLabel(projectKey: DashboardProjectKey) {
  if (projectKey === "all") {
    return "Cross-project overview";
  }

  const staticMatch = DASHBOARD_PROJECTS.find((project) => project.key === projectKey)?.label;
  if (staticMatch) {
    return staticMatch;
  }

  return projectKey
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function projectNameToKey(projectName: string): DashboardProjectKey {
  return PROJECT_NAME_TO_KEY[projectName] ?? projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function matchesProject(projectName: string, projectKey: DashboardProjectKey) {
  if (projectKey === "all") {
    return true;
  }

  return projectNameToKey(projectName) === projectKey;
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

function isAllowedProjectForPath(projectKey: string | undefined, pathname: string): projectKey is DashboardProjectKey {
  if (!projectKey) {
    return false;
  }

  if (projectKey === "all") {
    return getProjectOptions(pathname).some((project) => project.key === "all");
  }

  return projectKey.trim().length > 0;
}

export function parseDashboardSearchParams(
  raw: URLSearchParams | Record<string, string | string[] | undefined>,
  pathname: string
): DashboardFilters {
  const rangeKey = (readSingleParam(raw, "range") as DashboardRangeKey | undefined) ?? "30d";
  const normalizedRangeKey = RANGE_OPTIONS.some((option) => option.key === rangeKey) ? rangeKey : "30d";
  const granularityRaw = (readSingleParam(raw, "granularity") as DashboardGranularityKey | undefined) ?? "7";
  const granularity = GRANULARITY_OPTIONS.find((option) => option.key === granularityRaw) ?? GRANULARITY_OPTIONS[1];
  const defaultRange = getRangeDates(normalizedRangeKey);

  const projectKeyRaw = readSingleParam(raw, "project");
  const projectKey = isAllowedProjectForPath(projectKeyRaw, pathname)
    ? projectKeyRaw
    : getDefaultProjectForPath(pathname);

  const platform = (readSingleParam(raw, "platform") as DashboardPlatformKey | undefined) ?? "all";
  const segment = (readSingleParam(raw, "segment") as DashboardSegmentKey | undefined) ?? "all";
  const groupBy = (readSingleParam(raw, "groupBy") as DashboardGroupByKey | undefined) ?? "none";
  const tag = (readSingleParam(raw, "tag") as DashboardTagKey | undefined) ?? "all";

  return {
    projectKey,
    rangeKey: normalizedRangeKey,
    granularityKey: granularity.key,
    granularityDays: granularity.days,
    from: readSingleParam(raw, "from") ?? defaultRange.from,
    to: readSingleParam(raw, "to") ?? defaultRange.to,
    platform: PLATFORM_OPTIONS.some((option) => option.key === platform) ? platform : "all",
    segment,
    groupBy: GROUP_BY_OPTIONS.some((option) => option.key === groupBy) ? groupBy : "none",
    tag: TAG_OPTIONS.some((option) => option.key === tag) ? tag : "all",
  };
}

export function serializeDashboardFilters(filters: DashboardFilters) {
  const params = new URLSearchParams();
  params.set("project", filters.projectKey);
  params.set("range", filters.rangeKey);
  params.set("granularity", filters.granularityKey);
  params.set("from", filters.from);
  params.set("to", filters.to);
  params.set("platform", filters.platform);
  params.set("segment", filters.segment);
  params.set("groupBy", filters.groupBy);
  params.set("tag", filters.tag);
  return params;
}

export function getRangePatch(rangeKey: DashboardRangeKey, now = new Date()) {
  if (rangeKey === "custom") {
    const fallback = getRangeDates("30d", now);
    return { rangeKey, from: fallback.from, to: fallback.to };
  }

  return { rangeKey, ...getRangeDates(rangeKey, now) };
}

export function normalizeFiltersForPath(filters: DashboardFilters, pathname: string): DashboardFilters {
  const projectKey = isAllowedProjectForPath(filters.projectKey, pathname)
    ? filters.projectKey
    : getDefaultProjectForPath(pathname);

  return { ...filters, projectKey };
}
