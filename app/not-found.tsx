import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "var(--color-ivory-base)",
        textAlign: "center",
        padding: "0 24px",
      }}
    >
      <div
        style={{
          fontSize: 72,
          fontWeight: 700,
          color: "var(--color-border-strong)",
          lineHeight: 1,
          marginBottom: 16,
        }}
      >
        404
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--color-ink-950)",
          marginBottom: 8,
        }}
      >
        Page not found
      </div>
      <div
        style={{
          fontSize: 14,
          color: "var(--color-ink-500)",
          marginBottom: 32,
          maxWidth: 340,
        }}
      >
        The page you are looking for does not exist or has been moved.
      </div>
      <Link
        href="/overview"
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "9px 20px",
          borderRadius: 8,
          backgroundColor: "var(--color-signal-blue)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Go to Overview
      </Link>
    </div>
  );
}
