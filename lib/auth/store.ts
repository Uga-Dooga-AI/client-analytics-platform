import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getPostgresPool } from "@/lib/db/postgres";
import type { AuthUser, UserRole } from "./types";

export type AccessRequestStatus = "pending" | "approved" | "rejected";
export type AuditAction =
  | "role_assigned"
  | "role_changed"
  | "access_approved"
  | "access_rejected"
  | "user_pre_added"
  | "user_removed";

export interface StoredUserRecord extends AuthUser {
  id: string;
  authUid: string | null;
  preAdded: boolean;
  addedBy: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface StoredAccessRequest {
  requestId: string;
  authUid: string;
  email: string;
  displayName: string | null;
  status: AccessRequestStatus;
  requestedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  assignedRole: UserRole | null;
}

export interface StoredAuditEntry {
  logId: string;
  timestamp: Date;
  actorUid: string | null;
  actorEmail: string | null;
  targetUid: string | null;
  targetEmail: string | null;
  action: AuditAction | null;
  oldRole: UserRole | null;
  newRole: UserRole | null;
  event: string | null;
  ip: string | null;
  reason: string | null;
}

interface AuditCursor {
  timestamp: string;
  logId: string;
}

interface DemoStore {
  seeded: boolean;
  users: StoredUserRecord[];
  requests: StoredAccessRequest[];
  audit: StoredAuditEntry[];
  config: Map<string, unknown>;
}

const VALID_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "analyst",
  "ab_analyst",
  "viewer",
];

const DEMO_ACCESS_ENABLED = process.env.DEMO_ACCESS_ENABLED === "true";

declare global {
  // eslint-disable-next-line no-var
  var __analyticsPlatformAuthSchemaReady: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __analyticsPlatformDemoStore: DemoStore | undefined;
}

function parseStoredRole(role: unknown): UserRole {
  if (typeof role === "string" && VALID_ROLES.includes(role as UserRole)) {
    return role as UserRole;
  }

  return "viewer";
}

function getDemoStore(): DemoStore {
  if (!globalThis.__analyticsPlatformDemoStore) {
    globalThis.__analyticsPlatformDemoStore = {
      seeded: false,
      users: [],
      requests: [],
      audit: [],
      config: new Map(),
    };
  }

  return globalThis.__analyticsPlatformDemoStore;
}

function seedDemoStore() {
  const store = getDemoStore();
  if (store.seeded) {
    return;
  }

  const now = new Date();
  const earlier = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3);
  const superAdminId = randomUUID();
  const analystId = randomUUID();
  const pendingUserId = randomUUID();
  const requestId = randomUUID();

  store.users = [
    {
      id: superAdminId,
      uid: "demo-admin",
      authUid: "demo-admin",
      email: "demo@client-analytics.local",
      displayName: "Demo Admin",
      avatarUrl: null,
      role: "super_admin",
      approved: true,
      preAdded: false,
      addedBy: null,
      createdAt: earlier,
      lastLoginAt: now,
    },
    {
      id: analystId,
      uid: "google-oauth2|analyst-seeded",
      authUid: "google-oauth2|analyst-seeded",
      email: "analyst@ugadooga.com",
      displayName: "Growth Analyst",
      avatarUrl: null,
      role: "analyst",
      approved: true,
      preAdded: false,
      addedBy: "demo-admin",
      createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 2),
      lastLoginAt: new Date(now.getTime() - 1000 * 60 * 40),
    },
    {
      id: pendingUserId,
      uid: `pending:${pendingUserId}`,
      authUid: null,
      email: "pending.user@ugadooga.com",
      displayName: null,
      avatarUrl: null,
      role: "viewer",
      approved: false,
      preAdded: true,
      addedBy: "demo-admin",
      createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 12),
      lastLoginAt: null,
    },
  ];

  store.requests = [
    {
      requestId,
      authUid: "google-oauth2|request-1",
      email: "request.user@ugadooga.com",
      displayName: "Request User",
      status: "pending",
      requestedAt: new Date(now.getTime() - 1000 * 60 * 45),
      resolvedAt: null,
      resolvedBy: null,
      assignedRole: null,
    },
  ];

  store.audit = [
    {
      logId: randomUUID(),
      timestamp: new Date(now.getTime() - 1000 * 60 * 30),
      actorUid: "demo-admin",
      actorEmail: "demo@client-analytics.local",
      targetUid: "google-oauth2|analyst-seeded",
      targetEmail: "analyst@ugadooga.com",
      action: "role_assigned",
      oldRole: null,
      newRole: "analyst",
      event: null,
      ip: null,
      reason: null,
    },
  ];

  store.config.set("bootstrap", { bootstrapComplete: true });
  store.seeded = true;
}

