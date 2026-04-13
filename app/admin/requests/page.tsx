"use client";

import { useEffect, useState } from "react";
import type { UserRole } from "@/lib/auth/types";

interface AccessRequest {
  id: string;
  requestId: string;
  uid: string;
  email: string;
  displayName: string | null;
  status: "pending" | "approved" | "rejected";
  requestedAt?: { _seconds: number } | null;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "analyst", label: "Analyst" },
  { value: "ab_analyst", label: "A/B Analyst" },
  { value: "admin", label: "Admin" },
  { value: "viewer", label: "Viewer" },
];

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approveModal, setApproveModal] = useState<{ requestId: string; email: string } | null>(null);
  const [approveRole, setApproveRole] = useState<UserRole>("analyst");
  const [rejectConfirm, setRejectConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  async function fetchRequests() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/requests?status=pending", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load requests");
      const data = await res.json();
      setRequests(data.requests);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRequests(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApprove() {
    if (!approveModal) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/requests/${approveModal.requestId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: approveRole }),
      });
      if (!res.ok) throw new Error("Approve failed");
      setRequests((prev) => prev.filter((r) => r.requestId !== approveModal.requestId));
      setApproveModal(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject(requestId: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/reject`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Reject failed");
      setRequests((prev) => prev.filter((r) => r.requestId !== requestId));
      setRejectConfirm(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setActionLoading(false);
    }
  }

  function formatDate(ts: { _seconds: number } | null | undefined) {
    if (!ts) return "—";
    return new Date(ts._seconds * 1000).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div style={{ padding: 32, maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--color-ink-950)",
            letterSpacing: "-0.01em",
            margin: 0,
          }}
        >
          Запросы на доступ
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-ink-500)", margin: "4px 0 0" }}>
          Ожидающие одобрения: {loading ? "…" : requests.length}
        </p>
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

      {/* List */}
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
        ) : requests.length === 0 ? (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              color: "var(--color-ink-500)",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <div style={{ fontWeight: 600, color: "var(--color-ink-700)", marginBottom: 4 }}>
              Нет ожидающих запросов
            </div>
            <div>Все запросы обработаны.</div>
          </div>
        ) : (
          requests.map((req, idx) => (
            <div
              key={req.id}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom:
                  idx < requests.length - 1
                    ? "1px solid var(--color-border-soft)"
                    : "none",
                gap: 16,
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  backgroundColor: "var(--color-signal-blue)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>
                  {(req.displayName ?? req.email)[0].toUpperCase()}
                </span>
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                {req.displayName && (
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-900)" }}>
                    {req.displayName}
                  </div>
                )}
                <div style={{ fontSize: 13, color: "var(--color-ink-500)" }}>{req.email}</div>
                <div style={{ fontSize: 11, color: "var(--color-ink-500)", marginTop: 2 }}>
                  Запрошен: {formatDate(req.requestedAt)}
                </div>
              </div>

              {/* Actions */}
              {rejectConfirm === req.requestId ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "var(--color-ink-700)" }}>Отклонить?</span>
                  <button
                    onClick={() => handleReject(req.requestId)}
                    disabled={actionLoading}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 7,
                      border: "none",
                      backgroundColor: "var(--color-danger)",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Да
                  </button>
                  <button
                    onClick={() => setRejectConfirm(null)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 7,
                      border: "1px solid var(--color-border-strong)",
                      background: "none",
                      fontSize: 13,
                      cursor: "pointer",
                      color: "var(--color-ink-500)",
                    }}
                  >
                    Нет
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setRejectConfirm(req.requestId)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 7,
                      border: "1.5px solid var(--color-border-strong)",
                      background: "none",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      color: "var(--color-ink-700)",
                    }}
                  >
                    Отклонить
                  </button>
                  <button
                    onClick={() => {
                      setApproveModal({ requestId: req.requestId, email: req.email });
                      setApproveRole("analyst");
                    }}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 7,
                      border: "none",
                      backgroundColor: "var(--color-signal-blue)",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Одобрить
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Approve modal */}
      {approveModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setApproveModal(null);
          }}
        >
          <div
            style={{
              backgroundColor: "var(--color-panel-base)",
              borderRadius: 16,
              padding: 28,
              width: 380,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h3
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--color-ink-950)",
                margin: "0 0 6px",
              }}
            >
              Одобрить доступ
            </h3>
            <p style={{ fontSize: 13, color: "var(--color-ink-500)", margin: "0 0 20px", lineHeight: 1.5 }}>
              {approveModal.email}
            </p>

            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--color-ink-700)",
                marginBottom: 6,
              }}
            >
              Назначить роль
            </label>
            <select
              value={approveRole}
              onChange={(e) => setApproveRole(e.target.value as UserRole)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1.5px solid var(--color-border-strong)",
                backgroundColor: "var(--color-panel-base)",
                fontSize: 14,
                color: "var(--color-ink-900)",
                marginBottom: 20,
                boxSizing: "border-box",
              }}
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setApproveModal(null)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 8,
                  border: "1.5px solid var(--color-border-strong)",
                  background: "none",
                  fontSize: 14,
                  cursor: "pointer",
                  color: "var(--color-ink-700)",
                }}
              >
                Отмена
              </button>
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                style={{
                  flex: 2,
                  padding: "10px",
                  borderRadius: 8,
                  border: "none",
                  backgroundColor: actionLoading ? "var(--color-panel-soft)" : "var(--color-signal-blue)",
                  color: actionLoading ? "var(--color-ink-500)" : "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: actionLoading ? "not-allowed" : "pointer",
                }}
              >
                {actionLoading ? "Одобряем…" : "Одобрить доступ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
