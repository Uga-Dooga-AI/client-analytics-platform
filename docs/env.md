# Environment Variables

## Web App (Railway)

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `production` on Railway, `development` locally |
| `PORT` | Yes | Default `3000`. Set by Railway automatically |
| `APP_URL` | Yes | Public URL of the deployed app, e.g. `https://analytics.railway.app` — used for CSRF origin check |
| `FIREBASE_PROJECT_ID` | Yes (auth) | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Yes (auth) | Firebase service account email (Admin SDK) |
| `FIREBASE_PRIVATE_KEY` | Yes (auth) | Firebase service account private key (Admin SDK) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes (auth) | Firebase Web API key (client SDK) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes (auth) | Firebase Auth domain, e.g. `project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes (auth) | Firebase project ID (client SDK) |
| `SUPERADMIN_BOOTSTRAP_KEY` | Yes (first deploy) | Min 32-char random key for bootstrap endpoint. Generate: `openssl rand -base64 32` |
| `AUTO_APPROVED_ADMIN_EMAILS` | Optional | Comma-separated emails that should be promoted to `admin` and `approved=true` on first sign-in, e.g. `sergey.mishustin@ugadooga.com` |
| `DEMO_ACCESS_ENABLED` | Optional | Set to `true` to bypass auth in demo/review mode, inject demo admin claims, and skip bootstrap-key startup enforcement |
| `NEXT_PUBLIC_DEMO_ACCESS_ENABLED` | Optional | Set to `true` to show demo-mode UI affordances like the login bypass button |

## Data Plane (GCP)

| Variable | Required | Description |
|---|---|---|
| `GCP_PROJECT_ID` | Yes (ingestion/forecasts) | GCP analytics project ID (blocked on UGAA-1167) |
| `BIGQUERY_DATASET_MART` | Yes | Target BigQuery mart dataset, e.g. `analytics_mart` |
| `GCS_BUCKET_RAW` | Yes | GCS bucket name for raw AppMetrica log dumps |
| `APPMETRICA_API_TOKEN` | Yes (ingestion) | AppMetrica Logs API token (blocked on UGAA-1166) |
| `APPMETRICA_APP_IDS` | Yes (ingestion) | Comma-separated AppMetrica app IDs |

## Local Development

Copy `.env.example` to `.env.local` and fill in values:

```bash
cp .env.example .env.local
npm run dev
```

> Note: Real GCP/AppMetrica credentials are not required for the shell UI. The web app reads only from BigQuery marts via the API layer, which is not yet implemented in v1.
