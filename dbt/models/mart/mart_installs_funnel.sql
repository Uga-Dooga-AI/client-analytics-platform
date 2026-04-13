-- mart_installs_funnel: воронка установки → первая сессия → удержание
-- Grain: install_date × os_name × tracker_name × step_name
-- Шаги воронки:
--   1. installed       — устройство установило приложение
--   2. first_session   — устройство открыло приложение (первая сессия)
--   3. retained_d1     — устройство вернулось на следующий день (D1 retention)
--   4. retained_d7     — устройство вернулось через 7 дней (D7 retention)
-- Партиционирование: по полю install_date

{{ config(
    materialized='table',
    partition_by={
        "field": "install_date",
        "data_type": "date",
        "granularity": "day"
    },
    cluster_by=["os_name", "tracker_name"]
) }}

with installs as (
    select
        device_id,
        install_date,
        os_name,
        coalesce(tracker_name, 'unknown')           as tracker_name
    from {{ ref('stg_appmetrica__installs') }}
),

first_sessions as (
    select
        device_id,
        min(session_date)                           as first_session_date
    from {{ ref('stg_appmetrica__sessions') }}
    group by 1
),

daily_activity as (
    select
        device_id,
        session_date
    from {{ ref('stg_appmetrica__sessions') }}
    group by 1, 2
),

funnel as (
    select
        i.install_date,
        i.os_name,
        i.tracker_name,

        -- Шаг 1: все установки
        count(distinct i.device_id)                 as installed,

        -- Шаг 2: открыли приложение в день установки или на следующий день
        count(distinct case
            when fs.first_session_date between i.install_date
                                           and date_add(i.install_date, interval 1 day)
            then i.device_id
        end)                                        as first_session,

        -- Шаг 3: вернулись на D1
        count(distinct case
            when da_d1.session_date = date_add(i.install_date, interval 1 day)
            then i.device_id
        end)                                        as retained_d1,

        -- Шаг 4: вернулись на D7
        count(distinct case
            when da_d7.session_date = date_add(i.install_date, interval 7 day)
            then i.device_id
        end)                                        as retained_d7

    from installs i
    left join first_sessions fs
        on fs.device_id = i.device_id
    left join daily_activity da_d1
        on  da_d1.device_id    = i.device_id
        and da_d1.session_date = date_add(i.install_date, interval 1 day)
    left join daily_activity da_d7
        on  da_d7.device_id    = i.device_id
        and da_d7.session_date = date_add(i.install_date, interval 7 day)
    group by 1, 2, 3
)

select
    install_date,
    os_name,
    tracker_name,
    installed,
    first_session,
    retained_d1,
    retained_d7,
    -- конверсия на каждый шаг
    safe_divide(first_session, installed)           as install_to_first_session_rate,
    safe_divide(retained_d1, installed)             as d1_retention_rate,
    safe_divide(retained_d7, installed)             as d7_retention_rate
from funnel
order by install_date desc, installed desc
