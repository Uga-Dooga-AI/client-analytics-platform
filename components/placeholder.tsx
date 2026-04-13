import Link from "next/link";

type PlaceholderState = "coming-soon" | "not-connected" | "waiting" | "action-required";

interface PlaceholderCTA {
  label: string;
  href: string;
}

interface PlaceholderProps {
  state: PlaceholderState;
  title: string;
  description?: string;
  cta?: PlaceholderCTA;
}

const STATE_CONFIG: Record<
  PlaceholderState,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  "coming-soon": {
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
  "not-connected": {
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
  waiting: {
    label: "Waiting on data",
    color: "var(--color-ink-500)",
    bg: "var(--color-panel-soft)",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 6v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="14" r="0.75" fill="currentColor" />
      </svg>
    ),
  },
  "action-required": {
    label: "Action required",
    color: "var(--color-danger)",
    bg: "#fee2e2",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L1 17h18L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10 8v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="14.5" r="0.75" fill="currentColor" />
      </svg>
    ),
  },
};

export function Placeholder({ state, title, description, cta }: PlaceholderProps) {
  const cfg = STATE_CONFIG[state];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 240,
        borderRadius: 12,
        border: "1.5px dashed var(--color-border-strong)",
        backgroundColor: "var(--color-panel-base)",
        padding: "40px 48px",
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
          marginBottom: description ? 8 : 0,
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
            marginBottom: cta ? 20 : 0,
          }}
        >
          {description}
        </div>
      )}

      {cta && (
        <Link
          href={cta.href}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "8px 16px",
            borderRadius: 8,
            backgroundColor: "var(--color-signal-blue)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            transition: "background-color 120ms ease",
          }}
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
