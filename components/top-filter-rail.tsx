"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getStitchRoute, getStitchStatusMeta } from "@/lib/stitch";
import {
  GRANULARITY_OPTIONS,
  getProjectOptions,
  getRangePatch,
  GROUP_BY_OPTIONS,
  normalizeFiltersForPath,
  parseDashboardSearchParams,
  PLATFORM_OPTIONS,
  RANGE_OPTIONS,
  serializeDashboardFilters,
  TAG_OPTIONS,
  type DashboardFilters,
  type DashboardGroupByKey,
  type DashboardRangeKey,
} from "@/lib/dashboard-filters";
import { getSegmentLabel, getSegmentOptions, type SavedUserSegment } from "@/lib/segments";

const DEMO_ACCESS_ENABLED = process.env.NEXT_PUBLIC_DEMO_ACCESS_ENABLED === "true";

export function TopFilterRail({
  title,
  allowedGroupByKeys,
}: {
  title: string;
  allowedGroupByKeys?: DashboardGroupByKey[];
}) {
  return (
    <Suspense fallback={<TopFilterRailFrame title={title} />}>
      <TopFilterRailContent title={title} allowedGroupByKeys={allowedGroupByKeys} />
    </Suspense>
  );
}

function TopFilterRailContent({
  title,
  allowedGroupByKeys,
}: {
  title: string;
  allowedGroupByKeys?: DashboardGroupByKey[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, startTransition] = useTransition();
  const [savedSegments, setSavedSegments] = useState<SavedUserSegment[]>([]);
  const [dynamicProjects, setDynamicProjects] = useState<
    Array<{ key: string; label: string; shortLabel: string }>
  >([]);
  const [draftFilters, setDraftFilters] = useState<DashboardFilters>(() =>
    normalizeFiltersForPath(parseDashboardSearchParams(searchParams, pathname), pathname)
  );
  const [activityState, setActivityState] = useState<"idle" | "settling" | "updating">("idle");
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filters = useMemo(
    () => normalizeFiltersForPath(parseDashboardSearchParams(searchParams, pathname), pathname),
    [pathname, searchParams]
  );
  const currentQuery = useMemo(
    () => serializeDashboardFilters(filters).toString(),
    [filters]
  );
  const stitchRoute = getStitchRoute(pathname);
  const stitchStatus = stitchRoute ? getStitchStatusMeta(stitchRoute.status) : null;
  const supportsCustomDayStep =
    pathname === "/forecasts" || pathname === "/acquisition" || pathname === "/cohorts";
  const groupByOptions = useMemo(() => {
    const scopedOptions = allowedGroupByKeys
      ? GROUP_BY_OPTIONS.filter((option) => allowedGroupByKeys.includes(option.key))
      : GROUP_BY_OPTIONS;

    return scopedOptions.length > 0 ? scopedOptions : GROUP_BY_OPTIONS;
  }, [allowedGroupByKeys]);
  const projectOptions = useMemo(() => {
    const base = getProjectOptions(pathname);
    if (DEMO_ACCESS_ENABLED) {
      const extras = dynamicProjects.filter(
        (project) => !base.some((baseProject) => baseProject.key === project.key)
      );
      return [...base, ...extras];
    }

    if (dynamicProjects.length > 0) {
      const overviewOption = base.find((project) => project.key === "all");
      return overviewOption ? [overviewOption, ...dynamicProjects] : dynamicProjects;
    }

    const selectedOption = base.find((project) => project.key === draftFilters.projectKey);
    if (selectedOption) {
      const overviewOption = base.find((project) => project.key === "all");
      if (overviewOption && selectedOption.key !== "all") {
        return [overviewOption, selectedOption];
      }

      return [selectedOption];
    }

    return base;
  }, [draftFilters.projectKey, dynamicProjects, pathname]);
  const segmentOptions = useMemo(() => {
    const options = getSegmentOptions(savedSegments, draftFilters.projectKey).map((option) => ({
      value: option.key,
      label: option.label,
    }));

    if (!options.some((option) => option.value === draftFilters.segment)) {
      options.push({
        value: draftFilters.segment,
        label: getSegmentLabel(draftFilters.segment, savedSegments, draftFilters.projectKey),
      });
    }

    return options;
  }, [draftFilters.projectKey, draftFilters.segment, savedSegments]);

  useEffect(() => {
    if (commitTimerRef.current || isNavigating) {
      return;
    }

    setDraftFilters((currentDraft) =>
      sameDashboardFilters(currentDraft, filters) ? currentDraft : filters
    );
    setActivityState("idle");
  }, [filters, isNavigating]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedSegments() {
      const response = await fetch("/api/segments", { cache: "no-store" }).catch(() => null);
      if (!response || !response.ok) {
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!cancelled) {
        setSavedSegments(payload?.segments ?? []);
      }
    }

    async function loadProjects() {
      const response = await fetch("/api/projects", { cache: "no-store" }).catch(() => null);
      if (!response || !response.ok) {
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!cancelled) {
        setDynamicProjects(payload?.projects ?? []);
      }
    }

    void loadSavedSegments();
    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
      }
    };
  }, []);

  function clearScheduledCommit() {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }

  function commitFiltersNow(nextFilters: DashboardFilters) {
    clearScheduledCommit();
    const nextQuery = serializeDashboardFilters(nextFilters).toString();
    if (nextQuery === currentQuery) {
      setActivityState("idle");
      return;
    }

    setActivityState("updating");
    startTransition(() => {
      router.replace(`${pathname}?${nextQuery}`, { scroll: false });
    });
  }

  function queueFilters(
    patch: Partial<DashboardFilters>,
    options: { delayMs?: number } = {}
  ) {
    const nextFilters = normalizeFiltersForPath({ ...draftFilters, ...patch }, pathname);
    const delayMs = options.delayMs ?? 0;

    setDraftFilters(nextFilters);
    clearScheduledCommit();

    if (delayMs <= 0) {
      commitFiltersNow(nextFilters);
      return;
    }

    setActivityState("settling");
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      commitFiltersNow(nextFilters);
    }, delayMs);
  }

  useEffect(() => {
    if (groupByOptions.some((option) => option.key === draftFilters.groupBy)) {
      return;
    }

    const nextGroupBy = groupByOptions[0]?.key ?? "none";
    setDraftFilters((currentDraft) => ({ ...currentDraft, groupBy: nextGroupBy }));
    commitFiltersNow(
      normalizeFiltersForPath({ ...filters, groupBy: nextGroupBy }, pathname)
    );
  }, [draftFilters.groupBy, filters, groupByOptions, pathname]);

  function handleRangeChange(nextRange: DashboardRangeKey) {
    queueFilters(getRangePatch(nextRange), { delayMs: 240 });
  }

  const activityLabel =
    activityState === "settling"
      ? "Waiting for the latest filter input"
      : activityState === "updating"
        ? "Refreshing page scope"
        : null;
  const activityDescription =
    activityState === "settling"
      ? "The interface is using the newest value locally and will commit the page update only after your input settles."
      : activityState === "updating"
        ? "Updating URL state, page scope, and lightweight filter catalogs without reloading heavy forecast data."
        : null;

  return (
    <TopFilterRailFrame
      title={title}
      stitchStatusLabel={stitchStatus?.label}
      stitchStatusColor={stitchStatus?.color}
      stitchWave={stitchRoute?.wave}
      onManageSegments={pathname === "/segments" ? undefined : () => router.push("/segments")}
      activityLabel={activityLabel}
      activityDescription={activityDescription}
      activityState={activityState}
      controlRows={
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: supportsCustomDayStep
                ? "minmax(180px, 1.2fr) repeat(6, minmax(116px, 0.74fr)) minmax(196px, 1fr)"
                : "minmax(180px, 1.2fr) repeat(5, minmax(124px, 0.78fr)) minmax(196px, 1fr)",
              gap: 10,
              alignItems: "end",
            }}
          >
            <FilterField
              label="Project"
              value={draftFilters.projectKey}
              onChange={(value) =>
                queueFilters({ projectKey: value as DashboardFilters["projectKey"] }, { delayMs: 240 })
              }
              options={projectOptions.map((option) => ({ value: option.key, label: option.label }))}
            />
            <FilterField
              label="Range"
              value={draftFilters.rangeKey}
              onChange={(value) => handleRangeChange(value as DashboardRangeKey)}
              options={RANGE_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
            />
            <FilterField
              label="Day step"
              value={draftFilters.granularityKey}
              onChange={(value) => {
                const option = GRANULARITY_OPTIONS.find((item) => item.key === value) ?? GRANULARITY_OPTIONS[1];
                queueFilters({
                  granularityKey: option.key,
                  granularityDays: option.key === "custom" ? draftFilters.granularityDays : option.days,
                }, { delayMs: 240 });
              }}
              options={GRANULARITY_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
            />
            {supportsCustomDayStep ? (
              <NumberField
                label="Step days"
                value={draftFilters.granularityDays}
                disabled={draftFilters.granularityKey !== "custom"}
                min={1}
                max={28}
                onChange={(value) =>
                  queueFilters({
                    granularityKey: "custom",
                    granularityDays: Math.max(1, Math.min(28, Math.round(value || 1))),
                  }, { delayMs: 900 })
                }
              />
            ) : null}
            <FilterField
              label="Platform"
              value={draftFilters.platform}
              onChange={(value) =>
                queueFilters({ platform: value as DashboardFilters["platform"] }, { delayMs: 240 })
              }
              options={PLATFORM_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
            />
            <FilterField
              label="Segment"
              value={draftFilters.segment}
              onChange={(value) =>
                queueFilters({ segment: value as DashboardFilters["segment"] }, { delayMs: 240 })
              }
              options={segmentOptions}
            />
            <FilterField
              label="Group by"
              value={draftFilters.groupBy}
              onChange={(value) =>
                queueFilters({ groupBy: value as DashboardFilters["groupBy"] }, { delayMs: 240 })
              }
              options={groupByOptions.map((option) => ({ value: option.key, label: option.label }))}
            />
            <FilterField
              label="Tag"
              value={draftFilters.tag}
              onChange={(value) =>
                queueFilters({ tag: value as DashboardFilters["tag"] }, { delayMs: 240 })
              }
              options={TAG_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(150px, 180px) minmax(150px, 180px) minmax(220px, 1fr)",
              gap: 10,
              alignItems: "end",
            }}
          >
            <DateField
              label="From"
              value={draftFilters.from}
              onChange={(value) => queueFilters({ rangeKey: "custom", from: value }, { delayMs: 900 })}
            />
            <DateField
              label="To"
              value={draftFilters.to}
              onChange={(value) => queueFilters({ rangeKey: "custom", to: value }, { delayMs: 900 })}
            />

            <div
              style={{
                border: "1px solid var(--color-border-soft)",
                background: "var(--color-panel-soft)",
                borderRadius: 10,
                padding: "10px 12px",
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)" }}>
                  Applied slice
                </div>
                <div style={{ fontSize: 13, color: "var(--color-ink-900)", marginTop: 4 }}>
                  {draftFilters.from} to {draftFilters.to}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <SlicePill label={projectOptions.find((project) => project.key === draftFilters.projectKey)?.shortLabel ?? "NA"} />
                <SlicePill label={draftFilters.platform === "all" ? "All platforms" : draftFilters.platform.toUpperCase()} />
                <SlicePill label={getSegmentLabel(draftFilters.segment, savedSegments, draftFilters.projectKey)} />
                <SlicePill label={`step ${draftFilters.granularityDays}d`} />
                <SlicePill label={draftFilters.groupBy === "none" ? "Ungrouped" : draftFilters.groupBy} />
              </div>
            </div>
          </div>
        </>
      }
    />
  );
}

