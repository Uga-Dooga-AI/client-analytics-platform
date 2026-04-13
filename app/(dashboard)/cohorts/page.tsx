import { TopFilterRail } from "@/components/top-filter-rail";
import { getProjectLabel, parseDashboardSearchParams } from "@/lib/dashboard-filters";
import { getCohortDefinitions, getCohortGrid, getCohortTrends } from "@/lib/data/cohorts";

const PERIOD_LABELS = ["D0", "D1", "D3", "D7", "D14", "D30"];

function heatColor(value: number) {
  if (value === 0) {
    return "var(--color-panel-soft)";
  }

  const alpha = Math.max(0.12, Math.min(0.88, value / 100));
  return `rgba(37, 99, 235, ${alpha.toFixed(2)})`;
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

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

export default async function CohortsPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const filters = parseDashboardSearchParams(await searchParams, "/cohorts");
  const selectedProject = getProjectLabel(filters.projectKey);
  const [visibleDefinitions, cohortGrid, cohortTrends] = await Promise.all([
    getCohortDefinitions({ projectKey: filters.projectKey }),
    getCohortGrid(),
    getCohortTrends(),
  ]);

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
              gridTemplateColumns: "0.85fr 1.35fr",
              gap: 20,
            }}
          >
            <div style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Saved cohort definitions</div>
                <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Mock-backed cohort presets for {selectedProject}</div>
              </div>

              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {visibleDefinitions.map((cohort, index) => (
                  <div
                    key={cohort.id}
                    style={{
                      padding: "14px 14px 12px",
                      borderRadius: 8,
                      border: index === 0 ? "1px solid var(--color-signal-blue)" : "1px solid var(--color-border-soft)",
                      background: index === 0 ? "var(--color-signal-blue-surface)" : "var(--color-panel-base)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>{cohort.name}</div>
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
                    <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 5 }}>{cohort.project}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12, fontSize: 11.5 }}>
                      <div>
                        <div style={{ color: "var(--color-ink-500)" }}>Trigger</div>
                        <div style={{ fontWeight: 600, color: "var(--color-ink-900)", marginTop: 2 }}>{cohort.trigger}</div>
                      </div>
                      <div>
                        <div style={{ color: "var(--color-ink-500)" }}>Population</div>
                        <div style={{ fontWeight: 600, color: "var(--color-ink-900)", marginTop: 2 }}>{cohort.population.toLocaleString()}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 10 }}>{cohort.window}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Retention grid</div>
                <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Weekly cohorts · Word Catcher install retention</div>
              </div>

              <div style={{ padding: 16 }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 4 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-ink-500)" }}>
                        Cohort
                      </th>
                      <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-ink-500)" }}>
                        Users
                      </th>
                      {PERIOD_LABELS.map((label) => (
                        <th key={label} style={{ padding: "6px 4px", textAlign: "center", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-ink-500)" }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohortGrid.map((row) => (
                      <tr key={row.cohortLabel}>
                        <td style={{ padding: "8px 8px", fontSize: 12.5, fontWeight: 600, color: "var(--color-ink-900)" }}>{row.cohortLabel}</td>
                        <td style={{ padding: "8px 8px", textAlign: "right", fontSize: 12, color: "var(--color-ink-500)" }}>{row.population.toLocaleString()}</td>
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

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Retention trend</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>D7 and D30 retention by cohort date</div>

              <svg viewBox="0 0 340 140" style={{ width: "100%", marginTop: 16, background: "var(--color-panel-soft)", borderRadius: 8, border: "1px solid var(--color-border-soft)" }}>
                {[20, 40, 60].map((grid) => (
                  <line key={grid} x1="28" y1={pointY(grid)} x2="316" y2={pointY(grid)} stroke="var(--color-border-soft)" strokeWidth="1" />
                ))}
                <line x1="28" y1="116" x2="316" y2="116" stroke="var(--color-border-strong)" strokeWidth="1" />
                <path d={linePath(cohortTrends.iosD7)} fill="none" stroke="var(--color-signal-blue)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d={linePath(cohortTrends.androidD7)} fill="none" stroke="rgba(37, 99, 235, 0.45)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d={linePath(cohortTrends.iosD30)} fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d={linePath(cohortTrends.androidD30)} fill="none" stroke="rgba(22, 163, 74, 0.45)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                {cohortTrends.labels.map((label, index) => (
                  <text key={label} x={pointX(index, cohortTrends.labels.length)} y="134" textAnchor="middle" fill="var(--color-ink-500)" fontSize="10">
                    {label.replace("Mar ", "M").replace("Apr ", "A")}
                  </text>
                ))}
              </svg>

              <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
                {[
                  ["iOS D7", "var(--color-signal-blue)"],
                  ["Android D7", "rgba(37, 99, 235, 0.45)"],
                  ["iOS D30", "var(--color-success)"],
                  ["Android D30", "rgba(22, 163, 74, 0.45)"],
                ].map(([label, color]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
                    {label}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Comparison surfaces</div>
                <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Structured placeholders that do not block UI delivery</div>
              </div>

              <div style={{ borderRadius: 8, border: "1.5px dashed var(--color-border-strong)", background: "var(--color-panel-soft)", padding: "18px 16px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-ink-900)" }}>Cross-project cohort comparison</div>
                <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 4, lineHeight: 1.55 }}>
                  Requires `dim_user_identity` mapping table. Layout and filter slots are already reserved in the interface.
                </div>
              </div>

              <div style={{ borderRadius: 8, border: "1.5px dashed var(--color-border-strong)", background: "var(--color-panel-soft)", padding: "18px 16px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-ink-900)" }}>Custom event cohort builder</div>
                <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 4, lineHeight: 1.55 }}>
                  Coming in Phase 4. The current screen covers the final layout and density without waiting for event taxonomy wiring.
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
