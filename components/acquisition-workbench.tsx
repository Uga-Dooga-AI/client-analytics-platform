"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  getAcquisitionCompareDimensions,
  getRevenueModeOptions,
  type AcquisitionFilterOptions,
  type AcquisitionLocalFilters,
} from "@/lib/data/acquisition";

export function AcquisitionWorkbench({
  title,
  caption,
  filters,
  options,
}: {
  title: string;
  caption: string;
  filters: AcquisitionLocalFilters;
  options: AcquisitionFilterOptions;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function commitPatch(patch: Partial<AcquisitionLocalFilters>) {
    const next = new URLSearchParams(searchParams.toString());

    const merged: AcquisitionLocalFilters = { ...filters, ...patch };

    setOptionalParam(next, "country", merged.country);
    setOptionalParam(next, "company", merged.company);
    setOptionalParam(next, "source", merged.source);
    setOptionalParam(next, "campaign", merged.campaign);
    setOptionalParam(next, "creative", merged.creative);
    next.set("revenueMode", merged.revenueMode);
    next.set("compareBy", merged.compareBy);
    setOptionalParam(next, "compareLeft", merged.compareLeft, "");
    setOptionalParam(next, "compareRight", merged.compareRight, "");

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
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>{title}</div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--color-ink-500)", lineHeight: 1.55 }}>
            {caption}
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            commitPatch({
              country: "all",
              company: "all",
              source: "all",
              campaign: "all",
              creative: "all",
              revenueMode: "total",
              compareLeft: "",
              compareRight: "",
            })
          }
          style={{
            border: "1px solid var(--color-border-soft)",
            background: "var(--color-panel-soft)",
            color: "var(--color-ink-700)",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Clear slice
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        <WorkbenchSelect
          label="Country"
          value={filters.country}
          options={options.countries}
          onChange={(value) => commitPatch({ country: value, campaign: "all", creative: "all" })}
        />
        <WorkbenchSelect
          label="Company"
          value={filters.company}
          options={options.companies}
          onChange={(value) => commitPatch({ company: value, source: "all", campaign: "all", creative: "all" })}
        />
        <WorkbenchSelect
          label="Traffic source"
          value={filters.source}
          options={options.sources}
          onChange={(value) => commitPatch({ source: value, campaign: "all", creative: "all" })}
        />
        <WorkbenchSelect
          label="Campaign"
          value={filters.campaign}
          options={options.campaigns}
          onChange={(value) => commitPatch({ campaign: value, creative: "all" })}
        />
        <WorkbenchSelect
          label="Creative"
          value={filters.creative}
          options={options.creatives}
          onChange={(value) => commitPatch({ creative: value })}
        />
        <WorkbenchSelect
          label="Revenue view"
          value={filters.revenueMode}
          options={getRevenueModeOptions().map((mode) => ({ value: mode.value, label: mode.label, count: 0 }))}
          onChange={(value) => commitPatch({ revenueMode: value as AcquisitionLocalFilters["revenueMode"] })}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(150px, 180px) minmax(220px, 1fr) minmax(220px, 1fr)",
          gap: 10,
          alignItems: "end",
        }}
      >
        <WorkbenchSelect
          label="Compare by"
          value={filters.compareBy}
          options={getAcquisitionCompareDimensions().map((dimension) => ({
            value: dimension.value,
            label: dimension.label,
            count: options.compareValues.length,
          }))}
          onChange={(value) =>
            commitPatch({
              compareBy: value as AcquisitionLocalFilters["compareBy"],
              compareLeft: "",
              compareRight: "",
            })
          }
        />
        <WorkbenchSelect
          label="Left side"
          value={filters.compareLeft}
          options={options.compareValues}
          onChange={(value) => commitPatch({ compareLeft: value, compareRight: filters.compareRight === value ? "" : filters.compareRight })}
        />
        <WorkbenchSelect
          label="Right side"
          value={filters.compareRight}
          options={options.compareValues}
          onChange={(value) => commitPatch({ compareRight: value })}
        />
      </div>
    </section>
  );
}

function setOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string,
  emptyValue = "all"
) {
  if (!value || value === emptyValue) {
    params.delete(key);
    return;
  }

  params.set(key, value);
}

function WorkbenchSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: AcquisitionFilterOptions[keyof AcquisitionFilterOptions];
  onChange: (value: string) => void;
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
          <option key={option.value || `${label}-${option.label}`} value={option.value}>
            {option.label}
            {option.count ? ` (${option.count})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
