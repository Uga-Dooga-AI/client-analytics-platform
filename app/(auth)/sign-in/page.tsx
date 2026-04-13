import Link from "next/link";

const DEMO_ACCESS_ENABLED = process.env.NEXT_PUBLIC_DEMO_ACCESS_ENABLED === "true";

export default function SignInPage() {
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
          Sign in
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--color-ink-500)",
            margin: "0 0 28px",
            lineHeight: 1.5,
          }}
        >
          Access your analytics workspace.
        </p>

        {/* Email field */}
        <div style={{ marginBottom: 16 }}>
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
            placeholder="you@example.com"
            disabled
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 8,
              border: "1.5px solid var(--color-border-strong)",
              backgroundColor: "var(--color-panel-soft)",
              fontSize: 14,
              color: "var(--color-ink-900)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Password field */}
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
            Password
          </label>
          <input
            type="password"
            placeholder="••••••••"
            disabled
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 8,
              border: "1.5px solid var(--color-border-strong)",
              backgroundColor: "var(--color-panel-soft)",
              fontSize: 14,
              color: "var(--color-ink-900)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* CTA button */}
        <button
          disabled
          style={{
            width: "100%",
            padding: "11px 16px",
            borderRadius: 8,
            border: "none",
            backgroundColor: "var(--color-signal-blue)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "not-allowed",
            opacity: 0.7,
            letterSpacing: "-0.01em",
          }}
        >
          Continue
        </button>

        {DEMO_ACCESS_ENABLED ? (
          <Link
            href="/overview"
            style={{
              marginTop: 10,
              width: "100%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "11px 16px",
              borderRadius: 8,
              border: "1px solid var(--color-border-strong)",
              backgroundColor: "var(--color-panel-base)",
              color: "var(--color-ink-900)",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              boxSizing: "border-box",
            }}
          >
            Open demo workspace
          </Link>
        ) : null}

        {/* Auth placeholder notice */}
        <div
          style={{
            marginTop: 20,
            padding: "12px 14px",
            borderRadius: 8,
            backgroundColor: "#fef3c7",
            border: "1px solid #fde68a",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#92400e",
              marginBottom: 4,
            }}
          >
            Auth not yet connected
          </div>
          <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.5 }}>
            Authentication provider is pending configuration (UGAA-1169). Form is a shell placeholder.
          </div>
          {DEMO_ACCESS_ENABLED ? (
            <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.5, marginTop: 8 }}>
              Demo access is enabled, so you can open the workspace without signing in.
            </div>
          ) : null}
        </div>
    </>
  );
}
