# forecasts — operational BigQuery mart → forecast engine → BigQuery output

Cloud Run Job that reads operational time-series data from BigQuery marts,
generates forecasts, and writes results back to `mart_forecast_points`.

This worker is not the notebook-parity cohort-decay / ROAS engine. Until that
surface is implemented, the runtime is restricted to revenue so it does not
materialize clearly invalid forecasts for DAU or installs.

## Pipeline overview

```
BigQuery mart.mart_experiment_daily
        ↓  (BQ read)
  ForecastEngine (statsmodels / Prophet)
        ↓  (BQ write-append)
  BigQuery mart.mart_forecast_points
```

## Status

The forecast worker is now functional in two modes:

- control-plane mode: claim the next queued `forecast` / `bounds_refresh` run, materialize generated YAML, execute, PATCH status back
- control-plane mode also reads the current hot forecast-combination list from the internal API so the worker can keep recent UI selections visible in run metadata and future prewarm flows
- local mode: read static config and optionally use `FORECAST_INPUT_PATH` as a CSV fallback

Live BigQuery / GCS writes still depend on real GCP credentials.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GCP_PROJECT_ID` | Yes | GCP project ID |
| `BQ_MART_DATASET` | No | Mart dataset name (default: `mart`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes* | Path to service account JSON (* or Workload Identity) |
| `JOB_CONFIG_PATH` | No | Path to config file (default: `config/job_config.example.yml`) |
| `FORECAST_INPUT_PATH` | No | CSV fallback with `date,metric,value` or `date,<metric columns...>` when BigQuery is unavailable |
| `FORECAST_OUTPUT_DIR` | No | Local output directory for CSV + bounds manifest fallback |
| `WORKER_CONTROL_BASE_URL` | No | Enable control-plane mode and call back into `/api/internal/*` |
| `WORKER_CONTROL_SECRET` | No | Shared secret for internal worker auth |
| `ANALYTICS_PROJECT_ID` | No | Project queue to claim from when running in control-plane mode |
| `ANALYTICS_RUN_ID` | No | Directly attach to one run instead of claiming the next queued run |

## Local run

```bash
# 1. Copy and fill config
cp config/job_config.example.yml config/job_config.yml
# Edit config/job_config.yml with real project_id

# 2. Set env vars
export GCP_PROJECT_ID=your_project
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
export JOB_CONFIG_PATH=config/job_config.yml

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run
python main.py
```

## Cloud Run deploy

```bash
# Build and push image
gcloud builds submit \
  --tag gcr.io/${GCP_PROJECT_ID}/forecasts:latest \
  --project ${GCP_PROJECT_ID}

# Create Cloud Run Job (first time)
gcloud run jobs create forecasts \
  --image gcr.io/${GCP_PROJECT_ID}/forecasts:latest \
  --region europe-west1 \
  --set-env-vars GCP_PROJECT_ID=${GCP_PROJECT_ID} \
  --set-secrets GOOGLE_APPLICATION_CREDENTIALS=sa-key-path:latest \
  --project ${GCP_PROJECT_ID}

# Update existing job
gcloud run jobs update forecasts \
  --image gcr.io/${GCP_PROJECT_ID}/forecasts:latest \
  --region europe-west1 \
  --project ${GCP_PROJECT_ID}

# Manual trigger
gcloud run jobs execute forecasts \
  --region europe-west1 \
  --project ${GCP_PROJECT_ID}
```

## Cloud Scheduler (daily, 08:00 MSK — after ingestion)

```bash
gcloud scheduler jobs create http forecasts-daily \
  --schedule "0 5 * * *" \
  --uri "https://run.googleapis.com/v1/namespaces/${GCP_PROJECT_ID}/jobs/forecasts:run" \
  --oauth-service-account-email forecasts-scheduler@${GCP_PROJECT_ID}.iam.gserviceaccount.com \
  --location europe-west1
```

## Forecast models

| Series length | Model | Notes |
|---|---|---|
| < 14 days | — | Insufficient data, job exits cleanly |
| 14–89 days | statsmodels ExponentialSmoothing | Fast, no seasonality |
| ≥ 90 days | Prophet | Handles weekly/annual seasonality |

## Bounds behavior

- `bounds_refresh` rebuilds upstream marts and republishes notebook-style bounds artifacts under the configured GCS prefix.
- Sizes without enough smoothed historical coverage are omitted entirely instead of being backfilled with synthetic `[-15%, +15%]` placeholders.
- Bounds training now unions daily and bucketed cohort-date slices for the common forecast step sizes (`1/2/3/5/7/14/30d`) so weekly and custom broad slices are not forced into a missing `1000.pkl` bucket just because the builder only learned from daily cohorts.
- Partially calculated tables stay sparse: missing cutoff / horizon keys remain absent so the UI can surface the gap instead of masking it.
- The published `p10 / p50 / p90` bands are still generated inside the forecast run itself.
- Holt intervals use residual standard deviation around the fitted series, scaled by the configured confidence interval.
- Prophet intervals use `yhat_lower / yhat / yhat_upper` directly from Prophet output.
- All bands are clipped to non-negative values before publishing.
