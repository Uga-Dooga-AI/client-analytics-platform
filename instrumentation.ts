/**
 * Next.js Instrumentation Hook
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Runs once on server startup, before any requests are handled.
 * validateBootstrapConfig() throws if SUPERADMIN_BOOTSTRAP_KEY is absent or too short,
 * preventing the server from accepting requests with an insecure configuration.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateBootstrapConfig } = await import(
      "@/lib/bootstrap/validate"
    );
    validateBootstrapConfig();
  }
}
