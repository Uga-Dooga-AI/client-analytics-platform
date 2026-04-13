# Feature Pack: Experiments — List

## Feature

- Name: Experiments List (`/experiments`)
- Owner: QA Engineer
- Related issue: UGAA-1285

## Risk summary

- What changed: страница экспериментов с фильтрацией по project, status badge, переходом на detail
- What it can break nearby: TopFilterRail (shared component), dashboard routing

## Happy path

1. Авторизованный пользователь открывает `/experiments`.
2. Видит список экспериментов (mock data): название, project, status badge (Running/Paused/Concluded).
3. Выбирает фильтр по project в TopFilterRail — список обновляется, показывает только эксперименты выбранного project.
4. Нажимает на experiment card — переходит на `/experiments/{id}`.
5. Возвращается кнопкой Back или breadcrumb — снова на `/experiments`.

## Edge cases

1. Нет экспериментов для выбранного фильтра project — список пуст, нет крэша.
2. Неизвестный project в URL query param — страница рендерится без ошибки (fallback на All projects).
3. Кнопка "+ New experiment" — присутствует в UI (функциональность v2, клик не должен крэшить).

## Test cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| EXP-LIST-01 | Default render | Открыть `/experiments` | Список виден, нет error boundary |
| EXP-LIST-02 | Status badge Running | Найти experiment со статусом Running | Зелёный badge "Running" |
| EXP-LIST-03 | Status badge Paused | Найти experiment со статусом Paused | Жёлтый badge "Paused" |
| EXP-LIST-04 | Status badge Concluded | Найти experiment со статусом Concluded | Серый badge "Concluded" |
| EXP-LIST-05 | Project filter | Выбрать конкретный project в TopFilterRail | Список фильтруется, счётчик обновляется |
| EXP-LIST-06 | Clear filter | Вернуть "All projects" | Показываются все эксперименты |
| EXP-LIST-07 | Navigate to detail | Кликнуть по experiment card | Переход на `/experiments/{id}` |
| EXP-LIST-08 | Empty filter result | Выбрать project без экспериментов | Пустой список, нет JS error |
| EXP-LIST-09 | Experiment count label | Проверить sub-header | Отображает "N experiments for <project>" |

## Telemetry, crash, auth notes

- Events: нет специфических аналитических событий в mock phase
- Auth: требует авторизацию; неавторизованный пользователь → `/login`
- Console: проверить отсутствие unhandled promise rejection

## Impacted adjacent areas

- TopFilterRail (shared) — изменения могут затронуть все dashboard pages
- Dashboard routing (`/experiments/[id]`) — навигационный flow

## Evidence

- Screenshots: _заполняется при прогоне_
- Logs: _заполняется при прогоне_
- Findings: _заполняется при прогоне_
