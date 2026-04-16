-- stg_ab_exposures: legacy-compatible surface over stg_appmetrica__ab_events
-- Экспозиция = само событие ab_<experiment_id>; variant = значение параметра variant_key
-- Firebase Remote Config → AppMetrica event stream (согласовано в UGAA-1169)

with source as (
    select * from {{ ref('stg_appmetrica__ab_events') }}
)

select
    device_id,
    user_id,
    exposed_at,
    exposure_date,
    experiment_id,
    coalesce(variant_key, 'unknown')         as variant_key,
    app_version,
    os_name,
    country_code                             as country,
    app_id
from source
