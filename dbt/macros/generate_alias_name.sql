{% macro generate_alias_name(custom_alias_name=none, node=none) -%}
  {%- set base_alias = (custom_alias_name if custom_alias_name is not none else node.name) | trim -%}
  {%- set project_slug = var('project_slug', '') | replace('-', '_') | trim -%}

  {%- if not project_slug -%}
    {{ base_alias }}
  {%- elif base_alias.startswith(project_slug ~ '_') -%}
    {{ base_alias }}
  {%- elif base_alias == 'mart_forecast_points' -%}
    {{ project_slug ~ '_forecast_points_serving' }}
  {%- elif base_alias.startswith('stg_') -%}
    {{ project_slug ~ '_' ~ base_alias[4:] }}
  {%- elif base_alias.startswith('fact_') -%}
    {{ project_slug ~ '_' ~ base_alias[5:] }}
  {%- elif base_alias.startswith('mart_') -%}
    {{ project_slug ~ '_' ~ base_alias[5:] }}
  {%- else -%}
    {{ project_slug ~ '_' ~ base_alias }}
  {%- endif -%}
{%- endmacro %}
