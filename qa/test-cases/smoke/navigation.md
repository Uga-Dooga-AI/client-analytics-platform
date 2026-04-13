# Smoke: Dashboard Navigation

## Purpose

Проверить, что все dashboard routes загружаются без blocking runtime error для авторизованного пользователя.

## Entry points

- Build или URL: https://acceptable-benevolence-production-5a19.up.railway.app
- Surface: Web (desktop browser, Chrome)
- Starting state: пользователь авторизован через Google SSO

## Smoke cases

| # | Route | URL | Ожидаемое |
|---|-------|-----|-----------|
| NAV-01 | Overview | `/overview` | Страница рендерится, KPI strip видна, нет console error уровня fatal |
| NAV-02 | Experiments list | `/experiments` | Список экспериментов рендерится, TopFilterRail присутствует |
| NAV-03 | Funnels list | `/funnels` | Список воронок рендерится, KPI summary виден |
| NAV-04 | Cohorts | `/cohorts` | Retention grid heatmap рендерится |
| NAV-05 | Forecasts | `/forecasts` | Список forecast runs рендерится, confidence band chart виден |
| NAV-06 | Access | `/access` | Страница управления доступом рендерится |
| NAV-07 | Settings | `/settings` | Страница настроек рендерится |
| NAV-08 | Root redirect | `/` | Редиректит на `/overview` (или `/login` если не авторизован) |

## Preconditions

- Пользователь авторизован через Google SSO (роль viewer или выше)
- Staging URL доступен
- Нет активных deployment-ов, мешающих запросам

## Steps

1. Открыть staging URL в браузере.
2. Убедиться, что auth redirect завершён — видна sidebar навигация.
3. Последовательно перейти по каждому route из таблицы выше.
4. Для каждого route: проверить отсутствие blank screen, crash overlay или неперехваченных ошибок (console).
5. Проверить, что sidebar активный пункт меняется при каждом переходе.

## Expected result

Все 8 routes загружаются без blocking error. Sidebar подсвечивает активный пункт. Нет JS runtime crash.

## Severity

Critical — любая поломка навигации блокирует работу с продуктом.

## Evidence

- Screenshots: _заполняется при прогоне_
- Console errors: _заполняется при прогоне_
- Notes: _заполняется при прогоне_

## Known exclusions

- Реальные данные BigQuery не проверяются (заблокированы UGAA-1166/1167) — страницы рендерятся на mock data
- Admin panel (`/admin`) в данный smoke не входит (отдельный flow)
