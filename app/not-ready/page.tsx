import Link from "next/link";

export default function NotReadyPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--color-ivory-base)",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          textAlign: "center",
          padding: "0 24px",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            backgroundColor: "var(--color-panel-soft)",
            border: "1.5px solid var(--color-border-strong)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
            color: "var(--color-ink-500)",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="11.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M14 9v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--color-ink-400)",
            marginBottom: 12,
          }}
        >
          Not yet available
        </div>

        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: "var(--color-ink-950)",
            margin: "0 0 12px",
            letterSpacing: "-0.02em",
          }}
        >
          This section is coming soon
        </h1>

        <p
          style={{
            fontSize: 15,
            color: "var(--color-ink-500)",
            lineHeight: 1.6,
            margin: "0 0 32px",
          }}
        >
          This part of the platform is not yet implemented or is waiting on data connections to be configured.
        </p>

        <Link
          href="/overview"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            borderRadius: 8,
            backgroundColor: "var(--color-signal-blue)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
            letterSpacing: "-0.01em",
          }}
        >
          Back to Overview
        </Link>
      </div>
    </div>
  );
}