function useDemoStore() {
  return DEMO_ACCESS_ENABLED;
}

function getUserKey(user: Pick<StoredUserRecord, "id" | "authUid">) {
  return user.authUid ?? `pending:${user.id}`;
}

function normalizeUser(record: Omit<StoredUserRecord, "uid">): StoredUserRecord {
  return {
    ...record,
    uid: getUserKey(record),
  };
}

function normalizePgUser(row: Record<string, unknown>): StoredUserRecord {
  return normalizeUser({
    id: String(row.id),
    authUid: typeof row.auth_uid === "string" ? row.auth_uid : null,
    email: String(row.email),
    displayName: typeof row.display_name === "string" ? row.display_name : null,
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    role: parseStoredRole(row.role),
    approved: Boolean(row.approved),
    preAdded: Boolean(row.pre_added),
    addedBy: typeof row.added_by === "string" ? row.added_by : null,
    createdAt: new Date(String(row.created_at)),
    lastLoginAt: row.last_login_at ? new Date(String(row.last_login_at)) : null,
  });
}

function normalizePgRequest(row: Record<string, unknown>): StoredAccessRequest {
  return {
    requestId: String(row.id),
    authUid: String(row.auth_uid),
    email: String(row.email),
    displayName: typeof row.display_name === "string" ? row.display_name : null,
    status: String(row.status) as AccessRequestStatus,
    requestedAt: new Date(String(row.requested_at)),
    resolvedAt: row.resolved_at ? new Date(String(row.resolved_at)) : null,
    resolvedBy: typeof row.resolved_by === "string" ? row.resolved_by : null,
    assignedRole: row.assigned_role ? parseStoredRole(row.assigned_role) : null,
  };
}

function normalizePgAudit(row: Record<string, unknown>): StoredAuditEntry {
  return {
    logId: String(row.id),
    timestamp: new Date(String(row.timestamp)),
    actorUid: typeof row.actor_uid === "string" ? row.actor_uid : null,
    actorEmail: typeof row.actor_email === "string" ? row.actor_email : null,
    targetUid: typeof row.target_uid === "string" ? row.target_uid : null,
    targetEmail: typeof row.target_email === "string" ? row.target_email : null,
    action: row.action ? (String(row.action) as AuditAction) : null,
    oldRole: row.old_role ? parseStoredRole(row.old_role) : null,
    newRole: row.new_role ? parseStoredRole(row.new_role) : null,
    event: typeof row.event === "string" ? row.event : null,
    ip: typeof row.ip === "string" ? row.ip : null,
    reason: typeof row.reason === "string" ? row.reason : null,
  };
}

