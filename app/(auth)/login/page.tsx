"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
const DEMO_ACCESS_ENABLED = process.env.NEXT_PUBLIC_DEMO_ACCESS_ENABLED === "true";

function describeGoogleSignInError(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    switch (error.code) {
      case "auth/popup-closed-by-user":
        return "Вход отменён до завершения Google-авторизации.";
      case "auth/popup-blocked":
        return "Браузер заблокировал окно входа. Разрешите pop-up и попробуйте снова.";
      case "auth/operation-not-allowed":
        return "Google provider не включён в Firebase Auth для этого проекта.";
      default:
        break;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Не удалось выполнить вход через Google.";
}

function LoginContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const runtimeError = searchParams.get("error");
  const callbackUrl = useMemo(
    () => searchParams.get("callbackUrl") ?? "/overview",
    [searchParams]
  );

  async function handleGoogleSignIn() {
    setLoading(true);
    setClientError(null);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      const credential = await signInWithPopup(auth, provider);
      const idToken = await credential.user.getIdToken();
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, callbackUrl }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirectTo?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Не удалось создать сессию приложения.");
      }

      window.location.href = payload.redirectTo ?? callbackUrl;
    } catch (error) {
      setClientError(describeGoogleSignInError(error));
      setLoading(false);
    }
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
        Войти
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "var(--color-ink-500)",
          margin: "0 0 28px",
          lineHeight: 1.5,
        }}
      >
        Войдите с корпоративным Google-аккаунтом, чтобы получить доступ к платформе.
      </p>

      <button
        onClick={handleGoogleSignIn}
        disabled={loading}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "11px 16px",
          borderRadius: 8,
          border: "1.5px solid var(--color-border-strong)",
          backgroundColor: loading ? "var(--color-panel-soft)" : "var(--color-panel-base)",
          color: "var(--color-ink-900)",
          fontSize: 14,
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          letterSpacing: "-0.01em",
          transition: "background-color 120ms ease",
        }}
      >
        {loading ? (
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: "2px solid var(--color-border-strong)",
              borderTopColor: "var(--color-signal-blue)",
              display: "inline-block",
              animation: "spin 0.7s linear infinite",
            }}
          />
        ) : (
          <GoogleIcon />
        )}
        {loading ? "Входим…" : "Войти через Google"}
      </button>

      {DEMO_ACCESS_ENABLED ? (
        <Link
          href={callbackUrl}
          style={{
            marginTop: 10,
            width: "100%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "11px 16px",
            borderRadius: 8,
            border: "1.5px solid var(--color-border-strong)",
            backgroundColor: "var(--color-panel-base)",
            color: "var(--color-ink-900)",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
            letterSpacing: "-0.01em",
            boxSizing: "border-box",
          }}
        >
          Открыть demo workspace
        </Link>
      ) : null}

      {(runtimeError || clientError) && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 14px",
            borderRadius: 8,
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            fontSize: 13,
            color: "#991b1b",
            lineHeight: 1.5,
          }}
        >
          {clientError ?? runtimeError}
        </div>
      )}

      {DEMO_ACCESS_ENABLED ? (
        <div
          style={{
            marginTop: 16,
            padding: "12px 14px",
            borderRadius: 8,
            backgroundColor: "#fef3c7",
            border: "1px solid #fde68a",
            fontSize: 13,
            color: "#78350f",
            lineHeight: 1.5,
          }}
        >
          Demo access включён. Можно зайти в продукт без Google-логина и посмотреть весь интерфейс в review-режиме.
        </div>
      ) : null}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
