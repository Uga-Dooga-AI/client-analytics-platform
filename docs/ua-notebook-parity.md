# User Acquisition Notebook Parity

## Goal

Replace the current notebook-only workflow with a product surface that preserves the same analysis model:

- cohort slices by `campaign_name`, `creative_pack_name`, `country`, and `store`
- cohort-date charts with predicted, lower, upper, and realized values
- cumulative payback / ROAS curves by lifetime day
- grouped breakdowns by country, source, campaign, creative, and company
- the same comparison surface for saved A/B tests, arbitrary user segments, and platform-vs-platform slices
- monetization splits for `total`, `ads`, and `iap`
- retention comparisons and session-length comparisons on the same filtered cohort slices
- cohort-specific review surfaces where retention heatmaps, payback curves, and comparison tables use the same slice contract

## Serving shape

The UI should not query raw event tables directly.

Recommended flow:

1. Ingest raw AppMetrica, ad network, and BigQuery exports into warehouse landing tables.
2. Build canonical cohort slices keyed by:
   - `project_key`
   - `cohort_date`
   - `platform`
   - `country`
   - `company`
   - `source`
   - `campaign_name`
   - `creative_name`
3. Materialize serving marts for:
   - `mart_ua_cohort_metrics`
   - `mart_ua_group_breakdown`
   - `mart_ua_compare_surface`
4. Run forecast / bounds refresh jobs separately and publish the results back into serving tables.

## Storage decision

### BigQuery

Use BigQuery for:

- canonical cohort facts
- serving marts used by the product API
- grouped and comparison-ready aggregates
- refresh manifests and latest active artifact references

### Google Cloud Storage

Use GCS for:

- versioned confidence-interval helper artifacts
- bounds snapshots and serialized lookup tables
- batch outputs that are easier to store as files than rows

### Google Drive

Do not keep production interval artifacts on Google Drive. It is acceptable as notebook-era storage, but it is not the right runtime dependency for automated refresh jobs.

## New project bootstrap

Adding a new project should require only these inputs:

- project slug and display name
- AppMetrica app id and token
- BigQuery project / dataset mapping
- GCS bucket path for bounds artifacts

Once those are registered, automation should create:

- source bindings
- raw landing tables
- canonical marts
- serving views
- scheduled refresh jobs
- project-level UI visibility and default filters

## Mock-first implementation

Until live credentials are available, the product should continue using synthetic data shaped exactly like the eventual serving contract. That lets UI, filtering, grouping, and comparison logic be validated before warehouse access is turned on.
