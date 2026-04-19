"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ForecastSliceControls, type ForecastSliceSelection } from "@/components/forecast-slice-controls";
import { serializeForecastHorizonDays } from "@/lib/data/forecast-horizons";
import type { SliceOption } from "@/lib/slice-catalog";

type Props = {
  projectKey: string;
  appliedSelection: ForecastSliceSelection;
  appliedHorizonDays: number[];
  initialDraftSelection: ForecastSliceSelection;
  initialDraftHorizonDays: number[];
  hasAppliedSelection: boolean;
  countries: SliceOption[];
  sources: SliceOption[];
  companies: SliceOption[];
  campaigns: SliceOption[];
  creatives: SliceOption[];
  notes: string[];
  showMirrorFilters: boolean;
  latestHistoryLabel: string | null;
  latestHistoryViewedAt: string | null;
};

export function ForecastSelectionWorkbench({
  projectKey,
  appliedSelection,
  appliedHorizonDays,
  initialDraftSelection,
  initialDraftHorizonDays,
  hasAppliedSelection,
  countries,
  sources,
  companies,
  campaigns,
  creatives,
  notes,
  showMirrorFilters,
  latestHistoryLabel,
  latestHistoryViewedAt,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draftSelection, setDraftSelection] = useState<ForecastSliceSelection>(initialDraftSelection);
  const [draftHorizonDays, setDraftHorizonDays] = useState<number[]>(initialDraftHorizonDays);

  useEffect(() => {
    setDraftSelection(initialDraftSelection);
  }, [initialDraftSelection, projectKey]);

  useEffect(() => {
    setDraftHorizonDays(initialDraftHorizonDays);
  }, [initialDraftHorizonDays, projectKey]);

  const hasPendingChanges =
    !hasAppliedSelection ||
    !sameSelection(draftSelection, appliedSelection) ||
    !sameDays(draftHorizonDays, appliedHorizonDays);

  const statusMessage = useMemo(() => {
    if (!hasAppliedSelection) {
      if (latestHistoryLabel) {
        const viewedAt = latestHistoryViewedAt
          ? ` Last viewed ${formatRelativeDraftTime(latestHistoryViewedAt)}.`
          : "";
        return `The latest saved slice for this project is preselected but not loaded yet: ${latestHistoryLabel}.${viewedAt}`;
      }

      return "No forecast slice is loaded yet. Adjust the filters below and load data only when you actually want this slice.";
    }

    return "The charts above still reflect the previously applied slice. Apply the current draft to load and, if needed, queue only this exact combination.";
  }, [hasAppliedSelection, latestHistoryLabel, latestHistoryViewedAt]);

  function applySelection() {
    const next = new URLSearchParams(searchParams.toString());

    next.set("forecastView", "1");
    next.set("revenueMode", draftSelection.revenueMode);
    next.set("country", draftSelection.country);
    next.set("source", draftSelection.source);
    next.set("company", draftSelection.company);
    next.set("campaign", draftSelection.campaign);
    next.set("creative", draftSelection.creative);
    next.set("horizonDays", serializeForecastHorizonDays(draftHorizonDays));

    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <ForecastSliceControls
        selection={draftSelection}
        countries={countries}
        sources={sources}
        companies={companies}
        campaigns={campaigns}
        creatives={creatives}
        selectedHorizonDays={draftHorizonDays}
        notes={notes}
        showMirrorFilters={showMirrorFilters}
        onSelectionChange={setDraftSelection}
        onHorizonDaysChange={setDraftHorizonDays}
      />

      {hasPendingChanges ? (
        <div
          style={{
            position: "sticky",
            bottom: 16,
            zIndex: 20,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              pointerEvents: "auto",
              width: "min(860px, 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 18,
              padding: "14px 16px",
              borderRadius: 14,
              border: "1px solid rgba(15, 23, 42, 0.14)",
              background: "rgba(255, 255, 255, 0.96)",
              boxShadow: "0 14px 40px rgba(15, 23, 42, 0.16)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-ink-950)" }}>
                {hasAppliedSelection ? "Current settings changed" : "Current settings are not loaded yet"}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: "var(--color-ink-600)",
                }}
              >
                {statusMessage}
              </div>
            </div>

            <button
              type="button"
              onClick={applySelection}
              style={{
                border: "none",
                borderRadius: 12,
                background: "var(--color-ink-950)",
                color: "white",
                minHeight: 44,
                padding: "0 18px",
                fontSize: 13,
                fontWeight: 700,
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {hasAppliedSelection ? "Update Data For Current Settings" : "Display Data For Current Settings"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function sameSelection(left: ForecastSliceSelection, right: ForecastSliceSelection) {
  return (
    left.revenueMode === right.revenueMode &&
    left.country === right.country &&
    left.source === right.source &&
    left.company === right.company &&
    left.campaign === right.campaign &&
    left.creative === right.creative
  );
}

function sameDays(left: number[], right: number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatRelativeDraftTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "at an unknown time";
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 60) {
    return `${Math.max(diffMinutes, 0)}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return `${Math.max(diffHours, 0)}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${Math.max(diffDays, 0)}d ago`;
}
