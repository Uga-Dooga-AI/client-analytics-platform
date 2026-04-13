-- fact_experiment_exposure: первая экспозиция устройства на A/B эксперимент
-- Источник: stg_appmetrica__ab_events (AppMetrica ab_* events)
-- Grain: один ряд = (device_id, experiment_id, variant) — первая экспозиция
-- Дедупликация: берём минимальный exposed_at для каждого (device_id, experiment_id, variant_key)
-- Партиционирование: по exposure_date (BigQuery cost optimization)
-- Связанные задачи: UGAA-1507

{{
    config(
        materialized='table',
        partition_by={
            'field': 'exposure_date',
            'data_type': 'date',
            'granularity': 'day'
        },
        cluster_by=['experiment_id', 'app_id'],
        labels={'mart': 'experiments', 'source': 'appmetrica'}
    )
}}

with ab_events as (
    select
        device_id,
        user_id,
        app_id,
        experiment_id,
        variant_key                         as variant,
        exposed_at,
        exposure_date,
        os_name,
        app_version,
        country_code
    from {{ ref('stg_appmetrica__ab_events') }}
    where experiment_id is not null
      and experiment_id != ''
),

-- Первая экспозиция на (device_id, experiment_id, variant)
first_exposure as (
    select
        device_id,
        user_id,
        app_id,
        experiment_id,
        variant,
        min(exposed_at)                     as first_exposure_at,
        min(exposure_date)                  as exposure_date,
        -- Берём os_name и country_code из первого события
        any_value(os_name)                  as os_name,
        any_value(app_version)              as app_version,
        any_value(country_code)             as country_code
    from ab_events
    group by device_id, user_id, app_id, experiment_id, variant
),

final as (
    select
        -- Суррогатный ключ: детерминированный хэш по зерну
        to_hex(md5(
            concat(device_id, '|', experiment_id, '|', coalesce(variant, ''))
        ))                                  as exposure_id,

        device_id,
        user_id,
        app_id,
        experiment_id,
        variant,
        first_exposure_at,
        exposure_date,
        os_name,
        app_version,
        country_code
    from first_exposure
)

select * from final
