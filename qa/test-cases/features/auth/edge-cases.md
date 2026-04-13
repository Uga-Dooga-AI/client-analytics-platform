# Auth Feature Pack — Edge Cases

## Meta

| Поле | Значение |
|------|---------|
| Feature | Firebase Auth + RBAC |
| Owner | QA Engineer |
| Spec | `e2e/auth/` |

---

## TC-AUTH-EC-001 · Session endpoint — invalid token returns 401

**Шаги:** `POST /api/auth/session` с `{ idToken: "invalid-token-garbage" }`

**Ожидаемый результат:** Status 401, `{ error: "Invalid token" }`

---

## TC-AUTH-EC-002 · Session endpoint — missing idToken returns 400

**Шаги:** `POST /api/auth/session` с `{}`

**Ожидаемый результат:** Status 400, `{ error: "idToken required" }`

---

## TC-AUTH-EC-003 · Bootstrap — wrong key returns 403

**Spec:** `e2e/auth/bootstrap.spec.ts` — "wrong bootstrap key returns 403"

---

## TC-AUTH-EC-004 · Bootstrap — missing uid returns 400

**Spec:** `e2e/auth/bootstrap.spec.ts` — "missing uid returns 400"

---

## TC-AUTH-EC-005 · Bootstrap — second call when super_admin exists returns 409

**Цель:** Bootstrap endpoint отключён после первого супер-администратора.

**Spec:** `e2e/auth/bootstrap.spec.ts` — "disabled after super_admin already exists"

---

## TC-AUTH-EC-006 · Bootstrap — non-existent uid returns 404

**Spec:** `e2e/auth/bootstrap.spec.ts` — "non-existent uid returns 404"

---

## TC-AUTH-EC-007 · Approve endpoint — unauthenticated returns 401

**Spec:** `e2e/auth/access-request.spec.ts` — "approve endpoint returns 401 for unauthenticated"

---

## TC-AUTH-EC-008 · Approve endpoint — viewer returns 403

**Spec:** `e2e/auth/access-request.spec.ts` — "approve endpoint returns 403 for viewer"

---

## TC-AUTH-EC-009 · Unapproved user always redirected to /access-request

Даже если пользователь введёт URL защищённого маршрута напрямую — middleware вернёт redirect.

---

## TC-AUTH-EC-010 · No session cookie → redirect to /login (not 500)

Запрос без `__session` cookie на любой protected route должен возвращать 307 → `/login`, не 500.

---

## TC-AUTH-EC-011 · API routes return 401 JSON (not redirect) for unauthenticated API calls

`GET /api/admin/users` без сессии → `{ error: "Unauthorized" }` status 401.

---

## TC-AUTH-EC-012 · Audit log inaccessible to viewer (403)

**Spec:** `e2e/auth/audit-log.spec.ts` — "viewer gets 403"

---

## TC-AUTH-EC-013 · Pre-add rejects unauthenticated caller

**Spec:** `e2e/auth/pre-add.spec.ts` — "rejects unauthenticated caller"

---

## TC-AUTH-EC-014 · Rejected user stays on /access-request despite direct URL entry

**Spec:** `e2e/auth/access-request.spec.ts` — "rejected user stays on /access-request"
