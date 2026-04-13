-- mart_daily_active_users: Daily Active Users по app_id
-- Grain: app_id × date
-- Активный пользователь = device_id с хотя бы одним событием за день
-- Партиционирование: по полю date

{{ config(
    materialized='table',
    partition_by={
        "field": "date",
        "data_type": "date",
        "granularity": "day"
    },
    cluster_by=["app_id", "os_name"]
) }}

with daily_activity as (
    select
        app_id,
        event_date                                  as date,
        os_name,
        count(distinct device_id)                   as dau,
        count(distinct case
            when user_id != '' then user_id
        end)                                        as dau_logged_in,
        count(*)                                    as total_events
    from {{ ref('stg_appmetrica__events') }}
    group by 1, 2, 3
),

weekly_rolling as (
    select
        app_id,
        date,
        os_name,
        dau,
        dau_logged_in,
        total_events,
        -- WAU: скользящее окно 7 дней
        count(distinct device_id) over (
            partition by app_id, os_name
            order by date
            range between interval 6 day preceding and current row
        )                                           as wau_rolling_7d
    from daily_activity
    -- примечание: wau_rolling_7d — оценка на уровне агрегата, не точный WAU
    -- для точного WAU использовать отдельную mart_weekly_active_users модель
)

select
    app_id,
    date,
    os_name,
    dau,
    dau_logged_in,
    total_events,
    -- соотношение залогиненных пользователей
    safe_divide(dau_logged_in, dau)                 as login_rate
from daily_activity
order by date desc, app_id
