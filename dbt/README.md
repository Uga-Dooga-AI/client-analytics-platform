# dbt — Client Analytics Platform

Слой трансформации данных для Client Analytics Platform.  
Стек: dbt Core + Google BigQuery.

## Структура

```
dbt/
  dbt_project.yml          # конфигурация проекта
  profiles.yml.example     # шаблон подключения BigQuery (без credentials)
  models/
    staging/
      sources.yml          # определение источников AppMetrica BQ tables
      stg_events.sql       # нормализация AppMetrica event stream
      stg_ab_exposures.sql # разбор ab_* событий → экспозиции A/B
    mart/
      mart_experiment_daily.sql   # A/B результаты по дням
      mart_funnel_daily.sql       # воронки по шагам
      mart_cohort_daily.sql       # когорты удержания и LTV
      mart_forecast_points.sql    # прогнозные точки p50/p10/p90
      schema.yml                  # column docs + тесты
```

## Подключение реальных данных

### 1. Создайте `profiles.yml`

Скопируйте шаблон и заполните реальные значения:

```bash
cp profiles.yml.example ~/.dbt/profiles.yml
```

Заполните:
- `YOUR_GCP_PROJECT_ID` — ID вашего GCP-проекта
- `keyfile` — путь к JSON-ключу service account с ролью `BigQuery Data Editor` + `BigQuery Job User`

### 2. Установите зависимости

```bash
pip install dbt-bigquery
```

### 3. Проверьте подключение

```bash
cd dbt/
dbt debug
```

### 4. Задайте переменные окружения

```bash
export GCP_SOURCE_PROJECT=your-appmetrica-bq-project-id
```

Или передайте через `--vars` при запуске:

```bash
dbt run --vars '{"GCP_SOURCE_PROJECT": "your-project-id"}'
```

### 5. Запустите модели

```bash
# только staging
dbt run --select staging

# только mart
dbt run --select mart

# всё
dbt run

# с тестами
dbt test
```

## Состояние моделей

| Модель | Статус | Примечание |
|---|---|---|
| `stg_appmetrica__events` | Runtime-ready | Typed raw events surface over BigQuery `raw.events` |
| `stg_appmetrica__installs` | Runtime-ready | Typed installs surface over BigQuery `raw.installs` |
| `stg_appmetrica__sessions` | Runtime-ready | Typed sessions surface over BigQuery `raw.sessions` |
| `stg_appmetrica__ab_events` | Runtime-ready | A/B exposure events parsed from `ab_*` stream |
| `stg_events` | Compatibility view | Legacy view over `stg_appmetrica__events` for older marts |
| `stg_ab_exposures` | Compatibility view | Legacy view over `stg_appmetrica__ab_events` |
| `fact_experiment_exposure` | Runtime-ready | First exposure fact table for experiment analytics |
| `mart_experiment_daily` | Runtime-ready | A/B daily mart with activation/revenue/guardrail metrics |
| `mart_daily_active_users` | Runtime-ready | DAU plus rolling 7d/30d active user windows |
| `mart_installs_funnel` | Runtime-ready | Acquisition funnel from installs and sessions |
| `mart_session_metrics` | Runtime-ready | Session duration and bucket metrics |
| `mart_revenue_metrics` | Runtime-ready | Revenue mart from purchase/subscription events |
| `mart_cohort_daily` | Runtime-ready | Install cohorts with retention and cumulative LTV |
| `mart_funnel_daily` | Prototype | Hardcoded funnel definitions; should move to seeds/vars |
| `mart_forecast_points` | Runtime-wired | Forecast worker output table `{project_slug}_forecast_points` |

## TODO после получения credentials

- [ ] Заменить `YOUR_GCP_PROJECT_ID` в `sources.yml` на реальный project ID
- [ ] Перенести определения воронок в `seeds/funnel_definitions.csv`
- [ ] Задать `experiment_activation_event` / `experiment_activation_window_days` под конкретный продукт
- [ ] Вывести app-level revenue events к единому semantic contract, если SDK-схема отличается между проектами
- [ ] Добавить app_id в installs source, если он доступен в Logs export, чтобы cohort/install marts можно было фильтровать и по app_id
- [ ] Настроить dbt Cloud или Cloud Run Job для daily-запуска
