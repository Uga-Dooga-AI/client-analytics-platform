# Smoke: Auth Gate

## Purpose

Проверить, что неавторизованный доступ к dashboard routes перенаправляется на `/login`, а авторизованный пользователь видит контент.

## Entry points

- Build или URL: https://acceptable-benevolence-production-5a19.up.railway.app
- Surface: Web (desktop browser, Chrome)
- Starting state: браузер без активной сессии (incognito или очищенные cookies)

## Smoke cases

| # | Сценарий | Шаги | Ожидаемое |
|---|---------|------|-----------|
| AUTH-GATE-01 | Прямой доступ к `/overview` без сессии | Открыть `/overview` в incognito | Редирект на `/login` |
| AUTH-GATE-02 | Прямой доступ к `/experiments` без сессии | Открыть `/experiments` в incognito | Редирект на `/login` |
| AUTH-GATE-03 | Прямой доступ к `/admin` без сессии | Открыть `/admin` в incognito | Редирект на `/login` или 403 |
| AUTH-GATE-04 | Успешный вход через Google SSO | На `/login` нажать "Sign in with Google", завершить OAuth flow | Редирект на `/overview`, sidebar видна |
| AUTH-GATE-05 | Сессия сохраняется после перезагрузки | После входа обновить страницу | Остаётся авторизованным, нет редиректа на `/login` |
| AUTH-GATE-06 | Выход из системы | Нажать Sign Out (если есть в UI) | Сессия завершена, редирект на `/login` |

## Preconditions

- Firebase Authentication настроен и деплой завершён
- Google SSO доступен для тестового аккаунта (pre-added или approved)
- Staging URL доступен

## Steps для AUTH-GATE-04 (happy path)

1. Открыть https://acceptable-benevolence-production-5a19.up.railway.app/login в incognito.
2. Убедиться, что видна страница входа с кнопкой "Sign in with Google".
3. Нажать кнопку входа.
4. Завершить Google OAuth flow (выбрать аккаунт, если нужно).
5. Убедиться, что произошёл редирект на `/overview`.
6. Убедиться, что sidebar видна и активен пункт "Overview".

## Expected result

- Неавторизованные запросы → `/login` (не blank screen, не 500)
- Успешный вход → `/overview`
- Сессия persist между перезагрузками

## Severity

Critical — сломанный auth gate делает продукт недоступным.

## Evidence

- Screenshots: _заполняется при прогоне_
- Notes: _заполняется при прогоне_

## Known exclusions

- Google SSO popup может быть заблокирован — использовать pre-approved account или Firebase Emulator (см. `fixtures/auth-emulator.md`)
- RBAC enforcement тестируется в `features/auth/` и `regression/auth-rbac.md`
