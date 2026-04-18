import Link from "next/link";
import { TopFilterRail } from "@/components/top-filter-rail";
import { getExperimentById } from "@/lib/data/experiments";

const STATUS_STYLE = {
  running: { color: "var(--color-success)", bg: "#dcfce7", label: "Running" },
  paused: { color: "var(--color-warning)", bg: "#fef3c7", label: "Paused" },
  concluded: { color: "var(--color-ink-500)", bg: "var(--color-panel-soft)", label: "Concluded" },
};

const GUARDRAIL_STYLE = {
  ok: "var(--color-success)",
  warn: "var(--color-warning)",
  risk: "var(--color-danger)",
};

export default async function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getExperimentById(id);
  const experiment = result?.experiment ?? null;
  const detail = result?.detail ?? null;

  if (!experiment || !detail) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: "var(--color-ink-900)", fontWeight: 600 }}>
          Live experiment detail is not published yet for: {id}
        </p>
        <p style={{ color: "var(--color-ink-500)", marginTop: 8, maxWidth: 720, lineHeight: 1.6 }}>
          The dashboard no longer falls back to mock experiment data. This page will start rendering once
          experiment facts and forecast outputs are written into the warehouse and serving layer.
        </p>
        <Link href="/experiments" style={{ color: "var(--color-signal-blue)" }}>
          Back to experiments
        </Link>
      </div>
    );
  }

  const status = STATUS_STYLE[experiment.status];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title={experiment.name} />

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
          <div style={{ fontSize: 12.5, color: "var(--color-ink-500)" }}>
            <Link href="/experiments" style={{ color: "var(--color-signal-blue)", textDecoration: "none" }}>
              Experiments
            </Link>{" "}
            / {experiment.name}
          </div>

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
              { label: "Status", value: status.label, sub: experiment.project },
              { label: "Exposures", value: experiment.exposures.toLocaleString(), sub: `${experiment.variants} variants` },
              {
                label: "Lift",
                value: experiment.lift !== null ? `${experiment.lift > 0 ? "+" : ""}${experiment.lift}%` : "—",
                sub: "Primary metric",
              },
              {
                label: "Decision by",
                value: detail.decisionDate,
                sub: detail.owner,
              },
            ].map((card) => (
              <div key={card.label} style={{ background: "var(--color-panel-base)", padding: "18px 22px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)", marginBottom: 8 }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1 }}>
                  {card.value}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 6 }}>{card.sub}</div>
              </div>
            ))}
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 20 }}>
            <section style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Variant comparison</div>
                <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>{detail.primaryMetric} and monetization impact</div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Variant", "Users", "Activation", "Revenue / user", "Lift"].map((column) => (
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
                  {detail.variants.map((variant, index) => (
                    <tr key={variant.label} style={{ borderBottom: index < detail.variants.length - 1 ? "1px solid var(--color-border-soft)" : "none" }}>
                      <td style={{ padding: "13px 20px", fontWeight: 600, color: "var(--color-ink-950)" }}>{variant.label}</td>
                      <td style={{ padding: "13px 20px", color: "var(--color-ink-700)" }}>{variant.users.toLocaleString()}</td>
                      <td style={{ padding: "13px 20px", color: "var(--color-ink-700)" }}>{variant.activationRate}%</td>
                      <td style={{ padding: "13px 20px", color: "var(--color-ink-700)" }}>${variant.revenuePerUser.toFixed(2)}</td>
                      <td
                        style={{
                          padding: "13px 20px",
                          fontWeight: 600,
                          color: variant.lift > 0 ? "var(--color-success)" : variant.lift < 0 ? "var(--color-danger)" : "var(--color-ink-500)",
                        }}
                      >
                        {variant.lift > 0 ? "+" : ""}
                        {variant.lift}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>{detail.ciBand.label}</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>
                Confidence interval preview will remain informational until the serving marts are fully published.
              </div>

              <div style={{ marginTop: 18, height: 12, borderRadius: 6, background: "var(--color-panel-soft)", position: "relative" }}>
                <div style={{ position: "absolute", left: "50%", width: 1, height: "100%", background: "var(--color-border-strong)" }} />
                <div
                  style={{
                    position: "absolute",
                    left: detail.ciBand.bandLeft,
                    width: detail.ciBand.bandWidth,
                    height: "100%",
                    borderRadius: 6,
                    background: "rgba(37, 99, 235, 0.16)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: detail.ciBand.pointLeft,
                    width: 3,
                    height: "100%",
                    borderRadius: 3,
                    background: "var(--color-signal-blue)",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                <span>Negative</span>
                <span style={{ fontWeight: 600, color: experiment.lift && experiment.lift > 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                  {detail.ciBand.value}
                </span>
                <span>Positive</span>
              </div>

              <div
                style={{
                  marginTop: 18,
                  borderRadius: 8,
                  border: "1.5px dashed var(--color-border-strong)",
                  background: "var(--color-panel-soft)",
                  padding: "18px 16px",
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-ink-900)" }}>Forecast trajectory</div>
                <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 4, lineHeight: 1.5 }}>
                  Forecast trajectory will appear here once the project-scoped serving table is populated and the batch compute job publishes live outputs.
                </div>
              </div>
            </section>
          </div>

          <section style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)", marginBottom: 12 }}>Guardrail metrics</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {detail.guardrails.map((guardrail) => (
                <div key={guardrail.label} style={{ border: "1px solid var(--color-border-soft)", borderRadius: 8, padding: "14px 16px", background: "var(--color-panel-soft)" }}>
                  <div style={{ fontSize: 12, color: "var(--color-ink-500)" }}>{guardrail.label}</div>
                  <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700, color: GUARDRAIL_STYLE[guardrail.status] }}>{guardrail.value}</div>
                </div>
              ))}
            </div>
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
          <section>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-ink-500)", marginBottom: 10 }}>
              Hypothesis
            </div>
            <div style={{ fontSize: 12.5, color: "var(--color-ink-700)", lineHeight: 1.65 }}>{detail.hypothesis}</div>
          </section>

          <section style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-ink-500)", marginBottom: 10 }}>
              Run context
            </div>
            {[
              ["Owner", detail.owner],
              ["Primary metric", detail.primaryMetric],
              ["Project", experiment.project],
              ["Decision", detail.decisionDate],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--color-border-soft)" }}>
                <span style={{ fontSize: 12, color: "var(--color-ink-500)" }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink-950)", textAlign: "right" }}>{value}</span>
              </div>
            ))}
          </section>

          <section style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-ink-500)", marginBottom: 10 }}>
              Notes
            </div>
            <div style={{ fontSize: 12, color: "var(--color-ink-700)", lineHeight: 1.6 }}>
              This experiment detail page is already usable for design review and internal QA without warehouse credentials. Data hooks can be connected later to the same surface contract.
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
