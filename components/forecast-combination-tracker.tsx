"use client";

import { useEffect, useMemo, useState } from "react";
import type { ForecastPipelineSnapshot, ForecastPipelineStage } from "@/lib/data/forecast-progress";

type Props = {
  projectKey: string;
  combinationKey: string;
  label: string;
  sourcePage: string;
  filters: Record<string, unknown>;
  initialSnapshot: ForecastPipelineSnapshot;
};

type QueueState =
  | { tone: "idle"; message: string | null }
  | { tone: "info"; message: string }
  | { tone: "warning"; message: string };

const SENT_FORECAST_COMBINATION_REQUESTS = new Set<string>();

export function ForecastCombinationTracker({
  projectKey,
  combinationKey,
  label,
  sourcePage,
  filters,
  initialSnapshot,
}: Props) {
  const [state, setState] = useState<QueueState>({ tone: "idle", message: null });
  const [snapshot, setSnapshot] = useState<ForecastPipelineSnapshot>(initialSnapshot);
  const body = useMemo(
    () =>
      JSON.stringify({
        key: combinationKey,
        label,
        sourcePage,
        filters,
      }),
    [combinationKey, filters, label, sourcePage]
  );

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  useEffect(() => {
    if (!projectKey || projectKey === "all" || !combinationKey) {
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/projects/by-key/${encodeURIComponent(projectKey)}/forecast-status?combinationKey=${encodeURIComponent(combinationKey)}`,
          {
            cache: "no-store",
            credentials: "include",
          }
        );
        const payload = (await response.json().catch(() => ({}))) as {
          snapshot?: ForecastPipelineSnapshot;
        };
        if (!cancelled && response.ok && payload.snapshot) {
          setSnapshot(payload.snapshot);
        }
      } catch {
        // Keep the latest known snapshot visible.
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [combinationKey, projectKey]);

  useEffect(() => {
    if (!projectKey || projectKey === "all") {
      return;
    }

    const requestKey = `${projectKey}:${body}`;
    if (SENT_FORECAST_COMBINATION_REQUESTS.has(requestKey)) {
      return;
    }

    SENT_FORECAST_COMBINATION_REQUESTS.add(requestKey);
    let cancelled = false;
    void fetch(`/api/projects/by-key/${encodeURIComponent(projectKey)}/forecast-combinations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      credentials: "include",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          queuedRun?: { status?: string } | null;
          error?: string;
        };

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          SENT_FORECAST_COMBINATION_REQUESTS.delete(requestKey);
          setState({
            tone: "warning",
            message: payload.error ?? "Forecast control plane could not register this selection.",
          });
          return;
        }

        if (payload.queuedRun?.status) {
          const tone =
            payload.queuedRun.status === "waiting_credentials" ? "warning" : "info";
          setState({
            tone,
            message:
              payload.queuedRun.status === "waiting_credentials"
                ? "Cold forecast selection was captured, but it is waiting for source credentials."
                : `Cold forecast selection was queued for recalculation (${payload.queuedRun.status}).`,
          });
          void fetch(
            `/api/projects/by-key/${encodeURIComponent(projectKey)}/forecast-status?combinationKey=${encodeURIComponent(combinationKey)}`,
            {
              cache: "no-store",
              credentials: "include",
            }
          )
            .then((response) => response.json().catch(() => ({})).then((nextPayload) => ({ response, nextPayload })))
            .then(({ response, nextPayload }) => {
              if (!cancelled && response.ok && nextPayload.snapshot) {
                setSnapshot(nextPayload.snapshot as ForecastPipelineSnapshot);
              }
            })
            .catch(() => {});
          return;
        }

        setState({ tone: "idle", message: null });
      })
      .catch(() => {
        if (!cancelled) {
          SENT_FORECAST_COMBINATION_REQUESTS.delete(requestKey);
          setState({
            tone: "warning",
            message: "Forecast control plane registration failed.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [body, projectKey]);

  return (
    <section
      style={{
        display: "grid",
        gap: 12,
      }}
    >
      {state.message ? (
        <div
          style={{
            borderRadius: 8,
            border:
              state.tone === "warning"
                ? "1px solid #f59e0b"
                : "1px solid var(--color-signal-blue)",
            background:
              state.tone === "warning"
                ? "#fffbeb"
                : "var(--color-signal-blue-surface)",
            color:
              state.tone === "warning"
                ? "#92400e"
                : "var(--color-signal-blue-strong)",
            fontSize: 12,
            lineHeight: 1.55,
            padding: "10px 12px",
          }}
        >
          {state.message}
        </div>
      ) : null}

      <div
        style={{
          background: "var(--color-panel-base)",
          border: "1px solid var(--color-border-soft)",
          borderRadius: 10,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-ink-950)" }}>
            Forecast pipeline for the current slice
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-ink-500)", lineHeight: 1.5 }}>
            This shows what is blocking fresh forecast data for the exact filters currently selected on the page.
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {snapshot.stages.map((stage) => {
            const tone = stageTone(stage);
            return (
              <div
                key={stage.key}
                style={{
                  border: `1px solid ${tone.border}`,
                  background: tone.background,
                  borderRadius: 10,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--color-ink-950)" }}>
                      {stage.label}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 11.5, color: "var(--color-ink-600)", lineHeight: 1.45 }}>
                      {stage.message}
                    </div>
                  </div>
                  <span
                    style={{
                      display: "inline-flex",
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: tone.badgeBackground,
                      color: tone.badgeColor,
                      fontSize: 11.5,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatStageStatus(stage.status)}
                  </span>
                </div>

                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: "rgba(15, 23, 42, 0.08)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${stage.progressPercent}%`,
                      height: "100%",
                      background: tone.progress,
                    }}
                  />
                </div>

                <div style={{ fontSize: 11.5, color: "var(--color-ink-500)" }}>
                  {stage.updatedAt ? `Updated ${formatSnapshotTime(stage.updatedAt)}` : "No run timestamp yet"}
                  {stage.runType ? ` · ${stage.runType}` : ""}
                  {stage.runId ? ` · ${stage.runId.slice(0, 8)}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function formatStageStatus(status: ForecastPipelineStage["status"]) {
  if (status === "waiting_credentials") {
    return "Waiting credentials";
  }
  if (status === "ready") {
    return "Ready";
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatSnapshotTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown time";
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(date);
}

function stageTone(stage: ForecastPipelineStage) {
  switch (stage.status) {
    case "ready":
      return {
        border: "rgba(22, 163, 74, 0.24)",
        background: "#f0fdf4",
        badgeBackground: "#dcfce7",
        badgeColor: "#166534",
        progress: "#16a34a",
      };
    case "running":
      return {
        border: "rgba(37, 99, 235, 0.24)",
        background: "var(--color-signal-blue-surface)",
        badgeBackground: "rgba(37, 99, 235, 0.14)",
        badgeColor: "var(--color-signal-blue-strong)",
        progress: "#2563eb",
      };
    case "queued":
      return {
        border: "rgba(15, 23, 42, 0.12)",
        background: "var(--color-panel-soft)",
        badgeBackground: "rgba(15, 23, 42, 0.08)",
        badgeColor: "var(--color-ink-700)",
        progress: "#475569",
      };
    case "blocked":
    case "waiting_credentials":
      return {
        border: "rgba(217, 119, 6, 0.24)",
        background: "#fffbeb",
        badgeBackground: "#fef3c7",
        badgeColor: "#92400e",
        progress: "#d97706",
      };
    case "failed":
    default:
      return {
        border: "rgba(220, 38, 38, 0.24)",
        background: "#fef2f2",
        badgeBackground: "#fee2e2",
        badgeColor: "#b91c1c",
        progress: "#dc2626",
      };
  }
}
