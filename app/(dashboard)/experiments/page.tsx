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

export default async function ExperimentsPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const filters = parseDashboardSearchParams(await searchParams, "/experiments");
  const bundles = await listAnalyticsProjects();
  const scopedBundles = scopeBundles(bundles, filters.projectKey);
  const selectedBundle = scopedBundles[0] ?? null;
  const selectedProjectLabel = getProjectLabel(filters.projectKey);
  const relevantRuns = flattenRuns(scopedBundles).filter(({ run }) =>
    run.runType === "backfill" ||
    run.runType === "bounds_refresh" ||
    run.runType === "forecast"
  );
  const latestBackfill = selectedBundle ? findLatestRun(selectedBundle, ["backfill", "ingestion"]) : null;
  const latestForecast = selectedBundle ? findLatestRun(selectedBundle, ["forecast"]) : null;
  const readySources = selectedBundle?.sources.filter((source) => source.status === "ready").length ?? 0;
  const totalSources = selectedBundle?.sources.length ?? 0;
  const blockers = [
    !selectedBundle ? "No live project is selected for experiment analysis." : null,
    selectedBundle && readySources === 0 ? "No sources are currently in ready state." : null,
    selectedBundle && !latestBackfill ? "No successful backfill has completed yet." : null,
    selectedBundle && (!latestForecast || latestForecast.status !== "succeeded")
      ? "Forecast publication has not completed yet."
      : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Experiments" />

      <main
        style={{
          padding: 32,
          flex: 1,
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
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 1,
            background: "var(--color-border-soft)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <InfoCard label="Selected project" value={selectedProjectLabel} sub="Experiment readiness scope" />
          <InfoCard label="Ready sources" value={`${readySources}/${totalSources}`} sub="Inputs available for experiment publishing" />
          <InfoCard
            label="Latest backfill"
            value={latestBackfill ? latestBackfill.status : "none"}
            sub={latestBackfill ? formatDateTime(latestBackfill.finishedAt ?? latestBackfill.startedAt ?? latestBackfill.requestedAt) : "No run recorded"}
          />
          <InfoCard
            label="Latest forecast"
            value={latestForecast ? latestForecast.status : "none"}
            sub={latestForecast ? formatRelativeTime(latestForecast.finishedAt ?? latestForecast.startedAt ?? latestForecast.requestedAt) : "No forecast run recorded"}
          />
          <InfoCard label="Publication mode" value="Direct mart reads" sub="Experiment readiness now follows warehouse state instead of a separate serving stage" />
        </section>

        {selectedBundle ? (
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
                title="Readiness checklist"
                subtitle="What still needs to be true before experiment facts can appear as live tables."
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

              <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
                {blockers.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--color-success)" }}>
                    All control-plane prerequisites are currently satisfied. Remaining work is in the data plane.
                  </div>
                ) : (
                  blockers.map((blocker) => (
                    <div
                      key={blocker}
                      style={{
                        border: "1px solid #fee2e2",
                        borderRadius: 8,
                        padding: "10px 12px",
                        background: "#fff7f7",
                        fontSize: 12.5,
                        color: "var(--color-danger)",
                      }}
                    >
                      {blocker}
                    </div>
                  ))
                )}
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
                  title="Relevant run history"
                  subtitle="Backfill, bounds, forecast, and serving jobs that affect experiment publishing."
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
                        No relevant runs recorded yet.
                      </td>
                    </tr>
                  ) : (
                    relevantRuns.slice(0, 100).map(({ run }, index) => {
                      const tone = runStatusTone(run.status);
                      const updatedAt = run.finishedAt ?? run.startedAt ?? run.requestedAt;
                      return (
                        <tr
                          key={run.id}
                          style={{
                            borderBottom:
                              index < Math.min(relevantRuns.length, 100) - 1 ? "1px solid var(--color-border-soft)" : "none",
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
            No live project matched the selected experiment scope. Open Settings and create a project first.
          </section>
        )}
      </main>
    </div>
  );
}
