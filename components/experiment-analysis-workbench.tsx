"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ExperimentAnalysisData } from "@/lib/data/experiments";
import type { Experiment } from "@/lib/mock-data";

export function ExperimentAnalysisWorkbench({
  experiments,
  analysis,
}: {
  experiments: Experiment[];
  analysis: ExperimentAnalysisData;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function commitPatch(patch: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());

    Object.entries(patch).forEach(([key, value]) => {
      if (!value) {
        next.delete(key);
        return;
      }

      next.set(key, value);
    });

    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <section
      style={{
        background: "var(--color-panel-base)",
        border: "1px solid var(--color-border-soft)",
        borderRadius: 10,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>A/B test analysis workspace</div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--color-ink-500)", lineHeight: 1.55 }}>
            Choose one experiment, then compare concrete variants inside one segment. This is separate from the generic
            comparison workbench below.
          </div>
        </div>

        <a
          href={`/experiments/${analysis.experiment.id}`}
          style={{
            borderRadius: 8,
            border: "1px solid var(--color-border-soft)",
            background: "var(--color-panel-soft)",
            color: "var(--color-ink-700)",
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Open detail
        </a>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(240px, 1.1fr) minmax(180px, 0.9fr) minmax(180px, 0.85fr) minmax(180px, 0.85fr)",
          gap: 10,
        }}
      >
        <SelectField
          label="Experiment"
          value={analysis.experiment.id}
          onChange={(value) => commitPatch({ experimentId: value, variantLeft: "", variantRight: "" })}
          options={experiments.map((experiment) => ({ value: experiment.id, label: `${experiment.name} · ${experiment.project}` }))}
        />
        <SelectField
          label="Segment"
          value={analysis.selectedSegmentKey}
          onChange={(value) => commitPatch({ experimentSegment: value })}
          options={analysis.segmentOptions}
        />
        <SelectField
          label="Left side"
          value={analysis.leftVariant.label}
          onChange={(value) =>
            commitPatch({
              variantLeft: value,
              variantRight: analysis.rightVariant.label === value ? "" : analysis.rightVariant.label,
            })
          }
          options={analysis.variants.map((variant) => ({ value: variant.label, label: variant.label }))}
        />
        <SelectField
          label="Right side"
          value={analysis.rightVariant.label}
          onChange={(value) => commitPatch({ variantRight: value })}
          options={analysis.variants
            .filter((variant) => variant.label !== analysis.leftVariant.label)
            .map((variant) => ({ value: variant.label, label: variant.label }))}
        />
      </div>
    </section>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "var(--color-ink-500)",
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          height: 40,
          borderRadius: 9,
          border: "1px solid var(--color-border-soft)",
          background: "var(--color-panel-soft)",
          padding: "0 12px",
          fontSize: 13,
          color: "var(--color-ink-900)",
        }}
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
