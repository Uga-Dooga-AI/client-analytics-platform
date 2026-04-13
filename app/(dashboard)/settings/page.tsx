import { TopFilterRail } from "@/components/top-filter-rail";
import { getDataSources, getProjectBindings, getMetricCatalog } from "@/lib/data/settings";

const SOURCE_STYLE = {
  deferred: { label: "Deferred", color: "var(--color-ink-500)", bg: "var(--color-panel-soft)" },
  ready_for_key: { label: "Ready for key", color: "var(--color-warning)", bg: "#fef3c7" },
  mock_only: { label: "Mock only", color: "var(--color-signal-blue)", bg: "var(--color-signal-blue-surface)" },
};

const PROJECT_STYLE = {
  planned: { color: "var(--color-ink-500)", bg: "var(--color-panel-soft)" },
  shell_live: { color: "var(--color-signal-blue)", bg: "var(--color-signal-blue-surface)" },
  partial_data: { color: "var(--color-success)", bg: "#dcfce7" },
};

export default async function SettingsPage() {
  const [dataSources, projectBindings, metricCatalog] = await Promise.all([
    getDataSources(),
    getProjectBindings(),
    getMetricCatalog(),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Settings" />

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
        <section
          style={{
            borderRadius: 10,
            border: "1px solid var(--color-border-soft)",
            background: "linear-gradient(180deg, #ffffff 0%, #f8f8f4 100%)",
            padding: "18px 20px",
          }}
        >
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-ink-500)", marginBottom: 8 }}>
            Delivery policy
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink-950)" }}>
            Credentials do not block UI development.
          </div>
          <div style={{ fontSize: 13, color: "var(--color-ink-700)", lineHeight: 1.65, marginTop: 6, maxWidth: 880 }}>
            The interface, navigation, filter rails, tables, access surfaces, and analytics layouts are delivered in shell mode first. BigQuery, Google Cloud, and AppMetrica access are only required when we activate ingestion, serving marts, or forecast jobs.
          </div>
        </section>

        <section style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Data source registry</div>
            <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Explicitly modeled so integration can attach later without redesigning the product</div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Source", "Project", "Delivery mode", "Status", "Last sync", "Notes"].map((column) => (
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
              {dataSources.map((source, index) => {
                const status = SOURCE_STYLE[source.status];
                return (
                  <tr key={source.source} style={{ borderBottom: index < dataSources.length - 1 ? "1px solid var(--color-border-soft)" : "none" }}>
                    <td style={{ padding: "13px 20px", fontSize: 13.5, fontWeight: 600, color: "var(--color-ink-950)" }}>{source.source}</td>
                    <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-700)" }}>{source.project}</td>
                    <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-700)" }}>{source.deliveryMode}</td>
                    <td style={{ padding: "13px 20px" }}>
                      <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 6, background: status.bg, color: status.color, fontSize: 11.5, fontWeight: 600 }}>
                        {status.label}
                      </span>
                    </td>
                    <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-500)" }}>{source.lastSync}</td>
                    <td style={{ padding: "13px 20px", fontSize: 12.5, color: "var(--color-ink-700)", lineHeight: 1.55 }}>{source.notes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Project registry</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Cross-project shell status and eventual source bindings</div>
            </div>

            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {projectBindings.map((project) => {
                const style = PROJECT_STYLE[project.status];
                return (
                  <div key={project.projectKey} style={{ border: "1px solid var(--color-border-soft)", borderRadius: 8, padding: "14px 14px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>{project.projectKey}</div>
                      <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 6, background: style.bg, color: style.color, fontSize: 11.5, fontWeight: 600 }}>
                        {project.servingMode}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 4 }}>{project.owner}</div>
                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {project.sources.map((source) => (
                        <span key={source} style={{ padding: "2px 8px", borderRadius: 999, background: "var(--color-panel-soft)", fontSize: 11.5, color: "var(--color-ink-700)" }}>
                          {source}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Metric catalog preview</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Canonical metrics are defined before warehouse plumbing to protect UI/API contracts</div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Metric", "Owner", "Grain", "Status"].map((column) => (
                    <th
                      key={column}
                      style={{
                        padding: "10px 16px",
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
                {metricCatalog.map((metric, index) => (
                  <tr key={metric.metric} style={{ borderBottom: index < metricCatalog.length - 1 ? "1px solid var(--color-border-soft)" : "none" }}>
                    <td style={{ padding: "12px 16px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, color: "var(--color-ink-700)" }}>{metric.metric}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-ink-700)" }}>{metric.owner}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-ink-700)" }}>{metric.grain}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: metric.status === "Canonical" ? "var(--color-success)" : "var(--color-warning)" }}>{metric.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
