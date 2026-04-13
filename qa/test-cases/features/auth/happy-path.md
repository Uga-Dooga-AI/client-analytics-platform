# Auth Feature Pack — Happy Path Tests

## Meta

| Поле | Значение |
|------|---------|
| Feature | Firebase Auth + RBAC |
| Owner | QA Engineer |
| Spec | `e2e/auth/` |
| Surface | Web (Next.js, Firebase Auth Emulator) |
| Тип | E2E (Playwright) |

---

## TC-AUTH-HP-001 · Session creation via /api/auth/session

**Цель:** Верификация Firebase ID токена и установка httpOnly `__session` cookie.

**Предусловие:** Firebase Auth Emulator запущен на localhost:9099.

**Шаги:**
1. Создать пользователя через emulator: `POST /identitytoolkit.googleapis.com/v1/accounts:signUp`
2. Получить `idToken` из ответа
3. `POST /api/auth/session` с `{ idToken }`
4. Проверить response headers

**Ожидаемый результат:**
- Status 200
- `set-cookie: __session=...; HttpOnly; SameSite=Strict`
- Body содержит `uid`, `email`, `role`, `approved`

**Spec:** `e2e/auth/login.spec.ts` — "AC-1: /api/auth/session verifies idToken..."

---

## TC-AUTH-HP-002 · Approved user navigation flow

**Цель:** Подтвердить что пользователь с `approved=true` попадает на `/overview` после сессии.

**Шаги:**
1. Создать пользователя, вызвать `bootstrapSuperAdmin`
2. Sign in → получить свежий idToken с claims
3. `POST /api/auth/session`
4. `GET /` в браузере

**Ожидаемый результат:** Redirect на `/overview`, нет ошибок 500.

**Spec:** `e2e/auth/login.spec.ts` — "AC-1: approved user navigates to /..."

---

## TC-AUTH-HP-003 · New unapproved user → access-request

**Цель:** Новый пользователь без pre-add и без approval попадает на `/access-request`.

**Шаги:**
1. Создать нового пользователя (`loginAs(context, email)`)
2. Navigated to `/overview`
3. Проверить URL

**Ожидаемый результат:** URL = `/access-request`, страница рендерится без 500.

**Spec:** `e2e/auth/login.spec.ts` — "AC-2: new unapproved user..."

---

## TC-AUTH-HP-004 · Admin approves access request

**Шаги:**
1. Setup super_admin admin
2. Создать pending user + seed access request в Firestore emulator
3. `POST /api/admin/requests/{requestId}/approve` с `{ role: "analyst" }`
4. User refreshes token
5. `POST /api/auth/session` с fresh token
6. `GET /overview`

**Ожидаемый результат:**
- Approve endpoint 200
- User redirected to `/overview`
- Нет `Unauthorized` в body

**Spec:** `e2e/auth/access-request.spec.ts`

---

## TC-AUTH-HP-005 · Pre-added user gets direct access

**Шаги:**
1. Admin вызывает `POST /api/admin/users/pre-add` с `{ email, role: "analyst" }`
2. Пользователь Sign up с этим email
3. Seed custom claims + user doc (эмуляция `onUserLogin`)
4. Refresh token
5. `GET /overview`

**Ожидаемый результат:** `/overview` доступен, нет редиректа на `/access-request`.

**Spec:** `e2e/auth/pre-add.spec.ts`

---

## TC-AUTH-HP-006 · Role-based route access matrix

| Роль | /overview | /cohorts | /experiments | /forecasts | /settings | /admin |
|------|-----------|----------|--------------|------------|-----------|--------|
| viewer | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| ab_analyst | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| analyst | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| super_admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Spec:** `e2e/auth/rbac.spec.ts`

---

## TC-AUTH-HP-007 · Bootstrap endpoint

**Шаги:**
1. Создать user в emulator
2. `POST /api/admin/bootstrap` с `{ uid, bootstrapKey }`
3. Sign in → `GET /admin`

**Ожидаемый результат:**
- Bootstrap 200, `{ ok: true, role: "super_admin" }`
- `/admin` доступен

**Spec:** `e2e/auth/bootstrap.spec.ts`

---

## TC-AUTH-HP-008 · Audit log for every admin action

Каждое из следующих действий должно порождать запись в `audit_log`:

| Действие | `action` в логе |
|---------|----------------|
| Approve request | `access_approved` |
| Reject request | `access_rejected` |
| Pre-add user | `user_pre_added` |
| Change role | `role_changed` |

**Spec:** `e2e/auth/audit-log.spec.ts`

---

## TC-AUTH-HP-009 · Logout clears session

**Шаги:**
1. Login как super_admin
2. `DELETE /api/auth/session` (logout)
3. `GET /overview`

**Ожидаемый результат:** Redirect на `/login`, нет `__session` cookie.

**Spec:** `e2e/auth/login.spec.ts` — "AC-1 (session): logout..."
