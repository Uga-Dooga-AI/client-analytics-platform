"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";

type RequestStatus = "idle" | "submitting" | "submitted" | "rejected";

export default function AccessRequestPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleRequest() {
    if (!user) return;
    setStatus("submitting");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.status === 409) {
        setStatus("submitted");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Не удалось отправить запрос");
      }

      setStatus("submitted");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Ошибка");
      setStatus("idle");
    }
  }

  async function handleSignOut() {
    await fetch("/api/auth/session", { method: "DELETE" });
    router.replace("/login");
  }

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "20px 0", color: "var(--color-ink-500)", fontSize: 14 }}>
        Загрузка…
      </div>
    );
  }

  return (
    <>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "var(--color-ink-950)",
          margin: "0 0 8px",
          letterSpacing: "-0.01em",
        }}
      >
        Запросить доступ
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "var(--color-ink-500)",
          margin: "0 0 24px",
          lineHeight: 1.5,
        }}
      >
        Ваш аккаунт ожидает одобрения. Отправьте запрос администратору.
      </p>

      {/* User info */}
      {user && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderRadius: 10,
            backgroundColor: "var(--color-panel-soft)",
            border: "1px solid var(--color-border-soft)",
            marginBottom: 20,
          }}
        >
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt=""
              width={36}
              height={36}
              style={{ borderRadius: "50%", flexShrink: 0 }}
            />
          ) : (
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
                {user.email?.[0]?.toUpperCase() ?? "?"}
              </span>
            </div>
          )}
          <div>
            {user.displayName && (
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-900)" }}>
                {user.displayName}
              </div>
            )}
            <div style={{ fontSize: 12, color: "var(--color-ink-500)" }}>{user.email}</div>
          </div>
        </div>
      )}

      {status === "submitted" && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: 10,
            backgroundColor: "#f0fdf4",
            border: "1px solid #bbf7d0",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#15803d",
              marginBottom: 4,
            }}
          >
            Запрос отправлен
          </div>
          <div style={{ fontSize: 13, color: "#166534", lineHeight: 1.5 }}>
            Администратор получит уведомление и одобрит ваш доступ. После одобрения войдите снова.
          </div>
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            fontSize: 13,
            color: "#991b1b",
            marginBottom: 16,
          }}
        >
          {errorMsg}
        </div>
      )}

      {status !== "submitted" && (
        <button
          onClick={handleRequest}
          disabled={status === "submitting"}
          style={{
            width: "100%",
            padding: "11px 16px",
            borderRadius: 8,
            border: "none",
            backgroundColor:
              status === "submitting"
                ? "var(--color-panel-soft)"
                : "var(--color-signal-blue)",
            color: status === "submitting" ? "var(--color-ink-500)" : "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: status === "submitting" ? "not-allowed" : "pointer",
            letterSpacing: "-0.01em",
            marginBottom: 12,
          }}
        >
          {status === "submitting" ? "Отправляем…" : "Запросить доступ"}
        </button>
      )}

      <button
        onClick={handleSignOut}
        style={{
          width: "100%",
          padding: "10px 16px",
          borderRadius: 8,
          border: "1.5px solid var(--color-border-strong)",
          backgroundColor: "transparent",
          color: "var(--color-ink-700)",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          letterSpacing: "-0.01em",
        }}
      >
        Выйти
      </button>
    </>
  );
}
