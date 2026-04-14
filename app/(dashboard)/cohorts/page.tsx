import { cookies } from "next/headers";
import { AcquisitionWorkbench } from "@/components/acquisition-workbench";
import { CohortMatrixTable } from "@/components/cohort-matrix-table";
import { ComparisonConfidenceChart } from "@/components/comparison-confidence-chart";
import { RetentionTrendChart } from "@/components/retention-trend-chart";
import { TopFilterRail } from "@/components/top-filter-rail";
import {
  getAcquisitionDashboardData,
  parseAcquisitionSearchParams,
} from "@/lib/data/acquisition";
import { getProjectLabel, parseDashboardSearchParams } from "@/lib/dashboard-filters";
import { getCohortDefinitions, getCohortGrid, getCohortTrends } from "@/lib/data/cohorts";
import { parseSavedSegmentsCookie, SAVED_SEGMENTS_COOKIE } from "@/lib/segments";

const PERIOD_LABELS = ["D0", "D1", "D3", "D7", "D14", "D30"];
const COHORT_COMPARE_CHART_IDS = [
  "compare-payback",
  "compare-retention-d7",
  "compare-retention-d30",
  "compare-session-minutes",
];

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

function heatColor(value: number) {
  if (value === 0) {
    return "var(--color-panel-soft)";
  }

  const alpha = Math.max(0.12, Math.min(0.88, value / 100));
  return `rgba(37, 99, 235, ${alpha.toFixed(2)})`;
}

