-- stg_appmetrica__installs: инсталляции приложения с device metadata
-- Источник: {{ source('appmetrica_raw', 'installs') }}
-- Grain: одна строка = одна инсталляция (device_id + install_date уникальны)
-- Стратегия: view

with source as (
    select * from {{ source('appmetrica_raw', 'installs') }}
),

cleaned as (
    select
        -- identity
        cast(appmetrica_device_id   as string)              as device_id,
        cast(coalesce(profile_id, '') as string)            as user_id,

        -- install event
        cast(install_datetime       as timestamp)           as installed_at,
        date(cast(install_datetime  as timestamp))          as install_date,

        -- acquisition
        cast(tracker_name           as string)              as tracker_name,

        -- device
        lower(cast(os_name          as string))             as os_name,
        cast(app_version_name       as string)              as app_version,
        upper(cast(country_iso_code as string))             as country_code

    from source
    where install_datetime is not null
      and appmetrica_device_id is not null
)

select * from cleaned
