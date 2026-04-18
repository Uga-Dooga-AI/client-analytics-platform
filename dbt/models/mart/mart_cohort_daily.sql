-- mart_cohort_daily: дневные когорты удержания и LTV
-- Grain: cohort_id × cohort_date × period_day × os_name × country_code × tracker_name
-- Когорта = день установки устройства по данным AppMetrica installs

{{
    config(
        materialized='table',
        partition_by={
            "field": "cohort_date",
            "data_type": "date",
            "granularity": "day"
        },
        cluster_by=["os_name", "country_code", "tracker_name"]
    )
}}

with installs as (
    select
        device_id,
        install_date                                   as cohort_date,
        coalesce(os_name, 'unknown')                   as os_name,
        coalesce(country_code, 'ZZ')                   as country_code,
        coalesce(tracker_name, 'unknown')              as tracker_name
    from {{ ref('stg_appmetrica__installs') }}
),

base_period_zero as (
    select
        cohort_date,
        os_name,
        country_code,
        tracker_name,
        device_id,
        0                                              as period_day
    from installs
),

session_periods as (
    select distinct
        i.cohort_date,
        i.os_name,
        i.country_code,
        i.tracker_name,
        i.device_id,
        date_diff(s.session_date, i.cohort_date, day) as period_day
    from installs i
    inner join {{ ref('stg_appmetrica__sessions') }} s
        on  s.device_id = i.device_id
        and s.session_date >= i.cohort_date
),

cohort_activity as (
    select * from base_period_zero
    union distinct
    select * from session_periods
),

cohort_size as (
    select
        cohort_date,
        os_name,
        country_code,
        tracker_name,
        count(distinct device_id)                      as cohort_users
    from installs
    group by 1, 2, 3, 4
),

retention as (
    select
        cohort_date,
        os_name,
        country_code,
        tracker_name,
        period_day,
        count(distinct device_id)                      as retained_users
    from cohort_activity
    group by 1, 2, 3, 4, 5
),

revenue_daily as (
    select
        device_id,
        event_date,
        sum(
            safe_cast(json_value(to_json_string(event_params), '$.price') as float64)
        )                                             as revenue_amount
    from {{ ref('stg_appmetrica__events') }}
    where event_name in ('purchase', 'in_app_purchase', 'subscription_start')
      and event_params is not null
    group by 1, 2
),

cohort_revenue as (
    select
        i.cohort_date,
        i.os_name,
        i.country_code,
        i.tracker_name,
        date_diff(r.event_date, i.cohort_date, day)   as period_day,
        sum(coalesce(r.revenue_amount, 0))             as revenue_amount
    from installs i
    inner join revenue_daily r
        on  r.device_id = i.device_id
        and r.event_date >= i.cohort_date
    group by 1, 2, 3, 4, 5
),

cumulative_revenue as (
    select
        cohort_date,
        os_name,
        country_code,
        tracker_name,
        period_day,
        sum(revenue_amount) over (
            partition by cohort_date, os_name, country_code, tracker_name
            order by period_day
            rows between unbounded preceding and current row
        )                                             as cumulative_revenue
    from cohort_revenue
),

all_periods as (
    select
        cohort_date,
        os_name,
        country_code,
        tracker_name,
        period_day
    from retention

    union distinct

    select
        cohort_date,
        os_name,
        country_code,
        tracker_name,
        period_day
    from cumulative_revenue
)

select
    'default'                                         as cohort_id,
    p.cohort_date,
    p.period_day,
    cs.cohort_users                                   as users,
    coalesce(r.retained_users, 0)                     as retained,
    safe_divide(coalesce(r.retained_users, 0), cs.cohort_users)
                                                      as retention_rate,
    safe_divide(coalesce(cr.cumulative_revenue, 0), cs.cohort_users)
                                                      as ltv,
    p.os_name,
    p.country_code,
    p.tracker_name
from all_periods p
inner join cohort_size cs
    using (cohort_date, os_name, country_code, tracker_name)
left join retention r
    using (cohort_date, os_name, country_code, tracker_name, period_day)
left join cumulative_revenue cr
    using (cohort_date, os_name, country_code, tracker_name, period_day)
