# Client Analytics Platform — Test Case Index

## Ownership

- Product: Client Analytics Platform
- Test Design Owner: QA Engineer
- QA Execution Owner: QA Engineer
- QA Automation Owner: QA Engineer (Playwright E2E)
- Release Gate Owner: QA Lead

## Surfaces

- Web: Railway deployment (Next.js), desktop browser
- iOS: не в scope для v1
- Android: не в scope для v1
- Other: n/a

## Suites

- Smoke: `qa/test-cases/smoke/`
  - `auth-smoke.md` — sign-in, sign-out, session persistence
  - `nav-smoke.md` — sidebar navigation, placeholder routes
- Feature packs: `qa/test-cases/features/`
  - `auth/` — Firebase Auth + RBAC (30 E2E тестов, все 8 AC покрыты)
  - `overview.md` — overview page: KPI strip, tables, panels
- Regression: `qa/test-cases/regression/` _(заполняется к RC)_
- Fixtures: `qa/test-cases/fixtures/`
  - `auth-emulator.md` — Firebase Emulator setup, seed-стратегия, review-mode path

## Release-critical flows

- Auth: успешный вход / выход, session persistence, RBAC enforcement
- Navigation: sidebar, route transitions без ошибок
- Overview page: рендер KPI strip и основных панелей

## Правило scope selection

| Тип изменений | Что запускать |
|---|---|
| Small fix | Smoke + затронутый branch |
| Feature work | Smoke + feature pack + смежные области |
| RC / owner review | Smoke + feature pack + regression + evidence pack |
| High-risk (auth, nav, infra) | Smoke + feature pack + broader regression |

## Auth E2E — быстрый запуск

```bash
# Запустить Firebase Emulators (только auth + firestore)
firebase emulators:start --only auth,firestore

# Запустить E2E тесты
cd client-analytics-platform
npm run test:e2e -- e2e/auth/

# Отдельные AC
npx playwright test e2e/auth/bootstrap.spec.ts  # AC-8
npx playwright test e2e/auth/login.spec.ts       # AC-1, AC-2
npx playwright test e2e/auth/rbac.spec.ts        # AC-5, AC-6
```

## Current review-mode path

- Firebase Emulator: настроен (`firebase.json`, `.env.test`)
- Playwright E2E: настроен (`playwright.config.ts`, `e2e/`)
- Mock auth для browser-прохода: через E2E seed helpers (без Google OAuth popup)
- Полный интерактивный browser-проход с UI: **заблокирован UGAA-1169** (production Firebase creds)

## Notes

- Стандарт: `/Users/sergeymishustin/.paperclip/operating-standards/testing/TEST_CASE_STANDARD.md`
- E2E требуют: Firebase Emulators `--only auth,firestore` (Cloud Functions не обязателен)
- Реальные данные (BigQuery, AppMetrica) заблокированы задачами UGAA-1166/1167
- Auth E2E полностью готовы к запуску как только Firebase Emulators запущены
