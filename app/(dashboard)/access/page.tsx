import { TopFilterRail } from "@/components/top-filter-rail";
import { MOCK_ACCESS_MEMBERS, MOCK_ACCESS_REQUESTS, MOCK_ROLE_MATRIX } from "@/lib/mock-data";

const ROLE_STYLE = {
  super_admin: { color: "#7c3aed", bg: "#ede9fe" },
  admin: { color: "var(--color-signal-blue)", bg: "var(--color-signal-blue-surface)" },
  analyst: { color: "var(--color-success)", bg: "#dcfce7" },
  ab_analyst: { color: "#0891b2", bg: "#cffafe" },
  viewer: { color: "var(--color-ink-500)", bg: "var(--color-panel-soft)" },
};

export default function AccessPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Access" />

      <main
        style={{
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 24,
          overflowY: "auto",
          minWidth: 0,
          flex: 1,
        }}
      >
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1,
            background: "var(--color-border-soft)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {[
            { label: "Active members", value: "2", sub: "Current platform operators" },
            { label: "Pending invites", value: "1", sub: "Client Viewer" },
            { label: "Open requests", value: "1", sub: "Needs admin action" },
            { label: "Auth mode", value: "Shell live", sub: "Provider wiring later" },
          ].map((card) => (
            <div key={card.label} style={{ background: "var(--color-panel-base)", padding: "18px 22px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-ink-500)", marginBottom: 8 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-ink-950)", lineHeight: 1 }}>{card.value}</div>
              <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 5 }}>{card.sub}</div>
            </div>
          ))}
        </section>

        <section style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Members and invited users</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Operational access shell that can later connect to Firebase auth or another identity provider</div>
            </div>
            <button
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                border: "none",
                background: "var(--color-signal-blue)",
                color: "#fff",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              Invite member
            </button>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Member", "Email", "Role", "Status", "Last active", "Scope"].map((column) => (
                  <th
                    key={column}
                    style={{
                      padding: "10px 20px",
                      textAlign: "left",
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--color-ink-500)",
                      background: "var(--color-panel-soft)",
                      borderBottom: "1px solid var(--color-border-soft)",
                    }}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_ACCESS_MEMBERS.map((member, index) => {
                const roleStyle = ROLE_STYLE[member.role];
                return (
                  <tr key={member.email} style={{ borderBottom: index < MOCK_ACCESS_MEMBERS.length - 1 ? "1px solid var(--color-border-soft)" : "none" }}>
                    <td style={{ padding: "13px 20px", fontSize: 13.5, fontWeight: 600, color: "var(--color-ink-950)" }}>{member.name}</td>
                    <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-500)" }}>{member.email}</td>
                    <td style={{ padding: "13px 20px" }}>
                      <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 6, background: roleStyle.bg, color: roleStyle.color, fontSize: 11.5, fontWeight: 600 }}>
                        {member.role}
                      </span>
                    </td>
                    <td style={{ padding: "13px 20px", fontSize: 13, color: member.status === "active" ? "var(--color-success)" : "var(--color-warning)", fontWeight: 600 }}>{member.status}</td>
                    <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-700)" }}>{member.lastActive}</td>
                    <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-700)" }}>{member.scope}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Access requests</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Founder-only tasks should appear here only when real external access is needed</div>
            </div>

            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {MOCK_ACCESS_REQUESTS.map((request) => (
                <div key={request.email} style={{ border: "1px solid var(--color-border-soft)", borderRadius: 8, padding: "14px 14px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>{request.name}</div>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: request.status === "pending" ? "var(--color-warning)" : "var(--color-success)" }}>{request.status}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 4 }}>{request.email}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10, fontSize: 11.5 }}>
                    <div>
                      <div style={{ color: "var(--color-ink-500)" }}>Role</div>
                      <div style={{ fontWeight: 600, color: "var(--color-ink-900)", marginTop: 2 }}>{request.requestedRole}</div>
                    </div>
                    <div>
                      <div style={{ color: "var(--color-ink-500)" }}>Project</div>
                      <div style={{ fontWeight: 600, color: "var(--color-ink-900)", marginTop: 2 }}>{request.project}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 10 }}>{request.requestedAt}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "var(--color-panel-base)", border: "1px solid var(--color-border-soft)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Role matrix</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>Enough for UI and workflow validation before real policy enforcement</div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Role", "Experiments", "Forecasts", "Settings", "Access"].map((column) => (
                    <th
                      key={column}
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        fontSize: 10.5,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--color-ink-500)",
                        background: "var(--color-panel-soft)",
                        borderBottom: "1px solid var(--color-border-soft)",
                      }}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_ROLE_MATRIX.map((row, index) => (
                  <tr key={row.role} style={{ borderBottom: index < MOCK_ROLE_MATRIX.length - 1 ? "1px solid var(--color-border-soft)" : "none" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--color-ink-950)" }}>{row.role}</td>
                    <td style={{ padding: "12px 16px", color: "var(--color-ink-700)", fontSize: 13 }}>{row.experiments}</td>
                    <td style={{ padding: "12px 16px", color: "var(--color-ink-700)", fontSize: 13 }}>{row.forecasts}</td>
                    <td style={{ padding: "12px 16px", color: "var(--color-ink-700)", fontSize: 13 }}>{row.settings}</td>
                    <td style={{ padding: "12px 16px", color: "var(--color-ink-700)", fontSize: 13 }}>{row.access}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
