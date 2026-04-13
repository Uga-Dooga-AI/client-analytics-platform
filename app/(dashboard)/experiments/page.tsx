import Link from "next/link";
import { TopFilterRail } from "@/components/top-filter-rail";
import { getProjectLabel, parseDashboardSearchParams } from "@/lib/dashboard-filters";
import { getExperiments } from "@/lib/data/experiments";

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
  const filters = parseDashboardSearchParams(await searchParams, "/experiments");
  const visibleExperiments = await getExperiments({ projectKey: filters.projectKey });
  const selectedProject = getProjectLabel(filters.projectKey);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <TopFilterRail title="Experiments" />

      <main style={{ padding: "32px", flex: 1 }}>
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 14, color: "var(--color-ink-500)" }}>
              {visibleExperiments.length} experiments for {selectedProject}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--color-ink-500)" }}>
              Segment: {filters.segment} · Tag: {filters.tag} · Range: {filters.from} to {filters.to}
            </p>
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

        {/* Table */}
        <div
          style={{
            backgroundColor: "var(--color-panel-base)",
            borderRadius: 12,
            border: "1px solid var(--color-border-soft)",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--color-border-soft)",
                  backgroundColor: "var(--color-panel-soft)",
                }}
              >
                {["Experiment", "Project", "Status", "Variants", "Exposures", "Lift", "p-value", "Started"].map(
                  (col) => (
                    <th
                      key={col}
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--color-ink-500)",
                      }}
                    >
                      {col}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {visibleExperiments.map((exp, i) => {
                const s = STATUS_STYLE[exp.status];
                return (
                  <tr
                    key={exp.id}
                    style={{
                      borderBottom:
                        i < visibleExperiments.length - 1
                          ? "1px solid var(--color-border-soft)"
                          : "none",
                    }}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <Link
                        href={`/experiments/${exp.id}`}
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: "var(--color-signal-blue)",
                          textDecoration: "none",
                        }}
                      >
                        {exp.name}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-ink-700)" }}>
                      {exp.project}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          color: s.color,
                          backgroundColor: s.bg,
                        }}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-ink-700)", textAlign: "center" }}>
                      {exp.variants}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-ink-700)" }}>
                      {exp.exposures.toLocaleString()}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600 }}>
                      {exp.lift !== null ? (
                        <span
                          style={{
                            color:
                              exp.lift > 0
                                ? "var(--color-success)"
                                : exp.lift < 0
                                ? "var(--color-danger)"
                                : "var(--color-ink-500)",
                          }}
                        >
                          {exp.lift > 0 ? "+" : ""}
                          {exp.lift}%
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-ink-500)" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-ink-700)" }}>
                      {exp.pValue !== null ? exp.pValue.toFixed(3) : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-ink-500)" }}>
                      {exp.startDate}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
