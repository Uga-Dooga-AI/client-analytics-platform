-- mart_experiment_daily: дневная агрегация по экспериментам
-- Grain: experiment_id × variant_key × date
-- Используется UI дашбордом для A/B-анализа

with exposures as (
    select
        experiment_id,
        variant_key,
        exposure_date                       as date,
        count(distinct device_id)           as exposures
    from {{ ref('stg_ab_exposures') }}
    group by 1, 2, 3
),

activations as (
    -- Активация = первое целевое событие пользователя после экспозиции в тот же день
    -- TODO: заменить на реальную бизнес-цель (например subscription_start, level_complete)
    select
        ab.experiment_id,
        ab.variant_key,
        ab.exposure_date                    as date,
        count(distinct ev.device_id)        as activations
    from {{ ref('stg_ab_exposures') }} ab
    inner join {{ ref('stg_events') }} ev
        on  ev.device_id = ab.device_id
        and ev.event_date = ab.exposure_date
        and ev.event_name = 'activation'    -- TODO: параметризовать через var()
    group by 1, 2, 3
),

-- Guardrail: crash / error events как сигнал качества
guardrail as (
    select
        ab.experiment_id,
        ab.variant_key,
        ab.exposure_date                    as date,
        count(distinct case when ev.event_name = 'app_crash' then ev.device_id end)   as crashes,
        count(distinct case when ev.event_name = 'error' then ev.device_id end)       as errors
    from {{ ref('stg_ab_exposures') }} ab
    left join {{ ref('stg_events') }} ev
        on  ev.device_id = ab.device_id
        and ev.event_date = ab.exposure_date
    group by 1, 2, 3
)

select
    e.experiment_id,
    e.variant_key                           as variant,
    e.date,
    e.exposures,
    coalesce(a.activations, 0)              as activations,
    cast(null as float64)                   as revenue,          -- TODO: подключить revenue source
    coalesce(g.crashes, 0)                  as guardrail_crashes,
    coalesce(g.errors, 0)                   as guardrail_errors
from exposures e
left join activations a  using (experiment_id, variant_key, date)
left join guardrail  g   using (experiment_id, variant_key, date)
order by e.date desc, e.experiment_id, e.variant_key
