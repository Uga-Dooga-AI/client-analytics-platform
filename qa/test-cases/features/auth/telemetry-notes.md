# Auth Feature Pack — Telemetry Notes

## Audit Log

Audit log — это основной observability-инструмент для auth/admin операций.

### Проверяемые события

| Событие | Коллекция Firestore | Поля обязательные |
|---------|--------------------|--------------------|
| Вход с pre-add | `audit_log` | action=role_assigned, targetUid, newRole |
| Одобрение запроса | `audit_log` | action=access_approved, actorUid, targetUid, newRole |
| Отклонение запроса | `audit_log` | action=access_rejected, actorUid, targetUid |
| Pre-add пользователя | `audit_log` | action=user_pre_added, actorUid, targetEmail, newRole |
| Смена роли | `audit_log` | action=role_changed, oldRole, newRole, actorUid |

### Проверка через E2E

Все audit log assertions — в `e2e/auth/audit-log.spec.ts` через `GET /api/admin/audit`.

### В production

- Запросы к audit log доступны только `admin` / `super_admin`
- Не выводятся в клиентские bundle'ы
- В Railway — через Admin Dashboard `/admin/audit`

## Firebase Auth Emulator сигналы

При запуске emulator:
- Auth Emulator UI: `http://localhost:4000/auth`
- Firestore Emulator UI: `http://localhost:4000/firestore`
- Логи onUserLogin trigger видны в Emulator UI → Functions вкладке

## Что НЕ проверяется E2E тестами (in-scope, но ручная проверка нужна)

- Google OAuth popup (browser dialog — невозможно автоматизировать)
- Email link sign-in (если будет добавлен в v2)
- Firebase security rules (покрываются отдельно через `firebase emulators:exec`)
- Rate limiting и abuse protection (вне scope v1)