export default async function CohortsPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const rawSearchParams = await searchParams;
  const filters = parseDashboardSearchParams(rawSearchParams, "/cohorts");
  const localFilters = parseAcquisitionSearchParams(rawSearchParams);
  const selectedProject = getProjectLabel(filters.projectKey);
  const cookieStore = await cookies();
  const savedSegments = parseSavedSegmentsCookie(cookieStore.get(SAVED_SEGMENTS_COOKIE)?.value);

  const [visibleDefinitions, cohortGrid, cohortTrends, compareData] = await Promise.all([
    getCohortDefinitions({ projectKey: filters.projectKey }),
    getCohortGrid(),
    getCohortTrends(),
    getAcquisitionDashboardData(filters, localFilters, savedSegments),
  ]);

  const cohortCompareCharts = COHORT_COMPARE_CHART_IDS.map((chartId) =>
    compareData.compareCharts.find((chart) => chart.id === chartId)
  ).filter((chart): chart is NonNullable<typeof chart> => Boolean(chart));

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Cohorts" />

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <main
          style={{
            flex: 1,
            padding: 32,
            display: "flex",
            flexDirection: "column",
            gap: 24,
            overflowY: "auto",
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
                sub: `${compareData.summary.cohortCount} cohort dates`,
              },
              {
                label: "Compare workspace",
                value: `${compareData.comparisonSummary.leftLabel} vs ${compareData.comparisonSummary.rightLabel}`,
                sub: "Same compare engine as acquisition and experiments",
              },
              {
                label: "Revenue view",
                value: capitalizeMode(compareData.summary.revenueMode),
                sub: `Ad share ${compareData.summary.adShare.toFixed(0)}%`,
              },
              {
                label: "D7 retention",
                value: `${compareData.summary.d7Retention.toFixed(1)}%`,
                sub: `D1 ${compareData.summary.d1Retention.toFixed(1)}%`,
              },
              {
                label: "D30 retention",
                value: `${compareData.summary.d30Retention.toFixed(1)}%`,
                sub: "Long-tail cohort quality",
              },
              {
                label: "Session length",
                value: `${compareData.summary.sessionMinutes.toFixed(1)}m`,
                sub: "Average first-week session duration",
              },
              {
                label: "D60 ROAS",
                value: `${compareData.summary.d60Roas.toFixed(0)}%`,
                sub: `Revenue / user $${compareData.summary.totalRevenuePerUser.toFixed(2)}`,
              },
              {
                label: "Payback",
                value: `${compareData.summary.paybackDays}d`,
                sub: `${compareData.summary.confidence} confidence band`,
              },
            ].map((card) => (
              <div key={card.label} style={{ background: "var(--color-panel-base)", padding: "18px 20px" }}>
                <div style={CARD_LABEL_STYLE}>{card.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1.1 }}>
                  {card.value}
                </div>
                <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--color-ink-500)" }}>{card.sub}</div>
              </div>
            ))}
          </section>

          <AcquisitionWorkbench
            title="Cohort comparison workspace"
            caption="Pick the parent slice first, then compare two cohort segments by platform, country, company, source, campaign, creative, or saved user segment. Retention, session quality, and payback stay on the same statistical surface."
            filters={compareData.localFilters}
            options={compareData.options}
          />

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "0.85fr 1.15fr",
              gap: 20,
            }}
          >
            <div
              style={{
                background: "var(--color-panel-base)",
                border: "1px solid var(--color-border-soft)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>
                  Saved cohort definitions
                </div>
                <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>
                  Mock-backed cohort presets for {selectedProject}
                </div>
              </div>

              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {visibleDefinitions.map((cohort, index) => (
                  <div
                    key={cohort.id}
                    style={{
                      padding: "14px 14px 12px",
                      borderRadius: 8,
                      border:
                        index === 0
                          ? "1px solid var(--color-signal-blue)"
                          : "1px solid var(--color-border-soft)",
                      background:
                        index === 0 ? "var(--color-signal-blue-surface)" : "var(--color-panel-base)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                        {cohort.name}
                      </div>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "var(--color-panel-base)",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--color-ink-700)",
                        }}
                      >
                        {cohort.platform}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 5 }}>
                      {cohort.project}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10,
                        marginTop: 12,
                        fontSize: 11.5,
                      }}
                    >
                      <div>
                        <div style={{ color: "var(--color-ink-500)" }}>Trigger</div>
                        <div style={{ fontWeight: 600, color: "var(--color-ink-900)", marginTop: 2 }}>
                          {cohort.trigger}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "var(--color-ink-500)" }}>Population</div>
                        <div style={{ fontWeight: 600, color: "var(--color-ink-900)", marginTop: 2 }}>
                          {cohort.population.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 10 }}>
                      {cohort.window}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                background: "var(--color-panel-base)",
                border: "1px solid var(--color-border-soft)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>
                  Retention grid
                </div>
                <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>
                  Weekly cohorts for {selectedProject}. This stays useful as a fast heatmap even before live data is
                  wired.
                </div>
              </div>

              <div style={{ padding: 16 }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 4 }}>
                  <thead>
                    <tr>
                      <th style={HEATMAP_HEADER_STYLE}>Cohort</th>
                      <th style={{ ...HEATMAP_HEADER_STYLE, textAlign: "right" }}>Users</th>
                      {PERIOD_LABELS.map((label) => (
                        <th key={label} style={{ ...HEATMAP_HEADER_STYLE, textAlign: "center" }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohortGrid.map((row) => (
                      <tr key={row.cohortLabel}>
                        <td style={{ padding: "8px 8px", fontSize: 12.5, fontWeight: 600, color: "var(--color-ink-900)" }}>
                          {row.cohortLabel}
                        </td>
                        <td style={{ padding: "8px 8px", textAlign: "right", fontSize: 12, color: "var(--color-ink-500)" }}>
                          {row.population.toLocaleString()}
                        </td>
                        {row.values.map((value, index) => (
                          <td key={`${row.cohortLabel}-${PERIOD_LABELS[index]}`} style={{ padding: 0 }}>
                            <div
                              style={{
                                minWidth: 48,
                                padding: "9px 0",
                                borderRadius: 8,
                                background: heatColor(value),
                                color: value >= 45 ? "#fff" : "var(--color-ink-900)",
                                textAlign: "center",
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              {value === 0 ? "—" : `${value}%`}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 20 }}>
            {cohortCompareCharts.map((chart) => (
              <ComparisonConfidenceChart key={chart.id} chart={chart} />
            ))}
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 20 }}>
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
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>
                    Cohort metric comparison
                  </div>
                  <div style={{ marginTop: 3, fontSize: 12, color: "var(--color-ink-500)", lineHeight: 1.5 }}>
                    Same filtered parent slice, two compared segments, and one compact table for revenue, retention,
                    and engagement.
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-ink-500)", textAlign: "right", lineHeight: 1.55 }}>
                  Left:{" "}
                  <strong style={{ color: "var(--color-ink-900)" }}>
                    {compareData.comparisonSummary.leftLabel}
                  </strong>
                  <br />
                  Right:{" "}
                  <strong style={{ color: "var(--color-ink-900)" }}>
                    {compareData.comparisonSummary.rightLabel}
                  </strong>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
                  <thead>
                    <tr
                      style={{
                        background: "var(--color-panel-soft)",
                        borderBottom: "1px solid var(--color-border-soft)",
                      }}
                    >
                      {[
                        "Category",
                        "Metric",
                        compareData.comparisonSummary.leftLabel,
                        compareData.comparisonSummary.rightLabel,
                        "Delta",
                        "Direction",
                      ].map((column) => (
                        <th key={column} style={TABLE_HEADER_STYLE}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compareData.metricComparisonRows.map((row, index) => {
                      const positive = row.delta > 0;
                      const favorable =
                        row.preferredDirection === "higher" ? row.delta >= 0 : row.delta <= 0;

                      return (
                        <tr
                          key={`${row.category}-${row.label}`}
                          style={{
                            borderBottom:
                              index < compareData.metricComparisonRows.length - 1
                                ? "1px solid var(--color-border-soft)"
                                : "none",
                          }}
                        >
                          <td style={TABLE_BODY_STYLE}>
                            <span style={{ textTransform: "capitalize", color: "var(--color-ink-500)" }}>
                              {row.category}
                            </span>
                          </td>
                          <td style={{ ...TABLE_BODY_STYLE, fontWeight: 600, color: "var(--color-ink-950)" }}>
                            {row.label}
                          </td>
                          <td style={TABLE_BODY_STYLE}>{formatMetricValue(row.leftValue, row.unit)}</td>
                          <td style={TABLE_BODY_STYLE}>{formatMetricValue(row.rightValue, row.unit)}</td>
                          <td
                            style={{
                              ...TABLE_BODY_STYLE,
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
                          <td style={TABLE_BODY_STYLE}>
                            {row.preferredDirection === "higher" ? "Higher is better" : "Lower is better"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <div
              style={{
                background: "var(--color-panel-base)",
                border: "1px solid var(--color-border-soft)",
                borderRadius: 10,
                padding: 20,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Retention trend</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>
                D7 and D30 retention by cohort date. This complements the left-vs-right comparison with a top-level
                platform trend read.
              </div>

              <RetentionTrendChart trend={cohortTrends} />

              <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
                {[
                  ["iOS D7", "var(--color-signal-blue)"],
                  ["Android D7", "rgba(37, 99, 235, 0.45)"],
                  ["iOS D30", "var(--color-success)"],
                  ["Android D30", "rgba(22, 163, 74, 0.45)"],
                ].map(([label, color]) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11.5,
                      color: "var(--color-ink-500)",
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
                    {label}
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                <InfoStat
                  label="Revenue split"
                  value={`Ads $${compareData.summary.adRevenuePerUser.toFixed(2)} · IAP $${compareData.summary.iapRevenuePerUser.toFixed(2)}`}
                />
                <InfoStat
                  label="Compare axis"
                  value={
                    compareData.localFilters.compareBy === "segment"
                      ? "Saved user segment"
                      : compareData.localFilters.compareBy
                  }
                />
              </div>
            </div>
          </section>

          <CohortMatrixTable rows={compareData.cohortMatrix} />
        </main>
      </div>
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
      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)", lineHeight: 1.45 }}>
        {value}
      </div>
    </div>
  );
}

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

const CARD_LABEL_STYLE = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.07em",
  textTransform: "uppercase" as const,
  color: "var(--color-ink-500)",
  marginBottom: 8,
};

const HEATMAP_HEADER_STYLE = {
  padding: "6px 8px",
  textAlign: "left" as const,
  fontSize: 10.5,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: "var(--color-ink-500)",
};

const TABLE_HEADER_STYLE = {
  padding: "10px 16px",
  textAlign: "left" as const,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--color-ink-500)",
};

const TABLE_BODY_STYLE = {
  padding: "12px 16px",
  fontSize: 13,
  color: "var(--color-ink-700)",
  verticalAlign: "top" as const,
};
