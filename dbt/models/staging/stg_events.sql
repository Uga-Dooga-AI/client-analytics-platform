-- stg_events: базовая нормализация AppMetrica event stream
-- Источник: {{ source('appmetrica_raw', 'events') }}
-- Стратегия: view, обновляется при каждом запросе

with source as (
    select * from {{ source('appmetrica_raw', 'events') }}
),

renamed as (
    select
        -- identity
        appmetrica_device_id                    as device_id,
        coalesce(profile_id, '')                as user_id,

        -- event
        cast(event_datetime as timestamp)       as event_at,
        date(event_datetime)                    as event_date,
        event_name,
        event_json,

        -- session
        session_id,

        -- device / geo
        os_name,
        app_version_name                        as app_version,
        country_iso_code                        as country,
        city,

        -- app
        application_id                          as app_id

    from source
    where event_datetime is not null
)

select * from renamed
