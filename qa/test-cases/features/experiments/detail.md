# Feature Pack: Experiments — Detail

## Feature

- Name: Experiment Detail (`/experiments/[id]`)
- Owner: QA Engineer
- Related issue: UGAA-1285

## Risk summary

- What changed: страница деталей эксперимента с variant comparison table, CI band, guardrail metrics
- What it can break nearby: routing (dynamic `[id]` segment), mock data lookup

## Happy path

1. Из списка экспериментов кликнуть на experiment.
2. Открывается `/experiments/{id}`.
3. Видна breadcrumb "Experiments / {experiment.name}".
4. Виден status badge эксперимента.
5. Видна variant comparison table (Control vs Variant columns).
6. Виден confidence interval (CI) band для каждой метрики.
7. Видны guardrail metrics с цветовым индикатором (ok/warn/risk).
8. Клик "Back to experiments" / breadcrumb → возврат на `/experiments`.

## Edge cases

1. Несуществующий ID в URL (`/experiments/nonexistent`) → error state "Experiment not found", ссылка назад на список.
2. Experiment без detail data → graceful fallback, нет крэша.
3. Guardrail с риском (risk status) → красный индикатор отображается корректно.

## Test cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| EXP-DET-01 | Detail page load | Кликнуть на experiment в списке | Страница `/experiments/{id}` загружается без error |
| EXP-DET-02 | Breadcrumb | Проверить nav breadcrumb | "Experiments / {name}" с кликабельной ссылкой "Experiments" |
| EXP-DET-03 | Status badge | Проверить badge статуса | Соответствует статусу из списка (цвет + текст) |
| EXP-DET-04 | Variant table | Проверить наличие таблицы variant comparison | Таблица с Control и Variant(s) колонками видна |
| EXP-DET-05 | CI band | Проверить confidence interval display | CI band или диапазон отображается для метрик |
| EXP-DET-06 | Guardrail ok | Найти guardrail с ok статусом | Зелёный индикатор |
| EXP-DET-07 | Guardrail warn | Найти guardrail с warn статусом | Жёлтый индикатор |
| EXP-DET-08 | Guardrail risk | Найти guardrail с risk статусом | Красный индикатор |
| EXP-DET-09 | Not found | Открыть `/experiments/nonexistent` | Error message + ссылка на список, нет крэша |
| EXP-DET-10 | Back navigation | Кликнуть breadcrumb "Experiments" | Редирект на `/experiments`, список виден |

## Telemetry, crash, auth notes

- Auth: требует авторизацию
- Console: нет unhandled errors при any ID
- Guardrail статусы критичны для product decision-making — визуальные проблемы = дефект

## Impacted adjacent areas

- Experiments list (breadcrumb / back navigation)
- TopFilterRail (присутствует на detail page)

## Evidence

- Screenshots: _заполняется при прогоне_
- Logs: _заполняется при прогоне_
- Findings: _заполняется при прогоне_
