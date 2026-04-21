"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ComparisonConfidenceChart,
  type ComparisonConfidenceChartOverlay,
} from "@/components/comparison-confidence-chart";
import type {
  ComparisonConfidenceChartData,
  ConfidenceSeriesPoint,
} from "@/lib/data/acquisition";

const HISTORY_OVERLAY_COLORS = [
  "#d946ef",
  "#c026d3",
  "#a21caf",
  "#e879f9",
  "#db2777",
  "#f0abfc",
  "#ec4899",
  "#9333ea",
] as const;

type HistorySnapshot = {
  cutoffDay: number;
  visiblePointCount: number;
  groups: Array<{
    label: string;
    series: ConfidenceSeriesPoint[];
  }>;
};

type HistoryEvent =
  | { type: "start"; cutoffs: number[]; total: number }
  | {
      type: "progress";
      cutoffs: number[];
      completed: number;
      total: number;
      cutoffDay: number;
      snapshot: HistorySnapshot;
    }
  | { type: "complete"; cutoffs: number[]; total: number }
  | { type: "error"; message: string };

export function ForecastHistoryChart({
  chart,
  projectKey,
  historyBaseQuery,
}: {
  chart: ComparisonConfidenceChartData;
  projectKey: string;
  historyBaseQuery: string;
}) {
  const horizonDay = chart.historyHorizonDay ?? null;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cutoffs, setCutoffs] = useState<number[]>([]);
  const [progress, setProgress] = useState({
    completed: 0,
    total: 0,
    currentCutoff: null as number | null,
  });
  const [snapshotsByCutoff, setSnapshotsByCutoff] = useState<Record<number, HistorySnapshot>>({});
  const [activeCutoff, setActiveCutoff] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const completedSnapshots = useMemo(
    () =>
      cutoffs
        .map((cutoffDay) => snapshotsByCutoff[cutoffDay] ?? null)
        .filter((snapshot): snapshot is HistorySnapshot => snapshot !== null),
    [cutoffs, snapshotsByCutoff]
  );
  const latestCompletedSnapshot =
    completedSnapshots.length > 0 ? completedSnapshots[completedSnapshots.length - 1] ?? null : null;
  const activeSnapshot = activeCutoff == null ? null : snapshotsByCutoff[activeCutoff] ?? null;
  const activeSnapshotIndex = completedSnapshots.findIndex(
    (snapshot) => snapshot.cutoffDay === activeCutoff
  );

  const overlay = useMemo<ComparisonConfidenceChartOverlay | undefined>(() => {
    if (!activeSnapshot) {
      return undefined;
    }

    return {
      label: `history D${activeSnapshot.cutoffDay}`,
      bandAlpha: 0.16,
      groups: activeSnapshot.groups.map((group, index) => ({
        label: group.label,
        color: HISTORY_OVERLAY_COLORS[index % HISTORY_OVERLAY_COLORS.length],
        actualColor: HISTORY_OVERLAY_COLORS[index % HISTORY_OVERLAY_COLORS.length],
        series: group.series,
      })),
    };
  }, [activeSnapshot]);

  if (!horizonDay) {
    return <ComparisonConfidenceChart chart={chart} />;
  }

  async function buildHistory() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    setCutoffs([]);
    setProgress({ completed: 0, total: 0, currentCutoff: null });
    setSnapshotsByCutoff({});
    setActiveCutoff(null);

    try {
      const response = await fetch(
        `/api/projects/by-key/${projectKey}/forecast-history?${historyBaseQuery}&horizonDay=${horizonDay}`,
        {
          cache: "no-store",
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(
          errorPayload && typeof errorPayload.error === "string"
            ? errorPayload.error
            : `Historical forecast request failed (${response.status}).`
        );
      }

      if (!response.body) {
        throw new Error("Historical forecast stream is unavailable.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedComplete = false;
      let receivedCutoffs: number[] = [];

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

        let separatorIndex = buffer.indexOf("\n");
        while (separatorIndex >= 0) {
          const chunk = buffer.slice(0, separatorIndex).trim();
          buffer = buffer.slice(separatorIndex + 1);
          if (chunk.length > 0) {
            const event = JSON.parse(chunk) as HistoryEvent;
            if (event.type === "start") {
              receivedCutoffs = event.cutoffs;
              setCutoffs(event.cutoffs);
              setProgress({
                completed: 0,
                total: event.total,
                currentCutoff: event.cutoffs[0] ?? null,
              });
            }

            if (event.type === "progress") {
              receivedCutoffs = event.cutoffs;
              setCutoffs(event.cutoffs);
              setProgress({
                completed: event.completed,
                total: event.total,
                currentCutoff: event.cutoffDay,
              });
              setSnapshotsByCutoff((current) => ({
                ...current,
                [event.cutoffDay]: event.snapshot,
              }));
            }

            if (event.type === "complete") {
              receivedComplete = true;
              receivedCutoffs = event.cutoffs;
              setCutoffs(event.cutoffs);
              setProgress({
                completed: event.total,
                total: event.total,
                currentCutoff: event.cutoffs[event.cutoffs.length - 1] ?? null,
              });
            }

            if (event.type === "error") {
              throw new Error(event.message);
            }
          }
          separatorIndex = buffer.indexOf("\n");
        }

        if (done) {
          if (buffer.trim().length > 0) {
            const event = JSON.parse(buffer.trim()) as HistoryEvent;
            if (event.type === "error") {
              throw new Error(event.message);
            }
          }
          break;
        }
      }

      if (receivedComplete) {
        const latestCutoff = receivedCutoffs[receivedCutoffs.length - 1] ?? null;
        setActiveCutoff(latestCutoff);
      }
    } catch (requestError) {
      if (controller.signal.aborted) {
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to build historical forecast overlays."
      );
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    if (activeCutoff == null && completedSnapshots.length > 0) {
      setActiveCutoff(completedSnapshots[0]?.cutoffDay ?? null);
    }
  }, [activeCutoff, completedSnapshots]);

  const headerAccessory = isLoading ? (
    <div
      style={{
        minWidth: 280,
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid rgba(217, 70, 239, 0.18)",
        background: "rgba(250, 245, 255, 0.88)",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#a21caf" }}>
        Строим историю прогнозов
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-ink-700)" }}>
        {progress.total > 0
          ? progress.completed > 0
            ? `Готово ${progress.completed} из ${progress.total}. Последний подготовленный cutoff D${progress.currentCutoff ?? cutoffs[0] ?? "?"}.`
            : `Подготавливаем ${progress.total} historical snapshots. После завершения появится слайдер для переключения cutoff-дней.`
          : "Подготавливаем данные для historical overlay."}
      </div>
      <div
        style={{
          marginTop: 10,
          height: 6,
          borderRadius: 999,
          overflow: "hidden",
          background: "rgba(15, 23, 42, 0.08)",
        }}
      >
        <div
          style={{
            width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 12}%`,
            height: "100%",
            borderRadius: 999,
            background: "linear-gradient(90deg, #d946ef 0%, #9333ea 100%)",
          }}
        />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {cutoffs.map((cutoffDay) => {
          const isDone = Boolean(snapshotsByCutoff[cutoffDay]);
          const isCurrent = progress.currentCutoff === cutoffDay && !isDone;
          return (
            <span
              key={cutoffDay}
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 999,
                padding: "3px 8px",
                fontSize: 11,
                fontWeight: 600,
                background: isDone
                  ? "rgba(217, 70, 239, 0.18)"
                  : isCurrent
                    ? "rgba(147, 51, 234, 0.14)"
                    : "rgba(15, 23, 42, 0.06)",
                color: isDone || isCurrent ? "#86198f" : "var(--color-ink-500)",
              }}
            >
              D{cutoffDay}
            </span>
          );
        })}
      </div>
    </div>
  ) : completedSnapshots.length > 0 && activeSnapshot ? (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        borderRadius: 999,
        background: "rgba(250, 245, 255, 0.92)",
        border: "1px solid rgba(217, 70, 239, 0.18)",
        color: "#86198f",
        fontSize: 11.5,
        fontWeight: 600,
      }}
    >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: "#d946ef",
          }}
        />
      История D{activeSnapshot.cutoffDay} из D{latestCompletedSnapshot?.cutoffDay ?? activeSnapshot.cutoffDay}
    </div>
  ) : (
    <button
      type="button"
      onClick={buildHistory}
      style={{
        border: "1px solid rgba(217, 70, 239, 0.24)",
        borderRadius: 999,
        background: "rgba(250, 245, 255, 0.92)",
        color: "#86198f",
        minHeight: 34,
        padding: "0 14px",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      История прогнозов
    </button>
  );

  const footer = completedSnapshots.length > 0 ? (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "var(--color-ink-700)" }}>
          Магентовый overlay показывает, как этот же горизонт выглядел бы при фиксации прогноза на D
          {activeSnapshot?.cutoffDay ?? "?"}.
        </div>
        <div style={{ fontSize: 11.5, color: "var(--color-ink-500)" }}>
          Видимых cohort points: {activeSnapshot?.visiblePointCount ?? 0}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid rgba(217, 70, 239, 0.18)",
          background: "rgba(250, 245, 255, 0.72)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#a21caf" }}>
            История прогнозов
          </div>
          <div style={{ fontSize: 12, color: "var(--color-ink-700)" }}>
            Cutoff D{activeSnapshot?.cutoffDay ?? "?"} из {completedSnapshots.length}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => {
              const previousIndex = Math.max(activeSnapshotIndex - 1, 0);
              setActiveCutoff(completedSnapshots[previousIndex]?.cutoffDay ?? null);
            }}
            disabled={completedSnapshots.length <= 1 || activeSnapshotIndex <= 0}
            style={{
              border: "1px solid rgba(217, 70, 239, 0.24)",
              borderRadius: 999,
              background: "var(--color-panel-base)",
              color:
                completedSnapshots.length <= 1 || activeSnapshotIndex <= 0
                  ? "var(--color-ink-400)"
                  : "#86198f",
              minHeight: 32,
              padding: "0 12px",
              fontSize: 11.5,
              fontWeight: 700,
              cursor:
                completedSnapshots.length <= 1 || activeSnapshotIndex <= 0
                  ? "default"
                  : "pointer",
            }}
          >
            Назад
          </button>

          <input
            type="range"
            min={0}
            max={Math.max(completedSnapshots.length - 1, 0)}
            step={1}
            value={Math.max(activeSnapshotIndex, 0)}
            onChange={(event) => {
              const nextIndex = Number(event.target.value);
              setActiveCutoff(completedSnapshots[nextIndex]?.cutoffDay ?? null);
            }}
            disabled={completedSnapshots.length <= 1}
            style={{ width: "100%", accentColor: "#d946ef" }}
          />

          <button
            type="button"
            onClick={() => {
              const nextIndex = Math.min(
                activeSnapshotIndex + 1,
                Math.max(completedSnapshots.length - 1, 0)
              );
              setActiveCutoff(completedSnapshots[nextIndex]?.cutoffDay ?? null);
            }}
            disabled={
              completedSnapshots.length <= 1 ||
              activeSnapshotIndex >= completedSnapshots.length - 1
            }
            style={{
              border: "1px solid rgba(217, 70, 239, 0.24)",
              borderRadius: 999,
              background: "var(--color-panel-base)",
              color:
                completedSnapshots.length <= 1 ||
                activeSnapshotIndex >= completedSnapshots.length - 1
                  ? "var(--color-ink-400)"
                  : "#86198f",
              minHeight: 32,
              padding: "0 12px",
              fontSize: 11.5,
              fontWeight: 700,
              cursor:
                completedSnapshots.length <= 1 ||
                activeSnapshotIndex >= completedSnapshots.length - 1
                  ? "default"
                  : "pointer",
            }}
          >
            Вперёд
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10.5, color: "var(--color-ink-500)" }}>
          {completedSnapshots.map((snapshot) => (
            <span
              key={snapshot.cutoffDay}
              style={{
                color: snapshot.cutoffDay === activeCutoff ? "#86198f" : "var(--color-ink-500)",
                fontWeight: snapshot.cutoffDay === activeCutoff ? 700 : 500,
              }}
            >
              D{snapshot.cutoffDay}
            </span>
          ))}
        </div>
      </div>
    </div>
  ) : error ? (
    <div
      style={{
        fontSize: 12,
        color: "#b91c1c",
        background: "rgba(254, 242, 242, 0.95)",
        border: "1px solid rgba(248, 113, 113, 0.28)",
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      {error}
    </div>
  ) : null;

  return (
    <ComparisonConfidenceChart
      chart={chart}
      overlay={overlay}
      headerAccessory={headerAccessory}
      footer={footer}
    />
  );
}
