"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { UserRole } from "@/lib/auth/types";

interface UserRecord {
  id: string;
  uid: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  approved: boolean;
  preAdded?: boolean;
  createdAt?: { _seconds: number } | null;
}

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  analyst: "Analyst",
  ab_analyst: "A/B Analyst",
  viewer: "Viewer",
};

const ROLE_COLORS: Record<UserRole, { bg: string; color: string }> = {
  super_admin: { bg: "#ede9fe", color: "#5b21b6" },
  admin: { bg: "#dbeafe", color: "#1d4ed8" },
  analyst: { bg: "#dcfce7", color: "#15803d" },
  ab_analyst: { bg: "#fef3c7", color: "#92400e" },
  viewer: { bg: "var(--color-panel-soft)", color: "var(--color-ink-700)" },
};

const ASSIGNABLE_ROLES: UserRole[] = ["admin", "analyst", "ab_analyst", "viewer"];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [roleEdit, setRoleEdit] = useState<{ uid: string; role: UserRole } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(data.users);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDeleteConfirm(uid: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${uid}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setUsers((prev) => prev.filter((u) => u.uid !== uid));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setActionLoading(false);
      setConfirmDelete(null);
    }
  }

  async function handleRoleChange(uid: string, newRole: UserRole) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${uid}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error("Role update failed");
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u))
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setActionLoading(false);
      setRoleEdit(null);
    }
  }

  function formatDate(ts: { _seconds: number } | null | undefined) {
    if (!ts) return "—";
    return new Date(ts._seconds * 1000).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div style={{ padding: 32, maxWidth: 960 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 28,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--color-ink-950)",
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            Пользователи
          </h1>
          <p style={{ fontSize: 14, color: "var(--color-ink-500)", margin: "4px 0 0" }}>
            Управление доступом и ролями
          </p>
        </div>
        <Link
          href="/admin/users/pre-add"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 16px",
            borderRadius: 8,
            backgroundColor: "var(--color-signal-blue)",
            color: "#fff",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          + Добавить пользователя
        </Link>
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

      {/* Table */}
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
        ) : users.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-ink-500)", fontSize: 14 }}>
            Пользователи не найдены
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-soft)" }}>
                {["Пользователь", "Роль", "Статус", "Дата добавления", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--color-ink-500)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const roleStyle = ROLE_COLORS[user.role] ?? ROLE_COLORS.viewer;
                return (
                  <tr
                    key={user.id}
                    style={{ borderBottom: "1px solid var(--color-border-soft)" }}
                  >
                    {/* User info */}
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            backgroundColor: "var(--color-signal-blue)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>
                            {(user.displayName ?? user.email)[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          {user.displayName && (
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-900)" }}>
                              {user.displayName}
                            </div>
                          )}
                          <div style={{ fontSize: 12, color: "var(--color-ink-500)" }}>{user.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td style={{ padding: "12px 16px" }}>
                      {roleEdit?.uid === user.uid ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <select
                            value={roleEdit.role}
                            onChange={(e) =>
                              setRoleEdit({ uid: user.uid, role: e.target.value as UserRole })
                            }
                            style={{
                              padding: "5px 8px",
                              borderRadius: 6,
                              border: "1.5px solid var(--color-border-strong)",
                              backgroundColor: "var(--color-panel-base)",
                              fontSize: 13,
                              color: "var(--color-ink-900)",
                            }}
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleRoleChange(user.uid, roleEdit.role)}
                            disabled={actionLoading}
                            style={{
                              padding: "5px 10px",
                              borderRadius: 6,
                              border: "none",
                              backgroundColor: "var(--color-signal-blue)",
                              color: "#fff",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            ОК
                          </button>
                          <button
                            onClick={() => setRoleEdit(null)}
                            style={{
                              padding: "5px 8px",
                              borderRadius: 6,
                              border: "1px solid var(--color-border-strong)",
                              background: "none",
                              fontSize: 12,
                              cursor: "pointer",
                              color: "var(--color-ink-500)",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 8px",
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              backgroundColor: roleStyle.bg,
                              color: roleStyle.color,
                            }}
                          >
                            {ROLE_LABELS[user.role] ?? user.role}
                          </span>
                          <button
                            onClick={() => setRoleEdit({ uid: user.uid, role: user.role })}
                            style={{
                              padding: "3px 6px",
                              borderRadius: 5,
                              border: "1px solid var(--color-border-soft)",
                              background: "none",
                              fontSize: 11,
                              cursor: "pointer",
                              color: "var(--color-ink-500)",
                            }}
                          >
                            изменить
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          backgroundColor: user.approved ? "#dcfce7" : "#fef3c7",
                          color: user.approved ? "#15803d" : "#92400e",
                        }}
                      >
                        {user.approved ? "Активен" : "Ожидает"}
                      </span>
                    </td>

                    {/* Date */}
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-ink-500)" }}>
                      {formatDate(user.createdAt)}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {confirmDelete === user.uid ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                          <span style={{ fontSize: 12, color: "var(--color-ink-700)" }}>Удалить?</span>
                          <button
                            onClick={() => handleDeleteConfirm(user.uid)}
                            disabled={actionLoading}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 6,
                              border: "none",
                              backgroundColor: "var(--color-danger)",
                              color: "#fff",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Да
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid var(--color-border-strong)",
                              background: "none",
                              fontSize: 12,
                              cursor: "pointer",
                              color: "var(--color-ink-500)",
                            }}
                          >
                            Нет
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(user.uid)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: "1px solid var(--color-border-soft)",
                            background: "none",
                            fontSize: 12,
                            cursor: "pointer",
                            color: "var(--color-ink-500)",
                          }}
                        >
                          Удалить
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
