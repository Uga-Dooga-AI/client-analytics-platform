import Link from "next/link";
import { TopFilterRail } from "@/components/top-filter-rail";
import { getProjectLabel, parseDashboardSearchParams } from "@/lib/dashboard-filters";

// ── Local mock data ──────────────────────────────────────────────────────────

const KPIS = [
  { label: "Active Experiments", value: "12", badge: "+3", badgeType: "up" as const, meta: "vs prev. period" },
  { label: "Monitored Cohorts", value: "8", badge: null, meta: "across 3 projects" },
  { label: "Forecast Freshness", value: "2h", badge: "OK", badgeType: "up" as const, meta: "last run successful" },
  { label: "Anomalies Detected", value: "2", badge: "↑", badgeType: "warn" as const, meta: "needs review" },
];

const EXPERIMENTS = [
  {
    id: "exp-001",
    name: "Onboarding flow v3",
    meta: "Word Catcher · iOS · started Apr 5",
    status: "running" as const,
    exposures: "42 381",
    revenueLift: "+7.2%",
    revenueLiftDir: "positive" as const,
    retentionLift: "+4.1%",
    retentionLiftDir: "positive" as const,
    ciWidth: "±3.8%",
  },
  {
    id: "exp-002",
    name: "Paywall position B",
    meta: "2PG · Android · started Mar 28",
    status: "running" as const,
    exposures: "18 940",
    revenueLift: "−1.1%",
    revenueLiftDir: "negative" as const,
    retentionLift: "—",
    retentionLiftDir: "neutral" as const,
    ciWidth: "±6.2%",
  },
  {
    id: "exp-003",
    name: "Streak reward mechanic",
    meta: "Words in Word · iOS + Android · concluded Apr 2",
    status: "concluded" as const,
    exposures: "104 220",
    revenueLift: "+12.4%",
    revenueLiftDir: "positive" as const,
    retentionLift: "+9.7%",
    retentionLiftDir: "positive" as const,
    ciWidth: "±2.1%",
  },
  {
    id: "exp-004",
    name: "Push notification timing",
    meta: "Word Catcher · iOS · started Apr 10",
    status: "running" as const,
    exposures: "6 187",
    revenueLift: "—",
    revenueLiftDir: "neutral" as const,
    retentionLift: "—",
    retentionLiftDir: "neutral" as const,
    ciWidth: "Too early",
  },
  {
    id: "exp-005",
    name: "Hard paywall test",
    meta: "2PG · iOS · paused Apr 7",
    status: "paused" as const,
    exposures: "9 302",
    revenueLift: "−4.8%",
    revenueLiftDir: "negative" as const,
    retentionLift: "−2.3%",
    retentionLiftDir: "negative" as const,
    ciWidth: "±5.9%",
  },
];

const CI_ROWS = [
  { name: "Onboarding v3", bandLeft: "38%", bandWidth: "24%", pointLeft: "50%", zeroLeft: "35%", value: "+7.2%", color: "var(--color-success)" },
  { name: "Paywall B", bandLeft: "20%", bandWidth: "30%", pointLeft: "32%", zeroLeft: "35%", value: "−1.1%", color: "var(--color-danger)" },
  { name: "Streak reward", bandLeft: "48%", bandWidth: "18%", pointLeft: "58%", zeroLeft: "35%", value: "+12.4%", color: "var(--color-success)" },
];

const FRESHNESS = [
  { source: "AppMetrica · Word Catcher", time: "Last sync: 14 min ago", statusLabel: "OK", statusColor: "var(--color-success)" },
  { source: "AppMetrica · Words in Word", time: "Last sync: 6 h ago", statusLabel: "Lag", statusColor: "var(--color-warning)" },
  { source: "BigQuery · 2PG", time: "Last sync: 2 h ago", statusLabel: "OK", statusColor: "var(--color-success)" },
  { source: "BigQuery · User Acquisition", time: "Not connected", statusLabel: "—", statusColor: "var(--color-ink-500)" },
];

