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

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
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
              {tick.toFixed(0)}
              {unit}
            </text>
          </g>
        ))}

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

        {series.map((point, index) => (
          <g key={point.label}>
            <circle cx={getX(index)} cy={getY(point.value)} r="4" fill={predictedColor} />
            {typeof point.actual === "number" ? (
              <circle cx={getX(index)} cy={getY(point.actual)} r="3" fill={actualColor} />
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
        ))}
      </svg>
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
