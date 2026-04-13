import { AcquisitionWorkbench } from "@/components/acquisition-workbench";
import { CohortMatrixTable } from "@/components/cohort-matrix-table";
import { ComparisonConfidenceChart } from "@/components/comparison-confidence-chart";
import { TopFilterRail } from "@/components/top-filter-rail";
import {
  getAcquisitionDashboardData,
  parseAcquisitionSearchParams,
} from "@/lib/data/acquisition";
import { getProjectLabel, parseDashboardSearchParams } from "@/lib/dashboard-filters";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

const CONFIDENCE_TONE: Record<string, { color: string; background: string }> = {
  Tight: { color: "var(--color-success)", background: "#dcfce7" },
  Medium: { color: "var(--color-signal-blue)", background: "var(--color-signal-blue-surface)" },
  Wide: { color: "var(--color-warning)", background: "#fef3c7" },
};

export default async function AcquisitionPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const rawSearchParams = await searchParams;
  const filters = parseDashboardSearchParams(rawSearchParams, "/acquisition");
  const localFilters = parseAcquisitionSearchParams(rawSearchParams);
  const data = await getAcquisitionDashboardData(filters, localFilters);
  const selectedProject = getProjectLabel(filters.projectKey);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Acquisition" />

      <main
        style={{
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 24,
          overflowY: "auto",
          flex: 1,
          minWidth: 0,
        }}
      >
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 1,
            background: "var(--color-border-soft)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {[
            {
              label: "Selected project",
              value: selectedProject,
              sub: `Slice count ${data.summary.sliceCount.toLocaleString()}`,
            },
            {
              label: "Revenue view",
              value: capitalizeMode(data.summary.revenueMode),
              sub: `Ad share ${data.summary.adShare.toFixed(0)}%`,
            },
            {
              label: "Spend",
              value: `$${data.summary.spend.toLocaleString()}`,
              sub: `${data.summary.cohortCount} cohort dates`,
            },
            {
              label: "Installs",
              value: data.summary.installs.toLocaleString(),
              sub: `CPI ${data.summary.cpi.toFixed(2)}`,
            },
            {
              label: "D60 ROAS",
              value: `${data.summary.d60Roas.toFixed(0)}%`,
              sub: `D30 ${data.summary.d30Roas.toFixed(0)}%`,
            },
            {
              label: "D7 retention",
              value: `${data.summary.d7Retention.toFixed(1)}%`,
              sub: `D30 ${data.summary.d30Retention.toFixed(1)}%`,
            },
            {
              label: "Session length",
              value: `${data.summary.sessionMinutes.toFixed(1)}m`,
              sub: "Average first-week session duration",
            },
            {
              label: "Revenue / user",
              value: `$${data.summary.totalRevenuePerUser.toFixed(2)}`,
              sub: `Ads $${data.summary.adRevenuePerUser.toFixed(2)} · IAP $${data.summary.iapRevenuePerUser.toFixed(2)}`,
            },
            {
              label: "Payback",
              value: `${data.summary.paybackDays}d`,
              sub: `${data.summary.confidence} interval · ${filters.platform === "all" ? "mixed platform" : filters.platform}`,
            },
          ].map((card) => (
            <div key={card.label} style={{ background: "var(--color-panel-base)", padding: "18px 20px" }}>
              <div style={CARD_LABEL_STYLE}>{card.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1.05 }}>
                {card.value}
              </div>
              <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--color-ink-500)" }}>{card.sub}</div>
            </div>
          ))}
        </section>

        <AcquisitionWorkbench
          title="User acquisition workbench"
          caption="The logic mirrors the notebooks: pick a cohort slice by country, company, traffic source, campaign, or creative; then compare any two segments or acquisition cells on the same confidence-band charts."
          filters={data.localFilters}
          options={data.options}
        />

        <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 20 }}>
          {data.horizonCharts.map((chart) => (
            <ComparisonConfidenceChart key={chart.id} chart={chart} />
          ))}
          <ComparisonConfidenceChart chart={data.paybackChart} />
          <section
            style={{
              background: "var(--color-panel-base)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Notebook parity</div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--color-ink-500)", lineHeight: 1.6 }}>
                The synthetic serving layer now follows the same shape as the notebooks: cohort-date aggregation,
                lifetime checkpoints, confidence bands, and realized values when a cohort is old enough.
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <InfoStat
                label="Selected segment"
                value={filters.segment === "all" ? "All users" : filters.segment}
              />
              <InfoStat label="Revenue view" value={capitalizeMode(data.localFilters.revenueMode)} />
              <InfoStat label="Grouping" value={filters.groupBy === "none" ? "Ungrouped" : filters.groupBy} />
              <InfoStat label="Tag focus" value={filters.tag === "all" ? "All tags" : filters.tag} />
              <InfoStat label="Date range" value={`${filters.from} to ${filters.to}`} />
            </div>
          </section>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 1,
            background: "var(--color-border-soft)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {[
            {
              label: `${data.comparisonSummary.leftLabel} vs ${data.comparisonSummary.rightLabel}`,
              value: `${data.comparisonSummary.d60Lift > 0 ? "+" : ""}${data.comparisonSummary.d60Lift}%`,
              sub: "D60 ROAS delta",
            },
            {
              label: "Payback delta",
              value: `${data.comparisonSummary.paybackDeltaDays > 0 ? "+" : ""}${data.comparisonSummary.paybackDeltaDays}d`,
              sub: "Positive means left side pays back slower",
            },
            {
              label: "Spend delta",
              value: `${data.comparisonSummary.spendDelta > 0 ? "+" : ""}$${Math.abs(data.comparisonSummary.spendDelta).toLocaleString()}`,
              sub: "Budget footprint between compared slices",
            },
          ].map((card) => (
            <div key={card.label} style={{ background: "var(--color-panel-base)", padding: "18px 20px" }}>
              <div style={CARD_LABEL_STYLE}>{card.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1.05 }}>
                {card.value}
              </div>
              <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--color-ink-500)" }}>{card.sub}</div>
            </div>
          ))}
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 20 }}>
          {data.compareCharts.map((chart) => (
            <ComparisonConfidenceChart key={chart.id} chart={chart} />
          ))}
        </section>

        <section
          style={{
            background: "var(--color-panel-base)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-border-soft)",
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "flex-start",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Metric comparison table</div>
              <div style={{ marginTop: 3, fontSize: 12, color: "var(--color-ink-500)", lineHeight: 1.5 }}>
                One place to compare monetization, retention, and engagement metrics across any two chosen slices.
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--color-ink-500)", textAlign: "right", lineHeight: 1.55 }}>
              Left: <strong style={{ color: "var(--color-ink-900)" }}>{data.comparisonSummary.leftLabel}</strong>
              <br />
              Right: <strong style={{ color: "var(--color-ink-900)" }}>{data.comparisonSummary.rightLabel}</strong>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--color-panel-soft)", borderBottom: "1px solid var(--color-border-soft)" }}>
                {["Category", "Metric", data.comparisonSummary.leftLabel, data.comparisonSummary.rightLabel, "Delta", "Direction"].map((column) => (
                  <th key={column} style={HEADER_CELL_STYLE}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.metricComparisonRows.map((row, index) => {
                const positive = row.delta > 0;
                const favorable =
                  row.preferredDirection === "higher" ? row.delta >= 0 : row.delta <= 0;
                return (
                  <tr
                    key={`${row.category}-${row.label}`}
                    style={{ borderBottom: index < data.metricComparisonRows.length - 1 ? "1px solid var(--color-border-soft)" : "none" }}
                  >
                    <td style={BODY_CELL_STYLE}>
                      <span style={{ textTransform: "capitalize", color: "var(--color-ink-500)" }}>{row.category}</span>
                    </td>
                    <td style={{ ...BODY_CELL_STYLE, fontWeight: 600, color: "var(--color-ink-950)" }}>{row.label}</td>
                    <td style={BODY_CELL_STYLE}>{formatMetricValue(row.leftValue, row.unit)}</td>
                    <td style={BODY_CELL_STYLE}>{formatMetricValue(row.rightValue, row.unit)}</td>
                    <td
                      style={{
                        ...BODY_CELL_STYLE,
                        fontWeight: 600,
                        color: favorable
                          ? "var(--color-success)"
                          : positive
                            ? "var(--color-danger)"
                            : "var(--color-warning)",
                      }}
                    >
                      {formatMetricDelta(row.delta, row.unit)}
                    </td>
                    <td style={BODY_CELL_STYLE}>{row.preferredDirection === "higher" ? "Higher is better" : "Lower is better"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <CohortMatrixTable rows={data.cohortMatrix} />

        <section
          style={{
            background: "var(--color-panel-base)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-border-soft)",
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "flex-start",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Breakdown table</div>
              <div style={{ marginTop: 3, fontSize: 12, color: "var(--color-ink-500)", lineHeight: 1.5 }}>
                Works like a proper analytics surface: selection filters stay on top, and grouped rows reflect
                monetization, retention, and session quality for the chosen slice instead of querying every raw
                combination separately.
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--color-ink-500)", textAlign: "right", lineHeight: 1.55 }}>
              Grouping:{" "}
              <strong style={{ color: "var(--color-ink-900)" }}>
                {filters.groupBy === "none" ? "none" : filters.groupBy}
              </strong>
              <br />
              Compare:{" "}
              <strong style={{ color: "var(--color-ink-900)" }}>
                {data.localFilters.compareLeft} vs {data.localFilters.compareRight}
              </strong>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1380 }}>
              <thead>
                <tr style={{ background: "var(--color-panel-soft)", borderBottom: "1px solid var(--color-border-soft)" }}>
                  {[
                    "Group",
                    "Platform",
                    "Spend",
                    "Installs",
                    "Cohorts",
                    "CPI",
                    "Rev/user",
                    "D30",
                    "D60",
                    "D120",
                    "D7 retention",
                    "D30 retention",
                    "Session",
                    "Ad share",
                    "Payback",
                    "Confidence",
                  ].map((column) => (
                    <th key={column} style={HEADER_CELL_STYLE}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.breakdownRows.map((row, index) => {
                  const confidence = CONFIDENCE_TONE[row.confidence];
                  return (
                    <tr
                      key={`${row.dimension}-${row.label}`}
                      style={{ borderBottom: index < data.breakdownRows.length - 1 ? "1px solid var(--color-border-soft)" : "none" }}
                    >
                      <td style={BODY_CELL_STYLE}>
                        <div style={{ fontWeight: 600, color: "var(--color-ink-950)" }}>{row.label}</div>
                        <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--color-ink-500)" }}>{row.dimension}</div>
                      </td>
                      <td style={BODY_CELL_STYLE}>{row.platform}</td>
                      <td style={BODY_CELL_STYLE}>${row.spend.toLocaleString()}</td>
                      <td style={BODY_CELL_STYLE}>{row.installs.toLocaleString()}</td>
                      <td style={BODY_CELL_STYLE}>{row.cohorts}</td>
                      <td style={BODY_CELL_STYLE}>{row.cpi.toFixed(2)}</td>
                      <td style={{ ...BODY_CELL_STYLE, fontWeight: 600, color: "var(--color-ink-900)" }}>
                        ${row.revenuePerUser.toFixed(2)}
                      </td>
                      <td style={{ ...BODY_CELL_STYLE, fontWeight: 600, color: "var(--color-ink-900)" }}>{row.d30Roas.toFixed(0)}%</td>
                      <td style={{ ...BODY_CELL_STYLE, fontWeight: 600, color: "var(--color-ink-900)" }}>{row.d60Roas.toFixed(0)}%</td>
                      <td style={{ ...BODY_CELL_STYLE, fontWeight: 600, color: "var(--color-ink-900)" }}>{row.d120Roas.toFixed(0)}%</td>
                      <td style={BODY_CELL_STYLE}>{row.d7Retention.toFixed(1)}%</td>
                      <td style={BODY_CELL_STYLE}>{row.d30Retention.toFixed(1)}%</td>
                      <td style={BODY_CELL_STYLE}>{row.sessionMinutes.toFixed(1)}m</td>
                      <td style={BODY_CELL_STYLE}>{row.adShare.toFixed(0)}%</td>
                      <td style={BODY_CELL_STYLE}>{row.paybackDays}d</td>
                      <td style={BODY_CELL_STYLE}>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: confidence.background,
                            color: confidence.color,
                            fontSize: 11.5,
                            fontWeight: 600,
                          }}
                        >
                          {row.confidence}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--color-border-soft)",
        background: "var(--color-panel-soft)",
        borderRadius: 8,
        padding: "12px 13px",
      }}
    >
      <div style={CARD_LABEL_STYLE}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>{value}</div>
    </div>
  );
}

const CARD_LABEL_STYLE = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.07em",
  textTransform: "uppercase" as const,
  color: "var(--color-ink-500)",
  marginBottom: 8,
};

const HEADER_CELL_STYLE = {
  padding: "10px 16px",
  textAlign: "left" as const,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--color-ink-500)",
};

const BODY_CELL_STYLE = {
  padding: "12px 16px",
  fontSize: 13,
  color: "var(--color-ink-700)",
  verticalAlign: "top" as const,
};

function capitalizeMode(value: string) {
  return value === "iap" ? "IAP revenue" : `${value.charAt(0).toUpperCase()}${value.slice(1)} revenue`;
}

function formatMetricValue(value: number, unit: string) {
  if (unit === "$") {
    return `$${value.toFixed(2)}`;
  }

  if (unit === "%") {
    return `${value.toFixed(1)}%`;
  }

  if (unit === "d") {
    return `${value.toFixed(0)}d`;
  }

  return `${value.toFixed(1)}${unit}`;
}

function formatMetricDelta(value: number, unit: string) {
  const prefix = value > 0 ? "+" : "";
  if (unit === "$") {
    return `${prefix}$${value.toFixed(2)}`;
  }

  if (unit === "%") {
    return `${prefix}${value.toFixed(1)}%`;
  }

  if (unit === "d") {
    return `${prefix}${value.toFixed(0)}d`;
  }

  return `${prefix}${value.toFixed(1)}${unit}`;
}
