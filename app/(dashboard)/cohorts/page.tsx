import { TopFilterRail } from "@/components/top-filter-rail";
import {
  findLatestRun,
  flattenRuns,
  formatDateTime,
  formatRelativeTime,
  runStatusTone,
  scopeBundles,
  sourceStatusTone,
} from "@/lib/dashboard-live";
import { getProjectLabel, parseDashboardSearchParams } from "@/lib/dashboard-filters";
import { getLiveCohortRows } from "@/lib/live-warehouse";
import { listAnalyticsProjects } from "@/lib/platform/store";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-950)" }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-ink-500)" }}>{subtitle}</div>
    </div>
  );
}

function InfoCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div style={{ background: "var(--color-panel-base)", padding: "18px 20px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-ink-500)", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--color-ink-500)" }}>{sub}</div>
    </div>
  );
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export default async function CohortsPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const filters = parseDashboardSearchParams(await searchParams, "/cohorts");
  const bundles = await listAnalyticsProjects();
  const scopedBundles = scopeBundles(bundles, filters.projectKey);
  const cohortRows = await getLiveCohortRows(scopedBundles);
  const selectedBundle = scopedBundles[0] ?? null;
  const selectedProjectLabel = getProjectLabel(filters.projectKey);
  const relevantRuns = flattenRuns(scopedBundles).filter(({ run }) =>
    run.runType === "backfill" || run.runType === "ingestion"
  );
  const latestDataRun = selectedBundle ? findLatestRun(selectedBundle, ["backfill", "ingestion"]) : null;
  const publishReady =
    selectedBundle &&
    selectedBundle.sources.some((source) => source.sourceType === "appmetrica_logs" && source.status === "ready") &&
    latestDataRun?.status === "succeeded";
  const latestLiveCohort = cohortRows[0] ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Cohorts" />

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
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 1,
            background: "var(--color-border-soft)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <InfoCard label="Selected project" value={selectedProjectLabel} sub="Current cohort pipeline scope" />
          <InfoCard label="Granularity" value={`${selectedBundle?.project.defaultGranularityDays ?? filters.granularityDays}d`} sub="Default cohort step in project settings" />
          <InfoCard label="Lookback" value={`${selectedBundle?.project.lookbackDays ?? 0}d`} sub="D+1 extraction offset for raw data" />
          <InfoCard label="Backfill window" value={`${selectedBundle?.project.initialBackfillDays ?? 0}d`} sub="Configured initial catch-up window" />
          <InfoCard label="Publish state" value={publishReady ? "Ready" : "Pending"} sub={publishReady ? "Warehouse reads are live" : "Cohort facts are not available yet"} />
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 1,
            background: "var(--color-border-soft)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <InfoCard
            label="Latest live cohort"
            value={latestLiveCohort?.cohortDate ?? "No data"}
            sub="Newest install cohort visible from raw installs + sessions"
          />
          <InfoCard
            label="Cohort installs"
            value={formatInteger(latestLiveCohort?.installs ?? 0)}
            sub="Installs in the latest visible cohort"
          />
          <InfoCard
            label="D1 retention"
            value={formatPercent(latestLiveCohort?.d1RetentionRate ?? 0)}
            sub="Directly derived from session starts after install"
          />
          <InfoCard
            label="D7 retention"
            value={formatPercent(latestLiveCohort?.d7RetentionRate ?? 0)}
            sub="Live cohort return rate at day 7"
          />
        </section>

        {selectedBundle ? (
          <>
            {cohortRows.length > 0 ? (
              <section
                style={{
                  background: "var(--color-panel-base)",
                  border: "1px solid var(--color-border-soft)",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: 18 }}>
                  <SectionHeader
                    title="Live cohort retention"
                    subtitle="Direct warehouse query over installs and session starts for recent cohorts."
                  />
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Project", "Cohort date", "Installs", "First session", "D1", "D7"].map((column) => (
                        <th
                          key={column}
                          style={{
                            padding: "10px 18px",
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
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohortRows.map((row, index) => (
                      <tr
                        key={`${row.projectId}-${row.cohortDate}`}
                        style={{
                          borderBottom:
                            index < cohortRows.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                        }}
                      >
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                          {row.projectName}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                          {row.cohortDate}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                          {formatInteger(row.installs)}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                          {formatPercent(row.installToFirstSessionRate)}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                          {formatPercent(row.d1RetentionRate)}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                          {formatPercent(row.d7RetentionRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}

            <section style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 20 }}>
              <div
                style={{
                  background: "var(--color-panel-base)",
                  border: "1px solid var(--color-border-soft)",
                  borderRadius: 10,
                  padding: 18,
                }}
              >
                <SectionHeader
                  title="Cohort publishing prerequisites"
                  subtitle="Live configuration and source state for the current product."
                />

                <div style={{ display: "grid", gap: 12 }}>
                  {selectedBundle.sources.map((source) => {
                    const tone = sourceStatusTone(source.status);
                    return (
                      <div
                        key={source.id}
                        style={{
                          border: "1px solid var(--color-border-soft)",
                          borderRadius: 8,
                          padding: "12px 14px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                            {source.label}
                          </div>
                          <span
                            style={{
                              display: "inline-flex",
                              padding: "3px 8px",
                              borderRadius: 999,
                              background: tone.background,
                              color: tone.color,
                              fontSize: 11.5,
                              fontWeight: 600,
                            }}
                          >
                            {tone.label}
                          </span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                          {source.sourceType} · {source.deliveryMode}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    ["Raw dataset", selectedBundle.project.rawDataset],
                    ["Staging dataset", selectedBundle.project.stgDataset],
                    ["Mart dataset", selectedBundle.project.martDataset],
                    ["Bucket", selectedBundle.project.gcsBucket || "Not set"],
                    ["Bounds path", selectedBundle.project.boundsPath || "Not set"],
                    ["Provisioning region", selectedBundle.project.settings.provisioningRegion],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        border: "1px solid var(--color-border-soft)",
                        borderRadius: 8,
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)" }}>
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
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: 18 }}>
                  <SectionHeader
                    title="Cohort-related run history"
                    subtitle="Data ingestion and serving publish attempts that affect cohort facts."
                  />
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Run", "Status", "Window", "Updated", "Message"].map((column) => (
                        <th
                          key={column}
                          style={{
                            padding: "10px 18px",
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
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {relevantRuns.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 18, fontSize: 13, color: "var(--color-ink-500)" }}>
                          No cohort-related runs recorded yet.
                        </td>
                      </tr>
                    ) : (
                      relevantRuns.slice(0, 12).map(({ run }, index) => {
                        const tone = runStatusTone(run.status);
                        const updatedAt = run.finishedAt ?? run.startedAt ?? run.requestedAt;
                        return (
                          <tr
                            key={run.id}
                            style={{
                              borderBottom:
                                index < Math.min(relevantRuns.length, 12) - 1 ? "1px solid var(--color-border-soft)" : "none",
                            }}
                          >
                            <td style={{ padding: "14px 18px" }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                                {run.runType}
                              </div>
                              <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                                {run.id.slice(0, 8)}
                              </div>
                            </td>
                            <td style={{ padding: "14px 18px" }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  padding: "3px 8px",
                                  borderRadius: 999,
                                  background: tone.background,
                                  color: tone.color,
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                }}
                              >
                                {tone.label}
                              </span>
                            </td>
                            <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                              {run.windowFrom && run.windowTo ? `${run.windowFrom} → ${run.windowTo}` : "No explicit window"}
                            </td>
                            <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-500)" }}>
                              <div>{formatDateTime(updatedAt)}</div>
                              <div style={{ marginTop: 2 }}>{formatRelativeTime(updatedAt)}</div>
                            </td>
                            <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                              {run.message ?? "No worker message"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <section
            style={{
              background: "var(--color-panel-base)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              padding: 20,
              fontSize: 13,
              color: "var(--color-ink-500)",
            }}
          >
            No live project matched the selected cohort scope. Open Settings and create a project first.
          </section>
        )}
      </main>
    </div>
  );
}
