import Link from "next/link";
import { TopFilterRail } from "@/components/top-filter-rail";
import { getFunnelById } from "@/lib/data/funnels";

export default async function FunnelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const funnel = await getFunnelById(id);

  if (!funnel) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: "var(--color-danger)" }}>Funnel not found: {id}</p>
        <Link href="/funnels" style={{ color: "var(--color-signal-blue)" }}>
          Back to funnels
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title={funnel.name} />

      <main
        style={{
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 24,
          overflowY: "auto",
          minWidth: 0,
          flex: 1,
        }}
      >
        <div style={{ fontSize: 12.5, color: "var(--color-ink-500)" }}>
          <Link href="/funnels" style={{ color: "var(--color-signal-blue)", textDecoration: "none" }}>
            Funnels
          </Link>{" "}
          / {funnel.name}
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
            { label: "Project", value: funnel.project, sub: funnel.entryEvent },
            { label: "Sample size", value: funnel.sampleSize.toLocaleString(), sub: "Users entered" },
            { label: "Completion", value: `${funnel.completionRate}%`, sub: funnel.completionEvent },
            { label: "Median time", value: `${funnel.medianTimeMinutes} min`, sub: "End-to-end" },
          ].map((item) => (
            <div key={item.label} style={{ background: "var(--color-panel-base)", padding: "18px 22px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-ink-500)", marginBottom: 8 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1 }}>{item.value}</div>
              <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 5 }}>{item.sub}</div>
            </div>
          ))}
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 20 }}>
          <section style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Step conversion</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Dense operator view for step-by-step funnel health</div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Step", "Users", "Completion", "Dropoff"].map((column) => (
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
                {funnel.steps.map((step, index) => (
                  <tr key={step.label} style={{ borderBottom: index < funnel.steps.length - 1 ? "1px solid var(--color-border-soft)" : "none" }}>
                    <td style={{ padding: "13px 20px", fontWeight: 600, color: "var(--color-ink-950)" }}>{step.label}</td>
                    <td style={{ padding: "13px 20px", color: "var(--color-ink-700)" }}>{step.users.toLocaleString()}</td>
                    <td style={{ padding: "13px 20px", color: "var(--color-ink-700)" }}>{step.completionRate}%</td>
                    <td style={{ padding: "13px 20px", color: step.dropoffRate > 40 ? "var(--color-danger)" : "var(--color-ink-700)", fontWeight: step.dropoffRate > 40 ? 600 : 400 }}>
                      {step.dropoffRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Step intensity</div>
            <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Visual shell for future segment overlays</div>

            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              {funnel.steps.map((step) => (
                <div key={step.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
                    <span style={{ color: "var(--color-ink-900)" }}>{step.label}</span>
                    <span style={{ color: "var(--color-ink-500)" }}>{step.completionRate}%</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 999, background: "var(--color-panel-soft)", overflow: "hidden" }}>
                    <div style={{ width: `${step.completionRate}%`, height: "100%", borderRadius: 999, background: "var(--color-signal-blue)" }} />
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 18,
                borderRadius: 8,
                border: "1.5px dashed var(--color-border-strong)",
                background: "var(--color-panel-soft)",
                padding: "16px 14px",
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-ink-900)" }}>Segmentation layer</div>
              <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 4, lineHeight: 1.55 }}>
                Country, platform, acquisition source, and experiment slicing will bind later to the same layout once serving marts are connected.
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
