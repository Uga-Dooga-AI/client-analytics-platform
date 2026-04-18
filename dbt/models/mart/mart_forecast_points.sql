-- mart_forecast_points: serving mart for forecast worker output
-- Grain: run_id × metric × date
-- Source table convention: {project_slug}_forecast_points in mart dataset

{% set mart_dataset = var('mart_dataset', target.schema) %}
{% set source_identifier = var('project_slug') | replace('-', '_') ~ '_forecast_points' %}
{% set source_relation = adapter.get_relation(
    database=target.database,
    schema=mart_dataset,
    identifier=source_identifier
) %}

with source as (
    {% if source_relation %}
    select
        cast(run_id as string) as run_id,
        cast(metric as string) as metric,
        cast(date as date) as date,
        cast(p50 as float64) as p50,
        cast(p10 as float64) as p10,
        cast(p90 as float64) as p90,
        cast(generated_at as timestamp) as generated_at
    from {{ source_relation }}
    {% else %}
    select
        cast(null as string) as run_id,
        cast(null as string) as metric,
        cast(null as date) as date,
        cast(null as float64) as p50,
        cast(null as float64) as p10,
        cast(null as float64) as p90,
        cast(null as timestamp) as generated_at
    where false
    {% endif %}
),

ranked as (
    select
        run_id,
        metric,
        date,
        p50,
        p10,
        p90,
        generated_at,
        row_number() over (
            partition by metric, date
            order by generated_at desc, run_id desc
        ) as row_num
    from source
)

select
    run_id,
    metric,
    date,
    p50,
    p10,
    p90,
    generated_at
from ranked
where row_num = 1
