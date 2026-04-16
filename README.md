# Client Analytics Platform

Analytics workspace for A/B experiments, funnels, cohorts, and forecasts.

**Stack:** Next.js 15 App Router · Tailwind CSS 4 · Railway (web) · GCP BigQuery (data plane)

---

## Local Development

```bash
cd client-analytics-platform
npm install
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000).

No credentials required for the UI shell. Data-connected sections show placeholder states until the GCP/AppMetrica layer is configured.

The current build mode is `mock-first`: interface delivery proceeds independently from BigQuery, Google Cloud, and AppMetrica setup.

Admin onboarding is now implemented in `Settings`: projects, connector credentials, refresh cadence, run history, and manual backfill / pull-now / bounds / forecast actions live there.

`Settings` now also generates per-project runtime bundles for ingestion and forecast workers, along with callback endpoints for updating run status back into the control plane.

Auth/runtime path is now:

- Google OAuth on the server
- signed httpOnly session cookie
- Railway-hosted app/API
- own access store in Railway Postgres

Firebase Functions and Firestore are no longer part of the primary app runtime.

To review the product without logging in, enable demo access:

```bash
DEMO_ACCESS_ENABLED=true NEXT_PUBLIC_DEMO_ACCESS_ENABLED=true npm run dev
```

This bypasses auth middleware locally and opens the full workspace in demo mode.
It also skips the bootstrap-key and auth-secret startup checks so the shell can be reviewed before auth/bootstrap secrets are issued.
When demo mode is enabled, admin/access APIs and analytics control-plane data switch to the in-memory demo stores instead of the live database-backed state.

For production auto-approval of the primary operator account, set:

```bash
AUTO_APPROVED_SUPERADMIN_EMAILS=sergey.mishustin@ugadooga.com
AUTO_APPROVED_ADMIN_EMAILS=sergey.mishustin@ugadooga.com
```

## Stitch-first proof

Route design provenance is tracked in `config/stitch-provenance.json`.

```bash
npm run verify:stitch
```

This checks that:

- `.stitch/SITE.md`, `.stitch/DESIGN.md`, and `.stitch/next-prompt.md` exist;
- routes marked as `backed` have a downloaded Stitch HTML artifact;
- routes not yet exported from Stitch are explicitly marked as `prompt_ready` or `pending`.

---

## Routes

| Route | Status | Notes |
|---|---|---|
| `/` | Shell | Redirects to `/overview` or `/sign-in` |
| `/login` | Live | Google OAuth entrypoint |
| `/sign-in` | Live | Redirects to `/login` |
| `/overview` | Shell | KPI surface and operator overview |
| `/experiments` | Shell | Experiment list and filters |
| `/experiments/[id]` | Shell | Experiment detail, variants, guardrails, CI shell |
| `/funnels` | Shell | Funnel library and step previews |
| `/funnels/[id]` | Shell | Funnel detail and step conversion |
| `/cohorts` | Shell | Cohort explorer, retention heatmap, trend shell |
| `/forecasts` | Shell | Forecast runs, uncertainty cards, model summary |
| `/acquisition` | Shell | UA workspace with ROAS, payback, grouping, and confidence-band charts |
| `/access` | Shell | User, role, request, and permission shell |
| `/settings` | Shell | Source registry, project bindings, and metric catalog |
| `/not-ready` | Shell | Generic not-yet-available page |

---

## Deployment (Railway)

Railway config is in `railway.toml`. Deploy via Railway CLI or GitHub push.

```bash
railway link     # link to Railway project
railway up       # deploy current branch
railway logs     # tail deployment logs
```

Environment variables are documented in `docs/env.md`.

Worker runtimes should use `WORKER_CONTROL_SECRET` to call:

- `GET /api/internal/projects/:projectId/runtime-bundle`
- `POST /api/internal/projects/:projectId/claim-run`
- `GET /api/internal/runs/:runId`
- `PATCH /api/internal/runs/:runId`

The intended flow is:

1. Admin queues `ingestion`, `backfill`, `forecast`, or `bounds_refresh` from `Settings`.
2. A per-project worker starts with `ANALYTICS_PROJECT_ID`, `WORKER_CONTROL_BASE_URL`, and `WORKER_CONTROL_SECRET`.
3. The worker claims the oldest queued run, materializes the generated YAML config into `/tmp/analytics-runtime`, executes the job, and PATCHes final status back into the control plane.

---

## Project Context

- Architecture decision: `../docs/platform-decision-railway-gcp-vercel.md`
- API contract (data plane): `../docs/serving-marts-api-contract.md`
- Project onboarding plan: `docs/project-onboarding-plan.md`
- Stitch-first workflow: `docs/stitch-first-workflow.md`
- Founder blockers: UGAA-1166, UGAA-1167, UGAA-1169, UGAA-1170
