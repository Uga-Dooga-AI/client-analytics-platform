# Stitch-first workflow

This project treats data integration and interface delivery as separate tracks.

## Rule set

1. UI shell development does not wait for BigQuery, Google Cloud, or AppMetrica credentials.
2. Product routes are built against mock-serving data until the serving API is live.
3. Route design direction must come from the Stitch project, `.stitch/DESIGN.md`, and `.stitch/next-prompt.md`.
4. If a route is not yet backed by a downloaded Stitch HTML export, it must be marked as `prompt_ready` or `pending` in `config/stitch-provenance.json`.
5. `npm run verify:stitch` is the local proof that the project still follows Stitch-first development.

## Current delivery mode

- App surface: mock-first, light theme, dense operator UI.
- Data plane: deferred until credentials, project bindings, and source tokens are available.
- Design provenance: tracked in `config/stitch-provenance.json`.

## Blocking policy

Credentials are only a blocker for:

- ingestion jobs;
- source bindings;
- scheduled transforms;
- forecast compute deployment;
- production data freshness checks.

Credentials are not a blocker for:

- navigation;
- page layouts;
- filters and tables;
- placeholder states;
- access screens;
- mock KPI, forecast, cohort, and funnel surfaces.
