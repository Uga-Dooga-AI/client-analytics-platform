-- stg_events: legacy-compatible surface over stg_appmetrica__events
-- Нужен для старых mart-моделей, пока они постепенно переводятся на stg_appmetrica__*
-- Grain: одна строка = одно событие

with source as (
    select * from {{ ref('stg_appmetrica__events') }}
)

select
    device_id,
    user_id,
    event_at,
    event_date,
    event_name,
    to_json_string(event_params)                as event_json,
    session_id,
    os_name,
    app_version,
    country_code                               as country,
    city,
    app_id
from source
