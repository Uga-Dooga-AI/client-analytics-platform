import { TopFilterRail } from "@/components/top-filter-rail";
import {
  flattenRuns,
  formatDateTime,
  formatRelativeTime,
  runStatusTone,
  scopeBundles,
} from "@/lib/dashboard-live";
import { getProjectLabel, parseDashboardSearchParams } from "@/lib/dashboard-filters";
import { listAnalyticsProjects, listForecastCombinations } from "@/lib/platform/store";

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

export default async function ForecastsPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const filters = parseDashboardSearchParams(await searchParams, "/forecasts");
  const bundles = await listAnalyticsProjects();
  const scopedBundles = scopeBundles(bundles, filters.projectKey);
  const selectedProjectLabel = getProjectLabel(filters.projectKey);
  const selectedBundle = scopedBundles[0] ?? null;
  const recentRuns = flattenRuns(scopedBundles).filter(({ run }) =>
    run.runType === "forecast" || run.runType === "bounds_refresh"
  );
  const combinations = selectedBundle
    ? await listForecastCombinations(selectedBundle.project.id, 20, { includeSystem: true })
    : [];
  const strategy = selectedBundle?.project.settings.forecastStrategy ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Forecasts" />

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
          <InfoCard label="Selected project" value={selectedProjectLabel} sub="Current forecast control-plane slice" />
          <InfoCard label="Precompute primary" value={strategy?.precomputePrimaryForecasts ? "On" : "Off"} sub="Project-level primary matrix warming" />
          <InfoCard label="On-demand" value={strategy?.enableOnDemandForecasts ? "On" : "Off"} sub="Queue cold combinations when users open them" />
          <InfoCard label="Recent combination cap" value={strategy ? strategy.recentCombinationLimit.toString() : "0"} sub="How many viewed combinations stay warm" />
          <InfoCard label="Tracked combinations" value={combinations.length.toString()} sub="Stored warm + recent forecast slices" />
        </section>

        {selectedBundle ? (
          <>
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "0.95fr 1.05fr",
                gap: 20,
              }}
            >
              <div
                style={{
                  background: "var(--color-panel-base)",
                  border: "1px solid var(--color-border-soft)",
                  borderRadius: 10,
                  padding: 18,
                }}
              >
                <SectionHeader
                  title="Forecast strategy"
                  subtitle="Real settings currently stored in the analytics control plane."
                />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    ["Countries", strategy?.primaryCountries.join(", ") || "—"],
                    ["Segments", strategy?.primarySegments.join(", ") || "—"],
                    ["Spend sources", strategy?.primarySpendSources.join(", ") || "—"],
                    ["Platforms", strategy?.primaryPlatforms.join(", ") || "—"],
                    ["Forecast horizon", `${selectedBundle.project.forecastHorizonDays}d`],
                    ["Forecast interval", `${selectedBundle.project.forecastIntervalHours}h`],
                    ["Bounds interval", `${selectedBundle.project.boundsIntervalHours}h`],
                    ["Bounds path", selectedBundle.project.boundsPath || "Not set"],
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
                    title="Combination registry"
                    subtitle="Real forecast combinations recorded from prewarm and page views."
                  />
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Label", "Source", "Views", "Last viewed", "Last forecast"].map((column) => (
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
                    {combinations.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 18, fontSize: 13, color: "var(--color-ink-500)" }}>
                          No forecast combinations have been recorded yet.
                        </td>
                      </tr>
                    ) : (
                      combinations.map((combination, index) => {
                        const tone = combination.lastForecastStatus
                          ? runStatusTone(combination.lastForecastStatus)
                          : null;

                        return (
                          <tr
                            key={combination.id}
                            style={{
                              borderBottom:
                                index < combinations.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                            }}
                          >
                            <td style={{ padding: "14px 18px" }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                                {combination.label}
                              </div>
                              <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                                {combination.combinationKey}
                              </div>
                            </td>
                            <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                              {combination.sourcePage ?? "manual"}
                            </td>
                            <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                              {combination.viewCount}
                            </td>
                            <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-500)" }}>
                              <div>{formatDateTime(combination.lastViewedAt)}</div>
                              <div style={{ marginTop: 2 }}>{formatRelativeTime(combination.lastViewedAt)}</div>
                            </td>
                            <td style={{ padding: "14px 18px" }}>
                              {tone ? (
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
                              ) : (
                                <span style={{ fontSize: 12, color: "var(--color-ink-500)" }}>No run yet</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
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
                  title="Forecast-related run history"
                  subtitle="Bounds refresh, forecast jobs, and serving publish attempts from the live control plane."
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
                  {recentRuns.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 18, fontSize: 13, color: "var(--color-ink-500)" }}>
                        No forecast, bounds, or serving runs have been recorded yet.
                      </td>
                    </tr>
                  ) : (
                    recentRuns.slice(0, 12).map(({ run }, index) => {
                      const tone = runStatusTone(run.status);
                      const updatedAt = run.finishedAt ?? run.startedAt ?? run.requestedAt;
                      return (
                        <tr
                          key={run.id}
                          style={{
                            borderBottom:
                              index < Math.min(recentRuns.length, 12) - 1 ? "1px solid var(--color-border-soft)" : "none",
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
            No live project matched the selected forecast scope. Open Settings and create a project first.
          </section>
        )}
      </main>
    </div>
  );
}
