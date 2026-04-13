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

| Модель | Статус | Ожидает |
|---|---|---|
| `stg_events` | Заглушка | GCP credentials (UGAA-1167) |
| `stg_ab_exposures` | Заглушка | GCP credentials (UGAA-1167) |
| `mart_experiment_daily` | Заглушка | stg_events, stg_ab_exposures |
| `mart_funnel_daily` | Заглушка | stg_events |
| `mart_cohort_daily` | Заглушка | stg_events |
| `mart_forecast_points` | Заглушка | Cloud Run Jobs (jobs/forecasts) |

## TODO после получения credentials

- [ ] Заменить `YOUR_GCP_PROJECT_ID` в `sources.yml` на реальный project ID
- [ ] Активировать `mart_forecast_points` — подключить `stg.forecast_runs`
- [ ] Параметризовать целевое событие для активаций в `mart_experiment_daily`
- [ ] Перенести определения воронок в `seeds/funnel_definitions.csv`
- [ ] Добавить revenue source для `revenue` в `mart_experiment_daily` и `ltv` в `mart_cohort_daily`
- [ ] Настроить dbt Cloud или Cloud Run Job для daily-запуска
