import { cookies } from "next/headers";
import { SegmentsWorkspace } from "@/components/segments-workspace";
import { TopFilterRail } from "@/components/top-filter-rail";
import { scopeBundles } from "@/lib/dashboard-live";
import { getProjectLabel, parseDashboardSearchParams } from "@/lib/dashboard-filters";
import { getLiveSliceCatalog } from "@/lib/data/live-slice-catalog";
import { listAnalyticsProjectOptions, listAnalyticsProjects } from "@/lib/platform/store";
import { parseSavedSegmentsCookie, SAVED_SEGMENTS_COOKIE } from "@/lib/segments";
import type { LiveSliceCatalog } from "@/lib/slice-catalog";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

async function withTimeout<T>(work: Promise<T>, timeoutMs: number, fallback: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function buildEmptyLiveSliceCatalog(note: string): LiveSliceCatalog {
  return {
    appmetricaDescriptors: [],
    mirrorDescriptors: [],
    mirrorOptions: {
      companies: [{ value: "all", label: "All companies", count: 0 }],
      campaigns: [{ value: "all", label: "All campaigns", count: 0 }],
      creatives: [{ value: "all", label: "All creatives", count: 0 }],
    },
    events: [{ value: "all", label: "All events", count: 0 }],
    notes: [note],
  };
}

export default async function SegmentsPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  const filters = parseDashboardSearchParams(await searchParams, "/segments");
  const cookieStore = await cookies();
  const savedSegments = parseSavedSegmentsCookie(cookieStore.get(SAVED_SEGMENTS_COOKIE)?.value);
  const [projectOptions, bundles] = await Promise.all([
    listAnalyticsProjectOptions(),
    listAnalyticsProjects(),
  ]);
  const scopedBundles = scopeBundles(bundles, filters.projectKey);
  const catalog = await withTimeout(
    getLiveSliceCatalog(scopedBundles, {
      from: filters.from,
      to: filters.to,
      platform: filters.platform,
    }),
    12_000,
    () =>
      buildEmptyLiveSliceCatalog(
        "Live slice catalog timed out, so segment filters were reduced to safe defaults for this request."
      )
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Segments" />

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
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 1,
            background: "var(--color-border-soft)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {[
            {
              label: "Saved segments",
              value: savedSegments.length.toString(),
              sub: "Per-user segment registry",
            },
            {
              label: "Current scope",
              value: filters.projectKey === "all" ? "Cross-project" : getProjectLabel(filters.projectKey),
              sub: "Top rail project scope feeds the builder",
            },
            {
              label: "Compare availability",
              value: "Experiments + Cohorts",
              sub: "Also available in Acquisition workbench",
            },
            {
              label: "Persistence",
              value: "Saved segment store",
              sub: "Session-backed today, with real event rules and project-aware filters",
            },
          ].map((card) => (
            <div key={card.label} style={{ background: "var(--color-panel-base)", padding: "18px 20px" }}>
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
                {card.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1.05 }}>
                {card.value}
              </div>
              <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--color-ink-500)" }}>{card.sub}</div>
            </div>
          ))}
        </section>

        <SegmentsWorkspace
          initialSegments={savedSegments}
          projectKey={filters.projectKey}
          catalog={catalog}
          projectOptions={projectOptions.map((project) => ({ value: project.key, label: project.label }))}
        />
      </main>
    </div>
  );
}
