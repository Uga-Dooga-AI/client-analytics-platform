import { TopFilterRail } from "@/components/top-filter-rail";
import { formatDateTime, formatRelativeTime } from "@/lib/dashboard-live";
import { listAccessRequests, listAuditEntries, listUsers } from "@/lib/auth/store";

export const dynamic = "force-dynamic";

const ROLE_STYLE = {
  super_admin: { color: "#7c3aed", bg: "#ede9fe" },
  admin: { color: "var(--color-signal-blue)", bg: "var(--color-signal-blue-surface)" },
  analyst: { color: "var(--color-success)", bg: "#dcfce7" },
  ab_analyst: { color: "#0891b2", bg: "#cffafe" },
  viewer: { color: "var(--color-ink-500)", bg: "var(--color-panel-soft)" },
};

const ROLE_MATRIX = [
  { role: "super_admin", experiments: "Full", forecasts: "Full", settings: "Full", access: "Full" },
  { role: "admin", experiments: "Full", forecasts: "Full", settings: "Edit", access: "Review requests" },
  { role: "analyst", experiments: "Analyze", forecasts: "View + queue", settings: "View", access: "None" },
  { role: "ab_analyst", experiments: "Analyze + compare", forecasts: "View", settings: "View", access: "None" },
  { role: "viewer", experiments: "View", forecasts: "View", settings: "View", access: "None" },
] as const;

export default async function AccessPage() {
  const [users, requests, audit] = await Promise.all([
    listUsers(),
    listAccessRequests({ status: "all" }),
    listAuditEntries({
      action: null,
      from: null,
      to: null,
      limit: 8,
      after: null,
    }),
  ]);

  const activeUsers = users.filter((user) => user.approved);
  const invitedUsers = users.filter((user) => !user.approved);
  const pendingRequests = requests.filter((request) => request.status === "pending");

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
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 1,
            background: "var(--color-border-soft)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {[
            {
              label: "Approved members",
              value: activeUsers.length.toString(),
              sub: "Real platform access records",
            },
            {
              label: "Pre-added / invited",
              value: invitedUsers.length.toString(),
              sub: "Accounts not approved yet",
            },
            {
              label: "Pending requests",
              value: pendingRequests.length.toString(),
              sub: "Needs review by admin or super-admin",
            },
            {
              label: "Recent audit events",
              value: audit.entries.length.toString(),
              sub: "Latest access-control changes in the audit log",
            },
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

        <section
          style={{
            background: "var(--color-panel-base)",
            border: "1px solid var(--color-border-soft)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Platform members</div>
            <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>
              Live auth records from the application database.
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Member", "Email", "Role", "Status", "Last activity", "Origin"].map((column) => (
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
              {users.map((user, index) => {
                const roleStyle = ROLE_STYLE[user.role];
                const statusLabel = user.approved ? "active" : user.preAdded ? "pre-added" : "pending";

                return (
                  <tr
                    key={user.id}
                    style={{
                      borderBottom: index < users.length - 1 ? "1px solid var(--color-border-soft)" : "none",
                    }}
                  >
                    <td style={{ padding: "13px 20px" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-ink-950)" }}>
                        {user.displayName ?? "Unnamed user"}
                      </div>
                      <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                        Created {formatDateTime(user.createdAt)}
                      </div>
                    </td>
                    <td style={{ padding: "13px 20px", fontSize: 13, color: "var(--color-ink-500)" }}>{user.email}</td>
                    <td style={{ padding: "13px 20px" }}>
                      <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 6, background: roleStyle.bg, color: roleStyle.color, fontSize: 11.5, fontWeight: 600 }}>
                        {user.role}
                      </span>
                    </td>
                    <td style={{ padding: "13px 20px", fontSize: 13, color: user.approved ? "var(--color-success)" : "var(--color-warning)", fontWeight: 600 }}>
                      {statusLabel}
                    </td>
                    <td style={{ padding: "13px 20px", fontSize: 12, color: "var(--color-ink-700)" }}>
                      <div>{formatDateTime(user.lastLoginAt)}</div>
                      <div style={{ marginTop: 2, color: "var(--color-ink-500)" }}>{formatRelativeTime(user.lastLoginAt)}</div>
                    </td>
                    <td style={{ padding: "13px 20px", fontSize: 12, color: "var(--color-ink-700)" }}>
                      {user.preAdded ? "Admin pre-add" : user.authUid ? "Google login" : "Manual shell"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div
            style={{
              background: "var(--color-panel-base)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Access requests</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>
                Real request queue from the current auth database.
              </div>
            </div>

            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {requests.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--color-ink-500)" }}>No access requests recorded yet.</div>
              ) : (
                requests.map((request) => (
                  <div key={request.requestId} style={{ border: "1px solid var(--color-border-soft)", borderRadius: 8, padding: "14px 14px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-950)" }}>
                        {request.displayName ?? "Unnamed requester"}
                      </div>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: request.status === "pending" ? "var(--color-warning)" : "var(--color-success)" }}>
                        {request.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 4 }}>{request.email}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10, fontSize: 11.5 }}>
                      <div>
                        <div style={{ color: "var(--color-ink-500)" }}>Requested role</div>
                        <div style={{ fontWeight: 600, color: "var(--color-ink-900)", marginTop: 2 }}>
                          {request.assignedRole ?? "Not assigned yet"}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "var(--color-ink-500)" }}>Requested at</div>
                        <div style={{ fontWeight: 600, color: "var(--color-ink-900)", marginTop: 2 }}>
                          {formatDateTime(request.requestedAt)}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--color-ink-500)", marginTop: 10 }}>
                      {request.resolvedAt
                        ? `Resolved ${formatDateTime(request.resolvedAt)}`
                        : "Still waiting for resolution"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: 20 }}>
            <div
              style={{
                background: "var(--color-panel-base)",
                border: "1px solid var(--color-border-soft)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Role matrix</div>
                <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>
                  Static authorization policy for the live platform.
                </div>
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
                  {ROLE_MATRIX.map((row, index) => (
                    <tr key={row.role} style={{ borderBottom: index < ROLE_MATRIX.length - 1 ? "1px solid var(--color-border-soft)" : "none" }}>
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

            <div
              style={{
                background: "var(--color-panel-base)",
                border: "1px solid var(--color-border-soft)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-soft)" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-950)" }}>Audit trail</div>
                <div style={{ fontSize: 12, color: "var(--color-ink-500)", marginTop: 2 }}>
                  Latest role and access mutations from the audit log.
                </div>
              </div>

              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                {audit.entries.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--color-ink-500)" }}>No audit events recorded yet.</div>
                ) : (
                  audit.entries.map((entry) => (
                    <div key={entry.logId} style={{ border: "1px solid var(--color-border-soft)", borderRadius: 8, padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-ink-950)" }}>
                          {entry.action ?? "unknown_action"}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--color-ink-500)" }}>
                          {formatDateTime(entry.timestamp)}
                        </div>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--color-ink-700)" }}>
                        {entry.actorEmail ?? "Unknown actor"} → {entry.targetEmail ?? "Unknown target"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--color-ink-500)" }}>
                        {entry.oldRole ?? "—"} → {entry.newRole ?? "—"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
