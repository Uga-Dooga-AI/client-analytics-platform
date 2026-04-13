# Feature Pack: Funnels — List

## Feature

- Name: Funnels List (`/funnels`)
- Owner: QA Engineer
- Related issue: UGAA-1285

## Risk summary

- What changed: страница списка воронок с KPI summary, status badge (healthy/watch/risk), фильтрацией по project, переходом на detail
- What it can break nearby: TopFilterRail (shared), sidebar navigation

## Happy path

1. Авторизованный пользователь открывает `/funnels`.
2. Видит список воронок: название, project, KPI summary (conversion rate, drop-off).
3. Каждая воронка имеет status badge: Healthy / Watch / Risk.
4. Выбирает фильтр по project — список фильтруется.
5. Кликает на воронку — переходит на `/funnels/{id}`.

## Edge cases

1. Фильтр по project без воронок → пустой список, нет крэша.
2. Воронка с risk статусом — красный badge отображается.
3. Кнопка "+ New funnel" (если есть) — не крэшит при клике.

## Test cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| FUNNEL-LIST-01 | Default render | Открыть `/funnels` | Список виден, нет error boundary |
| FUNNEL-LIST-02 | KPI summary | Проверить каждую карточку воронки | Conversion rate / drop-off метрики отображаются |
| FUNNEL-LIST-03 | Badge Healthy | Найти funnel Healthy | Зелёный badge "Healthy" |
| FUNNEL-LIST-04 | Badge Watch | Найти funnel Watch | Жёлтый badge "Watch" |
| FUNNEL-LIST-05 | Badge Risk | Найти funnel Risk | Красный badge "Risk" |
| FUNNEL-LIST-06 | Project filter | Выбрать project в TopFilterRail | Список фильтруется корректно |
| FUNNEL-LIST-07 | Navigate to detail | Кликнуть на funnel card | Переход на `/funnels/{id}` |
| FUNNEL-LIST-08 | Empty filter | Выбрать project без воронок | Пустой список, нет ошибок |

## Telemetry, crash, auth notes

- Auth: требует авторизацию
- KPI summary критичен — неправильные числа или missing = дефект medium+

## Impacted adjacent areas

- TopFilterRail (shared component)
- Funnels detail page (navigation)

## Evidence

- Screenshots: _заполняется при прогоне_
- Logs: _заполняется при прогоне_
- Findings: _заполняется при прогоне_
