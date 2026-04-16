# Project Onboarding and Data Sync Plan

## What gets added in the UI

Every product is onboarded in `Settings` by an administrator. The project card stores:

- project slug and display name
- target GCP project
- auto-provision toggle for `raw` / `stg` / `mart` and the GCS bucket
- optional manual overrides for warehouse and bounds storage
- default dashboard day-step for cohort grouping
- incremental refresh cadence
- forecast cadence
- bounds refresh cadence
- initial backfill depth
- forecast horizon
- forecast warmup strategy
  - main countries
  - main saved segments
  - last-N viewed combinations to keep hot

## Connectors that belong to a project

Each project owns five connector records:

1. `AppMetrica Logs API`
   - app ids
   - event catalog
   - encrypted token
   - refresh cadence

2. `BigQuery export`
   - source project id
   - source dataset
   - encrypted service account JSON
   - refresh cadence

3. `Bounds artifacts`
   - GCS bucket
   - GCS prefix
   - bounds refresh cadence

4. `Unity Ads spend`
   - recommended mode: BigQuery mirror
   - fallback mode: direct API
   - cadence aligned to ingestion

5. `Google Ads spend`
   - recommended mode: BigQuery mirror
   - fallback mode: direct API
   - cadence aligned to ingestion

This is enough to recreate the same working surface that currently exists in notebooks, but in a proper control plane.

## First load vs recurring refresh

The first time a project is connected, the service should run this automatically:

1. `Initial backfill`
   - fetch historical AppMetrica windows
   - pull BigQuery exports
   - pull or read spend sources
   - populate raw/stg tables
   - publish first marts

2. `Rebuild bounds`
   - compute confidence interval artifacts
   - publish a GCS manifest version

3. `Forecast now`
   - build forecast outputs on top of the published marts and active bounds manifest

After that, the project switches to recurring refresh:

- ingestion: scheduled incremental pull
- bounds refresh: scheduled artifact rebuild
- forecast: scheduled recomputation after new serving data is available
- forecast prewarm: project-level matrix across baseline segments, countries, spend sources, and platforms plus the most recent 50 viewed combinations
- hot forecast combinations are captured from the UI and exposed through the control plane so workers can keep them warm without a config redeploy

## Where data should live

- `BigQuery`: raw landing, staging, marts, serving tables, mirrored spend tables where available
- `GCS`: bounds artifacts and active manifest versions
- `Railway Postgres`: only the control plane
  - project registry
  - connector status
  - sync run history
  - admin actions

`Google Drive` should not remain the operational home for bounds once the service is live. It is acceptable for historical notebook work, but not for the runtime system.

## How notebook behavior maps to the product

- notebook `run_date_freq` -> dashboard `day step`
- notebook bounds directory -> project `bounds bucket + prefix`
- notebook forecast horizons -> project `forecast horizon days`
- notebook cohort-date charts -> acquisition and forecast confidence-band charts
- notebook segment cuts -> saved segments + event rules + top-level filters

## What is still synthetic today

The analytics pages can still run on synthetic serving data while connectors are missing. That is intentional. The UI and filter contracts should be stable before live data is attached.

The control plane is already real:

- projects are created through admin API routes
- connector settings are stored in Postgres
- secrets are stored encrypted
- run requests are written to sync history
- status is visible in Settings

## Next integration step

The next operational step is not redesign. It is wiring workers to this registry:

1. read the project config from the control plane
2. auto-create missing bucket / datasets when auto-provision is enabled
3. generate ingestion/forecast job config
4. execute the job remotely
5. update run status and source freshness
6. publish marts and bounds manifest

That keeps project onboarding, notebook parity, and runtime orchestration in one system.

## Internal worker contract

The control plane now exposes internal worker endpoints:

- `GET /api/internal/projects/:projectId/runtime-bundle`
- `POST /api/internal/projects/:projectId/claim-run`
- `GET /api/internal/runs/:runId`
- `PATCH /api/internal/runs/:runId`

They are protected by `WORKER_CONTROL_SECRET` and are meant for Cloud Run / Railway jobs, not browser clients.

This means the remaining live step is operational, not architectural:

1. boot the worker with `WORKER_CONTROL_BASE_URL`, `WORKER_CONTROL_SECRET`, and `ANALYTICS_PROJECT_ID`
2. claim the next queued run for that project
3. materialize the generated runtime YAML inside the worker
4. run ingestion / forecast work
5. PATCH run status as `running`, `succeeded`, or `failed`
6. let `Settings` reflect the real source freshness and run history automatically
