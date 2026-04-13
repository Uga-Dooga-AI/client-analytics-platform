import { NextRequest, NextResponse } from "next/server";
import { isBootstrapComplete } from "@/lib/bootstrap/guard";
import { checkRateLimit } from "@/lib/bootstrap/rateLimiter";
import { logBootstrapEvent } from "@/lib/bootstrap/audit";
import { compareBootstrapKey } from "@/lib/bootstrap/compareKey";
import { bootstrapSuperAdmin } from "@/lib/auth/store";
import { readSessionFromRequest } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * POST /api/admin/bootstrap
 *
 * Creates the first super_admin. Protected by SUPERADMIN_BOOTSTRAP_KEY.
 *
 * Security mechanisms:
 *  1. Atomicity — store transaction creates user + sets bootstrapComplete flag.
 *  2. bootstrapGuard — 410 if system is already initialised.
 *  3. Startup validation — validateBootstrapConfig() throws on boot if key < 32 chars.
 *  4. Rate limiting — 5 req / 15 min per IP → 429.
 *  5. Audit logging — every call writes one event to `audit_log`.
 *
 * Body: { bootstrapKey: string }
 */
export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  // ── 4. Rate limiting ────────────────────────────────────────────────────────
  const allowed = checkRateLimit(ip);
  if (!allowed) {
    await logBootstrapEvent("bootstrap_blocked", ip, {
      reason: "rate_limit_exceeded",
    });
    return NextResponse.json(
      { error: "Too many bootstrap attempts. Try again in 15 minutes." },
      { status: 429 }
    );
  }

  // ── 2. bootstrapGuard ───────────────────────────────────────────────────────
  const alreadyComplete = await isBootstrapComplete();
  if (alreadyComplete) {
    await logBootstrapEvent("bootstrap_blocked", ip, {
      reason: "already_bootstrapped",
    });
    return NextResponse.json(
      { error: "Bootstrap endpoint is disabled. System already initialized." },
      { status: 410 }
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: { bootstrapKey?: string };
  try {
    body = await request.json();
  } catch {
    await logBootstrapEvent("bootstrap_attempt", ip, {
      reason: "invalid_json",
    });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { bootstrapKey: providedKey } = body;

  // ── 3. Key validation (also enforced at startup via validateBootstrapConfig) ─
  const bootstrapKey = process.env.SUPERADMIN_BOOTSTRAP_KEY;
  if (!bootstrapKey) {
    await logBootstrapEvent("bootstrap_attempt", ip, {
      reason: "key_not_configured",
    });
    return NextResponse.json(
      { error: "Bootstrap is not configured" },
      { status: 503 }
    );
  }

  if (!providedKey || !compareBootstrapKey(providedKey, bootstrapKey)) {
    await logBootstrapEvent("bootstrap_failure", ip, {
      reason: "invalid_key",
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await readSessionFromRequest(request);
  if (!session) {
    await logBootstrapEvent("bootstrap_attempt", ip, {
      reason: "session_not_found",
    });
    return NextResponse.json(
      { error: "Authenticated session required" },
      { status: 401 }
    );
  }

  const adminEmail = session.email ?? "";

  // ── 1. Atomic store transaction ─────────────────────────────────────────────
  try {
    await bootstrapSuperAdmin({
      authUid: session.uid,
      email: adminEmail,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "BOOTSTRAP_COMPLETE") {
      await logBootstrapEvent("bootstrap_blocked", ip, {
        email: adminEmail,
        reason: "race_condition_already_bootstrapped",
      });
      return NextResponse.json(
        { error: "Bootstrap endpoint is disabled. System already initialized." },
        { status: 410 }
      );
    }
    console.error("[BOOTSTRAP] Transaction failed:", err);
    await logBootstrapEvent("bootstrap_attempt", ip, {
      email: adminEmail,
      reason: "transaction_error",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  // ── 5. Audit log — success ──────────────────────────────────────────────────
  await logBootstrapEvent("bootstrap_success", ip, { email: adminEmail });

  return NextResponse.json({ ok: true, uid: session.uid, role: "super_admin" });
}
