-- mart_funnel_daily: дневная воронка по шагам
-- Grain: funnel_id × step_name × date
-- Воронки определяются через seed-файл или dbt var(); здесь — hardcoded заглушки

-- TODO: перенести определения воронок в seeds/funnel_definitions.csv
-- Пример воронок: onboarding, subscription, content_consumption

with funnel_steps as (
    -- Онбординг-воронка (заглушка; заменить на реальные события)
    select 'onboarding' as funnel_id, 'app_install'       as step_name, 1 as step_order, device_id, event_date as date from {{ ref('stg_events') }} where event_name = 'app_install'
    union all
    select 'onboarding',              'registration_start',           2,  device_id, event_date from {{ ref('stg_events') }} where event_name = 'registration_start'
    union all
    select 'onboarding',              'registration_complete',        3,  device_id, event_date from {{ ref('stg_events') }} where event_name = 'registration_complete'
    union all
    select 'onboarding',              'first_content_view',           4,  device_id, event_date from {{ ref('stg_events') }} where event_name = 'content_view'
),

aggregated as (
    select
        funnel_id,
        step_name,
        step_order,
        date,
        count(distinct device_id)                                           as entries
    from funnel_steps
    group by 1, 2, 3, 4
),

with_conversions as (
    select
        *,
        lag(entries) over (
            partition by funnel_id, date
            order by step_order
        )                                                                   as prev_step_entries,

        entries * 1.0 / nullif(
            lag(entries) over (
                partition by funnel_id, date
                order by step_order
            ), 0
        )                                                                   as step_conversion_rate,

        lag(entries) over (
            partition by funnel_id, date
            order by step_order
        ) - entries                                                          as drop_off
    from aggregated
)

select
    funnel_id,
    step_name,
    step_order,
    date,
    entries,
    coalesce(prev_step_entries - entries, 0)                                as drop_off,
    coalesce(step_conversion_rate, 1.0)                                     as conversions
from with_conversions
order by date desc, funnel_id, step_order
