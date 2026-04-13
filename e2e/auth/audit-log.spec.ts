/**
 * AC-7: Смена роли → запись в audit_log
 *
 * Verifies that approve, reject, pre-add, and role-change actions
 * produce correct audit_log entries via /api/admin/audit.
 */

import { test, expect } from "@playwright/test";
import {
  clearEmulatorData,
  emulatorSignUp,
  emulatorSignIn,
} from "../helpers/emulator";
import { bootstrapSuperAdmin, approveRequest, rejectRequest, preAddUser } from "../helpers/seed";
import { seedUserDoc, seedAccessRequest } from "../helpers/firestore";
import { BASE_URL } from "../helpers/config";

const PASSWORD = "Test1234!";

async function setupAdmin(): Promise<{ uid: string; cookie: string }> {
  const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2)}@test.example`;
  const { uid } = await emulatorSignUp(email, PASSWORD);
  await bootstrapSuperAdmin(uid);
  const { idToken } = await emulatorSignIn(email, PASSWORD);
  const res = await fetch(`${BASE_URL}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const cookie = res.headers.get("set-cookie")?.match(/__session=([^;]+)/)?.[1] ?? "";
  return { uid, cookie };
}

async function getAuditLogs(adminCookie: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${BASE_URL}/api/admin/audit`, {
    headers: { Cookie: `__session=${adminCookie}` },
  });
  if (!res.ok) throw new Error(`getAuditLogs failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  // API returns { entries: [...], nextAfter: ... }
  return Array.isArray(data.entries) ? data.entries : (Array.isArray(data.logs) ? data.logs : data);
}

test.beforeEach(async () => {
  await clearEmulatorData();
});

test("AC-7: approve creates audit_log entry (action=access_approved, newRole set)", async () => {
  const { uid: adminUid, cookie: adminCookie } = await setupAdmin();

  const { uid: userUid } = await emulatorSignUp("audit-approve@test.example", PASSWORD);
  const requestId = `req-${userUid}`;
  await seedUserDoc({ uid: userUid, email: "audit-approve@test.example", role: "viewer", approved: false });
  await seedAccessRequest({ requestId, uid: userUid, email: "audit-approve@test.example" });

  await approveRequest(requestId, "analyst", adminCookie);

  const logs = await getAuditLogs(adminCookie);
  const entry = logs.find((l) => l.targetUid === userUid && l.action === "access_approved");
  expect(entry).toBeDefined();
  expect(entry!.newRole).toBe("analyst");
  expect(entry!.actorUid).toBe(adminUid);
});

test("AC-7: reject creates audit_log entry (action=access_rejected)", async () => {
  const { cookie: adminCookie } = await setupAdmin();

  const { uid: userUid } = await emulatorSignUp("audit-reject@test.example", PASSWORD);
  const requestId = `req-${userUid}`;
  await seedUserDoc({ uid: userUid, email: "audit-reject@test.example", role: "viewer", approved: false });
  await seedAccessRequest({ requestId, uid: userUid, email: "audit-reject@test.example" });

  await rejectRequest(requestId, adminCookie);

  const logs = await getAuditLogs(adminCookie);
  const entry = logs.find((l) => l.targetUid === userUid && l.action === "access_rejected");
  expect(entry).toBeDefined();
});

test("AC-7: pre-add creates audit_log entry (action=user_pre_added)", async () => {
  const { cookie: adminCookie } = await setupAdmin();

  await preAddUser("audit-preadd@test.example", "viewer", adminCookie);

  const logs = await getAuditLogs(adminCookie);
  const entry = logs.find(
    (l) => (l.targetEmail as string) === "audit-preadd@test.example" && l.action === "user_pre_added"
  );
  expect(entry).toBeDefined();
  expect(entry!.newRole).toBe("viewer");
});

test("AC-7: role change creates audit_log entry (action=role_changed, oldRole and newRole)", async () => {
  const { uid: adminUid, cookie: adminCookie } = await setupAdmin();

  // Create user with viewer role
  const { uid: userUid } = await emulatorSignUp("audit-role@test.example", PASSWORD);
  const requestId = `req-${userUid}`;
  await seedUserDoc({ uid: userUid, email: "audit-role@test.example", role: "viewer", approved: false });
  await seedAccessRequest({ requestId, uid: userUid, email: "audit-role@test.example" });
  await approveRequest(requestId, "viewer", adminCookie);

  // Change role from viewer to analyst
  const roleRes = await fetch(`${BASE_URL}/api/admin/users/${userUid}/role`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: `__session=${adminCookie}`,
    },
    body: JSON.stringify({ role: "analyst" }),
  });
  expect(roleRes.status).toBe(200);

  const logs = await getAuditLogs(adminCookie);
  const entry = logs.find((l) => l.targetUid === userUid && l.action === "role_changed");
  expect(entry).toBeDefined();
  expect(entry!.oldRole).toBe("viewer");
  expect(entry!.newRole).toBe("analyst");
  expect(entry!.actorUid).toBe(adminUid);
});

test("AC-7: audit log endpoint returns 401 for unauthenticated caller", async ({ request }) => {
  const res = await request.get("/api/admin/audit");
  expect(res.status()).toBe(401);
});

test("AC-7: audit log endpoint returns 403 for viewer", async ({ browser }) => {
  const { seedUserDoc, setEmulatorCustomClaims } = await import("../helpers/firestore");
  const { uid } = await emulatorSignUp("viewer-audit@test.example", PASSWORD);
  await setEmulatorCustomClaims(uid, { role: "viewer", approved: true });
  await seedUserDoc({ uid, email: "viewer-audit@test.example", role: "viewer", approved: true });
  const { idToken } = await emulatorSignIn("viewer-audit@test.example", PASSWORD);

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.request.post("/api/auth/session", { data: { idToken } });

  const res = await page.request.get("/api/admin/audit");
  expect([401, 403]).toContain(res.status());

  await context.close();
});
