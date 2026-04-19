"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  TAG_OPTIONS,
  type DashboardProjectKey,
} from "@/lib/dashboard-filters";
import {
  defaultLiveSliceSelection,
  resolveLiveSliceCatalogOptions,
  type LiveSliceCatalog,
} from "@/lib/slice-catalog";
import type { SavedSegmentEventRule, SavedUserSegment } from "@/lib/segments";

type BuilderState = {
  label: string;
  description: string;
  profileKey: SavedUserSegment["profileKey"];
  projectKey: DashboardProjectKey;
  platform: string;
  tag: string;
  country: string;
  company: string;
  source: string;
  campaign: string;
  creative: string;
  eventRules: SavedSegmentEventRule[];
};

const PROFILE_OPTIONS: Array<{ value: SavedUserSegment["profileKey"]; label: string }> = [
  { value: "paid-ua", label: "Paid UA baseline" },
  { value: "new-users", label: "New users" },
  { value: "returning", label: "Returning" },
  { value: "payers", label: "Payers" },
  { value: "high-value", label: "High value" },
];

export function SegmentsWorkspace({
  initialSegments,
  projectKey,
  catalog,
  projectOptions,
}: {
  initialSegments: SavedUserSegment[];
  projectKey: DashboardProjectKey;
  catalog: LiveSliceCatalog;
  projectOptions: Array<{ value: string; label: string }>;
}) {
  const [segments, setSegments] = useState(initialSegments);
  const [builder, setBuilder] = useState<BuilderState>(() => ({
    label: "",
    description: "",
    profileKey: "paid-ua",
    projectKey,
    platform: "all",
    tag: "all",
    country: "all",
    company: "all",
    source: "all",
    campaign: "all",
    creative: "all",
    eventRules: [],
  }));
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setBuilder((current) => ({ ...current, projectKey }));
  }, [projectKey]);

  const scopedSegments = useMemo(
    () =>
      projectKey === "all"
        ? segments
        : segments.filter(
            (segment) => segment.rules.projectKey === "all" || segment.rules.projectKey === projectKey
          ),
    [projectKey, segments]
  );

  const resolvedOptions = useMemo(
    () =>
      resolveLiveSliceCatalogOptions(catalog, {
        platform: builder.platform,
        country: builder.country,
        source: builder.source,
        company: builder.company,
        campaign: builder.campaign,
        creative: builder.creative,
      }),
    [builder.campaign, builder.company, builder.country, builder.creative, builder.platform, builder.source, catalog]
  );
  const hasCompanyOptions = useMemo(
    () => resolvedOptions.companies.some((option) => option.value !== "all" && option.count > 0),
    [resolvedOptions.companies]
  );
  const hasCampaignOptions = useMemo(
    () => resolvedOptions.campaigns.some((option) => option.value !== "all" && option.count > 0),
    [resolvedOptions.campaigns]
  );
  const hasCreativeOptions = useMemo(
    () => resolvedOptions.creatives.some((option) => option.value !== "all" && option.count > 0),
    [resolvedOptions.creatives]
  );
  const hasMirrorFilters = hasCompanyOptions || hasCampaignOptions || hasCreativeOptions;

  useEffect(() => {
    const defaults = defaultLiveSliceSelection();

    setBuilder((current) => {
      const next = { ...current };
      let changed = false;

      if (!resolvedOptions.platforms.some((option) => option.value === current.platform)) {
        next.platform = defaults.platform;
        changed = true;
      }

      if (!resolvedOptions.countries.some((option) => option.value === current.country)) {
        next.country = defaults.country;
        changed = true;
      }

      if (!resolvedOptions.sources.some((option) => option.value === current.source)) {
        next.source = defaults.source;
        changed = true;
      }

      if (!resolvedOptions.companies.some((option) => option.value === current.company)) {
        next.company = defaults.company;
        changed = true;
      }
      if (!hasCompanyOptions && current.company !== defaults.company) {
        next.company = defaults.company;
        changed = true;
      }

      if (!resolvedOptions.campaigns.some((option) => option.value === current.campaign)) {
        next.campaign = defaults.campaign;
        changed = true;
      }
      if (!hasCampaignOptions && current.campaign !== defaults.campaign) {
        next.campaign = defaults.campaign;
        changed = true;
      }

      if (!resolvedOptions.creatives.some((option) => option.value === current.creative)) {
        next.creative = defaults.creative;
        changed = true;
      }
      if (!hasCreativeOptions && current.creative !== defaults.creative) {
        next.creative = defaults.creative;
        changed = true;
      }

      return changed ? next : current;
    });
  }, [hasCampaignOptions, hasCompanyOptions, hasCreativeOptions, resolvedOptions]);

  function resetBuilder() {
    setBuilder((current) => ({
      ...current,
      label: "",
      description: "",
      profileKey: "paid-ua",
      platform: "all",
      tag: "all",
      country: "all",
      company: "all",
      source: "all",
      campaign: "all",
      creative: "all",
      eventRules: [],
    }));
  }

  async function handleCreateSegment() {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: builder.label,
          description: builder.description,
          profileKey: builder.profileKey,
          rules: {
            projectKey: builder.projectKey,
            platform: builder.platform,
            tag: builder.tag,
            country: builder.country,
            company: builder.company,
            source: builder.source,
            campaign: builder.campaign,
            creative: builder.creative,
            eventRules: builder.eventRules,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "Could not save segment.");
        return;
      }

      setSegments(payload.segments ?? []);
      resetBuilder();
    });
  }

  async function handleDeleteSegment(id: string) {
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/segments?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "Could not delete segment.");
        return;
      }

      setSegments(payload.segments ?? []);
    });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 20 }}>
      <section
        style={{
          background: "var(--color-panel-base)",
          border: "1px solid var(--color-border-soft)",
          borderRadius: 12,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Create saved segment</div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--color-ink-500)", lineHeight: 1.55 }}>
            Saved segments become available in global segment filters, cohort comparison, acquisition, and A/B test
            analysis.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
          <TextField
            label="Segment name"
            value={builder.label}
            onChange={(value) => setBuilder((current) => ({ ...current, label: value }))}
            placeholder="High-value iOS Meta"
          />
          <SelectField
            label="Behavior profile"
            value={builder.profileKey}
            onChange={(value) =>
              setBuilder((current) => ({ ...current, profileKey: value as BuilderState["profileKey"] }))
            }
            options={PROFILE_OPTIONS}
          />
        </div>

        <TextAreaField
          label="What this segment means"
          value={builder.description}
          onChange={(value) => setBuilder((current) => ({ ...current, description: value }))}
          placeholder="Users from paid Meta acquisition on iOS for monetization-heavy analysis."
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          <SelectField
            label="Project scope"
            value={builder.projectKey}
            onChange={(value) => setBuilder((current) => ({ ...current, projectKey: value as DashboardProjectKey }))}
            options={[
              { value: "all", label: "Cross-project" },
              ...projectOptions,
            ]}
          />
          <SelectField
            label="Platform"
            value={builder.platform}
            onChange={(value) => setBuilder((current) => ({ ...current, platform: value }))}
            options={formatOptionsWithCounts(resolvedOptions.platforms)}
          />
          <SelectField
            label="Tag focus"
            value={builder.tag}
            onChange={(value) => setBuilder((current) => ({ ...current, tag: value }))}
            options={TAG_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          <SelectField
            label="Country"
            value={builder.country}
            onChange={(value) => setBuilder((current) => ({ ...current, country: value }))}
            options={formatOptionsWithCounts(resolvedOptions.countries)}
          />
          <SelectField
            label="Traffic source"
            value={builder.source}
            onChange={(value) => setBuilder((current) => ({ ...current, source: value }))}
            options={formatOptionsWithCounts(resolvedOptions.sources)}
          />
        </div>

        {hasMirrorFilters ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
            {hasCompanyOptions ? (
              <SelectField
                label="Company"
                value={builder.company}
                onChange={(value) => setBuilder((current) => ({ ...current, company: value }))}
                options={formatOptionsWithCounts(resolvedOptions.companies)}
              />
            ) : null}
            {hasCampaignOptions ? (
              <SelectField
                label="Campaign"
                value={builder.campaign}
                onChange={(value) => setBuilder((current) => ({ ...current, campaign: value }))}
                options={formatOptionsWithCounts(resolvedOptions.campaigns)}
              />
            ) : null}
            {hasCreativeOptions ? (
              <SelectField
                label="Creative"
                value={builder.creative}
                onChange={(value) => setBuilder((current) => ({ ...current, creative: value }))}
                options={formatOptionsWithCounts(resolvedOptions.creatives)}
              />
            ) : null}
          </div>
        ) : (
          <div
            style={{
              fontSize: 12,
              color: "var(--color-ink-500)",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px dashed var(--color-border-strong)",
              background: "var(--color-panel-soft)",
              lineHeight: 1.55,
            }}
          >
            Paid-media mirror filters stay hidden until live company, campaign, or creative catalogs resolve from the
            connected spend mirrors.
          </div>
        )}

        {catalog.notes.length > 0 ? (
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
              Live Filter Notes
            </div>
            {catalog.notes.map((note) => (
              <div key={note} style={{ fontSize: 12, color: "var(--color-ink-600)", lineHeight: 1.5 }}>
                {note}
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-ink-950)" }}>Event rules</div>
              <div style={{ marginTop: 3, fontSize: 11.5, color: "var(--color-ink-500)", lineHeight: 1.5 }}>
                Use notebook-style user behavior constraints on top of traffic, country, platform, and campaign filters.
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                setBuilder((current) => ({
                  ...current,
                  eventRules: [
                    ...current.eventRules,
                    {
                      eventName: resolvedOptions.events.find((option) => option.value !== "all")?.value ?? "session_start",
                      operator: "did" as const,
                      withinDays: 30,
                      minCount: 1,
                    },
                  ].slice(0, 4),
                }))
              }
              style={SECONDARY_BUTTON_STYLE}
            >
              Add event rule
            </button>
          </div>

          {builder.eventRules.map((rule, index) => (
            <div key={`${rule.eventName}-${index}`} style={{ display: "grid", gridTemplateColumns: "1.35fr 0.8fr 0.8fr 0.8fr auto", gap: 10, alignItems: "end" }}>
              <SelectField
                label={`Event ${index + 1}`}
                value={rule.eventName}
                onChange={(value) =>
                  setBuilder((current) => ({
                    ...current,
                    eventRules: current.eventRules.map((eventRule, eventIndex) =>
                      eventIndex === index ? { ...eventRule, eventName: value } : eventRule
                    ),
                  }))
                }
                options={resolvedOptions.events.filter((option) => option.value !== "all").map((option) => ({ value: option.value, label: option.label }))}
              />
              <SelectField
                label="Operator"
                value={rule.operator}
                onChange={(value) =>
                  setBuilder((current) => ({
                    ...current,
                    eventRules: current.eventRules.map((eventRule, eventIndex) =>
                      eventIndex === index ? { ...eventRule, operator: value as SavedSegmentEventRule["operator"] } : eventRule
                    ),
                  }))
                }
                options={[
                  { value: "did", label: "Did" },
                  { value: "did_not", label: "Did not" },
                ]}
              />
              <NumberField
                label="Within days"
                value={rule.withinDays}
                onChange={(value) =>
                  setBuilder((current) => ({
                    ...current,
                    eventRules: current.eventRules.map((eventRule, eventIndex) =>
                      eventIndex === index ? { ...eventRule, withinDays: value } : eventRule
                    ),
                  }))
                }
              />
              <NumberField
                label="Min count"
                value={rule.minCount}
                onChange={(value) =>
                  setBuilder((current) => ({
                    ...current,
                    eventRules: current.eventRules.map((eventRule, eventIndex) =>
                      eventIndex === index ? { ...eventRule, minCount: value } : eventRule
                    ),
                  }))
                }
              />
              <button
                type="button"
                onClick={() =>
                  setBuilder((current) => ({
                    ...current,
                    eventRules: current.eventRules.filter((_, eventIndex) => eventIndex !== index),
                  }))
                }
                style={{ ...SECONDARY_BUTTON_STYLE, padding: "10px 12px" }}
              >
                Remove
              </button>
            </div>
          ))}

          {builder.eventRules.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--color-ink-500)", padding: "10px 12px", borderRadius: 10, border: "1px dashed var(--color-border-strong)", background: "var(--color-panel-soft)" }}>
              No event rules configured. This segment is based only on the selected filters and scope.
            </div>
          ) : null}
        </div>

        {error ? (
          <div
            style={{
              borderRadius: 10,
              padding: "10px 12px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "var(--color-danger)",
              fontSize: 12.5,
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--color-ink-500)" }}>
            The narrower the rules, the smaller and noisier the synthetic cohort becomes.
          </div>
          <button
            type="button"
            onClick={handleCreateSegment}
            disabled={isPending}
            style={PRIMARY_BUTTON_STYLE}
          >
            {isPending ? "Saving..." : "Save segment"}
          </button>
        </div>
      </section>

      <section
        style={{
          background: "var(--color-panel-base)",
          border: "1px solid var(--color-border-soft)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Saved segments</div>
          <div style={{ marginTop: 3, fontSize: 12.5, color: "var(--color-ink-500)" }}>
            {scopedSegments.length} segment{scopedSegments.length === 1 ? "" : "s"} visible in this project scope
          </div>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {scopedSegments.length === 0 ? (
            <div
              style={{
                borderRadius: 10,
                border: "1px dashed var(--color-border-strong)",
                background: "var(--color-panel-soft)",
                padding: "18px 16px",
                fontSize: 12.5,
                color: "var(--color-ink-500)",
                lineHeight: 1.55,
              }}
            >
              No saved segments yet. Create the first one here, then compare it in `Experiments`, `Acquisition`, and
              `Cohorts`.
            </div>
          ) : null}

          {scopedSegments.map((segment) => (
            <div
              key={segment.id}
              style={{
                borderRadius: 10,
                border: "1px solid var(--color-border-soft)",
                background: "var(--color-panel-soft)",
                padding: "14px 14px 12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-ink-950)" }}>{segment.label}</div>
                  <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--color-ink-500)", lineHeight: 1.5 }}>
                    {segment.description || "No description"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteSegment(segment.id)}
                  disabled={isPending}
                  style={SECONDARY_BUTTON_STYLE}
                >
                  Delete
                </button>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <Pill label={PROFILE_OPTIONS.find((profile) => profile.value === segment.profileKey)?.label ?? segment.profileKey} />
                <Pill
                  label={
                    segment.rules.projectKey === "all"
                      ? "Cross-project"
                      : projectOptions.find((project) => project.value === segment.rules.projectKey)?.label ?? segment.rules.projectKey
                  }
                />
                {summarizeRules(segment).map((rule) => (
                  <Pill key={rule} label={rule} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function summarizeRules(segment: SavedUserSegment) {
  const rules: string[] = [];
  if (segment.rules.platform !== "all") rules.push(segment.rules.platform.toUpperCase());
  if (segment.rules.tag !== "all") rules.push(segment.rules.tag);
  if (segment.rules.country !== "all") rules.push(segment.rules.country);
  if (segment.rules.company !== "all") rules.push(segment.rules.company);
  if (segment.rules.source !== "all") rules.push(segment.rules.source);
  if (segment.rules.campaign !== "all") rules.push(segment.rules.campaign);
  if (segment.rules.creative !== "all") rules.push(segment.rules.creative);
  segment.rules.eventRules.forEach((rule) => {
    rules.push(`${rule.operator === "did" ? "did" : "did not"} ${rule.eventName} in ${rule.withinDays}d`);
  });
  return rules.length > 0 ? rules : ["No additional rules"];
}

function formatOptionsWithCounts(options: Array<{ value: string; label: string; count: number }>) {
  return options.map((option) => ({
    value: option.value,
    label:
      option.value === "all"
        ? `${option.label}${option.count > 0 ? ` (${option.count.toLocaleString()})` : ""}`
        : `${option.label} (${option.count.toLocaleString()})`,
  }));
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={FIELD_LABEL_STYLE}>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={FIELD_STYLE}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={FIELD_LABEL_STYLE}>{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{
          ...FIELD_STYLE,
          minHeight: 88,
          padding: "10px 12px",
          resize: "vertical",
        }}
      />
    </label>
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
      <span style={FIELD_LABEL_STYLE}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={FIELD_STYLE}>
        {options.map((option) => (
          <option key={`${label}-${option.value || option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={FIELD_LABEL_STYLE}>{label}</span>
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} style={FIELD_STYLE} />
    </label>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 9px",
        borderRadius: 999,
        background: "var(--color-panel-base)",
        border: "1px solid var(--color-border-soft)",
        fontSize: 11.5,
        fontWeight: 600,
        color: "var(--color-ink-700)",
      }}
    >
      {label}
    </span>
  );
}

const FIELD_LABEL_STYLE = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.07em",
  textTransform: "uppercase" as const,
  color: "var(--color-ink-500)",
};

const FIELD_STYLE = {
  minHeight: 40,
  borderRadius: 10,
  border: "1px solid var(--color-border-soft)",
  background: "var(--color-panel-base)",
  padding: "0 12px",
  fontSize: 13,
  color: "var(--color-ink-950)",
  outline: "none",
};

const PRIMARY_BUTTON_STYLE = {
  border: "none",
  borderRadius: 10,
  background: "var(--color-signal-blue)",
  color: "#fff",
  padding: "10px 14px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const SECONDARY_BUTTON_STYLE = {
  border: "1px solid var(--color-border-soft)",
  borderRadius: 8,
  background: "var(--color-panel-base)",
  color: "var(--color-ink-700)",
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
