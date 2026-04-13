-- stg_ab_exposures: нормализация событий A/B-экспозиции
-- Источник: AppMetrica events с prefix ab_
-- Экспозиция = само событие ab_<experiment_id>; variant = значение параметра variant_key из event_json
-- Firebase Remote Config → AppMetrica event stream (согласовано в UGAA-1169)

with raw_events as (
    select * from {{ ref('stg_events') }}
    where event_name like 'ab_%'
),

parsed as (
    select
        device_id,
        user_id,
        event_at                                                    as exposed_at,
        event_date                                                  as exposure_date,

        -- experiment_id: часть имени события после 'ab_'
        substr(event_name, 4)                                       as experiment_id,

        -- variant: из JSON-параметров события
        json_value(event_json, '$.variant_key')                     as variant_key,

        -- дополнительный контекст
        app_version,
        os_name,
        country,
        app_id

    from raw_events
    where substr(event_name, 4) != ''
)

select * from parsed
