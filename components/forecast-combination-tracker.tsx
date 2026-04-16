"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  projectKey: string;
  label: string;
  sourcePage: string;
  filters: Record<string, unknown>;
};

type QueueState =
  | { tone: "idle"; message: string | null }
  | { tone: "info"; message: string }
  | { tone: "warning"; message: string };

export function ForecastCombinationTracker({
  projectKey,
  label,
  sourcePage,
  filters,
}: Props) {
  const [state, setState] = useState<QueueState>({ tone: "idle", message: null });
  const body = useMemo(
    () =>
      JSON.stringify({
        label,
        sourcePage,
        filters,
      }),
    [filters, label, sourcePage]
  );

  useEffect(() => {
    if (!projectKey || projectKey === "all") {
      return;
    }

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
          return;
        }

        setState({ tone: "idle", message: null });
      })
      .catch(() => {
        if (!cancelled) {
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

  if (!state.message) {
    return null;
  }

  return (
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
  );
}
