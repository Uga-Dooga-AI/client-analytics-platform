import { ConfidenceBandChart } from "@/components/confidence-band-chart";
import { TopFilterRail } from "@/components/top-filter-rail";
import { getProjectLabel, parseDashboardSearchParams } from "@/lib/dashboard-filters";
import { getForecastRuns, getForecastCards, getForecastTrajectories } from "@/lib/data/forecasts";

const STATUS_STYLE = {
  completed: { label: "Completed", color: "var(--color-success)", bg: "#dcfce7" },
  running: { label: "Running", color: "var(--color-signal-blue)", bg: "var(--color-signal-blue-surface)" },
  needs_review: { label: "Review", color: "var(--color-warning)", bg: "#fef3c7" },
};

const CARD_STYLE = {
  stable: { label: "Stable", color: "var(--color-success)", bg: "#dcfce7" },
  converging: { label: "Converging", color: "var(--color-signal-blue)", bg: "var(--color-signal-blue-surface)" },
  wide: { label: "Wide interval", color: "var(--color-warning)", bg: "#fef3c7" },
};

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

export default async function ForecastsPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const filters = parseDashboardSearchParams(await searchParams, "/forecasts");
  const selectedProject = getProjectLabel(filters.projectKey);
  const [visibleRuns, visibleCards, visibleTrajectories] = await Promise.all([
    getForecastRuns({ projectKey: filters.projectKey }),
    getForecastCards({ projectKey: filters.projectKey }),
    getForecastTrajectories({ projectKey: filters.projectKey }),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Forecasts" />

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
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 1,
              background: "var(--color-border-soft)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {[
              { label: "Selected project", value: selectedProject, sub: "Forecast outputs scoped to one product" },
              { label: "Latest model", value: "v1.2.0", sub: "Revenue and paywall forecasts" },
              { label: "Visible runs", value: `${visibleRuns.length}`, sub: `Range ${filters.from} to ${filters.to}` },
              { label: "Mode", value: "Chart + table", sub: "Confidence intervals shown directly on chart" },
            ].map((card) => (
              <div key={card.label} style={{ background: "var(--color-panel-base)", padding: "18px 22px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)", marginBottom: 8 }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1 }}>
                  {card.value}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 5 }}>{card.sub}</div>
              </div>
            ))}
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
            {visibleTrajectories.map((trajectory) => (
              <ConfidenceBandChart
                key={trajectory.id}
                title={trajectory.metric}
                subtitle={trajectory.subtitle}
                unit={trajectory.unit}
                series={trajectory.series}
              />
            ))}
          </section>

          <section style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Forecast run history</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>
                Operational log scoped to {selectedProject}
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Run id", "Project", "Metric", "Status", "Generated", "Horizon", "MAE", "Coverage"].map((column) => (
                    <th
                      key={column}
                      style={{
                        padding: "10px 20px",
                        textAlign: "left",
                        fontSize: 10.5,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--color-ink-500)",
                        background: "var(--color-panel-soft)",
                        borderBottom: "1px solid var(--color-border-soft)",
                      }}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRuns.map((run, index) => {
                  const status = STATUS_STYLE[run.status];
                  return (
                    <tr key={run.id} style={{ borderBottom: index < visibleRuns.length - 1 ? "1px solid var(--color-border-soft)" : "none" }}>
                      <td style={{ padding: "13px 20px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, color: "var(--color-ink-700)" }}>{run.id}</td>
                      <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-700)" }}>{run.project}</td>
                      <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-900)" }}>{run.metric}</td>
                      <td style={{ padding: "13px 20px" }}>
                        <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 999, background: status.bg, color: status.color, fontSize: 11.5, fontWeight: 600 }}>
                          {status.label}
                        </span>
                      </td>
                      <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-500)" }}>{run.generatedAt}</td>
                      <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-700)" }}>{run.horizonDays}d</td>
                      <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-700)" }}>{run.mae}</td>
                      <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-700)" }}>{run.coverage}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {visibleCards.map((card) => {
              const status = CARD_STYLE[card.status];
              return (
                <div key={card.id} style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border-soft)", display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-ink-950)" }}>{card.project} · {card.metric}</div>
                      <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 2 }}>{card.horizonLabel}</div>
                    </div>
                    <span style={{ alignSelf: "flex-start", padding: "3px 8px", borderRadius: 6, background: status.bg, color: status.color, fontSize: 11, fontWeight: 600 }}>
                      {status.label}
                    </span>
                  </div>

                  <div style={{ padding: 20 }}>
                    <div style={{ fontSize: 12.5, color: "var(--color-ink-700)", lineHeight: 1.55 }}>{card.summary}</div>
                    <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                      {card.points.map((point) => (
                        <div key={point.date} style={{ display: "grid", gridTemplateColumns: "60px 1fr 72px", gap: 10, alignItems: "center" }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-700)" }}>{point.date}</div>
                          <div style={{ fontSize: 12.5, color: "var(--color-ink-900)" }}>{point.ci}</div>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-ink-950)", textAlign: "right" }}>{point.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        </main>

        <aside
          style={{
            width: 280,
            flexShrink: 0,
            borderLeft: "1px solid var(--color-border-soft)",
            background: "var(--color-panel-soft)",
            padding: "24px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            overflowY: "auto",
          }}
        >
          <section style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)", marginBottom: 10 }}>
              Why charts now
            </div>
            <div style={{ fontSize: 12, color: "var(--color-ink-700)", lineHeight: 1.6 }}>
              Forecasts now render as actual time-series charts with lower and upper confidence bounds instead of only textual cards.
            </div>
          </section>

          <section style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)", marginBottom: 10 }}>
              Publish gate
            </div>
            <div style={{ fontSize: 12, color: "var(--color-ink-700)", lineHeight: 1.6 }}>
              Admin review and source freshness stay separate from the chart surface. When data-plane jobs arrive, these outputs can bind without redesigning the UI.
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
