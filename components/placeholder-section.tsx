export function PlaceholderSection({
  title,
  description,
  status = "not_connected",
}: {
  title: string;
  description?: string;
  status?: "coming_soon" | "not_connected" | "no_data" | "not_implemented";
}) {
  const STATUS_CONFIG = {
    coming_soon: {
      label: "Coming soon",
      color: "var(--color-info)",
      bg: "#e0f2fe",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    not_connected: {
      label: "Not connected",
      color: "var(--color-warning)",
      bg: "#fef3c7",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 3L3 17h14L10 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M10 8v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="10" cy="14" r="0.75" fill="currentColor" />
        </svg>
      ),
    },
    no_data: {
      label: "Waiting on data",
      color: "var(--color-ink-500)",
      bg: "var(--color-panel-soft)",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M7 7h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    not_implemented: {
      label: "Not yet implemented",
      color: "var(--color-ink-500)",
      bg: "var(--color-panel-soft)",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="3" y="5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 10h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
        </svg>
      ),
    },
  };

  const cfg = STATUS_CONFIG[status];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 200,
        borderRadius: 12,
        border: "1.5px dashed var(--color-border-strong)",
        backgroundColor: "var(--color-panel-base)",
        padding: 40,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          backgroundColor: cfg.bg,
          color: cfg.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        {cfg.icon}
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: cfg.color,
          marginBottom: 8,
        }}
      >
        {cfg.label}
      </div>

      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--color-ink-900)",
          marginBottom: 8,
        }}
      >
        {title}
      </div>

      {description && (
        <div
          style={{
            fontSize: 14,
            color: "var(--color-ink-500)",
            maxWidth: 380,
            lineHeight: 1.6,
          }}
        >
          {description}
        </div>
      )}
    </div>
  );
}
