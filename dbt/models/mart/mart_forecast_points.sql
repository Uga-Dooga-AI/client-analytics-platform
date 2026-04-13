-- mart_forecast_points: результаты forecast-моделей (p50/p10/p90)
-- Grain: run_id × metric × date
-- Источник: Cloud Run Jobs (jobs/forecasts) → BigQuery staging table
-- Ноутбуки с текущей реализацией прогнозов: /Users/sergeymishustin/Projects/Analytics Dashboard

with source as (
    -- TODO: создать staging-таблицу stg.forecast_runs после подключения GCP credentials
    -- Временная заглушка: пустой набор с правильной схемой
    select
        cast(null as string)        as run_id,
        cast(null as string)        as metric,
        cast(null as date)          as date,
        cast(null as float64)       as p50,
        cast(null as float64)       as p10,
        cast(null as float64)       as p90,
        cast(null as timestamp)     as generated_at
    where false  -- заглушка; убрать после подключения source
)

select
    run_id,
    metric,
    date,
    p50,
    p10,
    p90,
    generated_at
from source
order by generated_at desc, metric, date
