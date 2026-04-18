import { createSign } from "crypto";
import { getPostgresPool } from "@/lib/db/postgres";
import { decryptSecret } from "@/lib/platform/secrets";
import type { AnalyticsProjectBundle, AnalyticsSyncRunRecord } from "./store";

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type DispatchResult = {
  ok: boolean;
  reason?: string;
  operationName?: string | null;
};

const OAUTH_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
const TOKEN_CACHE = new Map<string, { token: string; expiresAtMs: number }>();

function runJobName(bundle: AnalyticsProjectBundle, run: AnalyticsSyncRunRecord) {
  const baseName = `analytics-${bundle.project.slug}`;
  if (run.runType === "backfill" || run.runType === "ingestion") {
    return `${baseName}-ingestion`;
  }

  if (run.runType === "bounds_refresh" || run.runType === "forecast") {
    return `${baseName}-forecasts`;
  }

  return null;
}

async function loadProjectServiceAccount(projectId: string) {
  const pool = getPostgresPool();
  if (!pool) {
    return null;
  }

  const result = await pool.query<{
    secret_ciphertext: string | null;
  }>(
    `
      SELECT secret_ciphertext
      FROM analytics_project_sources
      WHERE project_id = $1
        AND source_type = 'bigquery_export'
      LIMIT 1
    `,
    [projectId]
  );

  const ciphertext = result.rows[0]?.secret_ciphertext;
  if (!ciphertext) {
    return null;
  }

  const secret = decryptSecret(ciphertext);
  if (!secret) {
    return null;
  }

  const parsed = JSON.parse(secret) as Partial<GoogleServiceAccount>;
  if (!parsed.client_email || !parsed.private_key) {
    return null;
  }

  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
    token_uri: parsed.token_uri,
  } satisfies GoogleServiceAccount;
}

async function getGoogleAccessToken(serviceAccount: GoogleServiceAccount) {
  const cacheKey = serviceAccount.client_email;
  const cached = TOKEN_CACHE.get(cacheKey);
  if (cached && cached.expiresAtMs > Date.now() + 60_000) {
    return cached.token;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;
  const tokenUri = serviceAccount.token_uri || TOKEN_AUDIENCE;

  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claimSet = Buffer.from(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: OAUTH_SCOPE,
      aud: tokenUri,
      iat: issuedAt,
      exp: expiresAt,
    })
  ).toString("base64url");
  const unsigned = `${header}.${claimSet}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key, "base64url");
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Could not mint Google access token: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new Error("Google access token response did not include access_token.");
  }

  TOKEN_CACHE.set(cacheKey, {
    token: payload.access_token,
    expiresAtMs: Date.now() + Math.max(300, payload.expires_in ?? 3600) * 1000,
  });

  return payload.access_token;
}

export async function dispatchAnalyticsRun(
  run: AnalyticsSyncRunRecord,
  bundle: AnalyticsProjectBundle
): Promise<DispatchResult> {
  if (run.status !== "queued") {
    return { ok: false, reason: `Run ${run.id} is ${run.status}, not queued.` };
  }

  const jobName = runJobName(bundle, run);
  if (!jobName) {
    return { ok: false, reason: `Run type ${run.runType} is not dispatchable.` };
  }

  if (!bundle.project.gcpProjectId) {
    return { ok: false, reason: "Project is missing gcpProjectId." };
  }

  const serviceAccount = await loadProjectServiceAccount(bundle.project.id);
  if (!serviceAccount) {
    return { ok: false, reason: "BigQuery service account credentials are unavailable." };
  }

  const token = await getGoogleAccessToken(serviceAccount);
  const region = bundle.project.settings.provisioningRegion;
  const response = await fetch(
    `https://run.googleapis.com/v2/projects/${bundle.project.gcpProjectId}/locations/${region}/jobs/${jobName}:run`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-goog-user-project": bundle.project.gcpProjectId,
      },
      body: JSON.stringify({}),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Cloud Run job dispatch failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json().catch(() => null)) as { name?: string } | null;
  return {
    ok: true,
    operationName: payload?.name ?? null,
  };
}

export async function dispatchAnalyticsRunSafely(
  run: AnalyticsSyncRunRecord,
  bundle: AnalyticsProjectBundle
) {
  try {
    return await dispatchAnalyticsRun(run, bundle);
  } catch (error) {
    console.error("analytics run dispatch failed", {
      projectId: bundle.project.id,
      projectSlug: bundle.project.slug,
      runId: run.id,
      runType: run.runType,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Unknown dispatch error.",
    } satisfies DispatchResult;
  }
}
