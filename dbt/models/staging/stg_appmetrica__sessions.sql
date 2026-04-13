-- stg_appmetrica__sessions: сессии пользователей с длительностью
-- Источник: {{ source('appmetrica_raw', 'sessions') }}
-- Grain: одна строка = одна сессия (session_id уникален)
-- Стратегия: view

with source as (
    select * from {{ source('appmetrica_raw', 'sessions') }}
),

cleaned as (
    select
        -- identity
        cast(appmetrica_device_id       as string)          as device_id,
        cast(coalesce(profile_id, '')   as string)          as user_id,

        -- session
        cast(session_id                 as string)          as session_id,
        cast(session_start_datetime     as timestamp)       as session_started_at,
        date(cast(session_start_datetime as timestamp))     as session_date,

        -- metrics
        cast(duration_seconds           as int64)           as duration_seconds,
        case
            when cast(duration_seconds as int64) < 60   then 'short'
            when cast(duration_seconds as int64) < 300  then 'medium'
            else 'long'
        end                                                 as session_length_bucket,

        -- device
        lower(cast(os_name              as string))         as os_name

    from source
    where session_start_datetime is not null
      and appmetrica_device_id is not null
      and cast(duration_seconds as int64) >= 0
)

select * from cleaned
