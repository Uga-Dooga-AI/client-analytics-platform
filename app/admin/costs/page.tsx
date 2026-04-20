import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth/server";
import { getAnalyticsCostSnapshot } from "@/lib/admin/analytics-costs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatUsd(value: number | null) {
  if (value == null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 2)} ${units[index]}`;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      style={{
        background: "var(--color-panel-base)",
        border: "1px solid var(--color-border-soft)",
        borderRadius: 12,
        padding: "18px 20px",
      }}
    >
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
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-ink-950)" }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--color-ink-500)" }}>{sub}</div>
    </div>
  );
}

export default async function AdminCostsPage() {
  const auth = await getServerAuth();
  if (!auth || (auth.role !== "admin" && auth.role !== "super_admin")) {
    redirect("/overview");
  }

  const snapshot = await getAnalyticsCostSnapshot();

  return (
    <div style={{ padding: 32, maxWidth: 1440 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--color-ink-950)",
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            Ops & Cost
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--color-ink-500)" }}>
            Реальные объёмы ingest/query/managed storage по проектам, плюс provisional run-rate и finalized billing view.
          </p>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-ink-500)" }}>
          Snapshot: {formatDateTime(snapshot.generatedAt)}
        </div>
      </div>

      {snapshot.warnings.map((warning) => (
        <div
          key={warning}
          style={{
            marginBottom: 12,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #fde68a",
            background: "#fffbeb",
            color: "#92400e",
            fontSize: 13,
          }}
        >
          {warning}
        </div>
      ))}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Tracked projects"
          value={`${snapshot.totals.readyProjects}/${snapshot.totals.trackedProjects}`}
          sub="Projects with working ops telemetry / all registered projects"
        />
        <StatCard
          label="Estimated today"
          value={formatUsd(snapshot.totals.estimatedTotalTodayUsd)}
          sub="Provisional BigQuery + managed storage run-rate for the current UTC day"
        />
        <StatCard
          label="Estimated 30d"
          value={formatUsd(snapshot.totals.estimatedTotal30dUsd)}
          sub="30-day run-rate based on billed bytes plus current retained managed storage"
        />
        <StatCard
          label="Finalized actual 30d"
          value={formatUsd(snapshot.totals.finalizedActual30dUsd)}
          sub={
            snapshot.billingExportConfigured
              ? "Cloud Billing export, excluding the current day"
              : "Requires ANALYTICS_BILLING_EXPORT_TABLE"
          }
        />
        <StatCard
          label="Transfer 30d"
          value={formatBytes(snapshot.totals.stagedTransferBytes30d)}
          sub="Total managed GCS object volume written over the last 30 days"
        />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          gap: 20,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "var(--color-panel-base)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-950)" }}>
            Estimation model
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-ink-500)" }}>
            Coefficients currently used for provisional cost reporting.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
            {[
              ["BigQuery on-demand", `${snapshot.estimationCoefficients.bigQueryUsdPerTib} USD / TiB billed`],
              ["Managed storage retained bytes", `${snapshot.estimationCoefficients.storageUsdPerGibMonth} USD / GiB-month`],
              ["Billing export", snapshot.billingExportConfigured ? snapshot.billingExportTable ?? "Configured" : "Not configured"],
              ["Billing export freshness", formatDateTime(snapshot.billingExportLastUpdatedAt)],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  border: "1px solid var(--color-border-soft)",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "var(--color-ink-500)",
                  }}
                >
                  {label}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: "var(--color-panel-base)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-950)" }}>
            Platform totals
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-ink-500)" }}>
            Aggregated workload across all client projects and warehouse groups.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
            {[
              ["Rows loaded today", formatCompact(snapshot.totals.rowsLoadedToday)],
              ["Rows loaded 30d", formatCompact(snapshot.totals.rowsLoaded30d)],
              ["Retained managed bytes", formatBytes(snapshot.totals.retainedStageBytes)],
              ["Transfer today", formatBytes(snapshot.totals.stagedTransferBytesToday)],
              ["BQ estimate today", formatUsd(snapshot.totals.estimatedBigQueryCostTodayUsd)],
              ["Storage estimate today", formatUsd(snapshot.totals.estimatedStorageCostTodayUsd)],
              ["Reported actual today", formatUsd(snapshot.totals.reportedActualTodayUsd)],
              [
                "Warehouses",
                snapshot.warehouseProjectIds.length > 0
                  ? snapshot.warehouseProjectIds.join(", ")
                  : "—",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  border: "1px solid var(--color-border-soft)",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "var(--color-ink-500)",
                  }}
                >
                  {label}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        style={{
          background: "var(--color-panel-base)",
          border: "1px solid var(--color-border-soft)",
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-950)" }}>
            Per-project operational telemetry
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-ink-500)" }}>
            Rows, managed storage, BigQuery workload, provisional cost, and allocated finalized cost share.
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1260 }}>
            <thead>
              <tr>
                {[
                  "Project",
                  "Status",
                  "Latest success",
                  "Rows today / 30d",
                  "Transfer today / 30d",
                  "Retained storage",
                  "BQ billed 30d",
                  "Jobs today / 30d",
                  "Est. today",
                  "Est. 30d",
                  "Allocated actual 30d",
                  "Notes",
                ].map((label) => (
                  <th
                    key={label}
                    style={{
                      padding: "10px 14px",
                      textAlign: "left",
                      fontSize: 10.5,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--color-ink-500)",
                      background: "var(--color-panel-soft)",
                      borderBottom: "1px solid var(--color-border-soft)",
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.projects.map((project, index) => {
                const tone =
                  project.status === "ready"
                    ? { bg: "#dcfce7", color: "#166534", label: "ready" }
                    : project.status === "partial"
                      ? { bg: "#fef3c7", color: "#92400e", label: "partial" }
                      : { bg: "#fee2e2", color: "#991b1b", label: "unavailable" };

                return (
                  <tr
                    key={project.projectId}
                    style={{
                      borderBottom:
                        index < snapshot.projects.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                    }}
                  >
                    <td style={{ padding: "14px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                        {project.projectName}
                      </div>
                      <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                        {project.projectSlug}
                      </div>
                    </td>
                    <td style={{ padding: "14px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: tone.bg,
                          color: tone.color,
                          fontSize: 11.5,
                          fontWeight: 600,
                        }}
                      >
                        {tone.label}
                      </span>
                    </td>
                    <td style={{ padding: "14px", fontSize: 12, color: "var(--color-ink-700)" }}>
                      {formatDateTime(project.latestSuccessfulIngestionAt)}
                    </td>
                    <td style={{ padding: "14px", fontSize: 12, color: "var(--color-ink-700)" }}>
                      <div>{formatCompact(project.rowsLoadedToday)}</div>
                      <div style={{ marginTop: 2, color: "var(--color-ink-500)" }}>
                        {formatCompact(project.rowsLoaded30d)}
                      </div>
                    </td>
                    <td style={{ padding: "14px", fontSize: 12, color: "var(--color-ink-700)" }}>
                      <div>{formatBytes(project.stagedTransferBytesToday)}</div>
                      <div style={{ marginTop: 2, color: "var(--color-ink-500)" }}>
                        {formatBytes(project.stagedTransferBytes30d)}
                      </div>
                    </td>
                    <td style={{ padding: "14px", fontSize: 12, color: "var(--color-ink-700)" }}>
                      {formatBytes(project.retainedStageBytes)}
                    </td>
                    <td style={{ padding: "14px", fontSize: 12, color: "var(--color-ink-700)" }}>
                      {formatBytes(project.bytesBilled30d)}
                    </td>
                    <td style={{ padding: "14px", fontSize: 12, color: "var(--color-ink-700)" }}>
                      <div>{project.bigQueryJobsToday}</div>
                      <div style={{ marginTop: 2, color: "var(--color-ink-500)" }}>{project.bigQueryJobs30d}</div>
                    </td>
                    <td style={{ padding: "14px", fontSize: 12, color: "var(--color-ink-700)" }}>
                      {formatUsd(project.estimatedTotalTodayUsd)}
                    </td>
                    <td style={{ padding: "14px", fontSize: 12, color: "var(--color-ink-700)" }}>
                      {formatUsd(project.estimatedTotal30dUsd)}
                    </td>
                    <td style={{ padding: "14px", fontSize: 12, color: "var(--color-ink-700)" }}>
                      {formatUsd(project.attributedActualFinalized30dUsd)}
                    </td>
                    <td style={{ padding: "14px", fontSize: 12, color: "var(--color-ink-500)", maxWidth: 260 }}>
                      {project.error ?? `${project.successfulSlices30d} success / ${project.skippedSlices30d} skipped_existing over 30d`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section
        style={{
          background: "var(--color-panel-base)",
          border: "1px solid var(--color-border-soft)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-950)" }}>
            Finalized actual by service
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-ink-500)" }}>
            Aggregated Cloud Billing export across configured warehouse projects. Current day remains provisional.
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Service", "Finalized 30d", "Reported today"].map((label) => (
                <th
                  key={label}
                  style={{
                    padding: "10px 14px",
                    textAlign: "left",
                    fontSize: 10.5,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--color-ink-500)",
                    background: "var(--color-panel-soft)",
                    borderBottom: "1px solid var(--color-border-soft)",
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshot.actualByService.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: 18, fontSize: 13, color: "var(--color-ink-500)" }}>
                  No billing export rows are available yet.
                </td>
              </tr>
            ) : (
              snapshot.actualByService.map((row, index) => (
                <tr
                  key={row.serviceDescription}
                  style={{
                    borderBottom:
                      index < snapshot.actualByService.length - 1
                        ? "1px solid var(--color-border-soft)"
                        : "none",
                  }}
                >
                  <td style={{ padding: "14px", fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                    {row.serviceDescription}
                  </td>
                  <td style={{ padding: "14px", fontSize: 12, color: "var(--color-ink-700)" }}>
                    {formatUsd(row.finalizedCost30dUsd)}
                  </td>
                  <td style={{ padding: "14px", fontSize: 12, color: "var(--color-ink-700)" }}>
                    {formatUsd(row.reportedCostTodayUsd)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
