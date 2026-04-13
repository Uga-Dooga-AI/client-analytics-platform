"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface AuditEntry {
  id: string;
  timestamp?: { _seconds: number } | null;
  actorEmail: string;
  targetEmail: string | null;
  action: string;
  oldRole: string | null;
  newRole: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  role_assigned: "Роль назначена",
  role_changed: "Роль изменена",
  access_approved: "Доступ одобрен",
  access_rejected: "Доступ отклонён",
  user_pre_added: "Пользователь добавлен",
  user_removed: "Пользователь удалён",
};

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  role_assigned: { bg: "#dbeafe", color: "#1d4ed8" },
  role_changed: { bg: "#fef3c7", color: "#92400e" },
  access_approved: { bg: "#dcfce7", color: "#15803d" },
  access_rejected: { bg: "#fef2f2", color: "#991b1b" },
  user_pre_added: { bg: "#ede9fe", color: "#5b21b6" },
  user_removed: { bg: "#fef2f2", color: "#991b1b" },
};

const ACTION_ICONS: Record<string, string> = {
  role_assigned: "🏷",
  role_changed: "🔄",
  access_approved: "✓",
  access_rejected: "✕",
  user_pre_added: "➕",
  user_removed: "🗑",
};

const ALL_ACTIONS = Object.keys(ACTION_LABELS);

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextAfter, setNextAfter] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchEntries = useCallback(
    async (cursor?: string | null, append = false) => {
      if (!append) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const params = new URLSearchParams({ limit: "50" });
        if (actionFilter !== "all") params.set("action", actionFilter);
        if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
        if (dateTo) {
          const end = new Date(dateTo);
          end.setHours(23, 59, 59, 999);
          params.set("to", end.toISOString());
        }
        if (cursor) params.set("after", cursor);

        const res = await fetch(`/api/admin/audit?${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load audit log");

        const data = await res.json();

        if (append) {
          setEntries((prev) => [...prev, ...data.entries]);
        } else {
          setEntries(data.entries);
        }
        setNextAfter(data.nextAfter ?? null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [actionFilter, dateFrom, dateTo]
  );

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Infinite scroll observer
  useEffect(() => {
    if (!nextAfter || loadingMore) return;
    const el = bottomRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fetchEntries(nextAfter, true);
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextAfter, loadingMore, fetchEntries]);

  function formatDate(ts: { _seconds: number } | null | undefined) {
    if (!ts) return "—";
    return new Date(ts._seconds * 1000).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div style={{ padding: 32, maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--color-ink-950)",
            letterSpacing: "-0.01em",
            margin: 0,
          }}
        >
          Audit Trail
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-ink-500)", margin: "4px 0 0" }}>
          История изменений ролей и доступа
        </p>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1.5px solid var(--color-border-strong)",
            backgroundColor: "var(--color-panel-base)",
            fontSize: 13,
            color: "var(--color-ink-900)",
          }}
        >
          <option value="all">Все действия</option>
          {ALL_ACTIONS.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a]}</option>
          ))}
        </select>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--color-ink-500)" }}>с</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1.5px solid var(--color-border-strong)",
              backgroundColor: "var(--color-panel-base)",
              fontSize: 13,
              color: "var(--color-ink-900)",
            }}
          />
          <span style={{ fontSize: 13, color: "var(--color-ink-500)" }}>по</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1.5px solid var(--color-border-strong)",
              backgroundColor: "var(--color-panel-base)",
              fontSize: 13,
              color: "var(--color-ink-900)",
            }}
          />
        </div>

        {(actionFilter !== "all" || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setActionFilter("all");
              setDateFrom("");
              setDateTo("");
            }}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              border: "1.5px solid var(--color-border-strong)",
              background: "none",
              fontSize: 13,
              cursor: "pointer",
              color: "var(--color-ink-500)",
            }}
          >
            Сбросить
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            fontSize: 13,
            color: "#991b1b",
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      {/* Feed */}
      <div
        style={{
          backgroundColor: "var(--color-panel-base)",
          borderRadius: 12,
          border: "1px solid var(--color-border-soft)",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-ink-500)", fontSize: 14 }}>
            Загрузка…
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-ink-500)", fontSize: 14 }}>
            Нет записей за выбранный период
          </div>
        ) : (
          entries.map((entry, idx) => {
            const style = ACTION_COLORS[entry.action] ?? { bg: "var(--color-panel-soft)", color: "var(--color-ink-700)" };
            const icon = ACTION_ICONS[entry.action] ?? "•";
            const label = ACTION_LABELS[entry.action] ?? entry.action;
            return (
              <div
                key={entry.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "14px 20px",
                  borderBottom: idx < entries.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                }}
              >
                {/* Action badge */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: style.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 14,
                  }}
                >
                  {icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 7px",
                        borderRadius: 5,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.03em",
                        backgroundColor: style.bg,
                        color: style.color,
                      }}
                    >
                      {label}
                    </span>
                    {entry.oldRole && entry.newRole && (
                      <span style={{ fontSize: 12, color: "var(--color-ink-500)" }}>
                        {entry.oldRole} → {entry.newRole}
                      </span>
                    )}
                    {!entry.oldRole && entry.newRole && (
                      <span style={{ fontSize: 12, color: "var(--color-ink-500)" }}>
                        роль: {entry.newRole}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 13,
                      color: "var(--color-ink-700)",
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{entry.actorEmail}</span>
                    {entry.targetEmail && entry.targetEmail !== entry.actorEmail && (
                      <>
                        {" → "}
                        <span style={{ fontWeight: 500 }}>{entry.targetEmail}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Timestamp */}
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-ink-500)",
                    flexShrink: 0,
                    paddingTop: 6,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatDate(entry.timestamp)}
                </div>
              </div>
            );
          })
        )}

        {/* Infinite scroll sentinel */}
        {nextAfter && (
          <div ref={bottomRef} style={{ padding: 16, textAlign: "center" }}>
            {loadingMore ? (
              <span style={{ fontSize: 13, color: "var(--color-ink-500)" }}>Загружаем…</span>
            ) : (
              <span style={{ fontSize: 13, color: "var(--color-ink-500)" }}>Прокрутите для загрузки</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
