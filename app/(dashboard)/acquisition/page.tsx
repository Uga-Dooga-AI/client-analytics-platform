import { TopFilterRail } from "@/components/top-filter-rail";
import {
  findLatestRun,
  flattenRuns,
  formatDateTime,
  formatRelativeTime,
  runStatusTone,
  scopeBundles,
  sourceStatusTone,
  summarizeSourceConfig,
} from "@/lib/dashboard-live";
import { getProjectLabel, parseDashboardSearchParams } from "@/lib/dashboard-filters";
import { getLiveTrackerRows } from "@/lib/live-warehouse";
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

export default async function AcquisitionPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const filters = parseDashboardSearchParams(await searchParams, "/acquisition");
  const bundles = await listAnalyticsProjects();
  const scopedBundles = scopeBundles(bundles, filters.projectKey);
  const trackerRows = await getLiveTrackerRows(scopedBundles);
  const selectedProjectLabel = getProjectLabel(filters.projectKey);
  const selectedBundle = scopedBundles[0] ?? null;
  const dataRuns = flattenRuns(scopedBundles).filter(({ run }) =>
    run.runType === "backfill" || run.runType === "ingestion"
  );
  const latestSuccess = dataRuns.find(({ run }) => run.status === "succeeded")?.run ?? null;
  const latestFailure = dataRuns.find(({ run }) => run.status === "failed")?.run ?? null;
  const appMetricaSource = selectedBundle?.sources.find((source) => source.sourceType === "appmetrica_logs") ?? null;
  const trackedEvents = Array.isArray(appMetricaSource?.config.eventNames)
    ? appMetricaSource?.config.eventNames.filter((value): value is string => typeof value === "string")
    : [];
  const appIds = Array.isArray(appMetricaSource?.config.appIds)
    ? appMetricaSource?.config.appIds.filter((value): value is string => typeof value === "string")
    : [];
  const spendSourcesEnabled = selectedBundle
    ? selectedBundle.sources.filter(
        (source) =>
          (source.sourceType === "unity_ads_spend" || source.sourceType === "google_ads_spend") &&
          source.config.enabled === true
      ).length
    : 0;
  const installs7d = trackerRows
    .filter((row) => new Date(`${row.installDate}T00:00:00Z`).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000)
    .reduce((sum, row) => sum + row.installs, 0);
  const organicInstalls7d = trackerRows
    .filter(
      (row) =>
        new Date(`${row.installDate}T00:00:00Z`).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000 &&
        row.trackerName.toLowerCase() === "organic"
    )
    .reduce((sum, row) => sum + row.installs, 0);
  const topTrackers = Array.from(
    trackerRows.reduce((acc, row) => {
      const current = acc.get(row.trackerName) ?? { installs: 0, projectNames: new Set<string>() };
      current.installs += row.installs;
      current.projectNames.add(row.projectName);
      acc.set(row.trackerName, current);
      return acc;
    }, new Map<string, { installs: number; projectNames: Set<string> }>())
  )
    .map(([trackerName, value]) => ({
      trackerName,
      installs: value.installs,
      projectNames: Array.from(value.projectNames).join(", "),
      share: installs7d > 0 ? value.installs / installs7d : 0,
    }))
    .sort((left, right) => right.installs - left.installs)
    .slice(0, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Acquisition" />

      <main
        style={{
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 24,
          overflowY: "auto",
          flex: 1,
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
          <InfoCard label="Selected project" value={selectedProjectLabel} sub="Current acquisition slice" />
          <InfoCard label="AppMetrica apps" value={appIds.length.toString()} sub={appIds.length ? appIds.join(", ") : "No app ids configured"} />
          <InfoCard label="Tracked events" value={trackedEvents.length.toString()} sub={trackedEvents.length ? trackedEvents.join(", ") : "No explicit event catalog"} />
          <InfoCard label="Spend mirrors enabled" value={spendSourcesEnabled.toString()} sub="Unity Ads + Google Ads connectors in enabled mode" />
          <InfoCard
            label="Latest ingestion"
            value={latestSuccess ? formatRelativeTime(latestSuccess.finishedAt) : "Never"}
            sub={latestFailure ? `Latest failure: ${formatRelativeTime(latestFailure.finishedAt)}` : "No failed ingestion runs in scope"}
          />
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
            label="Live installs · 7d"
            value={formatInteger(installs7d)}
            sub={trackerRows.length > 0 ? "Distinct AppMetrica installs grouped by tracker" : "No live install rows yet"}
          />
          <InfoCard
            label="Organic share · 7d"
            value={installs7d > 0 ? formatPercent(organicInstalls7d / installs7d) : "0.0%"}
            sub="Share of installs where tracker_name is empty / organic"
          />
          <InfoCard
            label="Trackers with volume"
            value={topTrackers.length.toString()}
            sub="Top install sources seen in the last 14 days"
          />
          <InfoCard
            label="Latest install day"
            value={trackerRows[0]?.installDate ?? "No data"}
            sub="Newest install date visible in warehouse raw tables"
          />
        </section>

        {selectedBundle ? (
          <>
            {topTrackers.length > 0 ? (
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
                    title="Live installs by tracker"
                    subtitle="Direct BigQuery read from AppMetrica raw installs for the last 14 days."
                  />
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Tracker", "Installs · 14d", "Share", "Projects"].map((column) => (
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
                    {topTrackers.map((row, index) => (
                      <tr
                        key={row.trackerName}
                        style={{
                          borderBottom:
                            index < topTrackers.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                        }}
                      >
                        <td style={{ padding: "14px 18px", fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                          {row.trackerName}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                          {formatInteger(row.installs)}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                          {formatPercent(row.share)}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-500)" }}>
                          {row.projectNames}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}

            <section
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 0.9fr",
                gap: 20,
              }}
            >
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
                    title="Connector state"
                    subtitle="Live source configuration that feeds acquisition and spend coverage."
                  />
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Source", "Mode", "Config", "Status", "Last sync"].map((column) => (
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
                    {selectedBundle.sources.map((source, index) => {
                      const tone = sourceStatusTone(source.status);
                      return (
                        <tr
                          key={source.id}
                          style={{
                            borderBottom:
                              index < selectedBundle.sources.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                          }}
                        >
                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-ink-950)" }}>
                              {source.label}
                            </div>
                            <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                              {source.sourceType}
                            </div>
                          </td>
                          <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                            {source.deliveryMode}
                          </td>
                          <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                            {summarizeSourceConfig(source)}
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
                          <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-500)" }}>
                            <div>{formatDateTime(source.lastSyncAt)}</div>
                            <div style={{ marginTop: 2 }}>{formatRelativeTime(source.lastSyncAt)}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "grid", gap: 20 }}>
                <div
                  style={{
                    background: "var(--color-panel-base)",
                    border: "1px solid var(--color-border-soft)",
                    borderRadius: 10,
                    padding: 18,
                  }}
                >
                  <SectionHeader
                    title="AppMetrica event catalog"
                    subtitle="Real event names currently configured for this product."
                  />

                  {trackedEvents.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--color-ink-500)" }}>
                      No explicit event names are configured. The connector is currently set to fetch all events.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {trackedEvents.map((eventName) => (
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
                </div>

                <div
                  style={{
                    background: "var(--color-panel-base)",
                    border: "1px solid var(--color-border-soft)",
                    borderRadius: 10,
                    padding: 18,
                  }}
                >
                  <SectionHeader
                    title="Acquisition runtime"
                    subtitle="Operational settings that currently control live backfills."
                  />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      ["GCP project", selectedBundle.project.gcpProjectId || "Not set"],
                      ["Bucket", selectedBundle.project.gcsBucket || "Not set"],
                      ["Raw dataset", selectedBundle.project.rawDataset],
                      ["Lookback days", selectedBundle.project.lookbackDays.toString()],
                      ["Initial backfill days", selectedBundle.project.initialBackfillDays.toString()],
                      ["Refresh interval", `${selectedBundle.project.refreshIntervalHours}h`],
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
              </div>
            </section>

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
                  title="Recent data-plane runs"
                  subtitle="Live backfill and ingestion attempts scoped to the current project filter."
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
                  {dataRuns.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 18, fontSize: 13, color: "var(--color-ink-500)" }}>
                        No ingestion runs recorded for this slice yet.
                      </td>
                    </tr>
                  ) : (
                    dataRuns.slice(0, 12).map(({ run }, index) => {
                      const tone = runStatusTone(run.status);
                      const updatedAt = run.finishedAt ?? run.startedAt ?? run.requestedAt;
                      return (
                        <tr
                          key={run.id}
                          style={{
                            borderBottom:
                              index < Math.min(dataRuns.length, 12) - 1 ? "1px solid var(--color-border-soft)" : "none",
                          }}
                        >
                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                              {run.runType}
                            </div>
                            <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                              {run.id.slice(0, 8)} · {run.sourceType ?? "platform"}
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
            No live acquisition project matched the selected filter. Open Settings and create a project first.
          </section>
        )}
      </main>
    </div>
  );
}
