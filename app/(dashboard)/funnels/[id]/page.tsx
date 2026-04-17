import Link from "next/link";
import { TopFilterRail } from "@/components/top-filter-rail";
import { getFunnelById, getFunnelDetail } from "@/lib/data/funnels";

const STATUS_STYLE = {
  healthy: { label: "Healthy", color: "#16a34a", bg: "#dcfce7" },
  watch: { label: "Watch", color: "#d97706", bg: "#fef3c7" },
  risk: { label: "Risk", color: "#dc2626", bg: "#fee2e2" },
};

function getDropoffSeverity(dropoffRate: number) {
  if (dropoffRate > 35) return { color: "#dc2626", bg: "#fee2e2", barColor: "#ef4444" };
  if (dropoffRate > 15) return { color: "#d97706", bg: "#fef9ec", barColor: "#f59e0b" };
  return { color: "#16a34a", bg: "#f0fdf4", barColor: "#22c55e" };
}

export default async function FunnelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [funnel, detail] = await Promise.all([getFunnelById(id), getFunnelDetail(id)]);

  if (!funnel) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: "var(--color-ink-900)", fontWeight: 600 }}>
          Live funnel detail is not published yet for: {id}
        </p>
        <p style={{ color: "var(--color-ink-500)", marginTop: 8, maxWidth: 720, lineHeight: 1.6 }}>
          The dashboard no longer returns mock funnel payloads. This route will populate after live funnel
          definitions and step metrics are materialized into the warehouse-backed serving layer.
        </p>
        <Link href="/funnels" style={{ color: "var(--color-signal-blue)" }}>
          Back to funnels
        </Link>
      </div>
    );
  }

  const status = STATUS_STYLE[funnel.status];
  const maxUsers = funnel.steps[0]?.users ?? 1;
  const platformRows = detail?.cohortRows.filter((r) => r.dimension === "platform") ?? [];
  const countryRows = detail?.cohortRows.filter((r) => r.dimension === "country") ?? [];
  const avgTimeLabel =
    detail && detail.avgTimeToCompleteMinutes >= 60
      ? `${(detail.avgTimeToCompleteMinutes / 60).toFixed(1)} hr`
      : `${funnel.medianTimeMinutes} min`;

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
        {/* Breadcrumb */}
        <div style={{ fontSize: 12.5, color: "var(--color-ink-500)" }}>
          <Link href="/funnels" style={{ color: "var(--color-signal-blue)", textDecoration: "none" }}>
            Funnels
          </Link>{" "}
          / {funnel.name}
        </div>

        {/* Summary strip */}
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
          {(
            [
              { label: "Project", value: funnel.project, sub: funnel.entryEvent },
              { label: "Volume", value: funnel.sampleSize.toLocaleString(), sub: "Users entered" },
              {
                label: "Overall conversion",
                value: `${funnel.completionRate}%`,
                sub: `${funnel.entryEvent} → ${funnel.completionEvent}`,
              },
              { label: "Avg time-to-complete", value: avgTimeLabel, sub: "End-to-end" },
              { label: "Health", badge: status },
            ] as Array<{ label: string; value?: string; sub?: string; badge?: { label: string; color: string; bg: string } }>
          ).map((item) => (
            <div key={item.label} style={{ background: "var(--color-panel-base)", padding: "18px 22px" }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: "var(--color-ink-500)",
                  marginBottom: 8,
                }}
              >
                {item.label}
              </div>
              {item.badge ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "5px 12px",
                    borderRadius: 999,
                    background: item.badge.bg,
                    color: item.badge.color,
                    fontSize: 15,
                    fontWeight: 700,
                    lineHeight: 1,
                    marginTop: 4,
                  }}
                >
                  {item.badge.label}
                </span>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: "var(--color-ink-950)",
                      lineHeight: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.value}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--color-ink-500)",
                      marginTop: 5,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.sub}
                  </div>
                </>
              )}
            </div>
          ))}
        </section>

        {/* Step-by-step funnel visualization */}
        <section
          style={{
            background: "var(--color-panel-base)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>
              Step-by-step funnel
            </div>
            <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>
              Conversion and drop-off at each step · bar width proportional to user volume · color = drop-off severity
            </div>
          </div>

          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            {funnel.steps.map((step, index) => {
              const barWidth = (step.users / maxUsers) * 100;
              const severity = index === 0 ? { color: "#2563eb", bg: "#eff6ff", barColor: "var(--color-signal-blue)" } : getDropoffSeverity(step.dropoffRate);
              const convFromPrev =
                index === 0
                  ? null
                  : ((step.users / funnel.steps[index - 1].users) * 100).toFixed(1);

              return (
                <div key={step.label}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: 12.5,
                      marginBottom: 6,
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "var(--color-panel-soft)",
                          border: "1px solid var(--color-border-soft)",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--color-ink-500)",
                          flexShrink: 0,
                        }}
                      >
                        {index + 1}
                      </span>
                      <span style={{ fontWeight: 600, color: "var(--color-ink-950)", whiteSpace: "nowrap" }}>
                        {step.label}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                      <span style={{ color: "var(--color-ink-700)", fontSize: 12.5 }}>
                        {step.users.toLocaleString()} users
                      </span>
                      <span style={{ color: "var(--color-ink-500)", fontSize: 12.5, minWidth: 72, textAlign: "right" }}>
                        {step.completionRate}% overall
                      </span>
                      {convFromPrev !== null ? (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 5,
                            background: severity.bg,
                            color: severity.color,
                            fontSize: 11.5,
                            fontWeight: 700,
                            minWidth: 80,
                            textAlign: "center",
                          }}
                        >
                          {convFromPrev}% from prev · −{step.dropoffRate}%
                        </span>
                      ) : (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 5,
                            background: "#eff6ff",
                            color: "#2563eb",
                            fontSize: 11.5,
                            fontWeight: 700,
                            minWidth: 80,
                            textAlign: "center",
                          }}
                        >
                          Entry
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      height: 26,
                      borderRadius: 6,
                      background: "var(--color-panel-soft)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${barWidth}%`,
                        height: "100%",
                        borderRadius: 6,
                        background: severity.barColor,
                        opacity: 0.82,
                        display: "flex",
                        alignItems: "center",
                        paddingLeft: 10,
                      }}
                    >
                      {barWidth > 18 && (
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}>
                          {index === 0 ? "100%" : `${convFromPrev}%`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Legend */}
            <div
              style={{
                display: "flex",
                gap: 20,
                marginTop: 4,
                paddingTop: 12,
                borderTop: "1px solid var(--color-border-soft)",
              }}
            >
              {[
                { color: "#22c55e", label: "Healthy drop (<15%)" },
                { color: "#f59e0b", label: "Watch (15–35%)" },
                { color: "#ef4444", label: "Risk (>35%)" },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color }} />
                  <span style={{ fontSize: 11.5, color: "var(--color-ink-500)" }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Cohort slicing panel */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Platform breakdown */}
          <div
            style={{
              background: "var(--color-panel-base)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-ink-950)" }}>Platform slicing</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Conversion breakdown by OS</div>
            </div>

            {platformRows.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Platform", "Users", "Conv. rate", "vs. Avg"].map((col) => (
                      <th
                        key={col}
                        style={{
                          padding: "9px 16px",
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
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {platformRows.map((row, i) => {
                    const positive = row.vsAvg >= 0;
                    return (
                      <tr
                        key={row.segment}
                        style={{
                          borderBottom:
                            i < platformRows.length - 1
                              ? "1px solid var(--color-border-soft)"
                              : "none",
                        }}
                      >
                        <td style={{ padding: "11px 16px", fontWeight: 600, color: "var(--color-ink-950)" }}>
                          {row.segment}
                        </td>
                        <td style={{ padding: "11px 16px", color: "var(--color-ink-700)" }}>
                          {row.users.toLocaleString()}
                        </td>
                        <td style={{ padding: "11px 16px", color: "var(--color-ink-700)", fontWeight: 600 }}>
                          {row.conversionRate}%
                        </td>
                        <td style={{ padding: "11px 16px" }}>
                          <span
                            style={{
                              padding: "2px 7px",
                              borderRadius: 5,
                              fontSize: 11.5,
                              fontWeight: 700,
                              background: positive ? "#dcfce7" : "#fee2e2",
                              color: positive ? "#16a34a" : "#dc2626",
                            }}
                          >
                            {positive ? "+" : ""}
                            {row.vsAvg.toFixed(1)}pp
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 20 }}>
                <div
                  style={{
                    borderRadius: 8,
                    border: "1.5px dashed var(--color-border-strong)",
                    background: "var(--color-panel-soft)",
                    padding: "16px 14px",
                  }}
                >
                  <div style={{ fontSize: 12.5, color: "var(--color-ink-500)", lineHeight: 1.55 }}>
                    Platform breakdown will be available when data marts are connected.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Country breakdown */}
          <div
            style={{
              background: "var(--color-panel-base)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-ink-950)" }}>Country slicing</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Top countries by user volume</div>
            </div>

            {countryRows.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Country", "Users", "Conv. rate", "vs. Avg"].map((col) => (
                      <th
                        key={col}
                        style={{
                          padding: "9px 16px",
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
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {countryRows.map((row, i) => {
                    const positive = row.vsAvg >= 0;
                    return (
                      <tr
                        key={row.segment}
                        style={{
                          borderBottom:
                            i < countryRows.length - 1
                              ? "1px solid var(--color-border-soft)"
                              : "none",
                        }}
                      >
                        <td style={{ padding: "11px 16px", fontWeight: 600, color: "var(--color-ink-950)" }}>
                          {row.segment}
                        </td>
                        <td style={{ padding: "11px 16px", color: "var(--color-ink-700)" }}>
                          {row.users.toLocaleString()}
                        </td>
                        <td style={{ padding: "11px 16px", color: "var(--color-ink-700)", fontWeight: 600 }}>
                          {row.conversionRate}%
                        </td>
                        <td style={{ padding: "11px 16px" }}>
                          <span
                            style={{
                              padding: "2px 7px",
                              borderRadius: 5,
                              fontSize: 11.5,
                              fontWeight: 700,
                              background: positive ? "#dcfce7" : "#fee2e2",
                              color: positive ? "#16a34a" : "#dc2626",
                            }}
                          >
                            {positive ? "+" : ""}
                            {row.vsAvg.toFixed(1)}pp
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 20 }}>
                <div
                  style={{
                    borderRadius: 8,
                    border: "1.5px dashed var(--color-border-strong)",
                    background: "var(--color-panel-soft)",
                    padding: "16px 14px",
                  }}
                >
                  <div style={{ fontSize: 12.5, color: "var(--color-ink-500)", lineHeight: 1.55 }}>
                    Country breakdown will be available when data marts are connected.
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
