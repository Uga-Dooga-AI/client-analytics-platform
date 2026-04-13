# forecasts — BigQuery mart → forecast engine → BigQuery output

Cloud Run Job that reads experiment time-series data from BigQuery marts,
generates forecasts, and writes results back to `mart_forecast_points`.

## Pipeline overview

```
BigQuery mart.mart_experiment_daily
        ↓  (BQ read)
  ForecastEngine (statsmodels / Prophet)
        ↓  (BQ write-append)
  BigQuery mart.mart_forecast_points
```

## Status

**Stub mode** — real I/O is not implemented yet. Blocked on:
- GCP project access + BigQuery datasets (UGAA-1167)

The scaffold is ready for Cloud Run deployment configuration by CTO.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GCP_PROJECT_ID` | Yes | GCP project ID |
| `BQ_MART_DATASET` | No | Mart dataset name (default: `mart`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes* | Path to service account JSON (* or Workload Identity) |
| `JOB_CONFIG_PATH` | No | Path to config file (default: `config/job_config.example.yml`) |

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
