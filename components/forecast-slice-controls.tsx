"use client";

import { useEffect } from "react";
import type { RevenueModeKey } from "@/lib/data/acquisition";
import { FORECAST_HORIZON_DAY_OPTIONS } from "@/lib/data/forecast-horizons";
import type { SliceOption } from "@/lib/slice-catalog";

export type ForecastSliceSelection = {
  revenueMode: RevenueModeKey;
  country: string;
  source: string;
  company: string;
  campaign: string;
  creative: string;
};

const REVENUE_MODE_OPTIONS: Array<{ value: RevenueModeKey; label: string }> = [
  { value: "total", label: "Total revenue / ROAS" },
  { value: "ads", label: "Ads-only ROAS" },
  { value: "iap", label: "IAP-only ROAS" },
];

export function ForecastSliceControls({
  selection,
  countries,
  sources,
  companies,
  campaigns,
  creatives,
  selectedHorizonDays,
  notes,
  showMirrorFilters,
  onSelectionChange,
  onHorizonDaysChange,
}: {
  selection: ForecastSliceSelection;
  countries: SliceOption[];
  sources: SliceOption[];
  companies: SliceOption[];
  campaigns: SliceOption[];
  creatives: SliceOption[];
  selectedHorizonDays: number[];
  notes: string[];
  showMirrorFilters: boolean;
  onSelectionChange: (selection: ForecastSliceSelection) => void;
  onHorizonDaysChange: (days: number[]) => void;
}) {
  function commitPatch(patch: Partial<ForecastSliceSelection>) {
    onSelectionChange({ ...selection, ...patch });
  }

  useEffect(() => {
    if (!showMirrorFilters && (selection.company !== "all" || selection.campaign !== "all" || selection.creative !== "all")) {
      onSelectionChange({
        ...selection,
        company: "all",
        campaign: "all",
        creative: "all",
      });
    }
  }, [
    selection.campaign,
    selection.company,
    selection.creative,
    showMirrorFilters,
    onSelectionChange,
  ]);

  return (
    <section
      style={{
        background: "var(--color-panel-base)",
        border: "1px solid var(--color-border-soft)",
        borderRadius: 12,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Forecast slice filters</div>
        <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--color-ink-500)", lineHeight: 1.55 }}>
          These page-level filters drive the notebook-style ROAS and payback surface directly. Standard country,
          traffic-source, company, campaign, and creative cuts stay on this page; `Segments` remains for harder
          behavior-based slices.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 340px)",
          gap: 12,
          alignItems: "start",
        }}
      >
        <div
          style={{
            border: "1px solid var(--color-border-soft)",
            background: "var(--color-panel-soft)",
            borderRadius: 10,
            padding: "12px 14px",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-ink-500)" }}>
            Active horizon days
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "var(--color-ink-900)", lineHeight: 1.5 }}>
            {selectedHorizonDays.map((day) => `D${day}`).join(", ")}
          </div>
        </div>

        <HorizonDaysDropdown
          selectedDays={selectedHorizonDays}
          onChange={onHorizonDaysChange}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <SelectField
          label="Revenue view"
          value={selection.revenueMode}
          onChange={(value) => commitPatch({ revenueMode: value as RevenueModeKey })}
          options={REVENUE_MODE_OPTIONS}
        />
        <SelectField
          label="Country"
          value={selection.country}
          onChange={(value) => commitPatch({ country: value })}
          options={formatOptions(countries)}
        />
        <SelectField
          label="Traffic source"
          value={selection.source}
          onChange={(value) => commitPatch({ source: value })}
          options={formatOptions(sources)}
        />
        {showMirrorFilters ? (
          <>
            <SelectField
              label="Company"
              value={selection.company}
              onChange={(value) => commitPatch({ company: value })}
              options={formatOptions(companies)}
            />
            <SelectField
              label="Campaign"
              value={selection.campaign}
              onChange={(value) => commitPatch({ campaign: value })}
              options={formatOptions(campaigns)}
            />
            <SelectField
              label="Creative"
              value={selection.creative}
              onChange={(value) => commitPatch({ creative: value })}
              options={formatOptions(creatives)}
            />
          </>
        ) : null}
      </div>

      {notes.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid var(--color-border-soft)",
            background: "var(--color-panel-soft)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-ink-500)" }}>
            Slice Notes
          </div>
          {notes.map((note) => (
            <div key={note} style={{ fontSize: 12, color: "var(--color-ink-600)", lineHeight: 1.5 }}>
              {note}
            </div>
          ))}
        </div>
      ) : null}
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
          minHeight: 40,
          borderRadius: 10,
          border: "1px solid var(--color-border-soft)",
          background: "var(--color-panel-base)",
          padding: "0 12px",
          fontSize: 13,
          color: "var(--color-ink-950)",
          outline: "none",
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

function formatOptions(options: SliceOption[]) {
  return options.map((option) => ({
    value: option.value,
    label:
      option.value === "all"
        ? `${option.label}${option.count > 0 ? ` (${option.count.toLocaleString()})` : ""}`
        : `${option.label} (${option.count.toLocaleString()})`,
  }));
}

function HorizonDaysDropdown({
  selectedDays,
  onChange,
}: {
  selectedDays: number[];
  onChange: (days: number[]) => void;
}) {
  function toggleDay(day: number) {
    const isSelected = selectedDays.includes(day);
    if (isSelected && selectedDays.length === 1) {
      return;
    }

    const next = isSelected
      ? selectedDays.filter((value) => value !== day)
      : [...selectedDays, day];

    onChange(next);
  }

  return (
    <details
      style={{
        border: "1px solid var(--color-border-soft)",
        borderRadius: 10,
        background: "var(--color-panel-base)",
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          padding: "12px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-ink-500)" }}>
            Display days
          </div>
          <div style={{ marginTop: 5, fontSize: 13, color: "var(--color-ink-950)" }}>
            {selectedDays.map((day) => `D${day}`).join(", ")}
          </div>
        </div>
        <span style={{ fontSize: 11.5, color: "var(--color-ink-500)" }}>Edit</span>
      </summary>

      <div
        style={{
          borderTop: "1px solid var(--color-border-soft)",
          padding: 12,
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {FORECAST_HORIZON_DAY_OPTIONS.map((day) => {
          const checked = selectedDays.includes(day);
          return (
            <label
              key={day}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12.5,
                color: "var(--color-ink-800)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleDay(day)}
              />
              {`D${day}`}
            </label>
          );
        })}
      </div>
    </details>
  );
}