// ── Sub-components ───────────────────────────────────────────────────────────

function KpiStrip({
  selectedProject,
  visibleExperimentCount,
}: {
  selectedProject: string;
  visibleExperimentCount: number;
}) {
  const kpis = [
    { label: "Selected project", value: selectedProject === "Cross-project overview" ? "All" : selectedProject, badge: null, badgeType: "up" as const, meta: "Project-scoped operator view" },
    { label: "Active Experiments", value: String(visibleExperimentCount), badge: null, badgeType: "up" as const, meta: "in current slice" },
    ...KPIS.slice(1),
  ];

  return (
    <div>
      <SectionHead title="Platform pulse" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: "var(--color-border-soft)",
          border: "1px solid var(--color-border-soft)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {kpis.map((kpi) => (
          <div key={kpi.label} style={{ background: "var(--color-panel-base)", padding: "20px 24px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)", marginBottom: 8 }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1 }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
              {kpi.badge && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 7px",
                    borderRadius: 4,
                    background: kpi.badgeType === "up" ? "#DCFCE7" : "#FEF3C7",
                    color: kpi.badgeType === "up" ? "var(--color-success)" : "var(--color-warning)",
                  }}
                >
                  {kpi.badge}
                </span>
              )}
              {kpi.meta}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHead({ title, linkHref, linkLabel }: { title: string; linkHref?: string; linkLabel?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-950)" }}>{title}</div>
      {linkHref && (
        <Link href={linkHref} style={{ fontSize: 12, color: "var(--color-signal-blue)", fontWeight: 500, textDecoration: "none" }}>
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

const STATUS_CONFIG = {
  running: { bg: "var(--color-signal-blue-surface)", color: "var(--color-signal-blue)", label: "● Running", border: undefined },
  concluded: { bg: "#DCFCE7", color: "var(--color-success)", label: "✓ Concluded", border: undefined },
  paused: { bg: "var(--color-panel-soft)", color: "var(--color-ink-500)", label: "Paused", border: "1px solid var(--color-border-strong)" },
};

const LIFT_COLOR = {
  positive: "var(--color-success)",
  negative: "var(--color-danger)",
  neutral: "var(--color-ink-500)",
};

function ExperimentTable({
  experiments,
}: {
  experiments: typeof EXPERIMENTS;
}) {
  return (
    <div>
      <SectionHead title="Experiment health" linkHref="/experiments" linkLabel="All experiments →" />
      <div style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Experiment", "Status", "Exposed users", "Revenue lift", "Retention lift", "CI width"].map((col) => (
                <th
                  key={col}
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--color-ink-500)",
                    padding: "10px 24px",
                    textAlign: "left",
                    borderBottom: "1px solid var(--color-border-soft)",
                    background: "var(--color-panel-soft)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {experiments.map((exp, i) => {
              const s = STATUS_CONFIG[exp.status];
              return (
                <tr key={exp.id} style={{ borderBottom: i < experiments.length - 1 ? "1px solid var(--color-border-soft)" : "none" }}>
                  <td style={{ padding: "13px 24px" }}>
                    <div style={{ fontWeight: 500, color: "var(--color-ink-950)", fontSize: 13.5 }}>{exp.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 2 }}>{exp.meta}</div>
                  </td>
                  <td style={{ padding: "13px 24px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "3px 9px",
                        borderRadius: 100,
                        fontSize: 11.5,
                        fontWeight: 600,
                        background: s.bg,
                        color: s.color,
                        border: s.border,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.label}
                    </span>
                  </td>
                  <td style={{ padding: "13px 24px", fontSize: 13.5, color: "var(--color-ink-900)" }}>{exp.exposures}</td>
                  <td style={{ padding: "13px 24px", fontSize: 13.5, fontWeight: 600, color: LIFT_COLOR[exp.revenueLiftDir] }}>{exp.revenueLift}</td>
                  <td style={{ padding: "13px 24px", fontSize: 13.5, fontWeight: 600, color: LIFT_COLOR[exp.retentionLiftDir] }}>{exp.retentionLift}</td>
                  <td style={{ padding: "13px 24px", fontSize: 13.5, color: exp.ciWidth === "Too early" ? "var(--color-ink-500)" : "var(--color-ink-900)" }}>{exp.ciWidth}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CiPanel() {
  return (
    <div>
      <SectionHead title="Confidence intervals · top experiments" />
      <div style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, padding: "16px 24px" }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-ink-500)", marginBottom: 8 }}>
          Revenue lift, 95% CI
        </div>
        {CI_ROWS.map((row, i) => (
          <div
            key={row.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 0",
              borderBottom: i < CI_ROWS.length - 1 ? "1px solid var(--color-border-soft)" : "none",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ink-900)", width: 140, flexShrink: 0 }}>{row.name}</div>
            <div style={{ flex: 1, height: 12, background: "var(--color-panel-soft)", borderRadius: 4, position: "relative" }}>
              <div style={{ position: "absolute", left: row.zeroLeft, width: 1, height: "100%", background: "#CBD5E1" }} />
              <div style={{ position: "absolute", left: row.bandLeft, width: row.bandWidth, height: "100%", borderRadius: 4, background: "rgba(37,99,235,0.15)" }} />
              <div style={{ position: "absolute", left: row.pointLeft, width: 3, height: "100%", background: "var(--color-signal-blue)", borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: row.color, width: 64, textAlign: "right" }}>{row.value}</div>
          </div>
        ))}
        <div
          style={{
            marginTop: 16,
            height: 100,
            background: "var(--color-panel-soft)",
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            border: "1.5px dashed var(--color-border-strong)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink-500)" }}>Forecast trajectory</div>
          <div style={{ fontSize: 11, color: "#CBD5E1" }}>Connects when forecast layer is live</div>
        </div>
      </div>
    </div>
  );
}

function AnomalyPanel() {
  return (
    <div>
      <SectionHead title="Detected anomalies" />
      <div style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, padding: "16px 24px" }}>
        <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--color-border-soft)" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-warning)", flexShrink: 0, marginTop: 5 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ink-950)" }}>Paywall B: revenue guardrail at threshold</div>
            <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Revenue per user dropped 1.1% with CI crossing zero. Consider pausing or running longer for significance.</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--color-border-soft)" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-signal-blue)", flexShrink: 0, marginTop: 5 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ink-950)" }}>AppMetrica export delay — Words in Word</div>
            <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Ingestion lag detected: last successful batch 6h ago. No data loss confirmed. Monitoring.</div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>Funnel snapshot</div>
            <Link href="/funnels" style={{ fontSize: 12, color: "var(--color-signal-blue)", fontWeight: 500, textDecoration: "none" }}>View →</Link>
          </div>
          <div
            style={{
              height: 80,
              background: "var(--color-panel-soft)",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              border: "1.5px dashed var(--color-border-strong)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink-500)" }}>Funnel layer</div>
            <div style={{ fontSize: 11, color: "#CBD5E1" }}>Coming in Phase 3</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RetentionSnapshot({ selectedProject }: { selectedProject: string }) {
  return (
    <div>
      <SectionHead title={`Retention snapshot · ${selectedProject === "Cross-project overview" ? "Word Catcher" : selectedProject} D7`} linkHref="/cohorts" linkLabel="Cohorts →" />
      <div style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, padding: "20px 24px" }}>
        <div
          style={{
            height: 120,
            background: "var(--color-panel-soft)",
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            border: "1.5px dashed var(--color-border-strong)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink-500)" }}>Retention chart</div>
          <div style={{ fontSize: 11, color: "#CBD5E1" }}>Cohort data connecting to mart_cohort_daily</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 16 }}>
          {[{ v: "61%", l: "D1 retention" }, { v: "38%", l: "D7 retention" }, { v: "22%", l: "D30 retention" }].map((m) => (
            <div key={m.l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-ink-950)" }}>{m.v}</div>
              <div style={{ fontSize: 11, color: "var(--color-ink-500)", marginTop: 2 }}>{m.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PendingAreas() {
  return (
    <div>
      <SectionHead title="Pending areas" />
      <div style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        {[
          { label: "User Acquisition Analytics", sub: "Not connected — waiting on source inventory" },
          { label: "Cross-project identity graph", sub: "Requires dim_user_identity mapping table" },
        ].map((p) => (
          <div
            key={p.label}
            style={{
              height: 80,
              background: "var(--color-panel-soft)",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              border: "1.5px dashed var(--color-border-strong)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink-500)" }}>{p.label}</div>
            <div style={{ fontSize: 11, color: "#CBD5E1" }}>{p.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RightRail({
  freshness,
}: {
  freshness: typeof FRESHNESS;
}) {
  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        borderLeft: "1px solid var(--color-border-soft)",
        padding: "24px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        background: "var(--color-panel-soft)",
        overflowY: "auto",
      }}
    >
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)", marginBottom: 12 }}>
          Data freshness
        </div>
        {freshness.map((item) => (
          <div
            key={item.source}
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              padding: "8px 0",
              borderBottom: "1px solid var(--color-border-soft)",
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--color-ink-900)" }}>{item.source}</div>
              <div style={{ fontSize: 11, color: "var(--color-ink-500)" }}>{item.time}</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: item.statusColor, flexShrink: 0 }}>{item.statusLabel}</div>
          </div>
        ))}
      </div>

      <div>
        <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)", marginBottom: 12 }}>
          Forecast model
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink-900)", background: "var(--color-panel-base)", border: "1px solid var(--color-border-strong)", borderRadius: 6, padding: "8px 12px" }}>
          v1.2.0 · stable
        </div>
        <div style={{ fontSize: 11, color: "var(--color-ink-500)", marginTop: 4 }}>
          Last run: Apr 12, 17:04 UTC<br />Next: ~19:00 UTC
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)", marginBottom: 12 }}>
          Operator notes
        </div>
        <div style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 8, padding: 12, fontSize: 12, color: "var(--color-ink-700)", lineHeight: 1.55 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--color-ink-500)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Apr 12, 2026</div>
          Paywall B experiment is approaching guardrail threshold. Decision required by Apr 15 before next forecast cycle.
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-500)", marginBottom: 12 }}>
          Identity mapping
        </div>
        <div
          style={{
            padding: "20px 12px",
            background: "var(--color-panel-base)",
            border: "1.5px dashed var(--color-border-strong)",
            borderRadius: 8,
            textAlign: "center",
            fontSize: 12,
            color: "var(--color-ink-500)",
            lineHeight: 1.5,
          }}
        >
          dim_user_identity not yet built.<br />Cross-source user joins unavailable.
        </div>
      </div>
    </aside>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const filters = parseDashboardSearchParams(await searchParams, "/overview");
  const selectedProject = getProjectLabel(filters.projectKey);
  const visibleExperiments =
    filters.projectKey === "all"
      ? EXPERIMENTS
      : EXPERIMENTS.filter((experiment) => experiment.meta.includes(selectedProject));
  const visibleFreshness =
    filters.projectKey === "all"
      ? FRESHNESS
      : FRESHNESS.filter(
          (item) => item.source.includes(selectedProject) || item.source.includes("User Acquisition")
        );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Overview" />

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <main
          style={{
            flex: 1,
            padding: 32,
            display: "flex",
            flexDirection: "column",
            gap: 32,
            minWidth: 0,
            overflowY: "auto",
          }}
        >
          <KpiStrip selectedProject={selectedProject} visibleExperimentCount={visibleExperiments.length} />
          <ExperimentTable experiments={visibleExperiments} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <CiPanel />
            <AnomalyPanel />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <RetentionSnapshot selectedProject={selectedProject} />
            <PendingAreas />
          </div>
        </main>

        <RightRail freshness={visibleFreshness} />
      </div>
    </div>
  );
}
