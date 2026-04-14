/**
 * Startup validation for bootstrap configuration.
 * Call validateBootstrapConfig() before app.listen / in instrumentation.ts.
 * Throws if SUPERADMIN_BOOTSTRAP_KEY is missing or < 32 chars.
 */
export function validateBootstrapConfig(): void {
  const demoAccessEnabled = process.env.DEMO_ACCESS_ENABLED === "true";
  if (demoAccessEnabled) {
    return;
  }

  const authSecret =
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.SUPERADMIN_BOOTSTRAP_KEY;
  if (!authSecret) {
    throw new Error("FATAL: AUTH_SECRET is not set. Server cannot start.");
  }
  if (authSecret.length < 32) {
    throw new Error(
      `FATAL: AUTH_SECRET must be >= 32 characters. Got ${authSecret.length}.`
    );
  }

  const key = process.env.SUPERADMIN_BOOTSTRAP_KEY;
  if (!key) {
    throw new Error(
      "FATAL: SUPERADMIN_BOOTSTRAP_KEY is not set. Server cannot start."
    );
  }
  if (key.length < 32) {
    throw new Error(
      `FATAL: SUPERADMIN_BOOTSTRAP_KEY must be >= 32 characters. Got ${key.length}.`
    );
  }
}
