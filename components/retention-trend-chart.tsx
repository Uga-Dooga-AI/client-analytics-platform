"use client";

import { useMemo, useState } from "react";

type RetentionTrendData = {
  labels: string[];
  iosD7: number[];
  androidD7: number[];
  iosD30: number[];
  androidD30: number[];
};

export function RetentionTrendChart({ trend }: { trend: RetentionTrendData }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const width = 340;
  const height = 140;

  const tooltip = useMemo(() => {
    if (hoveredIndex === null) {
      return null;
    }

    const x = pointX(hoveredIndex, trend.labels.length);
    return {
      x,
      label: trend.labels[hoveredIndex],
      values: [
        { label: "iOS D7", color: "var(--color-signal-blue)", value: trend.iosD7[hoveredIndex] },
        { label: "Android D7", color: "rgba(37, 99, 235, 0.45)", value: trend.androidD7[hoveredIndex] },
        { label: "iOS D30", color: "var(--color-success)", value: trend.iosD30[hoveredIndex] },
        { label: "Android D30", color: "rgba(22, 163, 74, 0.45)", value: trend.androidD30[hoveredIndex] },
      ],
    };
  }, [hoveredIndex, trend]);

  return (
    <div style={{ position: "relative", marginTop: 16 }}>
      {tooltip ? (
        <div
          style={{
            position: "absolute",
            left: `${(tooltip.x / width) * 100}%`,
            top: 8,
            transform: "translateX(-50%)",
            zIndex: 2,
            minWidth: 170,
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
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {tooltip.values.map((entry) => (
              <div key={entry.label} style={{ display: "grid", gridTemplateColumns: "12px 1fr auto", gap: 8, alignItems: "center", fontSize: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: entry.color }} />
                <span>{entry.label}</span>
                <strong>{entry.value}%</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <svg
        viewBox="0 0 340 140"
        style={{
          width: "100%",
          background: "var(--color-panel-soft)",
          borderRadius: 8,
          border: "1px solid var(--color-border-soft)",
        }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {[20, 40, 60].map((grid) => (
          <line
            key={grid}
            x1="28"
            y1={pointY(grid)}
            x2="316"
            y2={pointY(grid)}
            stroke="var(--color-border-soft)"
            strokeWidth="1"
          />
        ))}
        <line x1="28" y1="116" x2="316" y2="116" stroke="var(--color-border-strong)" strokeWidth="1" />
        {tooltip ? (
          <line
            x1={tooltip.x}
            y1="20"
            x2={tooltip.x}
            y2="116"
            stroke="rgba(37, 99, 235, 0.35)"
            strokeDasharray="4 4"
          />
        ) : null}
        <path
          d={linePath(trend.iosD7)}
          fill="none"
          stroke="var(--color-signal-blue)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={linePath(trend.androidD7)}
          fill="none"
          stroke="rgba(37, 99, 235, 0.45)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={linePath(trend.iosD30)}
          fill="none"
          stroke="var(--color-success)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={linePath(trend.androidD30)}
          fill="none"
          stroke="rgba(22, 163, 74, 0.45)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {trend.labels.map((label, index) => {
          const x = pointX(index, trend.labels.length);
          const leftEdge = index === 0 ? 28 : (pointX(index - 1, trend.labels.length) + x) / 2;
          const rightEdge =
            index === trend.labels.length - 1 ? 316 : (x + pointX(index + 1, trend.labels.length)) / 2;
          const active = hoveredIndex === index;

          return (
            <g key={label}>
              <rect
                x={leftEdge}
                y="20"
                width={Math.max(20, rightEdge - leftEdge)}
                height="96"
                fill={active ? "rgba(37, 99, 235, 0.05)" : "transparent"}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseMove={() => setHoveredIndex(index)}
              />
              {[
                { value: trend.iosD7[index], color: "var(--color-signal-blue)", radius: active ? 4.5 : 3.4 },
                { value: trend.androidD7[index], color: "rgba(37, 99, 235, 0.45)", radius: active ? 4.5 : 3.4 },
                { value: trend.iosD30[index], color: "var(--color-success)", radius: active ? 4 : 3 },
                { value: trend.androidD30[index], color: "rgba(22, 163, 74, 0.45)", radius: active ? 4 : 3 },
              ].map((seriesPoint) => (
                <circle key={`${label}-${seriesPoint.color}-${seriesPoint.value}`} cx={x} cy={pointY(seriesPoint.value)} r={seriesPoint.radius} fill={seriesPoint.color} />
              ))}
              <text x={x} y="134" textAnchor="middle" fill="var(--color-ink-500)" fontSize="10">
                {label.replace("Mar ", "M").replace("Apr ", "A")}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function pointX(index: number, total: number) {
  if (total <= 1) {
    return 32;
  }

  return 32 + index * (280 / (total - 1));
}

function pointY(value: number) {
  return 116 - value * 1.6;
}

function linePath(values: number[]) {
  return values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${pointX(index, values.length)} ${pointY(value)}`)
    .join(" ");
}
