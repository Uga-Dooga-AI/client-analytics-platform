-- mart_revenue_metrics: метрики выручки из AppMetrica revenue events
-- Grain: date × os_name × product_id
-- Источник: события total revenue stream
--           ('c_ad_revenue', 'purchase', 'in_app_purchase', 'subscription_start')
-- Примечание: модель активируется только если в AppMetrica stream есть revenue события.
--             Если нет — модель вернёт пустой результат (не ошибку).
-- Партиционирование: по полю date

{{ config(
    materialized='table',
    partition_by={
        "field": "date",
        "data_type": "date",
        "granularity": "day"
    },
    cluster_by=["os_name", "product_id"]
) }}

with revenue_events as (
    select
        event_date                                          as date,
        event_name,
        os_name,
        country_code,
        app_id,
        device_id,
        user_id,
        -- revenue события: 'c_ad_revenue', 'purchase', 'in_app_purchase', 'subscription_start'
        -- структура event_params зависит от интеграции AppMetrica SDK
        json_value(to_json_string(event_params), '$.product_id')        as product_id,
        json_value(to_json_string(event_params), '$.currency')          as currency,
        coalesce(
            safe_cast(json_value(to_json_string(event_params), '$.price') as float64),
            safe_cast(json_value(to_json_string(event_params), '$.revenue') as float64),
            safe_cast(json_value(to_json_string(event_params), '$.value') as float64),
            0
        )                                                               as revenue_value,
        json_value(to_json_string(event_params), '$.transaction_id')    as transaction_id
    from {{ ref('stg_appmetrica__events') }}
    where event_name in ('c_ad_revenue', 'purchase', 'in_app_purchase', 'subscription_start')
      and event_params is not null
),

deduped as (
    -- дедупликация по transaction_id (защита от повторных событий)
    select * except(rn) from (
        select
            *,
            row_number() over (
                partition by transaction_id
                order by date
            ) as rn
        from revenue_events
        where transaction_id is not null
    )
    where rn = 1

    union all

    -- события без transaction_id — считаем все (best effort)
    select * from revenue_events
    where transaction_id is null
),

agg as (
    select
        date,
        os_name,
        country_code,
        app_id,
        coalesce(product_id, 'unknown')                     as product_id,
        coalesce(currency, 'USD')                           as currency,

        count(*)                                            as purchase_count,
        count(distinct device_id)                           as paying_users,
        sum(coalesce(revenue_value, 0))                     as gross_revenue,
        avg(coalesce(revenue_value, 0))                     as avg_order_value

    from deduped
    group by 1, 2, 3, 4, 5, 6
)

select
    date,
    os_name,
    country_code,
    app_id,
    product_id,
    currency,
    purchase_count,
    paying_users,
    round(gross_revenue, 2)                             as gross_revenue,
    round(avg_order_value, 2)                           as avg_order_value,
    -- ARPU на дату (требует join с mart_daily_active_users для полного расчёта)
    round(safe_divide(gross_revenue, paying_users), 2)  as arppu
from agg
