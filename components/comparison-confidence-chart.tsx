import type { ComparisonConfidenceChartData } from "@/lib/data/acquisition";

export function ComparisonConfidenceChart({
  chart,
}: {
  chart: ComparisonConfidenceChartData;
}) {
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

  const width = 560;
  const height = 256;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 22;
  const paddingBottom = 40;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const allPoints = chart.groups.flatMap((group) => group.series);
  const upperBound = Math.max(...allPoints.map((point) => point.upper));
  const lowerBound = Math.min(...allPoints.map((point) => point.lower));
  const span = upperBound - lowerBound || 1;
  const tickValues = Array.from({ length: 4 }, (_, index) => lowerBound + (span / 3) * index);

  function getX(index: number, count: number) {
    if (count <= 1) {
      return paddingLeft + chartWidth / 2;
    }

    return paddingLeft + (chartWidth / (count - 1)) * index;
  }

  function getY(value: number) {
    return paddingTop + chartHeight - ((value - lowerBound) / span) * chartHeight;
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

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start", justifyContent: "flex-end" }}>
          {chart.groups.map((group) => (
            <div key={group.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--color-ink-600)" }}>
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
            </div>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
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
              {tick.toFixed(0)}
              {chart.unit}
            </text>
          </g>
        ))}

        {chart.groups.map((group) => {
          const upperPath = group.series
            .map((point, index) => `${index === 0 ? "M" : "L"} ${getX(index, group.series.length)} ${getY(point.upper)}`)
            .join(" ");
          const lowerPath = [...group.series]
            .reverse()
            .map((point, reverseIndex) => {
              const originalIndex = group.series.length - 1 - reverseIndex;
              return `${reverseIndex === 0 ? "L" : "L"} ${getX(originalIndex, group.series.length)} ${getY(point.lower)}`;
            })
            .join(" ");
          const bandPath = `${upperPath} ${lowerPath} Z`;
          const predictedPath = group.series
            .map((point, index) => `${index === 0 ? "M" : "L"} ${getX(index, group.series.length)} ${getY(point.value)}`)
            .join(" ");
          const actualPoints = group.series.filter((point) => typeof point.actual === "number");
          const actualPath = actualPoints
            .map((point, index) => {
              const originalIndex = group.series.findIndex((entry) => entry.label === point.label);
              return `${index === 0 ? "M" : "L"} ${getX(originalIndex, group.series.length)} ${getY(point.actual ?? 0)}`;
            })
            .join(" ");

          return (
            <g key={group.label}>
              <path d={bandPath} fill={toAlpha(group.color, 0.1)} />
              <path
                d={predictedPath}
                fill="none"
                stroke={group.color}
                strokeWidth="2.6"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {actualPath ? (
                <path
                  d={actualPath}
                  fill="none"
                  stroke={group.actualColor ?? group.color}
                  strokeDasharray="4 4"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {group.series.map((point, index) => (
                <g key={`${group.label}-${point.label}`}>
                  <circle cx={getX(index, group.series.length)} cy={getY(point.value)} r="3.3" fill={group.color} />
                  {typeof point.actual === "number" ? (
                    <circle
                      cx={getX(index, group.series.length)}
                      cy={getY(point.actual)}
                      r="2.6"
                      fill={group.actualColor ?? group.color}
                    />
                  ) : null}
                </g>
              ))}
            </g>
          );
        })}

        {chart.groups[0]?.series.map((point, index) => (
          <text
            key={point.label}
            x={getX(index, chart.groups[0].series.length)}
            y={height - 13}
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
