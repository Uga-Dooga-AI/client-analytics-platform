"use client";

import { useMemo, useState, type ReactNode } from "react";
import type {
  ComparisonChartGroup,
  ComparisonConfidenceChartData,
} from "@/lib/data/acquisition";

export type ComparisonConfidenceChartOverlay = {
  label: string;
  groups: ComparisonChartGroup[];
  bandAlpha?: number;
};

export function ComparisonConfidenceChart({
  chart,
  overlay,
  headerAccessory,
  footer,
}: {
  chart: ComparisonConfidenceChartData;
  overlay?: ComparisonConfidenceChartOverlay;
  headerAccessory?: ReactNode;
  footer?: ReactNode;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hiddenGroupLabels, setHiddenGroupLabels] = useState<Set<string>>(new Set());
  const visibleGroups = useMemo(
    () => chart.groups.filter((group) => !hiddenGroupLabels.has(group.label)),
    [chart.groups, hiddenGroupLabels]
  );
  const visibleOverlayGroups = useMemo(
    () => overlay?.groups.filter((group) => !hiddenGroupLabels.has(group.label)) ?? [],
    [hiddenGroupLabels, overlay?.groups]
  );

  if (chart.groups.length === 0 || chart.groups[0]?.series.length === 0) {
    return (
      <section
        style={{
          background: "var(--color-panel-base)",
          border: "1px solid var(--color-border-soft)",
          borderRadius: 10,
          padding: 18,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>{chart.title}</div>
        <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--color-ink-500)" }}>
          No series available for this comparison.
        </div>
      </section>
    );
  }

  if (visibleGroups.length === 0) {
    return (
      <section
        style={{
          background: "var(--color-panel-base)",
          border: "1px solid var(--color-border-soft)",
          borderRadius: 10,
          padding: 18,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>{chart.title}</div>
        <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--color-ink-500)" }}>
          All lines are hidden. Re-enable at least one legend item to render the chart.
        </div>
      </section>
    );
  }

  const width = 560;
  const height = 256;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 22;
  const paddingBottom = 40;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const allPoints = visibleGroups.flatMap((group) => group.series);
  const overlayPoints = visibleOverlayGroups.flatMap((group) => group.series);
  const referenceLines = chart.yAxis?.referenceLines ?? [];
  const upperCandidates = [
    ...allPoints.map((point) => point.upper).filter(isFiniteNumber),
    ...overlayPoints.map((point) => point.upper).filter(isFiniteNumber),
    ...overlayPoints.map((point) => point.value).filter(isFiniteNumber),
    ...referenceLines.map((line) => line.value),
    ...(typeof chart.yAxis?.max === "number" ? [chart.yAxis.max] : []),
  ];
  const lowerCandidates = [
    ...allPoints.map((point) => point.lower).filter(isFiniteNumber),
    ...overlayPoints.map((point) => point.lower).filter(isFiniteNumber),
    ...overlayPoints.map((point) => point.value).filter(isFiniteNumber),
    ...referenceLines.map((line) => line.value),
    ...(typeof chart.yAxis?.min === "number" ? [chart.yAxis.min] : []),
  ];
  const upperBound = upperCandidates.length > 0 ? Math.max(...upperCandidates) : (chart.yAxis?.max ?? 1);
  const lowerBound = lowerCandidates.length > 0 ? Math.min(...lowerCandidates) : (chart.yAxis?.min ?? 0);
  const span = upperBound - lowerBound || 1;
  const tickValues = Array.from({ length: 4 }, (_, index) => lowerBound + (span / 3) * index);
  const domainCount = chart.groups[0].series.length;

  function getX(index: number, count: number) {
    if (count <= 1) {
      return paddingLeft + chartWidth / 2;
    }

    return paddingLeft + (chartWidth / (count - 1)) * index;
  }

  function getY(value: number) {
    return paddingTop + chartHeight - ((value - lowerBound) / span) * chartHeight;
  }

  const tooltip = useMemo(() => {
    if (hoveredIndex === null) {
      return null;
    }

    return {
      label: chart.groups[0]?.series[hoveredIndex]?.label ?? "",
      x: getX(hoveredIndex, domainCount),
      items: visibleGroups.map((group) => ({
        label: group.label,
        color: group.color,
        value: group.series[hoveredIndex]?.value ?? null,
        lower: group.series[hoveredIndex]?.lower ?? null,
        upper: group.series[hoveredIndex]?.upper ?? null,
        actual: group.series[hoveredIndex]?.actual ?? null,
        overlay:
          visibleOverlayGroups.find((overlayGroup) => overlayGroup.label === group.label)?.series[
            hoveredIndex
          ] ?? null,
      })),
    };
  }, [chart.groups, domainCount, hoveredIndex, visibleGroups, visibleOverlayGroups]);

  function toggleGroup(groupLabel: string) {
    setHiddenGroupLabels((current) => {
      const next = new Set(current);
      if (next.has(groupLabel)) {
        next.delete(groupLabel);
      } else {
        next.add(groupLabel);
      }
      return next;
    });
  }

  return (
    <section
      style={{
        background: "var(--color-panel-base)",
        border: "1px solid var(--color-border-soft)",
        borderRadius: 10,
        padding: 18,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>{chart.title}</div>
          <div style={{ marginTop: 3, fontSize: 12, color: "var(--color-ink-500)", lineHeight: 1.5 }}>
            {chart.subtitle}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
          {headerAccessory}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start", justifyContent: "flex-end" }}>
            {chart.groups.map((group) => (
              <button
                key={group.label}
                type="button"
                onClick={() => toggleGroup(group.label)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11.5,
                  color: "var(--color-ink-600)",
                  borderRadius: 999,
                  border: hiddenGroupLabels.has(group.label)
                    ? "1px solid var(--color-border-soft)"
                    : `1px solid ${group.color}`,
                  background: hiddenGroupLabels.has(group.label)
                    ? "var(--color-panel-soft)"
                    : "var(--color-panel-base)",
                  padding: "5px 10px",
                  cursor: "pointer",
                  opacity: hiddenGroupLabels.has(group.label) ? 0.55 : 1,
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 999,
                    background: group.color,
                    border: "1px solid rgba(15, 23, 42, 0.08)",
                  }}
                />
                {group.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ position: "relative" }}>
        {tooltip ? (
          <div
            style={{
              position: "absolute",
              left: `${(tooltip.x / width) * 100}%`,
              top: 10,
              transform: "translateX(-50%)",
              zIndex: 2,
              minWidth: 200,
              maxWidth: 260,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(11, 18, 32, 0.96)",
              color: "#fff",
              boxShadow: "0 14px 32px rgba(11, 18, 32, 0.18)",
              pointerEvents: "none",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.78 }}>
              {tooltip.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {tooltip.items.map((item) => (
                <div key={`${tooltip.label}-${item.label}`} style={{ display: "grid", gridTemplateColumns: "12px 1fr", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: item.color, marginTop: 4 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</div>
                      <div style={{ marginTop: 3, fontSize: 11.5, opacity: 0.86, lineHeight: 1.45 }}>
                        {item.value === null
                          ? "No forecast for this point"
                          : `Forecast ${formatChartValue(item.value, chart.unit)} · bounds ${formatChartValue(item.lower, chart.unit)}–${formatChartValue(item.upper, chart.unit)}`}
                        {item.actual !== null ? ` · actual ${formatChartValue(item.actual, chart.unit)}` : ""}
                        {item.overlay && overlay
                          ? ` · ${overlay.label} ${formatChartValue(item.overlay.value, chart.unit)} (${formatChartValue(item.overlay.lower, chart.unit)}–${formatChartValue(item.overlay.upper, chart.unit)})`
                          : ""}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : null}

        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {tickValues.map((tick) => (
            <g key={tick}>
              <line
                x1={paddingLeft}
                y1={getY(tick)}
                x2={width - paddingRight}
                y2={getY(tick)}
                stroke="var(--color-border-soft)"
                strokeWidth="1"
              />
              <text x={paddingLeft - 10} y={getY(tick) + 4} textAnchor="end" fill="var(--color-ink-500)" fontSize="10.5">
                {formatAxisTick(tick, chart.unit)}
              </text>
            </g>
          ))}

          {referenceLines.map((line) => (
            <g key={`${chart.id}-reference-${line.value}`}>
              <line
                x1={paddingLeft}
                y1={getY(line.value)}
                x2={width - paddingRight}
                y2={getY(line.value)}
                stroke={line.color ?? "rgba(15, 23, 42, 0.3)"}
                strokeWidth="1.5"
                strokeDasharray={line.dasharray ?? "5 5"}
              />
              {line.label ? (
                <text
                  x={paddingLeft - 10}
                  y={getY(line.value) - 6}
                  textAnchor="end"
                  fill={line.color ?? "var(--color-ink-600)"}
                  fontSize="10.5"
                  fontWeight="600"
                >
                  {line.label}
                </text>
              ) : null}
            </g>
          ))}

          {tooltip ? (
            <line
              x1={tooltip.x}
              y1={paddingTop}
              x2={tooltip.x}
              y2={height - paddingBottom}
              stroke="rgba(37, 99, 235, 0.35)"
              strokeDasharray="4 4"
            />
          ) : null}

          {visibleGroups.map((group) => {
            const bandPaths = buildBandPaths(group.series, group.series.length, getX, getY);
            const upperBandPaths = buildLinePaths(
              group.series,
              group.series.length,
              getX,
              getY,
              (point) => point.upper
            );
            const lowerBandPaths = buildLinePaths(
              group.series,
              group.series.length,
              getX,
              getY,
              (point) => point.lower
            );
            const predictedPaths = buildLinePaths(group.series, group.series.length, getX, getY, (point) => point.value);
            const actualPaths = buildLinePaths(group.series, group.series.length, getX, getY, (point) => point.actual ?? null);

            return (
              <g key={group.label}>
                {bandPaths.map((path, index) => (
                  <path
                    key={`${group.label}-band-${index}`}
                    d={path}
                    fill={toAlpha(group.color, 0.16)}
                  />
                ))}
                {upperBandPaths.map((path, index) => (
                  <path
                    key={`${group.label}-band-upper-${index}`}
                    d={path}
                    fill="none"
                    stroke={toAlpha(group.color, 0.6)}
                    strokeWidth="1.35"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {lowerBandPaths.map((path, index) => (
                  <path
                    key={`${group.label}-band-lower-${index}`}
                    d={path}
                    fill="none"
                    stroke={toAlpha(group.color, 0.6)}
                    strokeWidth="1.35"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {predictedPaths.map((path, index) => (
                  <path
                    key={`${group.label}-predicted-${index}`}
                    d={path}
                    fill="none"
                    stroke={group.color}
                    strokeWidth="2.6"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {actualPaths.map((path, index) => (
                  <path
                    key={`${group.label}-actual-${index}`}
                    d={path}
                    fill="none"
                    stroke={group.actualColor ?? group.color}
                    strokeWidth="1.8"
                    strokeDasharray="4 4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {group.series.map((point, index) => {
                  const active = hoveredIndex === index;
                  const actualValue = point.actual;
                  const hasBounds = isFiniteNumber(point.lower) && isFiniteNumber(point.upper);
                  const x = getX(index, group.series.length);
                  const lowerValue = hasBounds ? point.lower : null;
                  const upperValue = hasBounds ? point.upper : null;
                  return (
                    <g key={`${group.label}-${point.label}`}>
                      {hasBounds ? (
                        <g>
                          <line
                            x1={x}
                            y1={getY(lowerValue!)}
                            x2={x}
                            y2={getY(upperValue!)}
                            stroke={toAlpha(group.color, active ? 0.92 : 0.8)}
                            strokeWidth={active ? "1.85" : "1.4"}
                            strokeDasharray="3 3"
                            strokeLinecap="round"
                          />
                          <line
                            x1={x - 4}
                            y1={getY(lowerValue!)}
                            x2={x + 4}
                            y2={getY(lowerValue!)}
                            stroke={toAlpha(group.color, active ? 0.92 : 0.8)}
                            strokeWidth={active ? "1.85" : "1.4"}
                            strokeLinecap="round"
                          />
                          <line
                            x1={x - 4}
                            y1={getY(upperValue!)}
                            x2={x + 4}
                            y2={getY(upperValue!)}
                            stroke={toAlpha(group.color, active ? 0.92 : 0.8)}
                            strokeWidth={active ? "1.85" : "1.4"}
                            strokeLinecap="round"
                          />
                        </g>
                      ) : null}
                      {isFiniteNumber(point.value) ? (
                        <circle
                          cx={x}
                          cy={getY(point.value)}
                          r={active ? "5" : "3.3"}
                          fill={group.color}
                        />
                      ) : null}
                      {isFiniteNumber(actualValue) ? (
                        <circle
                          cx={x}
                          cy={getY(actualValue)}
                          r={active ? "4" : "2.6"}
                          fill={group.actualColor ?? group.color}
                        />
                      ) : null}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {visibleOverlayGroups.map((group) => {
            const bandPaths = buildBandPaths(group.series, group.series.length, getX, getY);
            const upperBandPaths = buildLinePaths(
              group.series,
              group.series.length,
              getX,
              getY,
              (point) => point.upper
            );
            const lowerBandPaths = buildLinePaths(
              group.series,
              group.series.length,
              getX,
              getY,
              (point) => point.lower
            );
            const predictedPaths = buildLinePaths(
              group.series,
              group.series.length,
              getX,
              getY,
              (point) => point.value
            );

            return (
              <g key={`overlay-${group.label}`}>
                {bandPaths.map((path, index) => (
                  <path
                    key={`overlay-${group.label}-band-${index}`}
                    d={path}
                    fill={toAlpha(group.color, overlay?.bandAlpha ?? 0.2)}
                  />
                ))}
                {upperBandPaths.map((path, index) => (
                  <path
                    key={`overlay-${group.label}-band-upper-${index}`}
                    d={path}
                    fill="none"
                    stroke={toAlpha(group.color, 0.72)}
                    strokeWidth="1.25"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {lowerBandPaths.map((path, index) => (
                  <path
                    key={`overlay-${group.label}-band-lower-${index}`}
                    d={path}
                    fill="none"
                    stroke={toAlpha(group.color, 0.72)}
                    strokeWidth="1.25"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {predictedPaths.map((path, index) => (
                  <path
                    key={`overlay-${group.label}-predicted-${index}`}
                    d={path}
                    fill="none"
                    stroke={group.color}
                    strokeWidth="2.2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {group.series.map((point, index) =>
                  (() => {
                    const active = hoveredIndex === index;
                    const hasBounds = isFiniteNumber(point.lower) && isFiniteNumber(point.upper);
                    const x = getX(index, group.series.length);
                    const lowerValue = hasBounds ? point.lower : null;
                    const upperValue = hasBounds ? point.upper : null;
                    return (
                      <g key={`overlay-${group.label}-${point.label}`}>
                        {hasBounds ? (
                          <g>
                            <line
                              x1={x}
                              y1={getY(lowerValue!)}
                              x2={x}
                              y2={getY(upperValue!)}
                              stroke={toAlpha(group.color, active ? 0.96 : 0.88)}
                              strokeWidth={active ? "1.7" : "1.25"}
                              strokeDasharray="3 2"
                              strokeLinecap="round"
                            />
                            <line
                              x1={x - 4}
                              y1={getY(lowerValue!)}
                              x2={x + 4}
                              y2={getY(lowerValue!)}
                              stroke={toAlpha(group.color, active ? 0.96 : 0.88)}
                              strokeWidth={active ? "1.7" : "1.25"}
                              strokeLinecap="round"
                            />
                            <line
                              x1={x - 4}
                              y1={getY(upperValue!)}
                              x2={x + 4}
                              y2={getY(upperValue!)}
                              stroke={toAlpha(group.color, active ? 0.96 : 0.88)}
                              strokeWidth={active ? "1.7" : "1.25"}
                              strokeLinecap="round"
                            />
                          </g>
                        ) : null}
                        {isFiniteNumber(point.value) ? (
                          <circle
                            cx={x}
                            cy={getY(point.value)}
                            r={active ? "4.3" : "2.8"}
                            fill={group.color}
                            stroke="rgba(255, 255, 255, 0.75)"
                            strokeWidth="1.2"
                          />
                        ) : null}
                      </g>
                    );
                  })()
                )}
              </g>
            );
          })}

          {chart.groups[0]?.series.map((point, index) => {
            const leftEdge = index === 0 ? paddingLeft : (getX(index - 1, domainCount) + getX(index, domainCount)) / 2;
            const rightEdge =
              index === domainCount - 1
                ? width - paddingRight
                : (getX(index, domainCount) + getX(index + 1, domainCount)) / 2;

            return (
              <g key={point.label}>
                <rect
                  x={leftEdge}
                  y={paddingTop}
                  width={Math.max(20, rightEdge - leftEdge)}
                  height={chartHeight}
                  fill={hoveredIndex === index ? "rgba(37, 99, 235, 0.05)" : "transparent"}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseMove={() => setHoveredIndex(index)}
                />
                <text
                  x={getX(index, chart.groups[0].series.length)}
                  y={height - 13}
                  textAnchor="middle"
                  fill="var(--color-ink-500)"
                  fontSize="10.5"
                >
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {footer ? <div style={{ marginTop: 14 }}>{footer}</div> : null}
    </section>
  );
}

function formatAxisTick(value: number, unit: string) {
  if (unit === "$") {
    return `$${value.toFixed(2)}`;
  }

  if (unit === "") {
    return value.toFixed(0);
  }

  return `${value.toFixed(0)}${unit}`;
}

function formatChartValue(value: number | null, unit: string) {
  if (!isFiniteNumber(value)) {
    return "—";
  }
  if (unit === "$") {
    return `$${value.toFixed(2)}`;
  }

  if (unit === "") {
    return value.toLocaleString();
  }

  if (unit === "m") {
    return `${value.toFixed(1)}m`;
  }

  return `${value.toFixed(1)}${unit}`;
}

function toAlpha(color: string, alpha: number) {
  if (!color.startsWith("#") || (color.length !== 7 && color.length !== 4)) {
    return color;
  }

  const normalized =
    color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function buildLinePaths<T>(
  points: T[],
  count: number,
  getX: (index: number, count: number) => number,
  getY: (value: number) => number,
  pickValue: (point: T) => number | null
) {
  const paths: string[] = [];
  let current: Array<{ index: number; value: number }> = [];

  points.forEach((point, index) => {
    const value = pickValue(point);
    if (isFiniteNumber(value)) {
      current.push({ index, value });
      return;
    }
    if (current.length > 0) {
      paths.push(
        current
          .map((entry, entryIndex) => `${entryIndex === 0 ? "M" : "L"} ${getX(entry.index, count)} ${getY(entry.value)}`)
          .join(" ")
      );
      current = [];
    }
  });

  if (current.length > 0) {
    paths.push(
      current
        .map((entry, entryIndex) => `${entryIndex === 0 ? "M" : "L"} ${getX(entry.index, count)} ${getY(entry.value)}`)
        .join(" ")
    );
  }

  return paths;
}

function buildBandPaths<T extends { upper: number | null; lower: number | null }>(
  points: T[],
  count: number,
  getX: (index: number, count: number) => number,
  getY: (value: number) => number
) {
  const paths: string[] = [];
  let current: Array<{ index: number; upper: number; lower: number }> = [];

  points.forEach((point, index) => {
    if (isFiniteNumber(point.upper) && isFiniteNumber(point.lower)) {
      current.push({ index, upper: point.upper, lower: point.lower });
      return;
    }
    if (current.length > 0) {
      paths.push(buildBandPath(current, count, getX, getY));
      current = [];
    }
  });

  if (current.length > 0) {
    paths.push(buildBandPath(current, count, getX, getY));
  }

  return paths;
}

function buildBandPath(
  segment: Array<{ index: number; upper: number; lower: number }>,
  count: number,
  getX: (index: number, count: number) => number,
  getY: (value: number) => number
) {
  const upperPath = segment
    .map((point, index) => `${index === 0 ? "M" : "L"} ${getX(point.index, count)} ${getY(point.upper)}`)
    .join(" ");
  const lowerPath = [...segment]
    .reverse()
    .map((point) => `L ${getX(point.index, count)} ${getY(point.lower)}`)
    .join(" ");
  return `${upperPath} ${lowerPath} Z`;
}
