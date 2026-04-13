# Feature Pack: Funnels — Detail

## Feature

- Name: Funnel Detail (`/funnels/[id]`)
- Owner: QA Engineer
- Related issue: UGAA-1285

## Risk summary

- What changed: страница деталей воронки со step-by-step funnel visualization (бар-чарт, % переходов между шагами)
- What it can break nearby: routing (`/funnels/[id]`), SVG/chart rendering

## Happy path

1. Из списка воронок кликнуть на воронку.
2. Открывается `/funnels/{id}`.
3. Видна breadcrumb "Funnels / {funnel.name}".
4. Видна funnel visualization: шаги последовательно сверху вниз (или слева направо).
5. Каждый шаг показывает: название, количество пользователей, % от предыдущего шага (conversion rate).
6. Drop-off между шагами обозначен.
7. Breadcrumb/Back → возврат на `/funnels`.

## Edge cases

1. Несуществующий ID → error state или 404, нет крэша.
2. Воронка с одним шагом → корректный рендер без ошибок.
3. Drop-off 100% (0 пользователей на последнем шаге) → отображается без деления на ноль.

## Test cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| FUNNEL-DET-01 | Detail page load | Кликнуть на funnel в списке | Страница загружается без error |
| FUNNEL-DET-02 | Breadcrumb | Проверить nav | "Funnels / {name}" с кликабельной ссылкой |
| FUNNEL-DET-03 | Step visualization | Проверить шаги воронки | Шаги отрендерены последовательно |
| FUNNEL-DET-04 | Step counts | Проверить числа пользователей | Каждый шаг имеет count |
| FUNNEL-DET-05 | Conversion rate | Проверить % между шагами | % отображается, нет NaN/undefined |
| FUNNEL-DET-06 | Drop-off indicator | Проверить drop-off | Потери между шагами обозначены |
| FUNNEL-DET-07 | Not found | Открыть `/funnels/nonexistent` | Error message, нет крэша |
| FUNNEL-DET-08 | Back navigation | Breadcrumb "Funnels" | Редирект на `/funnels` |

## Telemetry, crash, auth notes

- Auth: требует авторизацию
- Chart rendering: проверить SVG/DOM на деление на ноль или NaN в атрибутах

## Impacted adjacent areas

- Funnels list (breadcrumb)
- TopFilterRail

## Evidence

- Screenshots: _заполняется при прогоне_
- Logs: _заполняется при прогоне_
- Findings: _заполняется при прогоне_
