-- mart_daily_active_users: Daily Active Users по app_id
-- Grain: app_id × os_name × date
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

with activity as (
    select
        app_id,
        event_date                                  as date,
        os_name,
        device_id,
        user_id
    from {{ ref('stg_appmetrica__events') }}
),

daily_activity as (
    select
        app_id,
        date,
        os_name,
        count(distinct device_id)                   as dau,
        count(distinct case
            when user_id != '' then user_id
        end)                                        as dau_logged_in,
        count(*)                                    as total_events
    from activity
    group by 1, 2, 3
),

wau_rolling as (
    select
        d.app_id,
        d.date,
        d.os_name,
        count(distinct a.device_id)                 as wau_rolling_7d
    from daily_activity d
    inner join activity a
        on  a.app_id = d.app_id
        and a.os_name = d.os_name
        and a.date between date_sub(d.date, interval 6 day) and d.date
    group by 1, 2, 3
),

mau_rolling as (
    select
        d.app_id,
        d.date,
        d.os_name,
        count(distinct a.device_id)                 as mau_rolling_30d
    from daily_activity d
    inner join activity a
        on  a.app_id = d.app_id
        and a.os_name = d.os_name
        and a.date between date_sub(d.date, interval 29 day) and d.date
    group by 1, 2, 3
)

select
    da.app_id,
    da.date,
    da.os_name,
    da.dau,
    da.dau_logged_in,
    da.total_events,
    coalesce(wr.wau_rolling_7d, da.dau)             as wau_rolling_7d,
    coalesce(mr.mau_rolling_30d, da.dau)            as mau_rolling_30d,
    safe_divide(da.dau_logged_in, da.dau)           as login_rate
from daily_activity da
left join wau_rolling wr
    using (app_id, date, os_name)
left join mau_rolling mr
    using (app_id, date, os_name)
