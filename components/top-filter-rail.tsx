"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
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
  const [savedSegments, setSavedSegments] = useState<SavedUserSegment[]>([]);
  const [dynamicProjects, setDynamicProjects] = useState<
    Array<{ key: string; label: string; shortLabel: string }>
  >([]);

  const filters = useMemo(
    () => normalizeFiltersForPath(parseDashboardSearchParams(searchParams, pathname), pathname),
    [pathname, searchParams]
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

    const selectedOption = base.find((project) => project.key === filters.projectKey);
    if (selectedOption) {
      const overviewOption = base.find((project) => project.key === "all");
      if (overviewOption && selectedOption.key !== "all") {
        return [overviewOption, selectedOption];
      }

      return [selectedOption];
    }

    return base;
  }, [dynamicProjects, filters.projectKey, pathname]);
  const segmentOptions = useMemo(() => {
    const options = getSegmentOptions(savedSegments, filters.projectKey).map((option) => ({
      value: option.key,
      label: option.label,
    }));

    if (!options.some((option) => option.value === filters.segment)) {
      options.push({
        value: filters.segment,
        label: getSegmentLabel(filters.segment, savedSegments, filters.projectKey),
      });
    }

    return options;
  }, [filters.projectKey, filters.segment, savedSegments]);

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

  function commitFilters(patch: Partial<DashboardFilters>) {
    const nextFilters = normalizeFiltersForPath({ ...filters, ...patch }, pathname);
    const nextQuery = serializeDashboardFilters(nextFilters).toString();
    router.replace(`${pathname}?${nextQuery}`, { scroll: false });
  }

  useEffect(() => {
    if (groupByOptions.some((option) => option.key === filters.groupBy)) {
      return;
    }

    commitFilters({ groupBy: groupByOptions[0]?.key ?? "none" });
  }, [filters.groupBy, groupByOptions, pathname]);

  function handleRangeChange(nextRange: DashboardRangeKey) {
    commitFilters(getRangePatch(nextRange));
  }

  return (
    <TopFilterRailFrame
      title={title}
      stitchStatusLabel={stitchStatus?.label}
      stitchStatusColor={stitchStatus?.color}
      stitchWave={stitchRoute?.wave}
      onManageSegments={pathname === "/segments" ? undefined : () => router.push("/segments")}
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
              value={filters.projectKey}
              onChange={(value) => commitFilters({ projectKey: value as DashboardFilters["projectKey"] })}
              options={projectOptions.map((option) => ({ value: option.key, label: option.label }))}
            />
            <FilterField
              label="Range"
              value={filters.rangeKey}
              onChange={(value) => handleRangeChange(value as DashboardRangeKey)}
              options={RANGE_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
            />
            <FilterField
              label="Day step"
              value={filters.granularityKey}
              onChange={(value) => {
                const option = GRANULARITY_OPTIONS.find((item) => item.key === value) ?? GRANULARITY_OPTIONS[1];
                commitFilters({
                  granularityKey: option.key,
                  granularityDays: option.key === "custom" ? filters.granularityDays : option.days,
                });
              }}
              options={GRANULARITY_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
            />
            {supportsCustomDayStep ? (
              <NumberField
                label="Step days"
                value={filters.granularityDays}
                disabled={filters.granularityKey !== "custom"}
                min={1}
                max={28}
                onChange={(value) =>
                  commitFilters({
                    granularityKey: "custom",
                    granularityDays: Math.max(1, Math.min(28, Math.round(value || 1))),
                  })
                }
              />
            ) : null}
            <FilterField
              label="Platform"
              value={filters.platform}
              onChange={(value) => commitFilters({ platform: value as DashboardFilters["platform"] })}
              options={PLATFORM_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
            />
            <FilterField
              label="Segment"
              value={filters.segment}
              onChange={(value) => commitFilters({ segment: value as DashboardFilters["segment"] })}
              options={segmentOptions}
            />
            <FilterField
              label="Group by"
              value={filters.groupBy}
              onChange={(value) => commitFilters({ groupBy: value as DashboardFilters["groupBy"] })}
              options={groupByOptions.map((option) => ({ value: option.key, label: option.label }))}
            />
            <FilterField
              label="Tag"
              value={filters.tag}
              onChange={(value) => commitFilters({ tag: value as DashboardFilters["tag"] })}
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
              value={filters.from}
              onChange={(value) => commitFilters({ rangeKey: "custom", from: value })}
            />
            <DateField
              label="To"
              value={filters.to}
              onChange={(value) => commitFilters({ rangeKey: "custom", to: value })}
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
                  {filters.from} to {filters.to}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <SlicePill label={projectOptions.find((project) => project.key === filters.projectKey)?.shortLabel ?? "NA"} />
                <SlicePill label={filters.platform === "all" ? "All platforms" : filters.platform.toUpperCase()} />
                <SlicePill label={getSegmentLabel(filters.segment, savedSegments, filters.projectKey)} />
                <SlicePill label={`step ${filters.granularityDays}d`} />
                <SlicePill label={filters.groupBy === "none" ? "Ungrouped" : filters.groupBy} />
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
  controlRows,
}: {
  title: string;
  stitchStatusLabel?: string;
  stitchStatusColor?: string;
  stitchWave?: number;
  onManageSegments?: () => void;
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

      {controlRows}
    </div>
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
