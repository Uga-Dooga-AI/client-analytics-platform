export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--color-ivory-base)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
        }}
      >
        {/* Wordmark */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 22,
              color: "var(--color-ink-950)",
              letterSpacing: "-0.01em",
            }}
          >
            Analytics
          </span>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--color-ink-500)",
              marginTop: 4,
            }}
          >
            Client Platform
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--color-panel-base)",
            borderRadius: 16,
            border: "1px solid var(--color-border-soft)",
            padding: "32px",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
