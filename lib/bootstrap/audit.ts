import { writeBootstrapAuditEvent } from "@/lib/auth/store";

export type BootstrapAuditEvent =
  | "bootstrap_attempt"
  | "bootstrap_success"
  | "bootstrap_failure"
  | "bootstrap_blocked";

/**
 * Writes a bootstrap audit event to the shared audit log.
 * Errors are swallowed to avoid disrupting the main request flow —
 * the audit is best-effort but should not fail the bootstrap.
 */
export async function logBootstrapEvent(
  event: BootstrapAuditEvent,
  ip: string,
  options?: { email?: string; reason?: string }
): Promise<void> {
  try {
    await writeBootstrapAuditEvent({
      event,
      ip,
      email: options?.email,
      reason: options?.reason,
    });
    console.log(`[BOOTSTRAP_AUDIT] ${JSON.stringify({ event, ip, reason: options?.reason })}`);
  } catch (err) {
    console.error("[BOOTSTRAP_AUDIT] Failed to write audit log:", err);
  }
}
