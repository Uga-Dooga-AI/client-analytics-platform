-- mart_session_metrics: агрегированные метрики сессий
-- Grain: date × os_name
-- Ключевые метрики: avg_session_duration, sessions_per_user, длина bucket распределение
-- Партиционирование: по полю date

{{ config(
    materialized='table',
    partition_by={
        "field": "date",
        "data_type": "date",
        "granularity": "day"
    },
    cluster_by=["os_name"]
) }}

with session_base as (
    select
        session_date                                as date,
        os_name,
        device_id,
        duration_seconds,
        session_length_bucket
    from {{ ref('stg_appmetrica__sessions') }}
),

daily_users as (
    select
        session_date                                as date,
        os_name,
        count(distinct device_id)                   as active_users
    from {{ ref('stg_appmetrica__sessions') }}
    group by 1, 2
),

agg as (
    select
        date,
        os_name,

        -- объём
        count(*)                                    as total_sessions,
        count(distinct device_id)                   as unique_devices,

        -- длительность
        avg(duration_seconds)                       as avg_session_duration_sec,
        approx_quantiles(duration_seconds, 100)[offset(50)]
                                                    as median_session_duration_sec,
        max(duration_seconds)                       as max_session_duration_sec,

        -- bucket распределение
        countif(session_length_bucket = 'short')    as short_sessions,
        countif(session_length_bucket = 'medium')   as medium_sessions,
        countif(session_length_bucket = 'long')     as long_sessions

    from session_base
    group by 1, 2
)

select
    a.date,
    a.os_name,
    a.total_sessions,
    a.unique_devices,
    round(a.avg_session_duration_sec, 1)            as avg_session_duration_sec,
    a.median_session_duration_sec,
    a.max_session_duration_sec,
    a.short_sessions,
    a.medium_sessions,
    a.long_sessions,
    -- сессий на активного пользователя
    safe_divide(a.total_sessions, du.active_users)  as sessions_per_user,
    -- доля длинных сессий
    safe_divide(a.long_sessions, a.total_sessions)  as long_session_rate
from agg a
left join daily_users du using (date, os_name)
order by date desc, os_name