function FilterField({
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
      <span style={FIELD_LABEL_STYLE}>{label}</span>
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

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={FIELD_LABEL_STYLE}>{label}</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} style={FIELD_STYLE} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={FIELD_LABEL_STYLE}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          ...FIELD_STYLE,
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? "not-allowed" : "text",
        }}
      />
    </label>
  );
}

function SlicePill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 9px",
        borderRadius: 999,
        background: "var(--color-panel-base)",
        border: "1px solid var(--color-border-soft)",
        fontSize: 11.5,
        fontWeight: 600,
        color: "var(--color-ink-700)",
      }}
    >
      {label}
    </span>
  );
}

function SeparatorDot() {
  return <span style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "var(--color-border-strong)" }} />;
}

function TopFilterRailFrame({
  title,
  stitchStatusLabel,
  stitchStatusColor,
  stitchWave,
  onManageSegments,
  activityLabel,
  activityDescription,
  activityState,
  controlRows,
}: {
  title: string;
  stitchStatusLabel?: string;
  stitchStatusColor?: string;
  stitchWave?: number;
  onManageSegments?: () => void;
  activityLabel?: string | null;
  activityDescription?: string | null;
  activityState?: "idle" | "settling" | "updating";
  controlRows?: ReactNode;
}) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        backgroundColor: "var(--color-panel-base)",
        borderBottom: "1px solid var(--color-border-soft)",
        padding: "14px 24px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flexShrink: 0,
      }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--color-ink-500)",
              marginBottom: 4,
              flexWrap: "wrap",
            }}
          >
            <span>Shell mode</span>
            {stitchStatusLabel ? (
              <>
                <SeparatorDot />
                <span style={{ color: stitchStatusColor }}>{stitchStatusLabel}</span>
                {stitchWave ? (
                  <>
                    <SeparatorDot />
                    <span>Wave {stitchWave}</span>
                  </>
                ) : null}
              </>
            ) : null}
            {DEMO_ACCESS_ENABLED ? (
              <>
                <SeparatorDot />
                <span style={{ color: "var(--color-warning)" }}>Demo access enabled</span>
              </>
            ) : null}
          </div>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 700,
              color: "var(--color-ink-950)",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {title}
          </h1>
        </div>

        <div
          style={{
            fontSize: 11.5,
            color: "var(--color-ink-500)",
            lineHeight: 1.5,
            textAlign: "right",
            maxWidth: 340,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "flex-end",
          }}
        >
          <div>Project-first filtering, custom date window, day-step grouping, segmentation, and compare surfaces are active in the shell.</div>
          {onManageSegments ? (
            <button type="button" onClick={onManageSegments} style={MANAGE_BUTTON_STYLE}>
              Manage segments
            </button>
          ) : null}
        </div>
      </div>

      {activityLabel && activityState !== "idle" ? (
        <div
          style={{
            border: "1px solid var(--color-border-soft)",
            background:
              activityState === "updating"
                ? "rgba(15, 23, 42, 0.04)"
                : "rgba(37, 99, 235, 0.06)",
            borderRadius: 12,
            padding: "10px 12px",
            display: "grid",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-ink-950)" }}>
                {activityLabel}
              </div>
              {activityDescription ? (
                <div style={{ marginTop: 2, fontSize: 11.5, lineHeight: 1.45, color: "var(--color-ink-600)" }}>
                  {activityDescription}
                </div>
              ) : null}
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: activityState === "updating" ? "var(--color-ink-950)" : "var(--color-primary)",
                whiteSpace: "nowrap",
              }}
            >
              {activityState === "updating" ? "Applying now" : "Debounced"}
            </span>
          </div>
          <div
            style={{
              height: 4,
              borderRadius: 999,
              background: "rgba(15, 23, 42, 0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: activityState === "updating" ? "72%" : "38%",
                height: "100%",
                borderRadius: 999,
                background:
                  activityState === "updating"
                    ? "var(--color-ink-950)"
                    : "var(--color-primary)",
              }}
            />
          </div>
        </div>
      ) : null}

      {controlRows}
    </div>
  );
}

function sameDashboardFilters(left: DashboardFilters, right: DashboardFilters) {
  return (
    left.projectKey === right.projectKey &&
    left.rangeKey === right.rangeKey &&
    left.granularityKey === right.granularityKey &&
    left.granularityDays === right.granularityDays &&
    left.from === right.from &&
    left.to === right.to &&
    left.platform === right.platform &&
    left.segment === right.segment &&
    left.groupBy === right.groupBy &&
    left.tag === right.tag
  );
}

const FIELD_LABEL_STYLE = {
  fontSize: 10.5,
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.07em",
  color: "var(--color-ink-500)",
};

const FIELD_STYLE = {
  height: 38,
  borderRadius: 10,
  border: "1px solid var(--color-border-soft)",
  background: "var(--color-panel-base)",
  color: "var(--color-ink-900)",
  fontSize: 13,
  fontWeight: 500,
  padding: "0 12px",
  outline: "none",
  boxSizing: "border-box" as const,
};

const MANAGE_BUTTON_STYLE = {
  borderRadius: 999,
  border: "1px solid var(--color-border-soft)",
  background: "var(--color-panel-base)",
  color: "var(--color-ink-700)",
  padding: "7px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
