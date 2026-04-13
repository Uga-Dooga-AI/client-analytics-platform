# Feature Pack: Cohorts — Retention Grid

## Feature

- Name: Cohorts Grid (`/cohorts`)
- Owner: QA Engineer
- Related issue: UGAA-1285

## Risk summary

- What changed: страница когорт с retention grid heatmap (цветовая тепловая карта), trend charts (SVG line charts)
- What it can break nearby: SVG rendering, heatColor function (rgba вычисление), TopFilterRail

## Happy path

1. Авторизованный пользователь открывает `/cohorts`.
2. Видит TopFilterRail с заголовком "Cohorts".
3. Видит retention grid: строки = когорты, колонки = периоды (D0, D1, D3, D7, D14, D30).
4. Каждая ячейка окрашена в оттенок синего по retention value (тёмнее = выше retention).
5. Под grid видны trend charts для каждой когорты (SVG line charts).
6. Project filter в TopFilterRail фильтрует когорты.

## Edge cases

1. Cohort с retention 0 → светлая ячейка (panel-soft цвет), нет деления на ноль.
2. Cohort с retention 100 → максимально тёмная ячейка (alpha 0.88).
3. Trend chart с одной точкой данных → рендерится без ошибки.
4. Пустой список когорт после фильтрации → пустой grid, нет крэша.

## Test cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| COH-01 | Page load | Открыть `/cohorts` | Страница рендерится, нет error |
| COH-02 | Grid headers | Проверить колонки | D0, D1, D3, D7, D14, D30 видны |
| COH-03 | Heatmap colors | Сравнить ячейки с высоким и низким retention | Более тёмные ячейки у высокого retention |
| COH-04 | Zero retention | Ячейка с 0% retention | Цвет panel-soft (не синий), нет NaN |
| COH-05 | Max retention (D0) | Ячейка D0 | 100% = тёмно-синяя, alpha ~0.88 |
| COH-06 | Trend charts | Проверить SVG chart под grid | Line chart виден для каждой когорты |
| COH-07 | Project filter | Выбрать project | Список когорт фильтруется |
| COH-08 | Cohort label | Проверить row labels | Дата или название когорты видно |
| COH-09 | No cohorts filter | Фильтр без когорт | Пустой grid, нет JS error |

## Telemetry, crash, auth notes

- Auth: требует авторизацию
- SVG: проверить отсутствие NaN в атрибутах `d`, `cx`, `cy`, `r`
- heatColor: alpha вычисляется как `value/100`, при value=0 → fallback 0.12 (не прозрачно)

## Impacted adjacent areas

- TopFilterRail (shared)
- Любое изменение heatColor затронет весь grid

## Evidence

- Screenshots: _заполняется при прогоне_
- Logs: _заполняется при прогоне_
- Findings: _заполняется при прогоне_
