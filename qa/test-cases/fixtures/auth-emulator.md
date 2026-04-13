# Fixtures: Firebase Auth Emulator

## Назначение

Описание тестовой среды, test accounts, seed-стратегии и review-mode path для Auth + RBAC тестирования.

## Emulator setup

### Требуемые emulators

```bash
# Минимум для E2E Auth тестов:
firebase emulators:start --only auth,firestore

# Полный набор (auth + firestore + functions + UI):
firebase emulators:start
```

Порты по умолчанию (`firebase.json`):
- Auth: `localhost:9099`
- Firestore: `localhost:8080`
- Functions: `localhost:5001`
- Emulator UI: `localhost:4000`

### .env.test переменные

Файл: `client-analytics-platform/.env.test`

```env
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-test
NEXT_PUBLIC_FIREBASE_API_KEY=demo-key
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=localhost:9099

FIREBASE_PROJECT_ID=demo-test
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
FIRESTORE_EMULATOR_HOST=localhost:8080

SUPERADMIN_BOOTSTRAP_KEY=test-bootstrap-key-1234
```

## Test accounts strategy

E2E тесты **не используют фиксированные test accounts**. Каждый тест:
1. Вызывает `clearEmulatorData()` в `beforeEach` — очищает всех пользователей и Firestore
2. Создаёт нужных пользователей через emulator REST API
3. Удаляет их автоматически через `clearEmulatorData()` в следующем тесте

Это гарантирует изоляцию тестов.

## Seed helpers

| Хелпер | Расположение | Назначение |
|--------|-------------|-----------|
| `emulatorSignUp` | `e2e/helpers/emulator.ts` | Создать пользователя |
| `emulatorSignIn` | `e2e/helpers/emulator.ts` | Sign in, получить idToken |
| `emulatorRefreshToken` | `e2e/helpers/emulator.ts` | Обновить claims в токене |
| `clearEmulatorData` | `e2e/helpers/emulator.ts` | Очистить всё |
| `loginAs` | `e2e/helpers/auth.ts` | Создать + inject session cookie |
| `logout` | `e2e/helpers/auth.ts` | Выйти, очистить cookies |
| `bootstrapSuperAdmin` | `e2e/helpers/seed.ts` | Bootstrap super_admin через API |
| `approveRequest` | `e2e/helpers/seed.ts` | Approve access request через API |
| `rejectRequest` | `e2e/helpers/seed.ts` | Reject request через API |
| `preAddUser` | `e2e/helpers/seed.ts` | Pre-add через API |
| `seedUserDoc` | `e2e/helpers/firestore.ts` | Direct Firestore seed |
| `seedAccessRequest` | `e2e/helpers/firestore.ts` | Direct Firestore seed |
| `setEmulatorCustomClaims` | `e2e/helpers/firestore.ts` | Custom claims через emulator REST |

## Review-mode path

**Mock-auth / seeded session для owner/client review:**

Пока Firebase production credentials не настроены (UGAA-1169), для интерактивного browser-прохода используется эта процедура:

1. Запустить Firebase Emulator: `firebase emulators:start --only auth,firestore`
2. Запустить Next.js с emulator env vars: see `.env.test`
3. Открыть Emulator UI: `http://localhost:4000/auth`
4. Нажать "Add user" → создать test admin user
5. Записать UID
6. Вызвать bootstrap через curl:
   ```bash
   curl -X POST http://localhost:3100/api/admin/bootstrap \
     -H 'Content-Type: application/json' \
     -d '{"uid":"<UID>","bootstrapKey":"test-bootstrap-key-1234"}'
   ```
7. Sign in через `/login` в браузере через Google (emulator не поддерживает popup — нужна production Firebase config)

**Ограничение:** Google OAuth popup не работает с emulator. Для полного browser-прохода через UI — нужен настроенный Firebase project (UGAA-1169).

Для API-level тестирования (без popup) — E2E тесты через Playwright достаточны.
