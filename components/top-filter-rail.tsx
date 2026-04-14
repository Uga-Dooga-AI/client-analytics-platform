"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getStitchRoute, getStitchStatusMeta } from "@/lib/stitch";
import {
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
  type DashboardRangeKey,
} from "@/lib/dashboard-filters";
import { getSegmentLabel, getSegmentOptions, type SavedUserSegment } from "@/lib/segments";

const DEMO_ACCESS_ENABLED = process.env.NEXT_PUBLIC_DEMO_ACCESS_ENABLED === "true";

export function TopFilterRail({ title }: { title: string }) {
  return (
    <Suspense fallback={<TopFilterRailFrame title={title} />}>
      <TopFilterRailContent title={title} />
    </Suspense>
  );
}

function TopFilterRailContent({ title }: { title: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [savedSegments, setSavedSegments] = useState<SavedUserSegment[]>([]);

  const filters = useMemo(
    () => normalizeFiltersForPath(parseDashboardSearchParams(searchParams, pathname), pathname),
    [pathname, searchParams]
  );
  const stitchRoute = getStitchRoute(pathname);
  const stitchStatus = stitchRoute ? getStitchStatusMeta(stitchRoute.status) : null;
  const projectOptions = getProjectOptions(pathname);
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

    void loadSavedSegments();

    return () => {
      cancelled = true;
    };
  }, []);

  function commitFilters(patch: Partial<DashboardFilters>) {
    const nextFilters = normalizeFiltersForPath({ ...filters, ...patch }, pathname);
    const nextQuery = serializeDashboardFilters(nextFilters).toString();
    router.replace(`${pathname}?${nextQuery}`, { scroll: false });
  }

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
              gridTemplateColumns: "minmax(180px, 1.2fr) repeat(4, minmax(132px, 0.8fr)) minmax(196px, 1fr)",
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
              options={GROUP_BY_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
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
          <div>Project-first filtering, custom date window, segmentation, and grouping are active in the shell.</div>
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