async function ensurePostgresSchema() {
  if (useDemoStore()) {
    seedDemoStore();
    return;
  }

  const pool = getPostgresPool();
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!globalThis.__analyticsPlatformAuthSchemaReady) {
    globalThis.__analyticsPlatformAuthSchemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS auth_users (
          id TEXT PRIMARY KEY,
          auth_uid TEXT UNIQUE,
          email TEXT NOT NULL UNIQUE,
          display_name TEXT,
          avatar_url TEXT,
          role TEXT NOT NULL,
          approved BOOLEAN NOT NULL DEFAULT FALSE,
          pre_added BOOLEAN NOT NULL DEFAULT FALSE,
          added_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_login_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS access_requests (
          id TEXT PRIMARY KEY,
          auth_uid TEXT NOT NULL,
          email TEXT NOT NULL,
          display_name TEXT,
          status TEXT NOT NULL,
          requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          resolved_at TIMESTAMPTZ,
          resolved_by TEXT,
          assigned_role TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          actor_uid TEXT,
          actor_email TEXT,
          target_uid TEXT,
          target_email TEXT,
          action TEXT,
          old_role TEXT,
          new_role TEXT,
          event TEXT,
          ip TEXT,
          reason TEXT
        );

        CREATE TABLE IF NOT EXISTS app_config (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_auth_users_created_at ON auth_users (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_auth_users_role_approved ON auth_users (role, approved);
        CREATE INDEX IF NOT EXISTS idx_access_requests_status_requested_at ON access_requests (status, requested_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log (timestamp DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_log_action_timestamp ON audit_log (action, timestamp DESC, id DESC);
      `);
    })();
  }

  await globalThis.__analyticsPlatformAuthSchemaReady;
}

async function withPgTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const pool = getPostgresPool();
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function getAutoApprovedAdminEmails() {
  return (process.env.AUTO_APPROVED_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getAutoApprovedSuperAdminEmails() {
  const fromEnv = (process.env.AUTO_APPROVED_SUPERADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  const defaultOwners = ["sergey.mishustin@ugadooga.com"];

  return Array.from(new Set([...defaultOwners, ...fromEnv]));
}

export function getAutoApprovedRole(email: string): UserRole | null {
  const normalizedEmail = email.toLowerCase();

  if (getAutoApprovedSuperAdminEmails().includes(normalizedEmail)) {
    return "super_admin";
  }

  if (getAutoApprovedAdminEmails().includes(normalizedEmail)) {
    return "admin";
  }

  return null;
}

async function findDemoUserByAuthUidOrEmail(authUid: string, email: string) {
  seedDemoStore();
  const store = getDemoStore();
  return (
    store.users.find((user) => user.authUid === authUid) ??
    store.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ??
    null
  );
}

async function upsertDemoUser(input: {
  authUid: string | null;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  approved: boolean;
  preAdded: boolean;
  addedBy: string | null;
  lastLoginAt?: Date | null;
}) {
  seedDemoStore();
  const store = getDemoStore();
  const existing =
    store.users.find((user) => user.authUid && user.authUid === input.authUid) ??
    store.users.find((user) => user.email.toLowerCase() === input.email.toLowerCase()) ??
    null;

  if (existing) {
    existing.authUid = input.authUid ?? existing.authUid;
    existing.uid = getUserKey(existing);
    existing.email = input.email;
    existing.displayName = input.displayName;
    existing.avatarUrl = input.avatarUrl;
    existing.role = input.role;
    existing.approved = input.approved;
    existing.preAdded = input.preAdded;
    existing.addedBy = input.addedBy;
    existing.lastLoginAt = input.lastLoginAt ?? existing.lastLoginAt;
    return existing;
  }

  const user = normalizeUser({
    id: randomUUID(),
    authUid: input.authUid,
    email: input.email,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
    role: input.role,
    approved: input.approved,
    preAdded: input.preAdded,
    addedBy: input.addedBy,
    createdAt: new Date(),
    lastLoginAt: input.lastLoginAt ?? null,
  });
  store.users.unshift(user);
  return user;
}

export async function syncGoogleLoginUser(identity: {
  authUid: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  await ensurePostgresSchema();
  const autoApprovedRole = getAutoApprovedRole(identity.email);
  const now = new Date();

  if (useDemoStore()) {
    const existing = await findDemoUserByAuthUidOrEmail(identity.authUid, identity.email);
    if (autoApprovedRole) {
      return upsertDemoUser({
        authUid: identity.authUid,
        email: identity.email,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        role: autoApprovedRole,
        approved: true,
        preAdded: existing?.preAdded ?? false,
        addedBy: existing?.addedBy ?? null,
        lastLoginAt: now,
      });
    }

    if (existing) {
      return upsertDemoUser({
        authUid: identity.authUid,
        email: identity.email,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        role: existing.role,
        approved: existing.approved,
        preAdded: existing.preAdded,
        addedBy: existing.addedBy,
        lastLoginAt: now,
      });
    }

    return upsertDemoUser({
      authUid: identity.authUid,
      email: identity.email,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      role: "viewer",
      approved: false,
      preAdded: false,
      addedBy: null,
      lastLoginAt: now,
    });
  }

  return withPgTransaction(async (client) => {
    const existingResult = await client.query(
      `
        SELECT *
        FROM auth_users
        WHERE auth_uid = $1 OR LOWER(email) = LOWER($2)
        ORDER BY CASE WHEN auth_uid = $1 THEN 0 ELSE 1 END
        LIMIT 1
      `,
      [identity.authUid, identity.email]
    );

    const existing = existingResult.rows[0]
      ? normalizePgUser(existingResult.rows[0] as Record<string, unknown>)
      : null;

    const role = autoApprovedRole ?? existing?.role ?? "viewer";
    const approved = autoApprovedRole ? true : existing?.approved ?? false;
    const preAdded = existing?.preAdded ?? false;
    const addedBy = existing?.addedBy ?? null;
    const id = existing?.id ?? randomUUID();

    const upserted = await client.query(
      `
        INSERT INTO auth_users (
          id,
          auth_uid,
          email,
          display_name,
          avatar_url,
          role,
          approved,
          pre_added,
          added_by,
          created_at,
          updated_at,
          last_login_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()), NOW(), $11)
        ON CONFLICT (email)
        DO UPDATE SET
          auth_uid = EXCLUDED.auth_uid,
          display_name = EXCLUDED.display_name,
          avatar_url = EXCLUDED.avatar_url,
          role = EXCLUDED.role,
          approved = EXCLUDED.approved,
          pre_added = EXCLUDED.pre_added,
          added_by = EXCLUDED.added_by,
          updated_at = NOW(),
          last_login_at = EXCLUDED.last_login_at
        RETURNING *
      `,
      [
        id,
        identity.authUid,
        identity.email,
        identity.displayName,
        identity.avatarUrl,
        role,
        approved,
        preAdded,
        addedBy,
        existing?.createdAt ?? null,
        now,
      ]
    );

    return normalizePgUser(upserted.rows[0] as Record<string, unknown>);
  });
}

export async function listUsers() {
  await ensurePostgresSchema();

  if (useDemoStore()) {
    seedDemoStore();
    return [...getDemoStore().users].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  const pool = getPostgresPool()!;
  const result = await pool.query("SELECT * FROM auth_users ORDER BY created_at DESC");
  return result.rows.map((row) => normalizePgUser(row as Record<string, unknown>));
}

async function findUserByKey(userKey: string) {
  await ensurePostgresSchema();

  if (useDemoStore()) {
    seedDemoStore();
    return (
      getDemoStore().users.find((user) => user.uid === userKey || user.authUid === userKey || user.id === userKey) ??
      null
    );
  }

  const pool = getPostgresPool()!;
  if (userKey.startsWith("pending:")) {
    const id = userKey.slice("pending:".length);
    const result = await pool.query("SELECT * FROM auth_users WHERE id = $1 LIMIT 1", [id]);
    return result.rows[0] ? normalizePgUser(result.rows[0] as Record<string, unknown>) : null;
  }

  const result = await pool.query(
    "SELECT * FROM auth_users WHERE auth_uid = $1 OR id = $1 LIMIT 1",
    [userKey]
  );
  return result.rows[0] ? normalizePgUser(result.rows[0] as Record<string, unknown>) : null;
}

export async function updateUserRole(params: {
  userKey: string;
  role: UserRole;
  actor: { uid: string; email: string; role: UserRole };
}) {
  await ensurePostgresSchema();

  if (params.role === "super_admin" && params.actor.role !== "super_admin") {
    throw new Error("FORBIDDEN");
  }

  if (useDemoStore()) {
    const user = await findUserByKey(params.userKey);
    if (!user) {
      throw new Error("NOT_FOUND");
    }

    const oldRole = user.role;
    user.role = params.role;
    user.approved = true;

    await writeAuditLog({
      actorUid: params.actor.uid,
      actorEmail: params.actor.email,
      targetUid: user.uid,
      targetEmail: user.email,
      action: oldRole ? "role_changed" : "role_assigned",
      oldRole,
      newRole: params.role,
    });

    return user;
  }

  return withPgTransaction(async (client) => {
    const existing = await findUserByKey(params.userKey);
    if (!existing) {
      throw new Error("NOT_FOUND");
    }

    const updated = await client.query(
      `
        UPDATE auth_users
        SET role = $2, approved = TRUE, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [existing.id, params.role]
    );

    await client.query(
      `
        INSERT INTO audit_log (
          id,
          actor_uid,
          actor_email,
          target_uid,
          target_email,
          action,
          old_role,
          new_role
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        randomUUID(),
        params.actor.uid,
        params.actor.email,
        existing.uid,
        existing.email,
        existing.role ? "role_changed" : "role_assigned",
        existing.role,
        params.role,
      ]
    );

    return normalizePgUser(updated.rows[0] as Record<string, unknown>);
  });
}

export async function deleteUser(params: {
  userKey: string;
  actor: { uid: string; email: string; role: UserRole };
}) {
  await ensurePostgresSchema();

  const target = await findUserByKey(params.userKey);
  if (!target) {
    throw new Error("NOT_FOUND");
  }
  if (target.uid === params.actor.uid) {
    throw new Error("CANNOT_DELETE_SELF");
  }
  if (target.role === "super_admin" && params.actor.role !== "super_admin") {
    throw new Error("FORBIDDEN");
  }

  if (useDemoStore()) {
    const store = getDemoStore();
    store.users = store.users.filter((user) => user.id !== target.id);
    store.requests = store.requests.filter(
      (request) =>
        request.authUid !== target.authUid &&
        request.email.toLowerCase() !== target.email.toLowerCase()
    );

    await writeAuditLog({
      actorUid: params.actor.uid,
      actorEmail: params.actor.email,
      targetUid: target.uid,
      targetEmail: target.email,
      action: "user_removed",
      oldRole: target.role,
      newRole: null,
    });
    return;
  }

  await withPgTransaction(async (client) => {
    await client.query("DELETE FROM access_requests WHERE auth_uid = $1 OR LOWER(email) = LOWER($2)", [
      target.authUid,
      target.email,
    ]);
    await client.query("DELETE FROM auth_users WHERE id = $1", [target.id]);
    await client.query(
      `
        INSERT INTO audit_log (
          id,
          actor_uid,
          actor_email,
          target_uid,
          target_email,
          action,
          old_role,
          new_role
        )
        VALUES ($1, $2, $3, $4, $5, 'user_removed', $6, NULL)
      `,
      [randomUUID(), params.actor.uid, params.actor.email, target.uid, target.email, target.role]
    );
  });
}

export async function preAddUser(params: {
  email: string;
  role: UserRole;
  actor: { uid: string; email: string };
}) {
  await ensurePostgresSchema();

  if (useDemoStore()) {
    const existing = getDemoStore().users.find(
      (user) => user.email.toLowerCase() === params.email.toLowerCase()
    );
    const user = await upsertDemoUser({
      authUid: existing?.authUid ?? null,
      email: params.email,
      displayName: existing?.displayName ?? null,
      avatarUrl: existing?.avatarUrl ?? null,
      role: params.role,
      approved: true,
      preAdded: true,
      addedBy: params.actor.uid,
      lastLoginAt: existing?.lastLoginAt ?? null,
    });

    await writeAuditLog({
      actorUid: params.actor.uid,
      actorEmail: params.actor.email,
      targetUid: user.authUid ? user.uid : null,
      targetEmail: params.email,
      action: "user_pre_added",
      oldRole: null,
      newRole: params.role,
    });

    return { user, immediate: Boolean(user.authUid) };
  }

  return withPgTransaction(async (client) => {
    const existingResult = await client.query(
      "SELECT * FROM auth_users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [params.email]
    );
    const existing = existingResult.rows[0]
      ? normalizePgUser(existingResult.rows[0] as Record<string, unknown>)
      : null;
    const userId = existing?.id ?? randomUUID();

    const upserted = await client.query(
      `
        INSERT INTO auth_users (
          id,
          auth_uid,
          email,
          display_name,
          avatar_url,
          role,
          approved,
          pre_added,
          added_by,
          created_at,
          updated_at,
          last_login_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, $7, COALESCE($8, NOW()), NOW(), $9)
        ON CONFLICT (email)
        DO UPDATE SET
          role = EXCLUDED.role,
          approved = TRUE,
          pre_added = TRUE,
          added_by = EXCLUDED.added_by,
          updated_at = NOW()
        RETURNING *
      `,
      [
        userId,
        existing?.authUid ?? null,
        params.email,
        existing?.displayName ?? null,
        existing?.avatarUrl ?? null,
        params.role,
        params.actor.uid,
        existing?.createdAt ?? null,
        existing?.lastLoginAt ?? null,
      ]
    );

    const user = normalizePgUser(upserted.rows[0] as Record<string, unknown>);

    await client.query(
      `
        INSERT INTO audit_log (
          id,
          actor_uid,
          actor_email,
          target_uid,
          target_email,
          action,
          old_role,
          new_role
        )
        VALUES ($1, $2, $3, $4, $5, 'user_pre_added', NULL, $6)
      `,
      [randomUUID(), params.actor.uid, params.actor.email, user.authUid, user.email, params.role]
    );

    return { user, immediate: Boolean(user.authUid) };
  });
}

export async function createAccessRequest(params: {
  authUid: string;
  email: string;
  displayName: string | null;
}) {
  await ensurePostgresSchema();

  if (useDemoStore()) {
    const store = getDemoStore();
    const existing = store.requests.find(
      (request) => request.authUid === params.authUid && request.status === "pending"
    );
    if (existing) {
      throw new Error("REQUEST_EXISTS");
    }

    const request: StoredAccessRequest = {
      requestId: randomUUID(),
      authUid: params.authUid,
      email: params.email,
      displayName: params.displayName,
      status: "pending",
      requestedAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
      assignedRole: null,
    };
    store.requests.unshift(request);
    return request;
  }

  const pool = getPostgresPool()!;
  const existing = await pool.query(
    `
      SELECT id
      FROM access_requests
      WHERE auth_uid = $1 AND status = 'pending'
      LIMIT 1
    `,
    [params.authUid]
  );
  if (existing.rowCount) {
    throw new Error("REQUEST_EXISTS");
  }

  const created = await pool.query(
    `
      INSERT INTO access_requests (id, auth_uid, email, display_name, status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING *
    `,
    [randomUUID(), params.authUid, params.email, params.displayName]
  );

  return normalizePgRequest(created.rows[0] as Record<string, unknown>);
}

export async function listAccessRequests(params: {
  status: AccessRequestStatus | "all";
}) {
  await ensurePostgresSchema();

  if (useDemoStore()) {
    seedDemoStore();
    const requests = getDemoStore().requests
      .filter((request) => params.status === "all" || request.status === params.status)
      .sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime());
    return requests;
  }

  const pool = getPostgresPool()!;
  const query =
    params.status === "all"
      ? "SELECT * FROM access_requests ORDER BY requested_at DESC"
      : "SELECT * FROM access_requests WHERE status = $1 ORDER BY requested_at DESC";
  const values = params.status === "all" ? [] : [params.status];
  const result = await pool.query(query, values);
  return result.rows.map((row) => normalizePgRequest(row as Record<string, unknown>));
}

async function getAccessRequest(requestId: string) {
  await ensurePostgresSchema();

  if (useDemoStore()) {
    seedDemoStore();
    return getDemoStore().requests.find((request) => request.requestId === requestId) ?? null;
  }

  const pool = getPostgresPool()!;
  const result = await pool.query("SELECT * FROM access_requests WHERE id = $1 LIMIT 1", [requestId]);
  return result.rows[0] ? normalizePgRequest(result.rows[0] as Record<string, unknown>) : null;
}

export async function approveAccessRequest(params: {
  requestId: string;
  role: UserRole;
  actor: { uid: string; email: string };
}) {
  await ensurePostgresSchema();
  const accessRequest = await getAccessRequest(params.requestId);
  if (!accessRequest) {
    throw new Error("NOT_FOUND");
  }
  if (accessRequest.status !== "pending") {
    throw new Error("ALREADY_RESOLVED");
  }

  if (useDemoStore()) {
    const store = getDemoStore();
    const user = await upsertDemoUser({
      authUid: accessRequest.authUid,
      email: accessRequest.email,
      displayName: accessRequest.displayName,
      avatarUrl: null,
      role: params.role,
      approved: true,
      preAdded: false,
      addedBy: params.actor.uid,
      lastLoginAt: new Date(),
    });
    const request = store.requests.find((entry) => entry.requestId === params.requestId)!;
    request.status = "approved";
    request.assignedRole = params.role;
    request.resolvedAt = new Date();
    request.resolvedBy = params.actor.uid;

    await writeAuditLog({
      actorUid: params.actor.uid,
      actorEmail: params.actor.email,
      targetUid: user.uid,
      targetEmail: user.email,
      action: "access_approved",
      oldRole: null,
      newRole: params.role,
    });
    return;
  }

  await withPgTransaction(async (client) => {
    const userResult = await client.query(
      "SELECT * FROM auth_users WHERE auth_uid = $1 OR LOWER(email) = LOWER($2) LIMIT 1",
      [accessRequest.authUid, accessRequest.email]
    );
    const existingUser = userResult.rows[0]
      ? normalizePgUser(userResult.rows[0] as Record<string, unknown>)
      : null;
    const userId = existingUser?.id ?? randomUUID();

    await client.query(
      `
        INSERT INTO auth_users (
          id,
          auth_uid,
          email,
          display_name,
          avatar_url,
          role,
          approved,
          pre_added,
          added_by,
          created_at,
          updated_at,
          last_login_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, TRUE, COALESCE($7, FALSE), $8, COALESCE($9, NOW()), NOW(), NOW())
        ON CONFLICT (email)
        DO UPDATE SET
          auth_uid = EXCLUDED.auth_uid,
          display_name = COALESCE(EXCLUDED.display_name, auth_users.display_name),
          role = EXCLUDED.role,
          approved = TRUE,
          updated_at = NOW(),
          last_login_at = NOW()
      `,
      [
        userId,
        accessRequest.authUid,
        accessRequest.email,
        accessRequest.displayName,
        existingUser?.avatarUrl ?? null,
        params.role,
        existingUser?.preAdded ?? false,
        params.actor.uid,
        existingUser?.createdAt ?? null,
      ]
    );

    await client.query(
      `
        UPDATE access_requests
        SET status = 'approved',
            assigned_role = $2,
            resolved_at = NOW(),
            resolved_by = $3
        WHERE id = $1
      `,
      [params.requestId, params.role, params.actor.uid]
    );

    await client.query(
      `
        INSERT INTO audit_log (
          id,
          actor_uid,
          actor_email,
          target_uid,
          target_email,
          action,
          old_role,
          new_role
        )
        VALUES ($1, $2, $3, $4, $5, 'access_approved', NULL, $6)
      `,
      [randomUUID(), params.actor.uid, params.actor.email, accessRequest.authUid, accessRequest.email, params.role]
    );
  });
}

export async function rejectAccessRequest(params: {
  requestId: string;
  actor: { uid: string; email: string };
}) {
  await ensurePostgresSchema();
  const accessRequest = await getAccessRequest(params.requestId);
  if (!accessRequest) {
    throw new Error("NOT_FOUND");
  }
  if (accessRequest.status !== "pending") {
    throw new Error("ALREADY_RESOLVED");
  }

  if (useDemoStore()) {
    const request = getDemoStore().requests.find((entry) => entry.requestId === params.requestId)!;
    request.status = "rejected";
    request.resolvedAt = new Date();
    request.resolvedBy = params.actor.uid;

    await writeAuditLog({
      actorUid: params.actor.uid,
      actorEmail: params.actor.email,
      targetUid: accessRequest.authUid,
      targetEmail: accessRequest.email,
      action: "access_rejected",
      oldRole: null,
      newRole: null,
    });
    return;
  }

  const pool = getPostgresPool()!;
  await withPgTransaction(async (client) => {
    await client.query(
      `
        UPDATE access_requests
        SET status = 'rejected',
            resolved_at = NOW(),
            resolved_by = $2
        WHERE id = $1
      `,
      [params.requestId, params.actor.uid]
    );
    await client.query(
      `
        INSERT INTO audit_log (
          id,
          actor_uid,
          actor_email,
          target_uid,
          target_email,
          action,
          old_role,
          new_role
        )
        VALUES ($1, $2, $3, $4, $5, 'access_rejected', NULL, NULL)
      `,
      [randomUUID(), params.actor.uid, params.actor.email, accessRequest.authUid, accessRequest.email]
    );
  });
  void pool;
}

export async function writeAuditLog(entry: {
  actorUid: string | null;
  actorEmail: string | null;
  targetUid: string | null;
  targetEmail: string | null;
  action: AuditAction;
  oldRole: UserRole | null;
  newRole: UserRole | null;
}) {
  await ensurePostgresSchema();

  if (useDemoStore()) {
    getDemoStore().audit.unshift({
      logId: randomUUID(),
      timestamp: new Date(),
      actorUid: entry.actorUid,
      actorEmail: entry.actorEmail,
      targetUid: entry.targetUid,
      targetEmail: entry.targetEmail,
      action: entry.action,
      oldRole: entry.oldRole,
      newRole: entry.newRole,
      event: null,
      ip: null,
      reason: null,
    });
    return;
  }

  const pool = getPostgresPool()!;
  await pool.query(
    `
      INSERT INTO audit_log (
        id,
        actor_uid,
        actor_email,
        target_uid,
        target_email,
        action,
        old_role,
        new_role
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      randomUUID(),
      entry.actorUid,
      entry.actorEmail,
      entry.targetUid,
      entry.targetEmail,
      entry.action,
      entry.oldRole,
      entry.newRole,
    ]
  );
}

function encodeAuditCursor(entry: StoredAuditEntry) {
  return Buffer.from(
    JSON.stringify({ timestamp: entry.timestamp.toISOString(), logId: entry.logId } satisfies AuditCursor)
  ).toString("base64url");
}

function decodeAuditCursor(cursor: string | null): AuditCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as AuditCursor;
  } catch {
    return null;
  }
}

export async function listAuditEntries(params: {
  action: string | null;
  from: string | null;
  to: string | null;
  limit: number;
  after: string | null;
}) {
  await ensurePostgresSchema();
  const cursor = decodeAuditCursor(params.after);

  if (useDemoStore()) {
    seedDemoStore();
    let entries = getDemoStore().audit.filter((entry) => entry.action !== null);
    if (params.action) {
      entries = entries.filter((entry) => entry.action === params.action);
    }
    if (params.from) {
      const from = new Date(params.from).getTime();
      entries = entries.filter((entry) => entry.timestamp.getTime() >= from);
    }
    if (params.to) {
      const to = new Date(params.to).getTime();
      entries = entries.filter((entry) => entry.timestamp.getTime() <= to);
    }
    entries = entries.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
    if (cursor) {
      const cursorTs = new Date(cursor.timestamp).getTime();
      entries = entries.filter(
        (entry) =>
          entry.timestamp.getTime() < cursorTs ||
          (entry.timestamp.getTime() === cursorTs && entry.logId < cursor.logId)
      );
    }
    const page = entries.slice(0, params.limit);
    return {
      entries: page,
      nextAfter: page.length === params.limit ? encodeAuditCursor(page[page.length - 1]) : null,
    };
  }

  const pool = getPostgresPool()!;
  const values: Array<string | number | Date> = [];
  const filters = ["action IS NOT NULL"];

  if (params.action) {
    values.push(params.action);
    filters.push(`action = $${values.length}`);
  }
  if (params.from) {
    values.push(new Date(params.from));
    filters.push(`timestamp >= $${values.length}`);
  }
  if (params.to) {
    values.push(new Date(params.to));
    filters.push(`timestamp <= $${values.length}`);
  }
  if (cursor) {
    values.push(new Date(cursor.timestamp));
    const tsIndex = values.length;
    values.push(cursor.logId);
    const idIndex = values.length;
    filters.push(`(timestamp < $${tsIndex} OR (timestamp = $${tsIndex} AND id < $${idIndex}))`);
  }

  values.push(params.limit);
  const query = `
    SELECT *
    FROM audit_log
    WHERE ${filters.join(" AND ")}
    ORDER BY timestamp DESC, id DESC
    LIMIT $${values.length}
  `;
  const result = await pool.query(query, values);
  const entries = result.rows.map((row) => normalizePgAudit(row as Record<string, unknown>));
  return {
    entries,
    nextAfter: entries.length === params.limit ? encodeAuditCursor(entries[entries.length - 1]) : null,
  };
}

export async function isBootstrapComplete() {
  await ensurePostgresSchema();

  if (useDemoStore()) {
    seedDemoStore();
    return Boolean(getDemoStore().config.get("bootstrap"));
  }

  const pool = getPostgresPool()!;
  const result = await pool.query("SELECT value FROM app_config WHERE key = 'bootstrap' LIMIT 1");
  if (!result.rows[0]) {
    return false;
  }

  const value = result.rows[0].value as { bootstrapComplete?: boolean } | null;
  return value?.bootstrapComplete === true;
}

export async function writeBootstrapAuditEvent(params: {
  event: string;
  ip: string;
  email?: string;
  reason?: string;
}) {
  await ensurePostgresSchema();

  if (useDemoStore()) {
    getDemoStore().audit.unshift({
      logId: randomUUID(),
      timestamp: new Date(),
      actorUid: null,
      actorEmail: params.email ?? null,
      targetUid: null,
      targetEmail: params.email ?? null,
      action: null,
      oldRole: null,
      newRole: null,
      event: params.event,
      ip: params.ip,
      reason: params.reason ?? null,
    });
    return;
  }

  const pool = getPostgresPool()!;
  await pool.query(
    `
      INSERT INTO audit_log (id, actor_email, target_email, event, ip, reason)
      VALUES ($1, $2, $2, $3, $4, $5)
    `,
    [randomUUID(), params.email ?? null, params.event, params.ip, params.reason ?? null]
  );
}

export async function bootstrapSuperAdmin(params: {
  authUid: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  await ensurePostgresSchema();

  if (useDemoStore()) {
    const store = getDemoStore();
    const user = await upsertDemoUser({
      authUid: params.authUid,
      email: params.email,
      displayName: params.displayName,
      avatarUrl: params.avatarUrl,
      role: "super_admin",
      approved: true,
      preAdded: false,
      addedBy: null,
      lastLoginAt: new Date(),
    });
    store.config.set("bootstrap", { bootstrapComplete: true, completedByEmail: params.email });
    return user;
  }

  return withPgTransaction(async (client) => {
    const configResult = await client.query(
      "SELECT value FROM app_config WHERE key = 'bootstrap' LIMIT 1 FOR UPDATE"
    );
    const configValue = configResult.rows[0]?.value as { bootstrapComplete?: boolean } | undefined;
    if (configValue?.bootstrapComplete) {
      throw new Error("BOOTSTRAP_COMPLETE");
    }

    const userResult = await client.query(
      "SELECT * FROM auth_users WHERE auth_uid = $1 OR LOWER(email) = LOWER($2) LIMIT 1",
      [params.authUid, params.email]
    );
    const existing = userResult.rows[0]
      ? normalizePgUser(userResult.rows[0] as Record<string, unknown>)
      : null;
    const id = existing?.id ?? randomUUID();

    const updated = await client.query(
      `
        INSERT INTO auth_users (
          id,
          auth_uid,
          email,
          display_name,
          avatar_url,
          role,
          approved,
          pre_added,
          added_by,
          created_at,
          updated_at,
          last_login_at
        )
        VALUES ($1, $2, $3, $4, $5, 'super_admin', TRUE, FALSE, NULL, COALESCE($6, NOW()), NOW(), NOW())
        ON CONFLICT (email)
        DO UPDATE SET
          auth_uid = EXCLUDED.auth_uid,
          display_name = EXCLUDED.display_name,
          avatar_url = EXCLUDED.avatar_url,
          role = 'super_admin',
          approved = TRUE,
          updated_at = NOW(),
          last_login_at = NOW()
        RETURNING *
      `,
      [id, params.authUid, params.email, params.displayName, params.avatarUrl, existing?.createdAt ?? null]
    );

    await client.query(
      `
        INSERT INTO app_config (key, value, updated_at)
        VALUES ('bootstrap', $1::jsonb, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `,
      [JSON.stringify({ bootstrapComplete: true, completedByEmail: params.email, completedAt: new Date().toISOString() })]
    );

    return normalizePgUser(updated.rows[0] as Record<string, unknown>);
  });
}

export function toTimestampValue(value: Date | null) {
  if (!value) {
    return null;
  }

  return { _seconds: Math.floor(value.getTime() / 1000) };
}
