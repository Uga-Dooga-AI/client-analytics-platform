import Link from "next/link";
import { AcquisitionWorkbench } from "@/components/acquisition-workbench";
import { ComparisonConfidenceChart } from "@/components/comparison-confidence-chart";
import { TopFilterRail } from "@/components/top-filter-rail";
import {
  getAcquisitionDashboardData,
  parseAcquisitionSearchParams,
} from "@/lib/data/acquisition";
import { getExperiments } from "@/lib/data/experiments";
import { getProjectLabel, parseDashboardSearchParams } from "@/lib/dashboard-filters";

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  running: { color: "var(--color-success)", bg: "#dcfce7", label: "Running" },
  paused: { color: "var(--color-warning)", bg: "#fef3c7", label: "Paused" },
  concluded: { color: "var(--color-ink-500)", bg: "var(--color-panel-soft)", label: "Concluded" },
};

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

export default async function ExperimentsPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const rawSearchParams = await searchParams;
  const filters = parseDashboardSearchParams(rawSearchParams, "/experiments");
  const localFilters = parseAcquisitionSearchParams(rawSearchParams);
  const [visibleExperiments, compareData] = await Promise.all([
    getExperiments({ projectKey: filters.projectKey }),
    getAcquisitionDashboardData(filters, localFilters),
  ]);
  const selectedProject = getProjectLabel(filters.projectKey);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <TopFilterRail title="Experiments" />

      <main
        style={{
          padding: 32,
          flex: 1,
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
              label: "Saved experiments",
              value: visibleExperiments.length.toString(),
              sub: selectedProject,
            },
            {
              label: "Compare workspace",
              value: `${compareData.comparisonSummary.leftLabel} vs ${compareData.comparisonSummary.rightLabel}`,
              sub: "Same surface for A/B tests and generic segment analysis",
            },
            {
              label: "D60 delta",
              value: `${compareData.comparisonSummary.d60Lift > 0 ? "+" : ""}${compareData.comparisonSummary.d60Lift}%`,
              sub: "Lift between selected sides",
            },
            {
              label: "Payback delta",
              value: `${compareData.comparisonSummary.paybackDeltaDays > 0 ? "+" : ""}${compareData.comparisonSummary.paybackDeltaDays}d`,
              sub: "Negative means left side repays faster",
            },
          ].map((card) => (
            <div key={card.label} style={{ background: "var(--color-panel-base)", padding: "18px 20px" }}>
              <div style={CARD_LABEL_STYLE}>{card.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1.15 }}>
                {card.value}
              </div>
              <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--color-ink-500)" }}>{card.sub}</div>
            </div>
          ))}
        </section>

        <AcquisitionWorkbench
          title="Comparison workspace"
          caption="Treat A/B tests as first-class saved comparisons, but do not limit the interface to them. The same workbench lets you compare arbitrary countries, campaigns, creatives, or user segments on a common statistical surface."
          filters={compareData.localFilters}
          options={compareData.options}
        />

        <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 20 }}>
          {compareData.compareCharts.slice(0, 3).map((chart) => (
            <ComparisonConfidenceChart key={chart.id} chart={chart} />
          ))}
        </section>

        <section
          style={{
            backgroundColor: "var(--color-panel-base)",
            borderRadius: 12,
            border: "1px solid var(--color-border-soft)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-border-soft)",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>
                Saved experiments
              </div>
              <div style={{ marginTop: 3, fontSize: 12, color: "var(--color-ink-500)" }}>
                Experiments remain stored entities, but the review surface is now shared with arbitrary segment
                comparisons.
              </div>
            </div>
            <button
              style={{
                padding: "8px 16px",
                backgroundColor: "var(--color-signal-blue)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + New experiment
            </button>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-soft)", backgroundColor: "var(--color-panel-soft)" }}>
                {["Experiment", "Project", "Status", "Variants", "Exposures", "Lift", "p-value", "Started"].map((column) => (
                  <th key={column} style={HEADER_CELL_STYLE}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleExperiments.map((experiment, index) => {
                const status = STATUS_STYLE[experiment.status];
                return (
                  <tr
                    key={experiment.id}
                    style={{
                      borderBottom: index < visibleExperiments.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                    }}
                  >
                    <td style={BODY_CELL_STYLE}>
                      <Link
                        href={`/experiments/${experiment.id}`}
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: "var(--color-signal-blue)",
                          textDecoration: "none",
                        }}
                      >
                        {experiment.name}
                      </Link>
                    </td>
                    <td style={BODY_CELL_STYLE}>{experiment.project}</td>
                    <td style={BODY_CELL_STYLE}>
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "3px 8px",
                          borderRadius: 6,
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: status.color,
                          backgroundColor: status.bg,
                        }}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td style={{ ...BODY_CELL_STYLE, textAlign: "center" }}>{experiment.variants}</td>
                    <td style={BODY_CELL_STYLE}>{experiment.exposures.toLocaleString()}</td>
                    <td style={{ ...BODY_CELL_STYLE, fontWeight: 600 }}>
                      {experiment.lift !== null ? (
                        <span
                          style={{
                            color:
                              experiment.lift > 0
                                ? "var(--color-success)"
                                : experiment.lift < 0
                                  ? "var(--color-danger)"
                                  : "var(--color-ink-500)",
                          }}
                        >
                          {experiment.lift > 0 ? "+" : ""}
                          {experiment.lift}%
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-ink-500)" }}>—</span>
                      )}
                    </td>
                    <td style={BODY_CELL_STYLE}>{experiment.pValue !== null ? experiment.pValue.toFixed(3) : "—"}</td>
                    <td style={{ ...BODY_CELL_STYLE, color: "var(--color-ink-500)" }}>{experiment.startDate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </main>
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
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--color-ink-500)",
};

const BODY_CELL_STYLE = {
  padding: "12px 16px",
  fontSize: 13,
  color: "var(--color-ink-700)",
};
