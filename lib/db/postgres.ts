import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __analyticsPlatformPgPool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  return new Pool({
    connectionString,
    max: 10,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined,
  });
}

export function getPostgresPool(): Pool | null {
  if (!globalThis.__analyticsPlatformPgPool) {
    const pool = createPool();
    if (!pool) {
      return null;
    }
    globalThis.__analyticsPlatformPgPool = pool;
  }

  return globalThis.__analyticsPlatformPgPool ?? null;
}

export function hasPostgresDatabase() {
  return Boolean(process.env.DATABASE_URL);
}
