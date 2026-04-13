"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import type { UserRole } from "@/lib/auth/types";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "analyst", label: "Analyst" },
  { value: "ab_analyst", label: "A/B Analyst" },
  { value: "viewer", label: "Viewer" },
];

export default function PreAddUserPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("analyst");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");
      const token = await user.getIdToken();

      const res = await fetch("/api/admin/users/pre-add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email, role }),
      });

      if (res.status === 409) {
        throw new Error("Пользователь с таким email уже существует");
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Ошибка при добавлении");
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div style={{ padding: 32, maxWidth: 480 }}>
        <div
          style={{
            padding: "24px",
            borderRadius: 12,
            backgroundColor: "#f0fdf4",
            border: "1px solid #bbf7d0",
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: "#15803d", marginBottom: 6 }}>
            Пользователь добавлен
          </div>
          <div style={{ fontSize: 14, color: "#166534", lineHeight: 1.5 }}>
            <strong>{email}</strong> получит доступ с ролью <strong>{role}</strong> при первом входе без ожидания одобрения.
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => { setSuccess(false); setEmail(""); setRole("analyst"); }}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1.5px solid var(--color-border-strong)",
              background: "none",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              color: "var(--color-ink-700)",
            }}
          >
            Добавить ещё
          </button>
          <button
            onClick={() => router.push("/admin/users")}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              backgroundColor: "var(--color-signal-blue)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            К списку пользователей
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 480 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <button
          onClick={() => router.push("/admin/users")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontSize: 13,
            color: "var(--color-ink-500)",
            marginBottom: 12,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Пользователи
        </button>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--color-ink-950)",
            letterSpacing: "-0.01em",
            margin: 0,
          }}
        >
          Добавить пользователя
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-ink-500)", margin: "4px 0 0", lineHeight: 1.5 }}>
          Пользователь получит доступ без ожидания одобрения при первом входе.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: "var(--color-panel-base)",
          border: "1px solid var(--color-border-soft)",
          borderRadius: 12,
          padding: 24,
        }}
      >
        {/* Email */}
        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-ink-700)",
              marginBottom: 6,
            }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 8,
              border: "1.5px solid var(--color-border-strong)",
              backgroundColor: "var(--color-panel-base)",
              fontSize: 14,
              color: "var(--color-ink-900)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Role */}
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-ink-700)",
              marginBottom: 6,
            }}
          >
            Роль
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 8,
              border: "1.5px solid var(--color-border-strong)",
              backgroundColor: "var(--color-panel-base)",
              fontSize: 14,
              color: "var(--color-ink-900)",
              outline: "none",
              boxSizing: "border-box",
            }}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {error && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              fontSize: 13,
              color: "#991b1b",
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            onClick={() => router.push("/admin/users")}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 8,
              border: "1.5px solid var(--color-border-strong)",
              background: "none",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              color: "var(--color-ink-700)",
            }}
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={loading || !email}
            style={{
              flex: 2,
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              backgroundColor: loading || !email ? "var(--color-panel-soft)" : "var(--color-signal-blue)",
              color: loading || !email ? "var(--color-ink-500)" : "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading || !email ? "not-allowed" : "pointer",
              letterSpacing: "-0.01em",
            }}
          >
            {loading ? "Добавляем…" : "Добавить пользователя"}
          </button>
        </div>
      </form>
    </div>
  );
}
