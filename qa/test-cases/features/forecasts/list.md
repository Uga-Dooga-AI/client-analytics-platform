# Feature Pack: Forecasts — List

## Feature

- Name: Forecasts List (`/forecasts`)
- Owner: QA Engineer
- Related issue: UGAA-1285

## Risk summary

- What changed: страница прогнозов с forecast runs table, confidence band chart (SVG), forecast cards
- What it can break nearby: ConfidenceBandChart component (custom SVG), TopFilterRail

## Happy path

1. Авторизованный пользователь открывает `/forecasts`.
2. Видит TopFilterRail с заголовком "Forecasts".
3. Видит таблицу или список forecast runs (название, project, статус: Completed/Running/Review).
4. Видит confidence band chart (SVG) для каждого trajectory — линия прогноза с полосой неопределённости.
5. Видит forecast cards с индикатором: Stable / Converging / Wide interval.
6. Project filter в TopFilterRail фильтрует runs, cards, trajectories.

## Edge cases

1. Фильтр без forecast runs → пустая таблица, нет крэша.
2. Running forecast (в процессе) → badge "Running" с синим цветом.
3. Forecast с wide interval → жёлтый badge "Wide interval" на card.
4. Chart с минимальными данными (1-2 точки) → рендерится без SVG-ошибок.

## Test cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| FORE-01 | Page load | Открыть `/forecasts` | Страница рендерится без error |
| FORE-02 | Runs table | Проверить список forecast runs | Runs видны с названием, project, статусом |
| FORE-03 | Badge Completed | Найти run Completed | Зелёный badge "Completed" |
| FORE-04 | Badge Running | Найти run Running | Синий badge "Running" |
| FORE-05 | Badge Review | Найти run needs_review | Жёлтый badge "Review" |
| FORE-06 | Confidence band chart | Проверить SVG chart | Chart виден, нет NaN в SVG атрибутах |
| FORE-07 | Card Stable | Найти forecast card Stable | Зелёный badge "Stable" |
| FORE-08 | Card Converging | Найти forecast card Converging | Синий badge "Converging" |
| FORE-09 | Card Wide | Найти forecast card Wide interval | Жёлтый badge "Wide interval" |
| FORE-10 | Project filter | Выбрать project | Runs, cards, charts фильтруются |
| FORE-11 | Empty filter | Project без forecasts | Пустой список, нет JS error |

## Telemetry, crash, auth notes

- Auth: требует авторизацию
- ConfidenceBandChart — кастомный SVG компонент, проверить отсутствие NaN/Infinity в path `d` атрибутах
- Wide interval = потенциальный product risk signal, визуальная корректность критична

## Impacted adjacent areas

- TopFilterRail (shared)
- ConfidenceBandChart (reusable chart component)

## Evidence

- Screenshots: _заполняется при прогоне_
- Logs: _заполняется при прогоне_
- Findings: _заполняется при прогоне_
