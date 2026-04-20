"use client";

import { useMemo, useState } from "react";
import type { ActualMultiSeriesChart } from "@/lib/data/forecast-workbench";

export function ActualMultiSeriesChart({
  chart,
}: {
  chart: ActualMultiSeriesChart;
}) {
  const [hiddenGroupIds, setHiddenGroupIds] = useState<Set<string>>(new Set());
  const visibleGroups = useMemo(
    () => chart.groups.filter((group) => !hiddenGroupIds.has(group.id)),
    [chart.groups, hiddenGroupIds]
  );

  if (chart.groups.length === 0) {
    return null;
  }

  const width = 1120;
  const height = 320;
  const paddingLeft = 56;
  const paddingRight = 24;
  const paddingTop = 20;
  const paddingBottom = 42;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const pointCount = chart.groups[0]?.points.length ?? 0;
  const maxValue = Math.max(1, ...visibleGroups.flatMap((group) => group.points.map((point) => point.value)));
  const ticks = Array.from({ length: 4 }, (_, index) => (maxValue / 3) * index);

  function toggleGroup(groupId: string) {
    setHiddenGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function getX(index: number) {
    if (pointCount <= 1) {
      return paddingLeft + chartWidth / 2;
    }

    return paddingLeft + (chartWidth / (pointCount - 1)) * index;
  }

  function getY(value: number) {
    return paddingTop + chartHeight - (value / maxValue) * chartHeight;
  }

  return (
    <section
      style={{
        background: "var(--color-panel-base)",
        border: "1px solid var(--color-border-soft)",
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-950)" }}>{chart.title}</div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--color-ink-500)", lineHeight: 1.5 }}>
            {chart.subtitle}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "flex-start" }}>
          {chart.groups.map((group) => {
            const hidden = hiddenGroupIds.has(group.id);
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => toggleGroup(group.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 999,
                  border: hidden ? "1px solid var(--color-border-soft)" : `1px solid ${group.color}`,
                  background: hidden ? "var(--color-panel-soft)" : "var(--color-panel-base)",
                  color: "var(--color-ink-700)",
                  padding: "5px 10px",
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: hidden ? 0.55 : 1,
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 999, background: group.color }} />
                {group.label}
              </button>
            );
          })}
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={paddingLeft}
              y1={getY(tick)}
              x2={width - paddingRight}
              y2={getY(tick)}
              stroke="var(--color-border-soft)"
              strokeWidth="1"
            />
            <text
              x={paddingLeft - 10}
              y={getY(tick) + 4}
              textAnchor="end"
              fill="var(--color-ink-500)"
              fontSize="10.5"
            >
              {formatValue(tick, chart.unit)}
            </text>
          </g>
        ))}

        {visibleGroups.map((group) => {
          const path = group.points
            .map((point, index) => `${index === 0 ? "M" : "L"} ${getX(index)} ${getY(point.value)}`)
            .join(" ");

          return (
            <g key={group.id}>
              <path
                d={path}
                fill="none"
                stroke={group.color}
                strokeWidth="2.6"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {group.points.map((point, index) => (
                <circle
                  key={`${group.id}-${point.label}`}
                  cx={getX(index)}
                  cy={getY(point.value)}
                  r="3.4"
                  fill={group.color}
                />
              ))}
            </g>
          );
        })}

        {chart.groups[0]?.points.map((point, index) => (
          <text
            key={`${chart.id}-${point.label}`}
            x={getX(index)}
            y={height - 14}
            textAnchor="middle"
            fill="var(--color-ink-500)"
            fontSize="10.5"
          >
            {point.label}
          </text>
        ))}
      </svg>
    </section>
  );
}

function formatValue(value: number, unit: string) {
  if (unit === "$") {
    return `$${value.toFixed(0)}`;
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: unit === "" ? 0 : 1,
  });
}
