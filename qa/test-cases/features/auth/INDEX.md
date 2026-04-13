# Feature Pack: Firebase Auth + RBAC

## Ownership

- Feature: Firebase Auth + RBAC (UGAA-1192)
- Test Design Owner: QA Engineer
- Spec files: `e2e/auth/`
- Related issues: [UGAA-1192](/UGAA/issues/UGAA-1192), [UGAA-1197](/UGAA/issues/UGAA-1197)

## Emulator prerequisites

```bash
firebase emulators:start --only auth,firestore
# Auth:      localhost:9099
# Firestore: localhost:8080
# UI:        localhost:4000
```

Cloud Functions emulator NOT required — tests seed state directly via emulator REST API.

## Spec files

| Файл | AC покрытые | Описание |
|------|------------|----------|
| `e2e/auth/login.spec.ts` | AC-1, AC-1 (session), AC-2 | Sign-in flow, session cookie, уnapproved redirect |
| `e2e/auth/access-request.spec.ts` | AC-3 | Admin одобряет / отклоняет запрос доступа |
| `e2e/auth/pre-add.spec.ts` | AC-4 | Pre-add → прямой доступ без очереди |
| `e2e/auth/rbac.spec.ts` | AC-5, AC-6 | Role-based route access per permission matrix |
| `e2e/auth/audit-log.spec.ts` | AC-7 | Audit log entries for all admin actions |
| `e2e/auth/bootstrap.spec.ts` | AC-8 | Bootstrap endpoint behaviour + security |

## Test counts

| Файл | Тестов |
|------|--------|
| login.spec.ts | 4 |
| access-request.spec.ts | 4 |
| pre-add.spec.ts | 3 |
| rbac.spec.ts | 8 |
| audit-log.spec.ts | 6 |
| bootstrap.spec.ts | 5 |
| **Итого** | **30** |

## Run commands

```bash
# Smoke (login + basic session)
npx playwright test e2e/auth/login.spec.ts e2e/auth/bootstrap.spec.ts

# Feature pack (все AC)
npm run test:e2e -- e2e/auth/

# Full with report
npm run test:e2e
```

## Fixtures / review mode path

Описание test fixtures → `qa/test-cases/fixtures/auth-emulator.md`

## Acceptance criteria coverage

| AC | Тест | Статус |
|----|------|--------|
| AC-1: Google SSO login → session создана | login.spec.ts: строки 1–2 | ✅ Покрыт |
| AC-2: Новый аккаунт → access-request экран | login.spec.ts: строка 3 | ✅ Покрыт |
| AC-3: Admin одобряет запрос → доступ | access-request.spec.ts | ✅ Покрыт |
| AC-4: Pre-add → direct access | pre-add.spec.ts | ✅ Покрыт |
| AC-5: viewer/ab_analyst RBAC | rbac.spec.ts: AC-5 suite | ✅ Покрыт |
| AC-6: /admin только admin/super_admin | rbac.spec.ts: AC-6 suite | ✅ Покрыт |
| AC-7: Смена роли → audit_log | audit-log.spec.ts | ✅ Покрыт |
| AC-8: Bootstrap endpoint | bootstrap.spec.ts | ✅ Покрыт |
