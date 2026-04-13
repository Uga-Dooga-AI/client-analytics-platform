import Link from "next/link";
import { TopFilterRail } from "@/components/top-filter-rail";
import { getProjectLabel, parseDashboardSearchParams } from "@/lib/dashboard-filters";
import { getFunnels } from "@/lib/data/funnels";

const STATUS_STYLE = {
  healthy: { label: "Healthy", color: "var(--color-success)", bg: "#dcfce7" },
  watch: { label: "Watch", color: "var(--color-warning)", bg: "#fef3c7" },
  risk: { label: "Risk", color: "var(--color-danger)", bg: "#fee2e2" },
};

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

export default async function FunnelsPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const filters = parseDashboardSearchParams(await searchParams, "/funnels");
  const visibleFunnels = await getFunnels({ projectKey: filters.projectKey });
  const selectedProject = getProjectLabel(filters.projectKey);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Funnels" />

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
              { label: "Tracked funnels", value: String(visibleFunnels.length), sub: `Scoped to ${selectedProject}` },
              { label: "Median completion", value: "39.8%", sub: "Weighted average" },
              { label: "Largest dropoff", value: "Store sheet", sub: "Paywall purchase path" },
              { label: "Builder mode", value: "Shell live", sub: "Event wiring later" },
            ].map((card) => (
              <div key={card.label} style={{ background: "var(--color-panel-base)", padding: "18px 22px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-ink-500)", marginBottom: 8 }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1 }}>{card.value}</div>
                <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 5 }}>{card.sub}</div>
              </div>
            ))}
          </section>

          <section style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Funnel library</div>
                <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Saved operational funnels with mock conversion diagnostics</div>
              </div>
              <button
                style={{
                  padding: "7px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--color-border-strong)",
                  background: "var(--color-panel-base)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--color-ink-700)",
                }}
              >
                New funnel
              </button>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Funnel", "Project", "Status", "Completion", "Median time", "Top dropoff"].map((column) => (
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
                        borderBottom: "1px solid var(--color-border-soft)",
                        background: "var(--color-panel-soft)",
                      }}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleFunnels.map((funnel, index) => {
                  const status = STATUS_STYLE[funnel.status];
                  return (
                    <tr key={funnel.id} style={{ borderBottom: index < visibleFunnels.length - 1 ? "1px solid var(--color-border-soft)" : "none" }}>
                      <td style={{ padding: "13px 20px" }}>
                        <Link href={`/funnels/${funnel.id}`} style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-signal-blue)", textDecoration: "none" }}>
                          {funnel.name}
                        </Link>
                        <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 2 }}>
                          {funnel.entryEvent} → {funnel.completionEvent}
                        </div>
                      </td>
                      <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-700)" }}>{funnel.project}</td>
                      <td style={{ padding: "13px 20px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: status.bg,
                            color: status.color,
                            fontSize: 11.5,
                            fontWeight: 600,
                          }}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td style={{ padding: "13px 20px", fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>{funnel.completionRate}%</td>
                      <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-700)" }}>{funnel.medianTimeMinutes} min</td>
                      <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-700)" }}>{funnel.topDropoff}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {visibleFunnels.slice(0, 2).map((funnel) => (
              <div key={funnel.id} style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>{funnel.name}</div>
                    <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>{funnel.project}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink-500)" }}>{funnel.sampleSize.toLocaleString()} users</div>
                </div>

                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  {funnel.steps.map((step) => (
                    <div key={step.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, marginBottom: 4 }}>
                        <span style={{ color: "var(--color-ink-900)" }}>{step.label}</span>
                        <span style={{ color: "var(--color-ink-500)" }}>{step.users.toLocaleString()}</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: "var(--color-panel-soft)", overflow: "hidden" }}>
                        <div style={{ width: `${step.completionRate}%`, height: "100%", borderRadius: 999, background: "var(--color-signal-blue)" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 4 }}>
                        <span>{step.completionRate}% completion</span>
                        <span>{step.dropoffRate}% dropoff</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
              Builder readiness
            </div>
            <div style={{ fontSize: 12.5, color: "var(--color-ink-700)", lineHeight: 1.65 }}>
              Funnel builder interactions are already being designed and validated in shell mode. Event catalog wiring can be connected after source credentials are available.
            </div>
          </section>

          <section>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)", marginBottom: 10 }}>
              Data dependencies
            </div>
            {[
              ["Step facts", "mart_funnel_daily"],
              ["Segmentation", "dim_user_identity"],
              ["Event builder", "event catalog registry"],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--color-border-soft)" }}>
                <span style={{ fontSize: 12, color: "var(--color-ink-500)" }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink-950)" }}>{value}</span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
