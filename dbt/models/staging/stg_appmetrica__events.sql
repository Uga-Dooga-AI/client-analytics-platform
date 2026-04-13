-- stg_appmetrica__events: очищенные события AppMetrica с явной типизацией
-- Источник: {{ source('appmetrica_raw', 'events') }}
-- Grain: одна строка = одно событие
-- Стратегия: view (пересчитывается при каждом запросе)

with source as (
    select * from {{ source('appmetrica_raw', 'events') }}
),

cleaned as (
    select
        -- identity
        cast(appmetrica_device_id as string)                as device_id,
        cast(coalesce(profile_id, '')  as string)           as user_id,
        cast(application_id            as string)           as app_id,

        -- event
        cast(event_datetime            as timestamp)        as event_at,
        date(cast(event_datetime       as timestamp))       as event_date,
        cast(event_name                as string)           as event_name,
        safe.parse_json(event_json)                         as event_params,

        -- session
        cast(session_id                as string)           as session_id,

        -- device / geo
        lower(cast(os_name             as string))          as os_name,
        cast(app_version_name          as string)           as app_version,
        upper(cast(country_iso_code    as string))          as country_code,
        cast(city                      as string)           as city

    from source
    where event_datetime is not null
      and appmetrica_device_id is not null
)

select * from cleaned
