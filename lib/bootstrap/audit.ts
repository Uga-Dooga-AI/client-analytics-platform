import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export type BootstrapAuditEvent =
  | "bootstrap_attempt"
  | "bootstrap_success"
  | "bootstrap_failure"
  | "bootstrap_blocked";

interface BootstrapAuditEntry {
  event: BootstrapAuditEvent;
  ip: string;
  email?: string;
  reason?: string;
  timestamp: FirebaseFirestore.FieldValue;
}

/**
 * Writes a bootstrap audit event to Firestore `audit_log`.
 * Errors are swallowed to avoid disrupting the main request flow —
 * the audit is best-effort but should not fail the bootstrap.
 */
export async function logBootstrapEvent(
  event: BootstrapAuditEvent,
  ip: string,
  options?: { email?: string; reason?: string }
): Promise<void> {
  const entry: BootstrapAuditEntry = {
    event,
    ip,
    timestamp: FieldValue.serverTimestamp(),
    ...(options?.email !== undefined && { email: options.email }),
    ...(options?.reason !== undefined && { reason: options.reason }),
  };

  try {
    await adminDb.collection("audit_log").add(entry);
    console.log(`[BOOTSTRAP_AUDIT] ${JSON.stringify({ event, ip, reason: options?.reason })}`);
  } catch (err) {
    console.error("[BOOTSTRAP_AUDIT] Failed to write audit log:", err);
  }
}
