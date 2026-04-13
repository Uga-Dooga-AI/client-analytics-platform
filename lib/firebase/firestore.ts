import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./admin";
import type { UserRole } from "@/lib/auth/types";

// ─── Document types ───────────────────────────────────────────────────────────

export interface UserDoc {
  uid: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  approved: boolean;
  preAdded: boolean;
  addedBy: string | null;
  createdAt: Timestamp;
  lastLoginAt: Timestamp | null;
}

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export interface AccessRequestDoc {
  requestId: string;
  uid: string;
  email: string;
  displayName: string | null;
  status: AccessRequestStatus;
  requestedAt: Timestamp;
  resolvedAt: Timestamp | null;
  resolvedBy: string | null;
  assignedRole: UserRole | null;
}

export type AuditAction =
  | "role_assigned"
  | "role_changed"
  | "access_approved"
  | "access_rejected"
  | "user_pre_added"
  | "user_removed";

export interface AuditLogDoc {
  logId: string;
  timestamp: Timestamp;
  actorUid: string;
  actorEmail: string;
  targetUid: string | null;
  targetEmail: string;
  action: AuditAction;
  oldRole: UserRole | null;
  newRole: UserRole | null;
}

// ─── Collection refs ──────────────────────────────────────────────────────────

const usersCol = () => adminDb.collection("users");
const requestsCol = () => adminDb.collection("access_requests");
const auditCol = () => adminDb.collection("audit_log");

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await usersCol().doc(uid).get();
  return snap.exists ? (snap.data() as UserDoc) : null;
}

export async function getUserDocByEmail(email: string): Promise<UserDoc | null> {
  const snap = await usersCol().where("email", "==", email).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].data() as UserDoc;
}

export async function upsertUserDoc(
  uid: string,
  data: Partial<UserDoc>
): Promise<void> {
  await usersCol().doc(uid).set(data, { merge: true });
}

export async function createUserDoc(doc: UserDoc): Promise<void> {
  await usersCol().doc(doc.uid).set(doc);
}

export async function hasSuperAdmin(): Promise<boolean> {
  const snap = await usersCol()
    .where("role", "==", "super_admin")
    .where("approved", "==", true)
    .limit(1)
    .get();
  return !snap.empty;
}

// ─── Access requests ──────────────────────────────────────────────────────────

export async function getAccessRequest(
  requestId: string
): Promise<AccessRequestDoc | null> {
  const snap = await requestsCol().doc(requestId).get();
  return snap.exists ? (snap.data() as AccessRequestDoc) : null;
}

export async function createAccessRequest(
  doc: AccessRequestDoc
): Promise<void> {
  await requestsCol().doc(doc.requestId).set(doc);
}

export async function updateAccessRequest(
  requestId: string,
  data: Partial<AccessRequestDoc>
): Promise<void> {
  await requestsCol().doc(requestId).update(data);
}

// ─── Audit log ────────────────────────────────────────────────────────────────

export async function writeAuditLog(
  entry: Omit<AuditLogDoc, "logId" | "timestamp">
): Promise<void> {
  const ref = auditCol().doc();
  const doc: AuditLogDoc = {
    ...entry,
    logId: ref.id,
    timestamp: Timestamp.now(),
  };
  await ref.set(doc);
}

// ─── Server timestamp helper ──────────────────────────────────────────────────

export { FieldValue, Timestamp };
