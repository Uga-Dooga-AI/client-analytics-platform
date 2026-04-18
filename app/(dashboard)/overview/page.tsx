import Link from "next/link";
import { TopFilterRail } from "@/components/top-filter-rail";
import {
  countScopedRuns,
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
import { listAccessRequests, listUsers } from "@/lib/auth/store";
import { getLiveOverviewMetrics } from "@/lib/live-warehouse";
import { listAnalyticsProjects } from "@/lib/platform/store";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

function SectionHeader({
  title,
  subtitle,
  href,
  hrefLabel,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        alignItems: "baseline",
        marginBottom: 14,
      }}
    >
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-950)" }}>{title}</div>
        {subtitle ? (
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-ink-500)" }}>{subtitle}</div>
        ) : null}
      </div>
      {href && hrefLabel ? (
        <Link
          href={href}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-signal-blue)",
            textDecoration: "none",
          }}
        >
          {hrefLabel}
        </Link>
      ) : null}
    </div>
  );
}

function KpiCard({
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
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: "var(--color-ink-500)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--color-ink-500)" }}>{sub}</div>
    </div>
  );
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function latestLiveDate(values: Array<string | null | undefined>) {
  const filtered = values.filter((value): value is string => Boolean(value)).sort();
  return filtered.at(-1) ?? null;
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const filters = parseDashboardSearchParams(await searchParams, "/overview");
  const [bundles, users, pendingRequests] = await Promise.all([
    listAnalyticsProjects(),
    listUsers(),
    listAccessRequests({ status: "pending" }),
  ]);

  const scopedBundles = scopeBundles(bundles, filters.projectKey);
  const liveMetrics = await getLiveOverviewMetrics(scopedBundles);
  const selectedProjectLabel = getProjectLabel(filters.projectKey);
  const scopedSources = scopedBundles.flatMap((bundle) =>
    bundle.sources.map((source) => ({
      projectName: bundle.project.displayName,
      source,
    }))
  );
  const scopedRuns = flattenRuns(scopedBundles).slice(0, 10);
  const readySources = scopedSources.filter(({ source }) => source.status === "ready").length;
  const runningRuns = countScopedRuns(scopedBundles, (run) => run.status === "running");
  const failedRuns = countScopedRuns(scopedBundles, (run) => run.status === "failed");
  const latestSuccessfulRun = flattenRuns(scopedBundles).find(
    ({ run }) => run.status === "succeeded"
  )?.run;
  const installs7d = liveMetrics.reduce((sum, item) => sum + item.installs7d, 0);
  const activeDevices7d = liveMetrics.reduce((sum, item) => sum + item.activeDevices7d, 0);
  const revenue7d = liveMetrics.reduce((sum, item) => sum + item.revenue7d, 0);
  const latestWarehouseDate = latestLiveDate(
    liveMetrics.flatMap((item) => [item.lastInstallDate, item.lastSessionDate, item.lastRevenueDate])
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Overview" />

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
          <KpiCard
            label="Projects in scope"
            value={scopedBundles.length.toString()}
            sub={selectedProjectLabel}
          />
          <KpiCard
            label="Ready sources"
            value={`${readySources}/${scopedSources.length || 0}`}
            sub="Configured connectors with live-ready status"
          />
          <KpiCard
            label="Running jobs"
            value={runningRuns.toString()}
            sub="Current queued/running sync work in this slice"
          />
          <KpiCard
            label="Failed jobs"
            value={failedRuns.toString()}
            sub="Latest failed runs still visible in control plane"
          />
          <KpiCard
            label="Latest success"
            value={latestSuccessfulRun ? formatRelativeTime(latestSuccessfulRun.finishedAt) : "Never"}
            sub={
              latestSuccessfulRun
                ? `${latestSuccessfulRun.runType} · ${formatDateTime(latestSuccessfulRun.finishedAt)} UTC`
                : "No successful live runs yet"
            }
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
          <KpiCard
            label="Live installs · 7d"
            value={formatInteger(installs7d)}
            sub={liveMetrics.length > 0 ? "From AppMetrica raw installs in warehouse" : "No live warehouse rows yet"}
          />
          <KpiCard
            label="Live active devices · 7d"
            value={formatInteger(activeDevices7d)}
            sub={liveMetrics.length > 0 ? "Distinct session starts in the last 7 days" : "Waiting for session data"}
          />
          <KpiCard
            label="Live revenue · 7d"
            value={formatMoney(revenue7d)}
            sub={liveMetrics.length > 0 ? "GA4 / BigQuery export revenue sources" : "Waiting for BigQuery source reads"}
          />
          <KpiCard
            label="Latest warehouse day"
            value={latestWarehouseDate ?? "No data"}
            sub="Newest date visible through the live warehouse readers"
          />
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.25fr 0.75fr",
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
                title="Projects"
                subtitle="Live control-plane state for the projects currently visible in the dashboard slice."
                href="/settings"
                hrefLabel="Open settings"
              />
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Project", "Status", "Sources", "Latest run", "Warehouse"].map((column) => (
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
                {scopedBundles.map((bundle, index) => {
                  const latestRun = findLatestRun(bundle);
                  const readyCount = bundle.sources.filter((source) => source.status === "ready").length;
                  const statusTone =
                    bundle.project.status === "live" || bundle.project.status === "ready"
                      ? { label: bundle.project.status, color: "var(--color-success)", background: "#dcfce7" }
                      : bundle.project.status === "syncing" || bundle.project.status === "configuring"
                        ? { label: bundle.project.status, color: "var(--color-signal-blue)", background: "var(--color-signal-blue-surface)" }
                        : bundle.project.status === "error"
                          ? { label: bundle.project.status, color: "var(--color-danger)", background: "#fee2e2" }
                          : { label: bundle.project.status, color: "var(--color-ink-700)", background: "var(--color-panel-soft)" };

                  return (
                    <tr
                      key={bundle.project.id}
                      style={{
                        borderBottom:
                          index < scopedBundles.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                      }}
                    >
                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-ink-950)" }}>
                          {bundle.project.displayName}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                          {bundle.project.slug}
                        </div>
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: statusTone.background,
                            color: statusTone.color,
                            fontSize: 11.5,
                            fontWeight: 600,
                            textTransform: "capitalize",
                          }}
                        >
                          {statusTone.label}
                        </span>
                      </td>
                      <td style={{ padding: "14px 18px", fontSize: 13, color: "var(--color-ink-700)" }}>
                        {readyCount}/{bundle.sources.length} ready
                      </td>
                      <td style={{ padding: "14px 18px", fontSize: 13, color: "var(--color-ink-700)" }}>
                        {latestRun ? `${latestRun.runType} · ${latestRun.status}` : "No runs yet"}
                        <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                          {latestRun
                            ? formatDateTime(latestRun.finishedAt ?? latestRun.startedAt ?? latestRun.requestedAt)
                            : "No timestamps"}
                        </div>
                      </td>
                      <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                        <div>{bundle.project.gcpProjectId || "Not set"}</div>
                        <div style={{ marginTop: 2, color: "var(--color-ink-500)" }}>
                          {bundle.project.gcsBucket || "Bucket missing"}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
              title="Operators"
              subtitle="Real platform access state, not mock shell data."
              href="/access"
              hrefLabel="Manage access"
            />

            <div style={{ display: "grid", gap: 12 }}>
              {[
                {
                  label: "Approved users",
                  value: users.filter((user) => user.approved).length.toString(),
                  sub: "Platform members with live access",
                },
                {
                  label: "Pending requests",
                  value: pendingRequests.length.toString(),
                  sub: "Waiting for admin action",
                },
                {
                  label: "Auto-approved owners",
                  value: users.filter((user) => user.role === "super_admin").length.toString(),
                  sub: "Current super-admin count",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    border: "1px solid var(--color-border-soft)",
                    borderRadius: 8,
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)" }}>
                    {item.label}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700, color: "var(--color-ink-950)" }}>
                    {item.value}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--color-ink-500)" }}>{item.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
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
                title="Recent runs"
                subtitle="Latest sync attempts across ingestion, bootstrap, forecast, and serving."
              />
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Project", "Run", "Status", "Window", "Updated"].map((column) => (
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
                {scopedRuns.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 18, fontSize: 13, color: "var(--color-ink-500)" }}>
                      No live runs recorded yet for this dashboard slice.
                    </td>
                  </tr>
                ) : (
                  scopedRuns.map(({ projectName, run }, index) => {
                    const tone = runStatusTone(run.status);
                    const updatedAt = run.finishedAt ?? run.startedAt ?? run.requestedAt;
                    return (
                      <tr
                        key={run.id}
                        style={{
                          borderBottom:
                            index < scopedRuns.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                        }}
                      >
                        <td style={{ padding: "14px 18px", fontSize: 13, color: "var(--color-ink-900)" }}>
                          {projectName}
                        </td>
                        <td style={{ padding: "14px 18px" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                            {run.runType}
                          </div>
                          <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                            {run.sourceType ?? "platform"} · {run.id.slice(0, 8)}
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
                          {run.windowFrom && run.windowTo
                            ? `${run.windowFrom} → ${run.windowTo}`
                            : "No explicit window"}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-500)" }}>
                          <div>{formatDateTime(updatedAt)}</div>
                          <div style={{ marginTop: 2 }}>{formatRelativeTime(updatedAt)}</div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
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
                title="Source registry"
                subtitle="Actual connector state by project, including live credentials, delivery mode, and sync timestamps."
                href="/settings"
                hrefLabel="Review connectors"
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              {scopedSources.length === 0 ? (
                <div style={{ padding: 18, fontSize: 13, color: "var(--color-ink-500)" }}>
                  No project sources are configured for this slice yet.
                </div>
              ) : (
                scopedSources.map(({ projectName, source }, index) => {
                  const tone = sourceStatusTone(source.status);
                  return (
                    <div
                      key={source.id}
                      style={{
                        padding: "14px 18px",
                        borderTop: index === 0 ? "1px solid var(--color-border-soft)" : "none",
                        borderBottom:
                          index < scopedSources.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                        display: "grid",
                        gridTemplateColumns: "1.15fr 0.85fr 0.75fr",
                        gap: 14,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                          {projectName} · {source.label}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                          {summarizeSourceConfig(source)}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--color-ink-700)" }}>
                        <div>Last sync: {formatDateTime(source.lastSyncAt)}</div>
                        <div style={{ marginTop: 2, color: "var(--color-ink-500)" }}>
                          Next sync: {formatDateTime(source.nextSyncAt)}
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
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
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {liveMetrics.length > 0 ? (
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
                title="Live analytics by project"
                subtitle="Direct BigQuery reads from the shared warehouse and source export datasets."
              />
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Project", "Installs 7d", "Active devices 7d", "Revenue 7d", "Latest live date"].map((column) => (
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
                {liveMetrics.map((item, index) => (
                  <tr
                    key={item.projectId}
                    style={{
                      borderBottom:
                        index < liveMetrics.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                    }}
                  >
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-ink-950)" }}>
                        {item.projectName}
                      </div>
                      <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                        {item.projectSlug}
                      </div>
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                      {formatInteger(item.installs7d)}
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                      {formatInteger(item.activeDevices7d)}
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                      {formatMoney(item.revenue7d)}
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--color-ink-700)" }}>
                      {latestLiveDate([item.lastRevenueDate, item.lastSessionDate, item.lastInstallDate]) ?? "No data"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </main>
    </div>
  );
}
