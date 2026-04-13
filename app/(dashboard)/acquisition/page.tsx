import { ConfidenceBandChart } from "@/components/confidence-band-chart";
import { TopFilterRail } from "@/components/top-filter-rail";
import { getProjectLabel, parseDashboardSearchParams } from "@/lib/dashboard-filters";
import { getAcquisitionTrajectories, getAcquisitionBreakdown, type AcquisitionBreakdownRow } from "@/lib/data/acquisition";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

function matchesRowFilters(
  row: AcquisitionBreakdownRow,
  filters: ReturnType<typeof parseDashboardSearchParams>,
  projectLabel: string
) {
  if (row.project !== projectLabel) {
    return false;
  }

  if (filters.groupBy !== "none" && row.groupBy !== filters.groupBy) {
    return false;
  }

  if (filters.groupBy === "none" && row.groupBy !== "none") {
    return false;
  }

  if (filters.platform !== "all" && row.platform.toLowerCase() !== filters.platform) {
    return false;
  }

  if (filters.segment !== "all" && !row.segments.includes(filters.segment)) {
    return false;
  }

  if (filters.tag !== "all" && !row.tags.includes(filters.tag)) {
    return false;
  }

  return true;
}

function aggregateSummary(rows: AcquisitionBreakdownRow[]) {
  const spend = rows.reduce((sum, row) => sum + row.spend, 0);
  const installs = rows.reduce((sum, row) => sum + row.installs, 0);
  const weightedD30 = spend ? rows.reduce((sum, row) => sum + row.d30Roas * row.spend, 0) / spend : 0;
  const weightedD60 = spend ? rows.reduce((sum, row) => sum + row.d60Roas * row.spend, 0) / spend : 0;
  const weightedPayback = spend ? rows.reduce((sum, row) => sum + row.paybackDays * row.spend, 0) / spend : 0;

  return {
    spend,
    installs,
    cpi: installs ? spend / installs : 0,
    d30Roas: weightedD30,
    d60Roas: weightedD60,
    paybackDays: weightedPayback,
  };
}

function confidenceTone(confidence: string) {
  if (confidence === "Tight") {
    return { color: "var(--color-success)", background: "#dcfce7" };
  }

  if (confidence === "Medium") {
    return { color: "var(--color-signal-blue)", background: "var(--color-signal-blue-surface)" };
  }

  return { color: "var(--color-warning)", background: "#fef3c7" };
}

export default async function AcquisitionPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const filters = parseDashboardSearchParams(await searchParams, "/acquisition");
  const projectLabel = getProjectLabel(filters.projectKey);
  const [allTrajectories, allRows] = await Promise.all([
    getAcquisitionTrajectories({ projectKey: filters.projectKey }),
    getAcquisitionBreakdown({ projectKey: filters.projectKey }),
  ]);
  const chartSeries = allTrajectories.filter((entry) => entry.project === projectLabel);
  const visibleRows = allRows.filter((row) => matchesRowFilters(row, filters, projectLabel));
  const summary = aggregateSummary(visibleRows);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Acquisition" />

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <main
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: "auto",
            padding: 32,
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 1,
              background: "var(--color-border-soft)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {[
              { label: "Selected project", value: projectLabel, sub: "Single-project analysis only" },
              { label: "Spend", value: `$${summary.spend.toLocaleString()}`, sub: "Filtered paid traffic slice" },
              { label: "Installs", value: summary.installs.toLocaleString(), sub: `CPI ${summary.cpi.toFixed(2)}` },
              { label: "D60 ROAS", value: `${summary.d60Roas.toFixed(1)}%`, sub: `D30 ROAS ${summary.d30Roas.toFixed(1)}%` },
              { label: "Projected payback", value: `${summary.paybackDays.toFixed(0)}d`, sub: "Notebook-style interval charts below" },
            ].map((card) => (
              <div key={card.label} style={{ background: "var(--color-panel-base)", padding: "18px 20px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)", marginBottom: 8 }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1.05 }}>{card.value}</div>
                <div style={{ marginTop: 5, fontSize: 11.5, color: "var(--color-ink-500)" }}>{card.sub}</div>
              </div>
            ))}
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {chartSeries.map((chart) => (
              <ConfidenceBandChart
                key={chart.id}
                title={chart.title}
                subtitle={chart.subtitle}
                unit={chart.unit}
                series={chart.series}
              />
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
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 18,
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>
                  Acquisition breakdown
                </div>
                <div style={{ marginTop: 3, fontSize: 12, color: "var(--color-ink-500)" }}>
                  Grouping behaves like an analytics platform surface: no grouping, or split by country, traffic source,
                  campaign, and company.
                </div>
              </div>
              <div style={{ maxWidth: 320, fontSize: 12, color: "var(--color-ink-500)", lineHeight: 1.55, textAlign: "right" }}>
                Segment: <strong style={{ color: "var(--color-ink-900)" }}>{filters.segment}</strong> · Tag:{" "}
                <strong style={{ color: "var(--color-ink-900)" }}>{filters.tag}</strong> · Grouping:{" "}
                <strong style={{ color: "var(--color-ink-900)" }}>{filters.groupBy}</strong>
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--color-panel-soft)", borderBottom: "1px solid var(--color-border-soft)" }}>
                  {["Group", "Platform", "Spend", "Installs", "CPI", "D30 ROAS", "D60 ROAS", "Payback", "Confidence"].map(
                    (column) => (
                      <th
                        key={column}
                        style={{
                          padding: "10px 16px",
                          textAlign: "left",
                          fontSize: 10.5,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--color-ink-500)",
                        }}
                      >
                        {column}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => {
                  const confidence = confidenceTone(row.confidence);
                  return (
                    <tr
                      key={`${row.groupBy}-${row.label}`}
                      style={{ borderBottom: index < visibleRows.length - 1 ? "1px solid var(--color-border-soft)" : "none" }}
                    >
                      <td style={{ padding: "12px 16px", fontSize: 13.5, fontWeight: 600, color: "var(--color-ink-950)" }}>{row.label}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-ink-700)" }}>{row.platform}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-ink-700)" }}>${row.spend.toLocaleString()}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-ink-700)" }}>{row.installs.toLocaleString()}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-ink-700)" }}>{row.cpi.toFixed(2)}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "var(--color-ink-900)" }}>{row.d30Roas}%</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "var(--color-ink-900)" }}>{row.d60Roas}%</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-ink-700)" }}>{row.paybackDays}d</td>
                      <td style={{ padding: "12px 16px" }}>
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
          </section>
        </main>

        <aside
          style={{
            width: 300,
            flexShrink: 0,
            borderLeft: "1px solid var(--color-border-soft)",
            background: "var(--color-panel-soft)",
            padding: "24px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
            overflowY: "auto",
          }}
        >
          <SideCard
            title="Notebook parity"
            body="The ROAS and payback charts intentionally mirror the current helper.py logic: predicted line, lower bound, upper bound, and realized values when available."
          />
          <SideCard
            title="Group-ready model"
            body="The shell is prepared for country, source, campaign, and company grouping so the BigQuery marts can attach without changing the UI contract."
          />
          <SideCard
            title="Planned API output"
            body="Acquisition screens expect cohort-date metrics with predicted, lower, upper, and actual series plus grouped slices for ROAS, CPI, payback, and confidence coverage."
          />
        </aside>
      </div>
    </div>
  );
}

function SideCard({ title, body }: { title: string; body: string }) {
  return (
    <section
      style={{
        background: "var(--color-panel-base)",
        border: "1px solid var(--color-border-soft)",
        borderRadius: 8,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--color-ink-700)" }}>{body}</div>
    </section>
  );
}
