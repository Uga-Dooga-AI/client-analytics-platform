-- stg_appmetrica__ab_events: события A/B тестирования (префикс ab_*)
-- Источник: stg_appmetrica__events, фильтр event_name like 'ab_%'
-- Grain: одна строка = один факт экспозиции (device_id может встречаться несколько раз
--        если пользователь получил экспозицию в нескольких экспериментах)
-- Стратегия: view

with ab_raw as (
    select * from {{ ref('stg_appmetrica__events') }}
    where event_name like 'ab_%'
      and length(event_name) > 3   -- исключить голый 'ab_'
),

parsed as (
    select
        device_id,
        user_id,
        app_id,

        event_at                                            as exposed_at,
        event_date                                          as exposure_date,

        -- experiment_id: часть после 'ab_'
        substr(event_name, 4)                               as experiment_id,

        -- variant: из JSON параметров события
        json_value(to_json_string(event_params), '$.variant_key')   as variant_key,

        -- дополнительный контекст для сегментации
        os_name,
        app_version,
        country_code,
        session_id

    from ab_raw
)

select * from parsed
where experiment_id is not null
  and experiment_id != ''
