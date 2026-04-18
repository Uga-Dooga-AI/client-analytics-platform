-- stg_appmetrica__installs: инсталляции приложения с device metadata
-- Источник: {{ source('appmetrica_raw', 'installs') }}
-- Grain: одна строка = одна инсталляция (device_id + install_date уникальны)
-- Стратегия: view

with source as (
    select * from {{ source('appmetrica_raw', 'installs') }}
),

deduped as (
    select *
    from source
    where install_datetime is not null
      and appmetrica_device_id is not null
    qualify row_number() over (
        partition by
            cast(appmetrica_device_id as string),
            cast(install_datetime as timestamp),
            coalesce(cast(tracker_name as string), ''),
            coalesce(cast(profile_id as string), ''),
            coalesce(cast(os_name as string), ''),
            coalesce(cast(country_iso_code as string), ''),
            coalesce(cast(app_version_name as string), '')
        order by cast(install_datetime as timestamp) desc
    ) = 1
),

cleaned as (
    select
        -- identity
        cast(appmetrica_device_id   as string)              as device_id,
        coalesce(cast(profile_id as string), '')            as user_id,

        -- install event
        cast(install_datetime       as timestamp)           as installed_at,
        date(cast(install_datetime  as timestamp))          as install_date,

        -- acquisition
        cast(tracker_name           as string)              as tracker_name,

        -- device
        lower(cast(os_name          as string))             as os_name,
        cast(app_version_name       as string)              as app_version,
        upper(cast(country_iso_code as string))             as country_code

    from deduped
)

select * from cleaned
