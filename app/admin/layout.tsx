"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/context";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, loading } = useAuth();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  // Guard: redirect non-admins away
  useEffect(() => {
    if (!loading && role !== "admin" && role !== "super_admin") {
      router.replace("/overview");
    }
  }, [loading, role, router]);

  // Fetch pending request count for badge
  useEffect(() => {
    if (role !== "admin" && role !== "super_admin") return;
    async function fetchCount() {
      try {
        const res = await fetch("/api/admin/requests?status=pending&countOnly=true", {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setPendingCount(data.count ?? 0);
        }
      } catch {
        // Silently ignore
      }
    }
    fetchCount();
  }, [role]);

  async function handleSignOut() {
    await fetch("/api/auth/session", { method: "DELETE" });
    router.replace("/login");
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--color-ivory-base)",
          fontSize: 14,
          color: "var(--color-ink-500)",
        }}
      >
        Загрузка…
      </div>
    );
  }

  if (role !== "admin" && role !== "super_admin") return null;

  const NAV = [
    {
      label: "Пользователи",
      href: "/admin/users",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M1 14c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M11 7h4M13 5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: "Запросы",
      href: "/admin/requests",
      badge: pendingCount ?? 0,
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 8h6M5 5.5h6M5 10.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: "Audit trail",
      href: "/admin/audit",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1v4l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 1A7 7 0 1 0 15 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: "Ops & Cost",
      href: "/admin/costs",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 13h10M4.5 10.5V7.5M8 10.5V4.5M11.5 10.5V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: "var(--color-ivory-base)",
      }}
    >
      {/* Admin sidebar */}
      <aside
        style={{
          width: 220,
          minHeight: "100vh",
          backgroundColor: "var(--color-ivory-base)",
          borderRight: "1px solid var(--color-border-soft)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px 20px 20px",
            borderBottom: "1px solid var(--color-border-soft)",
          }}
        >
          <Link href="/overview" style={{ textDecoration: "none" }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 16,
                color: "var(--color-ink-950)",
                letterSpacing: "-0.01em",
              }}
            >
              Analytics
            </span>
            <span
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-signal-blue)",
                marginTop: 2,
              }}
            >
              Admin Panel
            </span>
          </Link>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px" }}>
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderRadius: 8,
                  marginBottom: 2,
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: active ? 600 : 400,
                  color: active ? "var(--color-signal-blue)" : "var(--color-ink-700)",
                  backgroundColor: active ? "var(--color-signal-blue-surface)" : "transparent",
                  transition: "background-color 160ms ease, color 160ms ease",
                }}
              >
                <span style={{ opacity: active ? 1 : 0.65, flexShrink: 0 }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span
                    style={{
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: "var(--color-danger)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 5px",
                    }}
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: back to dashboard + sign out */}
        <div style={{ padding: "12px 8px", borderTop: "1px solid var(--color-border-soft)" }}>
          <Link
            href="/overview"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              borderRadius: 8,
              marginBottom: 2,
              textDecoration: "none",
              fontSize: 14,
              color: "var(--color-ink-700)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            К дашборду
          </Link>

          <button
            onClick={handleSignOut}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              borderRadius: 8,
              marginBottom: 2,
              background: "none",
              border: "none",
              width: "100%",
              fontSize: 14,
              color: "var(--color-ink-500)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Выйти
          </button>
        </div>
      </aside>

      {/* Content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
