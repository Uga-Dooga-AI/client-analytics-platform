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

**Stub mode** — real I/O is not implemented yet. Blocked on:
- AppMetrica credentials + app_ids (UGAA-1166)
- GCP project access + BigQuery datasets (UGAA-1167)

The scaffold is ready for Cloud Run deployment configuration by CTO.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `APPMETRICA_TOKEN` | Yes | AppMetrica OAuth token |
| `GCP_PROJECT_ID` | Yes | GCP project ID |
| `GCS_BUCKET` | Yes | GCS bucket for raw data |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes* | Path to service account JSON (* or Workload Identity) |
| `JOB_CONFIG_PATH` | No | Path to config file (default: `config/job_config.example.yml`) |

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
