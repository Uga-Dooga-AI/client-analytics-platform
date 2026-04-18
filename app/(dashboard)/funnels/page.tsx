import { TopFilterRail } from "@/components/top-filter-rail";
import {
  flattenRuns,
  formatDateTime,
  formatRelativeTime,
  runStatusTone,
  scopeBundles,
  sourceStatusTone,
} from "@/lib/dashboard-live";
import { getProjectLabel, parseDashboardSearchParams } from "@/lib/dashboard-filters";
import { getLiveFunnelRows } from "@/lib/live-warehouse";
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

export default async function FunnelsPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const filters = parseDashboardSearchParams(await searchParams, "/funnels");
  const bundles = await listAnalyticsProjects();
  const scopedBundles = scopeBundles(bundles, filters.projectKey);
  const liveFunnelRows = await getLiveFunnelRows(scopedBundles);
  const selectedBundle = scopedBundles[0] ?? null;
  const selectedProjectLabel = getProjectLabel(filters.projectKey);
  const appMetricaSource = selectedBundle?.sources.find((source) => source.sourceType === "appmetrica_logs") ?? null;
  const eventNames = Array.isArray(appMetricaSource?.config.eventNames)
    ? appMetricaSource?.config.eventNames.filter((value): value is string => typeof value === "string")
    : [];
  const funnelRuns = flattenRuns(scopedBundles).filter(
    ({ run }) => run.runType === "backfill" || run.runType === "ingestion"
  );
  const appMetricaTone = appMetricaSource ? sourceStatusTone(appMetricaSource.status) : null;
  const orderedLiveStages = eventNames
    .map((eventName) => liveFunnelRows.find((row) => row.eventName === eventName))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const firstStageUsers = orderedLiveStages[0]?.users ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Funnels" />

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
          <InfoCard label="Selected project" value={selectedProjectLabel} sub="Current event funnel scope" />
          <InfoCard label="Tracked events" value={eventNames.length.toString()} sub={eventNames.length ? "Configured in AppMetrica source" : "No explicit event catalog"} />
          <InfoCard label="AppMetrica source" value={appMetricaTone?.label ?? "Missing"} sub={appMetricaSource ? appMetricaSource.deliveryMode : "No AppMetrica source configured"} />
          <InfoCard label="Recent pipeline runs" value={funnelRuns.length.toString()} sub="Backfill and ingestion attempts" />
          <InfoCard
            label="Live funnel stages"
            value={orderedLiveStages.length.toString()}
            sub={orderedLiveStages.length > 0 ? "Event stages with real warehouse counts" : "No live funnel data yet"}
          />
        </section>

        {selectedBundle ? (
          <>
            {orderedLiveStages.length > 0 ? (
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
                    title="Live event funnel"
                    subtitle="Actual AppMetrica event counts from the last 7 days, ordered by the configured event catalog."
                  />
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Stage", "Users", "Events", "Step conversion", "Latest day"].map((column) => (
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
                    {orderedLiveStages.map((row, index) => {
                      const previousUsers = index === 0 ? row.users : orderedLiveStages[index - 1]?.users ?? 0;
                      const conversion = index === 0 ? 1 : previousUsers > 0 ? row.users / previousUsers : 0;
                      return (
                        <tr
                          key={`${row.projectId}-${row.eventName}`}
                          style={{
                            borderBottom:
                              index < orderedLiveStages.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                          }}
                        >
                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                              {row.eventName}
                            </div>
                            <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                              {row.projectName}
                            </div>
                          </td>
                          <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                            {formatInteger(row.users)}
                          </td>
                          <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                            {formatInteger(row.eventCount)}
                          </td>
                          <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                            {formatPercent(conversion)}
                          </td>
                          <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-500)" }}>
                            {row.latestDate ?? "No data"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ) : null}

            <section style={{ display: "grid", gridTemplateColumns: "0.85fr 1.15fr", gap: 20 }}>
              <div
                style={{
                  background: "var(--color-panel-base)",
                  border: "1px solid var(--color-border-soft)",
                  borderRadius: 10,
                  padding: 18,
                }}
              >
                <SectionHeader
                  title="Event catalog"
                  subtitle="Real AppMetrica events currently configured for this project."
                />

                {eventNames.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--color-ink-500)" }}>
                    No explicit event list is configured. Funnel authoring should start after event catalog is defined.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {eventNames.map((eventName) => (
                      <span
                        key={eventName}
                        style={{
                          display: "inline-flex",
                          padding: "5px 9px",
                          borderRadius: 999,
                          background: "var(--color-panel-soft)",
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: "var(--color-ink-700)",
                        }}
                      >
                        {eventName}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
                  {selectedBundle.sources.map((source) => {
                    const tone = sourceStatusTone(source.status);
                    return (
                      <div
                        key={source.id}
                        style={{
                          border: "1px solid var(--color-border-soft)",
                          borderRadius: 8,
                          padding: "10px 12px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-ink-950)" }}>
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
                        <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                          {source.sourceType} · {source.deliveryMode}
                        </div>
                      </div>
                    );
                  })}
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
                    title="Funnel publishing history"
                    subtitle="Current data-plane runs that must succeed before funnel facts can be published."
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
                    {funnelRuns.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 18, fontSize: 13, color: "var(--color-ink-500)" }}>
                          No funnel-related runs recorded yet.
                        </td>
                      </tr>
                    ) : (
                      funnelRuns.slice(0, 100).map(({ run }, index) => {
                        const tone = runStatusTone(run.status);
                        const updatedAt = run.finishedAt ?? run.startedAt ?? run.requestedAt;
                        return (
                          <tr
                            key={run.id}
                            style={{
                              borderBottom:
                                index < Math.min(funnelRuns.length, 100) - 1 ? "1px solid var(--color-border-soft)" : "none",
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
            No live project matched the selected funnel scope. Open Settings and create a project first.
          </section>
        )}
      </main>
    </div>
  );
}
