# Firebase QA Test User

Тестовый пользователь для authenticated browser pass на staging.  
Создан через Firebase Admin SDK, 2026-04-13.

## Credentials

| Field         | Value                                 |
|---------------|---------------------------------------|
| **UID**       | `8HjaxnraSSMdhYPMi8ZaoMNqe9h2`       |
| **Email**     | `qa-test@analytics-platform.test`     |
| **Password**  | `qatest-staging-2026`                 |
| **Verified**  | `true`                                |
| **Project**   | Firebase project в Railway production  |

## Использование в Playwright

```typescript
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

const auth = getAuth();
const { user } = await signInWithEmailAndPassword(
  auth,
  "qa-test@analytics-platform.test",
  "qatest-staging-2026"
);
const idToken = await user.getIdToken();
// Передать idToken в cookies или Authorization header
```

Если нужен custom token (истекает через 1 час) — пересоздать через:
```bash
node scripts/create-firebase-test-user.mjs
```

## Пересоздание через Admin SDK

Скрипт: `scripts/create-firebase-test-user.mjs`  
Запуск: нужны env vars `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`  
Скрипт идемпотентен — если user уже существует, просто выдаёт новый custom token.
