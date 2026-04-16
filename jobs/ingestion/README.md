# ingestion — AppMetrica Logs API → GCS → BigQuery

Cloud Run Job that fetches AppMetrica event logs and lands them in BigQuery via GCS.

## Pipeline overview

```
AppMetrica Logs API
        ↓  (NDJSON over HTTPS)
  Google Cloud Storage   (raw/appmetrica/{app_id}/{date}/*.ndjson)
        ↓  (BQ load job)
  BigQuery raw.appmetrica_events
```

## Status

Runtime mode is now wired:

- the worker can claim the next queued `ingestion` / `backfill` run from the control plane
- generated YAML is materialized locally before execution
- final run/source status is PATCHed back into the control plane
- when `provisioning.auto_create_infrastructure=true`, the worker preflights and creates the GCS bucket plus `raw` / `stg` / `mart` datasets before ingestion starts

Live extraction still depends on real AppMetrica and GCP credentials.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `APPMETRICA_TOKEN` | Yes | AppMetrica OAuth token |
| `GCP_PROJECT_ID` | Yes | GCP project ID |
| `GCS_BUCKET` | Yes | GCS bucket for raw data |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes* | Path to service account JSON (* or Workload Identity) |
| `JOB_CONFIG_PATH` | No | Path to config file (default: `config/job_config.example.yml`) |
| `WORKER_CONTROL_BASE_URL` | No | Enable control-plane mode and call back into `/api/internal/*` |
| `WORKER_CONTROL_SECRET` | No | Shared secret for internal worker auth |
| `ANALYTICS_PROJECT_ID` | No | Project queue to claim from when running in control-plane mode |
| `ANALYTICS_RUN_ID` | No | Directly attach to one run instead of claiming the next queued run |

## Local run

```bash
# 1. Copy and fill config
cp config/job_config.example.yml config/job_config.yml
# Edit config/job_config.yml with real app_ids and project values

# 2. Set env vars
export APPMETRICA_TOKEN=your_token
export GCP_PROJECT_ID=your_project
export GCS_BUCKET=your_bucket
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
  --tag gcr.io/${GCP_PROJECT_ID}/ingestion:latest \
  --project ${GCP_PROJECT_ID}

# Create Cloud Run Job (first time)
gcloud run jobs create ingestion \
  --image gcr.io/${GCP_PROJECT_ID}/ingestion:latest \
  --region europe-west1 \
  --set-env-vars GCP_PROJECT_ID=${GCP_PROJECT_ID},GCS_BUCKET=${GCS_BUCKET} \
  --set-secrets APPMETRICA_TOKEN=appmetrica-token:latest \
  --set-secrets GOOGLE_APPLICATION_CREDENTIALS=sa-key-path:latest \
  --project ${GCP_PROJECT_ID}

# Update existing job
gcloud run jobs update ingestion \
  --image gcr.io/${GCP_PROJECT_ID}/ingestion:latest \
  --region europe-west1 \
  --project ${GCP_PROJECT_ID}

# Manual trigger
gcloud run jobs execute ingestion \
  --region europe-west1 \
  --project ${GCP_PROJECT_ID}
```

## Cloud Scheduler (D+1, 07:00 MSK)

```bash
gcloud scheduler jobs create http ingestion-daily \
  --schedule "0 4 * * *" \
  --uri "https://run.googleapis.com/v1/namespaces/${GCP_PROJECT_ID}/jobs/ingestion:run" \
  --oauth-service-account-email ingestion-scheduler@${GCP_PROJECT_ID}.iam.gserviceaccount.com \
  --location europe-west1
```
