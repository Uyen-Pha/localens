import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveLocalSupabaseCli } from "./supabase-local.mjs";

export const REQUIRED_CONCURRENCY_SCENARIOS = [
  "CAS revision winner",
  "guest claim winner",
  "quota bucket creation and reservation idempotency",
  "departure capacity without oversell",
  "quote checkout compensation",
  "Stripe webhook event race",
];

const LOCAL_SUPABASE_DB_PORT = "54322";

function result(code, reason) {
  return {
    ok: false,
    code,
    message: `${code}: ${reason}. Required two-session scenarios: ${REQUIRED_CONCURRENCY_SCENARIOS.join("; ")}`,
  };
}

export function validateLocalDatabaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("database URL is not a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("database URL must use postgres:// or postgresql://");
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
    throw new Error("database URL host must be loopback-only");
  }
  if (parsed.port !== LOCAL_SUPABASE_DB_PORT) {
    throw new Error(`database URL port must be ${LOCAL_SUPABASE_DB_PORT} for local Supabase`);
  }
  return parsed;
}

export async function runConcurrencyCheck({ cwd = process.cwd(), env = process.env } = {}) {
  if (env.LOCALENS_DB_URL) {
    try {
      validateLocalDatabaseUrl(env.LOCALENS_DB_URL);
    } catch (error) {
      return result("REMOTE_MODE_REJECTED", error.message);
    }
  }
  if (!env.LOCALENS_DB_URL || env.LOCALENS_DB_URL.trim().length === 0) {
    return result("NOT_CONFIGURED", "LOCALENS_DB_URL is not configured for the local two-session harness");
  }
  if (env.LOCALENS_DB_CONCURRENCY !== "1") {
    return result("NOT_CONFIGURED", "set LOCALENS_DB_CONCURRENCY=1 only for an explicitly configured local harness");
  }
  if (!resolveLocalSupabaseCli({ cwd })) {
    return result("NOT_AVAILABLE", "project-local Supabase CLI is unavailable");
  }
  return result("NOT_AVAILABLE", "the two-session harness is intentionally not implemented in this scaffold");
}

async function main() {
  const outcome = await runConcurrencyCheck();
  if (!outcome.ok) {
    console.error(outcome.message);
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`NOT_AVAILABLE: ${error?.message ?? String(error)}`);
    process.exitCode = 2;
  });
}
