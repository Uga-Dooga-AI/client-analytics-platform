import type { CohortMatrixRow } from "@/lib/data/acquisition";

export function CohortMatrixTable({
  rows,
}: {
  rows: CohortMatrixRow[];
}) {
  if (rows.length === 0) {
    return (
      <section
        style={{
          background: "var(--color-panel-base)",
          border: "1px solid var(--color-border-soft)",
          borderRadius: 10,
          padding: 18,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Cohort matrix</div>
        <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--color-ink-500)" }}>
          No cohort data is available for the selected slice.
        </div>
      </section>
    );
  }

  const allValues = rows.flatMap((row) => row.cells.map((cell) => cell.value));
  const maxValue = Math.max(...allValues, 1);
  const dayColumns = rows[0] ? rows[0].cells.map((cell) => cell.label) : [];

  return (
    <section
      style={{
        background: "var(--color-panel-base)",
        border: "1px solid var(--color-border-soft)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Cohort matrix</div>
        <div style={{ marginTop: 3, fontSize: 12, color: "var(--color-ink-500)", lineHeight: 1.5 }}>
          This mirrors the notebook heatmap surface: install cohorts by date, spend and installs on the left, cumulative
          ROAS checkpoints across lifetime on the right.
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-panel-soft)", borderBottom: "1px solid var(--color-border-soft)" }}>
              {["Install date", "Spend", "Installs", "CPI", ...dayColumns].map(
                (column) => (
                  <th
                    key={column}
                    style={{
                      padding: "10px 14px",
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
            {rows.map((row, rowIndex) => (
              <tr key={row.cohortDate} style={{ borderBottom: rowIndex < rows.length - 1 ? "1px solid var(--color-border-soft)" : "none" }}>
                <td style={BASE_CELL_STYLE}>
                  <div style={{ fontWeight: 600, color: "var(--color-ink-950)" }}>{row.cohortDate}</div>
                </td>
                <td style={BASE_CELL_STYLE}>${row.spend.toLocaleString()}</td>
                <td style={BASE_CELL_STYLE}>{row.installs.toLocaleString()}</td>
                <td style={BASE_CELL_STYLE}>{row.cpi.toFixed(2)}</td>
                {row.cells.map((cell) => (
                  <td key={`${row.cohortDate}-${cell.label}`} style={{ ...BASE_CELL_STYLE, minWidth: 102 }}>
                    <div
                      style={{
                        background: `rgba(37, 99, 235, ${0.08 + (cell.value / maxValue) * 0.2})`,
                        border: "1px solid rgba(37, 99, 235, 0.12)",
                        borderRadius: 8,
                        padding: "8px 9px",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-ink-950)" }}>
                        {cell.value.toFixed(0)}%
                      </div>
                      <div style={{ marginTop: 2, fontSize: 10.5, color: "var(--color-ink-500)", lineHeight: 1.35 }}>
                        {cell.lower.toFixed(0)}-{cell.upper.toFixed(0)}%
                        {typeof cell.actual === "number" ? ` · act ${cell.actual.toFixed(0)}%` : ""}
                      </div>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const BASE_CELL_STYLE = {
  padding: "12px 14px",
  fontSize: 13,
  color: "var(--color-ink-700)",
  verticalAlign: "top" as const,
};
