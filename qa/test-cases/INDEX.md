# Client Analytics Platform — Test Case Index

## Ownership

- Product: Client Analytics Platform
- Test Design Owner: QA Engineer
- QA Execution Owner: QA Engineer
- QA Automation Owner: QA Engineer (Playwright E2E)
- Release Gate Owner: QA Lead

## Surfaces

- Web: Railway deployment (Next.js), desktop browser
- Staging URL: https://acceptable-benevolence-production-5a19.up.railway.app
- iOS: не в scope для v1
- Android: не в scope для v1
- Other: n/a

## Suites

### Smoke (release-critical)
- `smoke/navigation.md` — все dashboard routes загружаются без ошибок (NAV-01..NAV-08)
- `smoke/auth-gate.md` — неавторизованный доступ перенаправляется на /login (AUTH-GATE-01..06)

### Feature packs
- `features/auth/` — Firebase Auth + RBAC (30 E2E тестов, все 8 AC покрыты)
- `features/experiments/list.md` — фильтрация, status badge, переход на detail (EXP-LIST-01..09)
- `features/experiments/detail.md` — variant comparison table, CI band, guardrail metrics (EXP-DET-01..10)
- `features/funnels/list.md` — список воронок, KPI summary, status badge (FUNNEL-LIST-01..08)
- `features/funnels/detail.md` — step-by-step funnel visualization (FUNNEL-DET-01..08)
- `features/cohorts/grid.md` — retention grid heatmap, trend charts (COH-01..09)
- `features/forecasts/list.md` — forecast runs, confidence band charts, cards (FORE-01..11)

### Regression
- `regression/auth-rbac.md` — full auth/RBAC regression pack для security changes и pre-RC

### Fixtures
- `fixtures/auth-emulator.md` — Firebase Emulator setup, seed-стратегия, review-mode path

## Release-critical flows

- Auth: успешный вход / выход, session persistence, RBAC enforcement
- Navigation: sidebar, все 7 dashboard routes без ошибок
- Experiments: list + detail с guardrail metrics
- Funnels: list + detail visualization
- Cohorts: retention grid render
- Forecasts: runs table + confidence band chart

## Правило scope selection

| Тип изменений | Что запускать |
|---|---|
| Small fix | Smoke + затронутый feature pack |
| Feature work | Smoke + feature pack + смежные области |
| Auth/security change | Smoke + `features/auth/` + `regression/auth-rbac.md` |
| RC / owner review | Smoke + все feature packs + regression + evidence pack |
| High-risk (nav shell, middleware) | Smoke + все затронутые feature packs + broader regression |

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
- Полный интерактивный browser-проход (staging): требует pre-approved Google аккаунт
- Admin role тестирование: требует аккаунт с role=admin в Firestore + `ADMIN_SECRET_PATH`

## Блокеры

- Реальные данные (BigQuery, AppMetrica) заблокированы UGAA-1166/1167 — все feature packs работают на mock data

## Notes

- Стандарт: `/Users/sergeymishustin/.paperclip/operating-standards/testing/TEST_CASE_STANDARD.md`
- E2E требуют: Firebase Emulators `--only auth,firestore` (Cloud Functions не обязателен)
- Smoke pack исполним на staging под авторизованным аккаунтом
