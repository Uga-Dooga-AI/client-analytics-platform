"use client";

import { useMemo, useState } from "react";

type ConfidencePoint = {
  label: string;
  value: number;
  lower: number;
  upper: number;
  actual?: number | null;
};

export function ConfidenceBandChart({
  title,
  subtitle,
  unit,
  series,
  predictedColor = "var(--color-signal-blue)",
  actualColor = "var(--color-ink-950)",
}: {
  title: string;
  subtitle?: string;
  unit: string;
  series: ConfidencePoint[];
  predictedColor?: string;
  actualColor?: string;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const width = 520;
  const height = 236;
  const paddingLeft = 48;
  const paddingRight = 18;
  const paddingTop = 20;
  const paddingBottom = 36;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const upperBound = Math.max(...series.map((point) => point.upper));
  const lowerBound = Math.min(...series.map((point) => point.lower));
  const span = upperBound - lowerBound || 1;
  const yTicks = Array.from({ length: 4 }, (_, index) => lowerBound + (span / 3) * index);

  function getX(index: number) {
    if (series.length <= 1) {
      return paddingLeft + chartWidth / 2;
    }

    return paddingLeft + (chartWidth / (series.length - 1)) * index;
  }

  function getY(value: number) {
    return paddingTop + chartHeight - ((value - lowerBound) / span) * chartHeight;
  }

  const upperPath = series.map((point, index) => `${index === 0 ? "M" : "L"} ${getX(index)} ${getY(point.upper)}`);
  const lowerPath = [...series]
    .reverse()
    .map((point) => {
      const originalIndex = series.findIndex((entry) => entry.label === point.label);
      return `L ${getX(originalIndex)} ${getY(point.lower)}`;
    });
  const bandPath = [...upperPath, ...lowerPath, "Z"].join(" ");

  const predictedPath = series
    .map((point, index) => `${index === 0 ? "M" : "L"} ${getX(index)} ${getY(point.value)}`)
    .join(" ");

  const actualPoints = series.filter((point) => typeof point.actual === "number");
  const actualPath = actualPoints
    .map((point) => {
      const index = series.findIndex((entry) => entry.label === point.label);
      return `${index === series.findIndex((entry) => typeof entry.actual === "number") ? "M" : "L"} ${getX(index)} ${getY(point.actual ?? 0)}`;
    })
    .join(" ");

  const tooltip = useMemo(() => {
    if (hoveredIndex === null) {
      return null;
    }

    const point = series[hoveredIndex];
    return {
      label: point.label,
      x: getX(hoveredIndex),
      value: point.value,
      lower: point.lower,
      upper: point.upper,
      actual: point.actual ?? null,
    };
  }, [hoveredIndex, series]);

  return (
    <div
      style={{
        background: "var(--color-panel-base)",
        border: "1px solid var(--color-border-soft)",
        borderRadius: 10,
        padding: 18,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 3 }}>{subtitle}</div> : null}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <LegendSwatch label="Predicted" color={predictedColor} />
          <LegendSwatch label="Actual" color={actualColor} />
          <LegendSwatch label="Confidence band" color="rgba(37, 99, 235, 0.18)" />
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
              minWidth: 180,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(11, 18, 32, 0.96)",
              color: "#fff",
              pointerEvents: "none",
              boxShadow: "0 14px 32px rgba(11, 18, 32, 0.18)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.78 }}>
              {tooltip.label}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.55 }}>
              Predicted {formatValue(tooltip.value, unit)}
              <br />
              Band {formatValue(tooltip.lower, unit)}–{formatValue(tooltip.upper, unit)}
              {tooltip.actual !== null ? (
                <>
                  <br />
                  Actual {formatValue(tooltip.actual, unit)}
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {yTicks.map((tick) => (
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
                {formatValue(tick, unit)}
              </text>
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

          <path d={bandPath} fill="rgba(37, 99, 235, 0.14)" />
          <path d={predictedPath} fill="none" stroke={predictedColor} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {actualPath ? (
            <path
              d={actualPath}
              fill="none"
              stroke={actualColor}
              strokeWidth="2"
              strokeDasharray="5 5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {series.map((point, index) => {
            const leftEdge = index === 0 ? paddingLeft : (getX(index - 1) + getX(index)) / 2;
            const rightEdge = index === series.length - 1 ? width - paddingRight : (getX(index) + getX(index + 1)) / 2;
            const active = hoveredIndex === index;

            return (
              <g key={point.label}>
                <rect
                  x={leftEdge}
                  y={paddingTop}
                  width={Math.max(20, rightEdge - leftEdge)}
                  height={chartHeight}
                  fill={active ? "rgba(37, 99, 235, 0.05)" : "transparent"}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseMove={() => setHoveredIndex(index)}
                />
                <circle cx={getX(index)} cy={getY(point.value)} r={active ? "5.25" : "4"} fill={predictedColor} />
                {typeof point.actual === "number" ? (
                  <circle cx={getX(index)} cy={getY(point.actual)} r={active ? "4" : "3"} fill={actualColor} />
                ) : null}
                <text
                  x={getX(index)}
                  y={height - 12}
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
    </div>
  );
}

function LegendSwatch({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--color-ink-500)" }}>
      <span style={{ width: 12, height: 12, borderRadius: 999, background: color, border: "1px solid rgba(15, 23, 42, 0.08)" }} />
      {label}
    </div>
  );
}

function formatValue(value: number, unit: string) {
  if (unit === "$") {
    return `$${value.toFixed(2)}`;
  }

  if (unit === "m") {
    return `${value.toFixed(1)}m`;
  }

  return `${value.toFixed(1)}${unit}`;
}
