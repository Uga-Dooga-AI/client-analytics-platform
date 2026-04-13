# Regression Pack: Auth + RBAC

## When to use

Запускать при:
- Любых изменениях в Firebase Auth flow
- Изменениях в middleware или session management
- Изменениях в RBAC правилах (roles/permissions)
- Security-related bugfix
- Pre-RC sweep

## Core areas

### 1. Authentication flow

| # | Case | Expected |
|---|------|----------|
| AUTH-R-01 | Вход через Google SSO с pre-approved аккаунтом | Успешный вход, редирект на `/overview` |
| AUTH-R-02 | Вход без pre-approval (незнакомый email) | Редирект на `/access-request` или error page |
| AUTH-R-03 | Session persistence (F5 после входа) | Остаётся авторизованным |
| AUTH-R-04 | Session expiry/invalid token | Редирект на `/login`, нет broken state |
| AUTH-R-05 | Sign out | Сессия уничтожена, редирект на `/login` |
| AUTH-R-06 | Invite link (`/invite/{token}`) | Корректный онбординг нового пользователя |

### 2. Route protection (auth gate)

| # | Route | Неавторизованный | Авторизованный (viewer) |
|---|-------|-----------------|------------------------|
| GATE-R-01 | `/overview` | → `/login` | 200 OK |
| GATE-R-02 | `/experiments` | → `/login` | 200 OK |
| GATE-R-03 | `/funnels` | → `/login` | 200 OK |
| GATE-R-04 | `/cohorts` | → `/login` | 200 OK |
| GATE-R-05 | `/forecasts` | → `/login` | 200 OK |
| GATE-R-06 | `/access` | → `/login` | 200 OK |
| GATE-R-07 | `/settings` | → `/login` | 200 OK |
| GATE-R-08 | `/admin` | → `/login` | 403 или → `/login` (non-admin) |

### 3. RBAC enforcement

| # | Case | Role | Expected |
|---|------|------|----------|
| RBAC-R-01 | Admin panel доступен | admin | `/admin` → 200 |
| RBAC-R-02 | Admin panel недоступен | viewer | 403 или redirect |
| RBAC-R-03 | Admin panel: Users list | admin | Список пользователей виден |
| RBAC-R-04 | Admin panel: Audit log | admin | Audit entries видны |
| RBAC-R-05 | Admin panel: Requests | admin | Access requests видны |
| RBAC-R-06 | Pre-add пользователь | admin | Форма `/admin/users/pre-add` работает |
| RBAC-R-07 | Approve access request | admin | Request помечен approved |
| RBAC-R-08 | Viewer не видит admin nav | viewer | Sidebar не показывает admin link |

### 4. Session edge cases

| # | Case | Expected |
|---|------|----------|
| SES-R-01 | Параллельные вкладки, logout в одной | Другие вкладки теряют сессию (или показывают re-auth prompt) |
| SES-R-02 | Firebase ID token refresh | Сессия не прерывается при фоновом refresh |
| SES-R-03 | Открыть `/login` с активной сессией | Редирект на `/overview`, не показывает login форму |

## High-risk integrations

- Firebase Authentication (token lifecycle)
- Next.js middleware (route protection)
- Firestore (RBAC role storage)

## Pass summary

- Surface: _заполняется при прогоне_
- Build или URL: https://acceptable-benevolence-production-5a19.up.railway.app
- Owner: _заполняется при прогоне_
- Date: _заполняется при прогоне_
- Result: _PASS / FAIL / PARTIAL_
- Findings: _заполняется при прогоне_

## Notes

- Firebase Emulator доступен для изолированного тестирования: `fixtures/auth-emulator.md`
- E2E покрытие auth: `features/auth/`
- Для admin role тестирования нужен аккаунт с role=admin в Firestore (`ADMIN_SECRET_PATH` env var задан)
