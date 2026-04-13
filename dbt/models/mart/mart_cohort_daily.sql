-- mart_cohort_daily: дневные когорты удержания и LTV
-- Grain: cohort_id × cohort_date × period_day
-- Когорта = первый день установки устройства

with installs as (
    select
        device_id,
        min(event_date)                     as cohort_date
    from {{ ref('stg_events') }}
    group by 1
),

daily_activity as (
    select distinct
        device_id,
        event_date
    from {{ ref('stg_events') }}
),

cohort_activity as (
    select
        i.cohort_date,
        da.event_date,
        date_diff(da.event_date, i.cohort_date, day)    as period_day,
        i.device_id
    from installs i
    inner join daily_activity da on da.device_id = i.device_id
    where da.event_date >= i.cohort_date
),

cohort_size as (
    select
        cohort_date,
        count(distinct device_id)           as cohort_users
    from installs
    group by 1
),

aggregated as (
    select
        ca.cohort_date,
        ca.period_day,
        count(distinct ca.device_id)        as retained_users
    from cohort_activity ca
    group by 1, 2
)

select
    'default'                               as cohort_id,   -- TODO: параметризовать сегменты
    a.cohort_date,
    a.period_day,
    cs.cohort_users                         as users,
    a.retained_users                        as retained,
    a.retained_users * 1.0
        / nullif(cs.cohort_users, 0)        as retention_rate,
    cast(null as float64)                   as ltv            -- TODO: подключить revenue source
from aggregated a
inner join cohort_size cs using (cohort_date)
order by a.cohort_date desc, a.period_day
