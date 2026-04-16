-- mart_experiment_daily: дневная агрегация по экспериментам
-- Grain: experiment_id × variant × date × app_id × os_name × country_code
-- Используется UI дашбордом для A/B-анализа и произвольного сравнения сегментов

{{
    config(
        materialized='table',
        partition_by={
            "field": "date",
            "data_type": "date",
            "granularity": "day"
        },
        cluster_by=["experiment_id", "variant", "app_id"]
    )
}}

{%- set activation_event = var('experiment_activation_event', 'activation') -%}
{%- set activation_window_days = var('experiment_activation_window_days', 0) -%}

with base_exposures as (
    select
        device_id,
        app_id,
        coalesce(os_name, 'unknown')                as os_name,
        coalesce(country_code, 'ZZ')                as country_code,
        experiment_id,
        coalesce(variant, 'unknown')                as variant,
        exposure_date                               as date
    from {{ ref('fact_experiment_exposure') }}
),

exposures as (
    select
        experiment_id,
        variant,
        date,
        app_id,
        os_name,
        country_code,
        count(distinct device_id)                   as exposures
    from base_exposures
    group by 1, 2, 3, 4, 5, 6
),

activations as (
    select
        ex.experiment_id,
        ex.variant,
        ex.date,
        ex.app_id,
        ex.os_name,
        ex.country_code,
        count(distinct ex.device_id)               as activations
    from base_exposures ex
    inner join {{ ref('stg_appmetrica__events') }} ev
        on  ev.device_id = ex.device_id
        and ev.event_name = '{{ activation_event }}'
        and ev.event_date between ex.date and date_add(ex.date, interval {{ activation_window_days }} day)
    group by 1, 2, 3, 4, 5, 6
),

revenue_events as (
    select
        device_id,
        event_date,
        safe_cast(
            json_value(to_json_string(event_params), '$.price') as float64
        )                                          as revenue_amount
    from {{ ref('stg_appmetrica__events') }}
    where event_name in ('purchase', 'in_app_purchase', 'subscription_start')
      and event_params is not null
),

revenue as (
    select
        ex.experiment_id,
        ex.variant,
        ex.date,
        ex.app_id,
        ex.os_name,
        ex.country_code,
        sum(coalesce(rev.revenue_amount, 0))       as revenue
    from base_exposures ex
    inner join revenue_events rev
        on  rev.device_id = ex.device_id
        and rev.event_date between ex.date and date_add(ex.date, interval {{ activation_window_days }} day)
    group by 1, 2, 3, 4, 5, 6
),

guardrail as (
    select
        ex.experiment_id,
        ex.variant,
        ex.date,
        ex.app_id,
        ex.os_name,
        ex.country_code,
        count(distinct case when ev.event_name = 'app_crash' then ex.device_id end)  as crashes,
        count(distinct case when ev.event_name = 'error' then ex.device_id end)      as errors
    from base_exposures ex
    left join {{ ref('stg_appmetrica__events') }} ev
        on  ev.device_id = ex.device_id
        and ev.event_date between ex.date and date_add(ex.date, interval {{ activation_window_days }} day)
        and ev.event_name in ('app_crash', 'error')
    group by 1, 2, 3, 4, 5, 6
)

select
    ex.experiment_id,
    ex.variant,
    ex.date,
    ex.app_id,
    ex.os_name,
    ex.country_code,
    ex.exposures,
    coalesce(ac.activations, 0)                    as activations,
    coalesce(rv.revenue, 0)                        as revenue,
    coalesce(gr.crashes, 0)                        as guardrail_crashes,
    coalesce(gr.errors, 0)                         as guardrail_errors
from exposures ex
left join activations ac
    using (experiment_id, variant, date, app_id, os_name, country_code)
left join revenue rv
    using (experiment_id, variant, date, app_id, os_name, country_code)
left join guardrail gr
    using (experiment_id, variant, date, app_id, os_name, country_code)
order by ex.date desc, ex.experiment_id, ex.variant
