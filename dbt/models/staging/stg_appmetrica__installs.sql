-- stg_appmetrica__installs: инсталляции приложения с device metadata
-- Источник: {{ source('appmetrica_raw', 'installs') }}
-- Grain: одна строка = одна инсталляция (device_id + install_date уникальны)
-- Стратегия: view

{% set installs_source = source('appmetrica_raw', 'installs') %}
{% set tracker_name_expr = "json_value(source_json, '$.tracker_name')" %}
{% set tracking_id_expr = "json_value(source_json, '$.tracking_id')" %}
{% set click_url_parameters_expr = "json_value(source_json, '$.click_url_parameters')" %}
{% set profile_id_expr = "json_value(source_json, '$.profile_id')" %}
{% set os_name_expr = "json_value(source_json, '$.os_name')" %}
{% set country_iso_code_expr = "json_value(source_json, '$.country_iso_code')" %}
{% set app_version_name_expr = "json_value(source_json, '$.app_version_name')" %}

with source as (
    select
        t.*,
        to_json_string(t) as source_json
    from {{ installs_source }} as t
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
            coalesce({{ tracker_name_expr }}, ''),
            coalesce({{ tracking_id_expr }}, ''),
            coalesce({{ click_url_parameters_expr }}, ''),
            coalesce({{ profile_id_expr }}, ''),
            coalesce({{ os_name_expr }}, ''),
            coalesce({{ country_iso_code_expr }}, ''),
            coalesce({{ app_version_name_expr }}, '')
        order by cast(install_datetime as timestamp) desc
    ) = 1
),

cleaned as (
    select
        -- identity
        cast(appmetrica_device_id   as string)              as device_id,
        coalesce({{ profile_id_expr }}, '')                 as user_id,

        -- install event
        cast(install_datetime       as timestamp)           as installed_at,
        date(cast(install_datetime  as timestamp))          as install_date,

        -- acquisition
        {{ tracker_name_expr }}                             as tracker_name,
        {{ tracking_id_expr }}                              as tracking_id,
        {{ click_url_parameters_expr }}                     as click_url_parameters,
        case
            when {{ click_url_parameters_expr }} = 'Google Play' then 'organic'
            when {{ click_url_parameters_expr }} in ('Unconfigured AdWords', 'AutocreatedGoogle Ads', 'Autocreated Google Ads') then 'google_ads'
            when {{ click_url_parameters_expr }} = 'unknown' then 'unknown'
            when nullif({{ click_url_parameters_expr }}, '') is null then null
            when regexp_contains({{ click_url_parameters_expr }}, r'gclid=') then regexp_extract({{ click_url_parameters_expr }}, r'gclid=([^&]+)')
            when regexp_contains({{ click_url_parameters_expr }}, r'c=[^&]+&c_ifa=') then regexp_extract({{ click_url_parameters_expr }}, r'c=([^&]+)&c_ifa=')
            when regexp_contains({{ click_url_parameters_expr }}, r'c=[^&]+&campaign_name=') then regexp_extract({{ click_url_parameters_expr }}, r'c=([^&]+)&campaign_name=')
            when regexp_contains({{ click_url_parameters_expr }}, r'appmetrica_tracking_id=') then regexp_extract({{ click_url_parameters_expr }}, r'appmetrica_tracking_id=([^&]+)&ym_tracking_id=')
            when regexp_contains({{ click_url_parameters_expr }}, r'afpub_id=') then regexp_extract({{ click_url_parameters_expr }}, r'afpub_id=([^&]+)&click_id=')
            else null
        end                                              as campaign_id,
        case
            when {{ click_url_parameters_expr }} in ('Google Play', 'Unconfigured AdWords', 'unknown') then null
            when nullif({{ click_url_parameters_expr }}, '') is null then null
            when regexp_contains({{ click_url_parameters_expr }}, r'custom_creative_pack_id=') then regexp_extract({{ click_url_parameters_expr }}, r'custom_creative_pack_id=([^&]+)')
            else null
        end                                              as creative_id,

        -- device
        lower({{ os_name_expr }})                           as os_name,
        {{ app_version_name_expr }}                         as app_version,
        upper({{ country_iso_code_expr }})                  as country_code

    from deduped
)

select * from cleaned
