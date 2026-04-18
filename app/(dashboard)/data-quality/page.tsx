import type { CSSProperties, ReactNode } from "react";
import { TopFilterRail } from "@/components/top-filter-rail";
import {
  formatDateTime,
  formatRelativeTime,
  scopeBundles,
  sourceStatusTone,
  summarizeSourceConfig,
} from "@/lib/dashboard-live";
import { getProjectLabel, parseDashboardSearchParams } from "@/lib/dashboard-filters";
import { getDataQualityDashboardData } from "@/lib/data/data-quality";
import { listAnalyticsProjects } from "@/lib/platform/store";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-950)" }}>{title}</div>
      {subtitle ? (
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-ink-500)" }}>{subtitle}</div>
      ) : null}
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
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--color-ink-500)" }}>{sub}</div>
    </div>
  );
}

function TableCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        border: "1px solid var(--color-border-soft)",
        borderRadius: 12,
        background: "var(--color-panel-base)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--color-border-soft)" }}>
        <SectionHeader title={title} subtitle={subtitle} />
      </div>
      <div style={{ overflowX: "auto" }}>{children}</div>
    </section>
  );
}

function formatInteger(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatRatio(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "N/A";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function deltaTone(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return { color: "var(--color-ink-500)", label: "N/A" };
  }

  const delta = value - 1;
  if (Math.abs(delta) <= 0.01) {
    return { color: "var(--color-success)", label: formatRatio(value) };
  }

  if (delta < 0) {
    return { color: "var(--color-warning)", label: formatRatio(value) };
  }

  return { color: "var(--color-danger)", label: formatRatio(value) };
}

function metricRowStyle(index: number) {
  return {
    borderTop: index === 0 ? "none" : "1px solid var(--color-border-soft)",
    background: index % 2 === 0 ? "var(--color-panel-base)" : "var(--color-panel-soft)",
  };
}

function compactLabel(value: string) {
  if (value === "source") {
    return "traffic source";
  }

  if (value === "country") {
    return "country";
  }

  if (value === "platform") {
    return "platform";
  }

  return value;
}

function ratioValue(part: number | null | undefined, total: number | null | undefined) {
  if (
    part === null ||
    part === undefined ||
    total === null ||
    total === undefined ||
    total <= 0
  ) {
    return null;
  }

  return part / total;
}

function overlapTone(
  overlap: number | null | undefined,
  rawDistinct: number | null | undefined,
  stageDistinct: number | null | undefined
) {
  const rawRatio = ratioValue(overlap, rawDistinct);
  const stageRatio = ratioValue(overlap, stageDistinct);
  const ratio =
    rawRatio !== null && stageRatio !== null
      ? Math.min(rawRatio, stageRatio)
      : rawRatio ?? stageRatio;

  return deltaTone(ratio);
}

function formatOverlapLabel(
  overlap: number | null | undefined,
  rawDistinct: number | null | undefined,
  stageDistinct: number | null | undefined
) {
  if (stageDistinct === null || stageDistinct === undefined || overlap === null || overlap === undefined) {
    return "Unavailable";
  }

  if ((rawDistinct ?? 0) === 0 && stageDistinct === 0) {
    return "No IDs";
  }

  return `${formatInteger(overlap)} · ${formatRatio(ratioValue(overlap, rawDistinct))} raw · ${formatRatio(ratioValue(overlap, stageDistinct))} stage`;
}

function formatMissingLabel(missingRows: number, totalRows: number) {
  if (totalRows <= 0) {
    return "No rows";
  }

  return `${formatInteger(missingRows)} · ${formatRatio(missingRows / totalRows)}`;
}

export default async function DataQualityPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const filters = parseDashboardSearchParams(await searchParams, "/data-quality");
  const bundles = await listAnalyticsProjects();
  const scopedBundles = scopeBundles(bundles, filters.projectKey);
  const qualityData = await getDataQualityDashboardData(scopedBundles, {
    from: filters.from,
    to: filters.to,
    platform: filters.platform,
    groupBy: filters.groupBy,
  });
  const selectedProjectLabel = getProjectLabel(filters.projectKey);
  const projectCount = qualityData.projectSummaries.length;
  const resolvedContextCount = qualityData.resolvedContextCount;
  const selectedProjectCount = scopedBundles.length;
  const hasWarehouseReconciliation = projectCount > 0;
  const hasFailedWarehouseReconciliation =
    resolvedContextCount > 0 && projectCount === 0 && qualityData.failedProjectNames.length > 0;
  const demoAccessEnabled =
    process.env.DEMO_ACCESS_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_DEMO_ACCESS_ENABLED === "true";
  const rawInstallsTotal = qualityData.projectSummaries.reduce((sum, row) => sum + row.rawInstallRows, 0);
  const stgInstallsTotal = qualityData.projectSummaries.reduce((sum, row) => sum + row.stgInstallRows, 0);
  const martAvailableSummaries = qualityData.projectSummaries.filter((row) => row.martInstallRows !== null);
  const martInstallsTotal =
    martAvailableSummaries.length > 0
      ? martAvailableSummaries.reduce((sum, row) => sum + (row.martInstallRows ?? 0), 0)
      : null;
  const stgInstallsTotalForMart =
    martAvailableSummaries.length > 0
      ? martAvailableSummaries.reduce((sum, row) => sum + row.stgInstallRows, 0)
      : null;
  const rawEventsTotal = qualityData.projectSummaries.reduce((sum, row) => sum + row.rawEventRows, 0);
  const stgEventsTotal = qualityData.projectSummaries.reduce((sum, row) => sum + row.stgEventRows, 0);
  const latestInstallDate =
    qualityData.projectSummaries
      .map((row) => row.latestInstallDate)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const latestEventDate =
    qualityData.projectSummaries
      .map((row) => row.latestEventDate)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const mirrorRows = scopedBundles.flatMap((bundle) =>
    bundle.sources
      .filter(
        (source) =>
          source.sourceType === "unity_ads_spend" || source.sourceType === "google_ads_spend"
      )
      .map((source) => ({
        projectName: bundle.project.displayName,
        source,
      }))
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Data Quality" />

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
        {hasWarehouseReconciliation ? (
          <>
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                gap: 1,
                background: "var(--color-border-soft)",
                border: "1px solid var(--color-border-soft)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <InfoCard
                label="Projects in scope"
                value={selectedProjectCount.toString()}
                sub={
                  resolvedContextCount === projectCount
                    ? selectedProjectLabel
                    : `${selectedProjectLabel} · reconciled ${projectCount}/${resolvedContextCount} live projects`
                }
              />
              <InfoCard label="Raw installs" value={formatInteger(rawInstallsTotal)} sub={`AppMetrica raw installs between ${filters.from} and ${filters.to}`} />
              <InfoCard label="Stage installs" value={formatInteger(stgInstallsTotal)} sub="dbt deduped installs in staging views" />
              <InfoCard label="Mart installs" value={formatInteger(martInstallsTotal)} sub="Published installs funnel volume" />
              <InfoCard label="Raw events" value={formatInteger(rawEventsTotal)} sub="AppMetrica raw event rows in warehouse" />
              <InfoCard label="Stage events" value={formatInteger(stgEventsTotal)} sub="dbt deduped events in staging views" />
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
                label="Install raw → stage"
                value={formatRatio(rawInstallsTotal > 0 ? stgInstallsTotal / rawInstallsTotal : null)}
                sub="How much of raw install volume survives dedup/cleaning"
              />
              <InfoCard
                label="Install stage → mart"
                value={formatRatio(
                  martInstallsTotal !== null && (stgInstallsTotalForMart ?? 0) > 0
                    ? martInstallsTotal / (stgInstallsTotalForMart ?? 1)
                    : null
                )}
                sub="How much of stage installs is represented in the installs mart"
              />
              <InfoCard
                label="Event raw → stage"
                value={formatRatio(rawEventsTotal > 0 ? stgEventsTotal / rawEventsTotal : null)}
                sub="Event survivorship after dbt staging cleanup"
              />
              <InfoCard
                label="Freshest data day"
                value={latestInstallDate ?? latestEventDate ?? "No data"}
                sub={`Installs: ${latestInstallDate ?? "n/a"} · Events: ${latestEventDate ?? "n/a"}`}
              />
            </section>
          </>
        ) : (
          <section
            style={{
              border: "1px solid var(--color-border-soft)",
              borderRadius: 12,
              background: "var(--color-panel-base)",
              padding: 18,
            }}
          >
            <SectionHeader
              title={
                hasFailedWarehouseReconciliation
                  ? "Live Reconciliation Failed"
                  : "Live Reconciliation Unavailable"
              }
              subtitle={
                hasFailedWarehouseReconciliation
                  ? `Live BigQuery contexts resolved, but every reconciliation query failed for the selected scope. Failed projects: ${qualityData.failedProjectNames.join(", ")}.`
                  : demoAccessEnabled
                  ? "Demo access is enabled, so the page can show control-plane metadata but cannot resolve live BigQuery contexts for warehouse reconciliation."
                  : "The selected scope did not resolve any live BigQuery contexts. Connector metadata can still render, but warehouse reconciliation cannot run."
              }
            />
            <div style={{ fontSize: 13, color: "var(--color-ink-700)", lineHeight: 1.6 }}>
              Scope: {selectedProjectLabel}. Selected projects: {scopedBundles.length}. Reconciliation tables and KPIs stay hidden until live warehouse access is available.
            </div>
          </section>
        )}

        <section
          style={{
            border: "1px solid var(--color-border-soft)",
            borderRadius: 12,
            background: "var(--color-panel-base)",
            padding: 18,
          }}
        >
          <SectionHeader
            title="What This Checks"
            subtitle="This screen reconciles AppMetrica ingestion and dbt transformations using only the layers that are actually present in the warehouse."
          />
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8, color: "var(--color-ink-700)", fontSize: 13 }}>
            {qualityData.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>

        {hasWarehouseReconciliation ? (
          <>
            <TableCard
              title="Project Reconciliation"
              subtitle="Per-project summary of load metadata, raw AppMetrica tables, dbt staging views, and marts."
            >
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
                <thead>
                  <tr style={{ background: "var(--color-panel-soft)" }}>
                    <th style={HEADER_CELL}>Project</th>
                    <th style={HEADER_CELL}>Pipeline installs</th>
                    <th style={HEADER_CELL}>Raw installs</th>
                    <th style={HEADER_CELL}>Stage installs</th>
                    <th style={HEADER_CELL}>Stage / raw</th>
                    <th style={HEADER_CELL}>Mart installs</th>
                    <th style={HEADER_CELL}>Mart / stage</th>
                    <th style={HEADER_CELL}>Pipeline events</th>
                    <th style={HEADER_CELL}>Raw events</th>
                    <th style={HEADER_CELL}>Stage events</th>
                    <th style={HEADER_CELL}>Stage / raw</th>
                    <th style={HEADER_CELL}>Freshest day</th>
                  </tr>
                </thead>
                <tbody>
                  {qualityData.projectSummaries.map((row, index) => {
                    const installStageTone = deltaTone(row.installsRawToStageRatio);
                    const installMartTone = deltaTone(row.installsStageToMartRatio);
                    const eventTone = deltaTone(row.eventsRawToStageRatio);
                    return (
                      <tr key={row.projectId} style={metricRowStyle(index)}>
                        <td style={BODY_CELL}>{row.projectName}</td>
                        <td style={BODY_CELL}>{formatInteger(row.pipelineInstallRows)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.rawInstallRows)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.stgInstallRows)}</td>
                        <td style={{ ...BODY_CELL, color: installStageTone.color }}>{installStageTone.label}</td>
                        <td style={BODY_CELL}>{formatInteger(row.martInstallRows)}</td>
                        <td style={{ ...BODY_CELL, color: installMartTone.color }}>{installMartTone.label}</td>
                        <td style={BODY_CELL}>{formatInteger(row.pipelineEventRows)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.rawEventRows)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.stgEventRows)}</td>
                        <td style={{ ...BODY_CELL, color: eventTone.color }}>{eventTone.label}</td>
                        <td style={BODY_CELL}>{row.latestInstallDate ?? row.latestEventDate ?? "No data"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableCard>

            <TableCard
              title="Install Identity Reconciliation"
              subtitle="Distinct device IDs, custom user IDs, and derived install fingerprints preserved from raw AppMetrica logs into staged BigQuery installs."
            >
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1520 }}>
                <thead>
                  <tr style={{ background: "var(--color-panel-soft)" }}>
                    <th style={HEADER_CELL}>Project</th>
                    <th style={HEADER_CELL}>Raw install rows</th>
                    <th style={HEADER_CELL}>Missing device ID</th>
                    <th style={HEADER_CELL}>Missing custom ID</th>
                    <th style={HEADER_CELL}>Missing both IDs</th>
                    <th style={HEADER_CELL}>Raw device IDs</th>
                    <th style={HEADER_CELL}>Stage device IDs</th>
                    <th style={HEADER_CELL}>Device overlap</th>
                    <th style={HEADER_CELL}>Raw custom IDs</th>
                    <th style={HEADER_CELL}>Stage custom IDs</th>
                    <th style={HEADER_CELL}>Custom ID overlap</th>
                    <th style={HEADER_CELL}>Raw fingerprints</th>
                    <th style={HEADER_CELL}>Stage fingerprints</th>
                    <th style={HEADER_CELL}>Fingerprint overlap</th>
                  </tr>
                </thead>
                <tbody>
                  {qualityData.identitySummaries.map((row, index) => {
                    const installDeviceTone = overlapTone(
                      row.overlapInstallDeviceIds,
                      row.rawInstallDeviceIds,
                      row.stageInstallDeviceIds
                    );
                    const installUserTone = overlapTone(
                      row.overlapInstallUserIds,
                      row.rawInstallUserIds,
                      row.stageInstallUserIds
                    );
                    const installFingerprintTone = overlapTone(
                      row.overlapInstallFingerprints,
                      row.rawInstallFingerprints,
                      row.stageInstallFingerprints
                    );

                    return (
                      <tr key={`install-identity:${row.projectId}`} style={metricRowStyle(index)}>
                        <td style={BODY_CELL}>{row.projectName}</td>
                        <td style={BODY_CELL}>{formatInteger(row.rawInstallRows)}</td>
                        <td style={BODY_CELL}>{formatMissingLabel(row.rawInstallMissingDeviceRows, row.rawInstallRows)}</td>
                        <td style={BODY_CELL}>{formatMissingLabel(row.rawInstallMissingUserRows, row.rawInstallRows)}</td>
                        <td style={BODY_CELL}>{formatMissingLabel(row.rawInstallMissingBothRows, row.rawInstallRows)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.rawInstallDeviceIds)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.stageInstallDeviceIds)}</td>
                        <td style={{ ...BODY_CELL, color: installDeviceTone.color }}>
                          {formatOverlapLabel(
                            row.overlapInstallDeviceIds,
                            row.rawInstallDeviceIds,
                            row.stageInstallDeviceIds
                          )}
                        </td>
                        <td style={BODY_CELL}>{formatInteger(row.rawInstallUserIds)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.stageInstallUserIds)}</td>
                        <td style={{ ...BODY_CELL, color: installUserTone.color }}>
                          {formatOverlapLabel(
                            row.overlapInstallUserIds,
                            row.rawInstallUserIds,
                            row.stageInstallUserIds
                          )}
                        </td>
                        <td style={BODY_CELL}>{formatInteger(row.rawInstallFingerprints)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.stageInstallFingerprints)}</td>
                        <td style={{ ...BODY_CELL, color: installFingerprintTone.color }}>
                          {formatOverlapLabel(
                            row.overlapInstallFingerprints,
                            row.rawInstallFingerprints,
                            row.stageInstallFingerprints
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableCard>

            <TableCard
              title="Session Identity Reconciliation"
              subtitle="Distinct session IDs, device IDs, custom user IDs, and derived session fingerprints preserved from raw AppMetrica session starts into staged BigQuery sessions."
            >
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1620 }}>
                <thead>
                  <tr style={{ background: "var(--color-panel-soft)" }}>
                    <th style={HEADER_CELL}>Project</th>
                    <th style={HEADER_CELL}>Raw session rows</th>
                    <th style={HEADER_CELL}>Missing session ID</th>
                    <th style={HEADER_CELL}>Missing device ID</th>
                    <th style={HEADER_CELL}>Missing custom ID</th>
                    <th style={HEADER_CELL}>Missing all join keys</th>
                    <th style={HEADER_CELL}>Raw session IDs</th>
                    <th style={HEADER_CELL}>Stage session IDs</th>
                    <th style={HEADER_CELL}>Session ID overlap</th>
                    <th style={HEADER_CELL}>Raw device IDs</th>
                    <th style={HEADER_CELL}>Stage device IDs</th>
                    <th style={HEADER_CELL}>Device overlap</th>
                    <th style={HEADER_CELL}>Raw custom IDs</th>
                    <th style={HEADER_CELL}>Stage custom IDs</th>
                    <th style={HEADER_CELL}>Custom ID overlap</th>
                    <th style={HEADER_CELL}>Raw fingerprints</th>
                    <th style={HEADER_CELL}>Stage fingerprints</th>
                    <th style={HEADER_CELL}>Fingerprint overlap</th>
                  </tr>
                </thead>
                <tbody>
                  {qualityData.identitySummaries.map((row, index) => {
                    const sessionIdTone = overlapTone(
                      row.overlapSessionIds,
                      row.rawSessionIds,
                      row.stageSessionIds
                    );
                    const sessionDeviceTone = overlapTone(
                      row.overlapSessionDeviceIds,
                      row.rawSessionDeviceIds,
                      row.stageSessionDeviceIds
                    );
                    const sessionUserTone = overlapTone(
                      row.overlapSessionUserIds,
                      row.rawSessionUserIds,
                      row.stageSessionUserIds
                    );
                    const sessionFingerprintTone = overlapTone(
                      row.overlapSessionFingerprints,
                      row.rawSessionFingerprints,
                      row.stageSessionFingerprints
                    );

                    return (
                      <tr key={`session-identity:${row.projectId}`} style={metricRowStyle(index)}>
                        <td style={BODY_CELL}>{row.projectName}</td>
                        <td style={BODY_CELL}>{formatInteger(row.rawSessionRows)}</td>
                        <td style={BODY_CELL}>{formatMissingLabel(row.rawSessionMissingSessionRows, row.rawSessionRows)}</td>
                        <td style={BODY_CELL}>{formatMissingLabel(row.rawSessionMissingDeviceRows, row.rawSessionRows)}</td>
                        <td style={BODY_CELL}>{formatMissingLabel(row.rawSessionMissingUserRows, row.rawSessionRows)}</td>
                        <td style={BODY_CELL}>{formatMissingLabel(row.rawSessionMissingBothRows, row.rawSessionRows)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.rawSessionIds)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.stageSessionIds)}</td>
                        <td style={{ ...BODY_CELL, color: sessionIdTone.color }}>
                          {formatOverlapLabel(row.overlapSessionIds, row.rawSessionIds, row.stageSessionIds)}
                        </td>
                        <td style={BODY_CELL}>{formatInteger(row.rawSessionDeviceIds)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.stageSessionDeviceIds)}</td>
                        <td style={{ ...BODY_CELL, color: sessionDeviceTone.color }}>
                          {formatOverlapLabel(
                            row.overlapSessionDeviceIds,
                            row.rawSessionDeviceIds,
                            row.stageSessionDeviceIds
                          )}
                        </td>
                        <td style={BODY_CELL}>{formatInteger(row.rawSessionUserIds)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.stageSessionUserIds)}</td>
                        <td style={{ ...BODY_CELL, color: sessionUserTone.color }}>
                          {formatOverlapLabel(
                            row.overlapSessionUserIds,
                            row.rawSessionUserIds,
                            row.stageSessionUserIds
                          )}
                        </td>
                        <td style={BODY_CELL}>{formatInteger(row.rawSessionFingerprints)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.stageSessionFingerprints)}</td>
                        <td style={{ ...BODY_CELL, color: sessionFingerprintTone.color }}>
                          {formatOverlapLabel(
                            row.overlapSessionFingerprints,
                            row.rawSessionFingerprints,
                            row.stageSessionFingerprints
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableCard>
          </>
        ) : null}

        <TableCard
          title="External Mirror Status"
          subtitle="Operational view of Unity Ads / Google Ads connectors. Quantitative mirror reconciliation is not normalized in the current schema yet."
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "var(--color-panel-soft)" }}>
                <th style={HEADER_CELL}>Project</th>
                <th style={HEADER_CELL}>Mirror</th>
                <th style={HEADER_CELL}>Status</th>
                <th style={HEADER_CELL}>Target</th>
                <th style={HEADER_CELL}>Last sync</th>
                <th style={HEADER_CELL}>Config</th>
              </tr>
            </thead>
            <tbody>
              {mirrorRows.length === 0 ? (
                <tr>
                  <td style={BODY_CELL} colSpan={6}>
                    No Unity Ads or Google Ads mirrors configured in the selected scope.
                  </td>
                </tr>
              ) : (
                mirrorRows.map(({ projectName, source }, index) => {
                  const tone = sourceStatusTone(source.status);
                  return (
                    <tr key={source.id} style={metricRowStyle(index)}>
                      <td style={BODY_CELL}>{projectName}</td>
                      <td style={BODY_CELL}>{source.label}</td>
                      <td style={BODY_CELL}>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "4px 8px",
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
                      <td style={BODY_CELL}>
                        {typeof source.config.sourceProjectId === "string" &&
                        typeof source.config.sourceDataset === "string"
                          ? `${source.config.sourceProjectId}.${source.config.sourceDataset}`
                          : "Not configured"}
                      </td>
                      <td style={BODY_CELL}>
                        {source.lastSyncAt
                          ? `${formatDateTime(source.lastSyncAt)} UTC (${formatRelativeTime(source.lastSyncAt)})`
                          : "External mirror / not tracked"}
                      </td>
                      <td style={BODY_CELL}>{summarizeSourceConfig(source)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableCard>

        {hasWarehouseReconciliation ? (
          <>
            <TableCard
              title="Daily Install Reconciliation"
              subtitle="Per-day check of load metadata, raw install rows, staging installs, and installs mart output."
            >
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
                <thead>
                  <tr style={{ background: "var(--color-panel-soft)" }}>
                    <th style={HEADER_CELL}>Date</th>
                    <th style={HEADER_CELL}>Project</th>
                    <th style={HEADER_CELL}>Pipeline installs</th>
                    <th style={HEADER_CELL}>Raw installs</th>
                    <th style={HEADER_CELL}>Stage installs</th>
                    <th style={HEADER_CELL}>Stage / raw</th>
                    <th style={HEADER_CELL}>Mart installs</th>
                    <th style={HEADER_CELL}>Mart / stage</th>
                  </tr>
                </thead>
                <tbody>
                  {qualityData.dailyRows.map((row, index) => {
                    const stageTone = deltaTone(
                      row.rawInstallRows > 0 ? row.stgInstallRows / row.rawInstallRows : null
                    );
                    const martTone = deltaTone(
                      row.martInstallRows !== null && row.stgInstallRows > 0
                        ? row.martInstallRows / row.stgInstallRows
                        : null
                    );
                    return (
                      <tr key={`${row.projectId}:${row.date}`} style={metricRowStyle(index)}>
                        <td style={BODY_CELL}>{row.date}</td>
                        <td style={BODY_CELL}>{row.projectName}</td>
                        <td style={BODY_CELL}>{formatInteger(row.pipelineInstallRows)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.rawInstallRows)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.stgInstallRows)}</td>
                        <td style={{ ...BODY_CELL, color: stageTone.color }}>{stageTone.label}</td>
                        <td style={BODY_CELL}>{formatInteger(row.martInstallRows)}</td>
                        <td style={{ ...BODY_CELL, color: martTone.color }}>{martTone.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableCard>

            <TableCard
              title="Daily Event Reconciliation"
              subtitle="Per-day check of load metadata, raw event rows, and dbt stage events."
            >
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr style={{ background: "var(--color-panel-soft)" }}>
                    <th style={HEADER_CELL}>Date</th>
                    <th style={HEADER_CELL}>Project</th>
                    <th style={HEADER_CELL}>Pipeline events</th>
                    <th style={HEADER_CELL}>Raw events</th>
                    <th style={HEADER_CELL}>Stage events</th>
                    <th style={HEADER_CELL}>Stage / raw</th>
                  </tr>
                </thead>
                <tbody>
                  {qualityData.dailyRows.map((row, index) => {
                    const eventTone = deltaTone(
                      row.rawEventRows > 0 ? row.stgEventRows / row.rawEventRows : null
                    );
                    return (
                      <tr key={`events:${row.projectId}:${row.date}`} style={metricRowStyle(index)}>
                        <td style={BODY_CELL}>{row.date}</td>
                        <td style={BODY_CELL}>{row.projectName}</td>
                        <td style={BODY_CELL}>{formatInteger(row.pipelineEventRows)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.rawEventRows)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.stgEventRows)}</td>
                        <td style={{ ...BODY_CELL, color: eventTone.color }}>{eventTone.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableCard>

            <TableCard
              title="Install Breakdown"
              subtitle={`Range-level install reconciliation grouped by ${compactLabel(qualityData.installsBreakdownDimension)}.`}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                <thead>
                  <tr style={{ background: "var(--color-panel-soft)" }}>
                    <th style={HEADER_CELL}>Project</th>
                    <th style={HEADER_CELL}>{compactLabel(qualityData.installsBreakdownDimension)}</th>
                    <th style={HEADER_CELL}>Raw installs</th>
                    <th style={HEADER_CELL}>Stage installs</th>
                    <th style={HEADER_CELL}>Stage / raw</th>
                    <th style={HEADER_CELL}>Mart installs</th>
                    <th style={HEADER_CELL}>Mart / stage</th>
                  </tr>
                </thead>
                <tbody>
                  {qualityData.installsBreakdownRows.map((row, index) => {
                    const stageTone = deltaTone(row.rawRows > 0 ? row.stageRows / row.rawRows : null);
                    const martTone = deltaTone(
                      row.martRows !== null && row.stageRows > 0 ? row.martRows / row.stageRows : null
                    );
                    return (
                      <tr key={`install-breakdown:${row.projectId}:${row.dimensionValue}`} style={metricRowStyle(index)}>
                        <td style={BODY_CELL}>{row.projectName}</td>
                        <td style={BODY_CELL}>{row.dimensionValue}</td>
                        <td style={BODY_CELL}>{formatInteger(row.rawRows)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.stageRows)}</td>
                        <td style={{ ...BODY_CELL, color: stageTone.color }}>{stageTone.label}</td>
                        <td style={BODY_CELL}>{formatInteger(row.martRows)}</td>
                        <td style={{ ...BODY_CELL, color: martTone.color }}>{martTone.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableCard>

            <TableCard
              title="Event Breakdown"
              subtitle={`Range-level event reconciliation grouped by ${compactLabel(qualityData.eventsBreakdownDimension)}.`}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                <thead>
                  <tr style={{ background: "var(--color-panel-soft)" }}>
                    <th style={HEADER_CELL}>Project</th>
                    <th style={HEADER_CELL}>{compactLabel(qualityData.eventsBreakdownDimension)}</th>
                    <th style={HEADER_CELL}>Raw events</th>
                    <th style={HEADER_CELL}>Stage events</th>
                    <th style={HEADER_CELL}>Stage / raw</th>
                  </tr>
                </thead>
                <tbody>
                  {qualityData.eventsBreakdownRows.map((row, index) => {
                    const tone = deltaTone(row.rawRows > 0 ? row.stageRows / row.rawRows : null);
                    return (
                      <tr key={`event-breakdown:${row.projectId}:${row.dimensionValue}`} style={metricRowStyle(index)}>
                        <td style={BODY_CELL}>{row.projectName}</td>
                        <td style={BODY_CELL}>{row.dimensionValue}</td>
                        <td style={BODY_CELL}>{formatInteger(row.rawRows)}</td>
                        <td style={BODY_CELL}>{formatInteger(row.stageRows)}</td>
                        <td style={{ ...BODY_CELL, color: tone.color }}>{tone.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableCard>
          </>
        ) : null}
      </main>
    </div>
  );
}

const HEADER_CELL: CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--color-ink-500)",
  whiteSpace: "nowrap",
};

const BODY_CELL: CSSProperties = {
  padding: "12px 16px",
  fontSize: 13,
  color: "var(--color-ink-900)",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};
