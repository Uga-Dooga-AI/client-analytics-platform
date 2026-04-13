"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  normalizeFiltersForPath,
  parseDashboardSearchParams,
  serializeDashboardFilters,
} from "@/lib/dashboard-filters";

const NAV_ITEMS = [
  {
    label: "Overview",
    href: "/overview",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    label: "Experiments",
    href: "/experiments",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 2V7L2 13h12L10 7V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 2h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Funnels",
    href: "/funnels",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 3h12l-4 5v5l-4-2V8L2 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Cohorts",
    href: "/cohorts",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="11" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M1 14c0-2.21 2.239-4 5-4s5 1.79 5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M11 10c1.657 0 3 1.343 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Forecasts",
    href: "/forecasts",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 12L6 7l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 4h2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Acquisition",
    href: "/acquisition",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 12.5V3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M2 12.5H13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4.5 10l2.5-2.5 2 1.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const BOTTOM_ITEMS = [
  {
    label: "Access",
    href: "/access",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Settings",
    href: "/settings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function Sidebar() {
  return (
    <Suspense fallback={<SidebarFrame />}>
      <SidebarContent />
    </Suspense>
  );
}

function SidebarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = normalizeFiltersForPath(parseDashboardSearchParams(searchParams, pathname), pathname);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  function hrefWithFilters(href: string) {
    const normalized = normalizeFiltersForPath(filters, href);
    return `${href}?${serializeDashboardFilters(normalized).toString()}`;
  }

  return <SidebarFrame renderLinks={(activeHref) => hrefWithFilters(activeHref)} isActive={isActive} />;
}

function SidebarFrame({
  renderLinks,
  isActive,
}: {
  renderLinks?: (href: string) => string;
  isActive?: (href: string) => boolean;
}) {
  return (
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
      <div
        style={{
          padding: "24px 20px 20px",
          borderBottom: "1px solid var(--color-border-soft)",
        }}
      >
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
            color: "var(--color-ink-500)",
            marginTop: 2,
          }}
        >
          Client Platform
        </span>
      </div>

      <nav style={{ flex: 1, padding: "12px 8px" }}>
        {NAV_ITEMS.map((item) => {
          const active = isActive?.(item.href) ?? false;
          return (
            <Link
              key={item.href}
              href={renderLinks?.(item.href) ?? item.href}
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
              <span style={{ opacity: active ? 1 : 0.65 }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: "12px 8px", borderTop: "1px solid var(--color-border-soft)" }}>
        {BOTTOM_ITEMS.map((item) => {
          const active = isActive?.(item.href) ?? false;
          return (
            <Link
              key={item.href}
              href={renderLinks?.(item.href) ?? item.href}
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
              <span style={{ opacity: active ? 1 : 0.65 }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            marginTop: 8,
            borderRadius: 8,
            backgroundColor: "var(--color-panel-soft)",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              backgroundColor: "var(--color-signal-blue)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>A</span>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-900)" }}>
              Analyst
            </div>
            <div style={{ fontSize: 11, color: "var(--color-ink-500)" }}>admin</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
