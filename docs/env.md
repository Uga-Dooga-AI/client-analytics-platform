# Environment Variables

## Web App (Railway)

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `production` on Railway, `development` locally |
| `PORT` | Yes | Default `3000`. Set by Railway automatically |
| `AUTH_SECRET` | Yes (non-demo) | Min 32-char secret used to sign the app session cookie and OAuth state |
| `DATABASE_URL` | Yes (non-demo) | Railway Postgres connection string for access-control and audit data |
| `GOOGLE_CLIENT_ID` | Yes (non-demo auth) | Google OAuth client id for server-side sign-in |
| `GOOGLE_CLIENT_SECRET` | Yes (non-demo auth) | Google OAuth client secret for server-side sign-in |
| `GOOGLE_HOSTED_DOMAIN` | Optional | Restricts Google OAuth sign-in to a company domain, e.g. `ugadooga.com` |
| `SUPERADMIN_BOOTSTRAP_KEY` | Yes (first deploy) | Min 32-char random key for bootstrap endpoint. Generate: `openssl rand -base64 32` |
| `AUTO_APPROVED_SUPERADMIN_EMAILS` | Optional | Comma-separated emails that should be promoted to `super_admin` and `approved=true` on first sign-in. `sergey.mishustin@ugadooga.com` is also treated as a built-in owner fallback. |
| `AUTO_APPROVED_ADMIN_EMAILS` | Optional | Comma-separated emails that should be promoted to `admin` and `approved=true` on first sign-in, e.g. `sergey.mishustin@ugadooga.com` |
| `DEMO_ACCESS_ENABLED` | Optional | Set to `true` to bypass auth in demo/review mode, inject demo admin claims, skip startup secret enforcement, and use an in-memory access store if `DATABASE_URL` is absent |
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

For UI-only review without Railway Postgres or Google OAuth:

```bash
DEMO_ACCESS_ENABLED=true
NEXT_PUBLIC_DEMO_ACCESS_ENABLED=true
```

> Note: Real GCP/AppMetrica credentials are not required for the shell UI. The web app reads only from BigQuery marts via the API layer, which is not yet implemented in v1.
