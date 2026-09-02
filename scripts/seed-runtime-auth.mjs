import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import { runLocalSupabase } from "./supabase-local.mjs";

const { Client } = pg;

const LOCAL_SUPABASE_API_PORT = "54321";
const LOCAL_SUPABASE_DB_PORT = "54322";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const RUNTIME_AUTH_SEED_ERROR = Symbol("RUNTIME_AUTH_SEED_ERROR");

export const RUNTIME_AUTH_IDENTITIES = Object.freeze([
  { email: "customer.runtime@localens.test", role: "customer", displayName: "Runtime Traveler", language: "en" },
  { email: "guide.runtime@localens.test", role: "guide", displayName: "Runtime Guide", language: "vi" },
  { email: "guide-secondary.runtime@localens.test", role: "guide", displayName: "Runtime Guide Two", language: "en" },
  { email: "admin.runtime@localens.test", role: "admin", displayName: "Runtime Administrator", language: "en" },
]);

function runtimeAuthSeedError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error[RUNTIME_AUTH_SEED_ERROR] = true;
  return error;
}

function stableRuntimeAuthSeedError(error, code, message) {
  return error?.[RUNTIME_AUTH_SEED_ERROR] === true
    ? error
    : runtimeAuthSeedError(code, message);
}

function requireLocalEndpoint(value, { protocols, port, label, rejectSearch = false }) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw runtimeAuthSeedError("RUNTIME_AUTH_SEED_LOCAL_ONLY", `${label} must be a loopback URL`);
  }
  if (
    !protocols.includes(parsed.protocol) ||
    !LOOPBACK_HOSTS.has(parsed.hostname) ||
    parsed.port !== port ||
    (rejectSearch && parsed.search !== "")
  ) {
    throw runtimeAuthSeedError("RUNTIME_AUTH_SEED_LOCAL_ONLY", `${label} must use the local Supabase loopback endpoint`);
  }
  return parsed;
}

function requirePasswords(passwords) {
  for (const { role } of RUNTIME_AUTH_IDENTITIES) {
    if (typeof passwords?.[role] !== "string" || passwords[role].length === 0) {
      throw runtimeAuthSeedError(
        "RUNTIME_AUTH_SEED_PASSWORDS_REQUIRED",
        "all runtime Auth password environment variables are required",
      );
    }
  }
}

function requireServiceRoleKey(serviceRoleKey) {
  if (typeof serviceRoleKey !== "string" || serviceRoleKey.length === 0) {
    throw runtimeAuthSeedError("RUNTIME_AUTH_SEED_SERVICE_KEY_REQUIRED", "local service-role key is required");
  }
}

function validateSeedConfiguration({ supabaseUrl, databaseUrl, serviceRoleKey, passwords }) {
  requireLocalEndpoint(supabaseUrl, {
    protocols: ["http:", "https:"],
    port: LOCAL_SUPABASE_API_PORT,
    label: "Supabase API URL",
  });
  requireLocalEndpoint(databaseUrl, {
    protocols: ["postgres:", "postgresql:"],
    port: LOCAL_SUPABASE_DB_PORT,
    label: "database URL",
    rejectSearch: true,
  });
  requireServiceRoleKey(serviceRoleKey);
  requirePasswords(passwords);
}

function unwrapAdminResult(operation, result) {
  if (result?.error) {
    throw runtimeAuthSeedError("RUNTIME_AUTH_SEED_AUTH_FAILED", `${operation} failed`);
  }
  return result?.data;
}

async function callAuthAdmin(operation, call) {
  try {
    return unwrapAdminResult(operation, await call());
  } catch (error) {
    if (error?.[RUNTIME_AUTH_SEED_ERROR] === true) throw error;
    throw runtimeAuthSeedError("RUNTIME_AUTH_SEED_AUTH_FAILED", `${operation} failed`);
  }
}

async function listRuntimeUsers(authAdmin) {
  const usersByEmail = new Map();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const data = await callAuthAdmin("list local Auth users", () => authAdmin.listUsers({ page, perPage }));
    const users = Array.isArray(data?.users) ? data.users : [];
    for (const user of users) {
      if (RUNTIME_AUTH_IDENTITIES.some(({ email }) => email === user.email)) usersByEmail.set(user.email, user);
    }
    if (!data?.nextPage || users.length < perPage) break;
    page = data.nextPage;
  }

  return usersByEmail;
}

async function ensureRuntimeUsers(authAdmin, passwords) {
  const existingUsers = await listRuntimeUsers(authAdmin);
  const users = [];

  for (const identity of RUNTIME_AUTH_IDENTITIES) {
    const existing = existingUsers.get(identity.email);
    const attributes = {
      email: identity.email,
      password: passwords[identity.role],
      email_confirm: true,
    };
    const data = existing
      ? await callAuthAdmin(
          `update ${identity.role} local Auth user`,
          () => authAdmin.updateUserById(existing.id, attributes),
        )
      : await callAuthAdmin(
          `create ${identity.role} local Auth user`,
          () => authAdmin.createUser(attributes),
        );
    const user = data?.user;
    if (!user?.id) {
      throw runtimeAuthSeedError("RUNTIME_AUTH_SEED_AUTH_FAILED", `${identity.role} Auth user has no id`);
    }
    users.push({ ...identity, userId: user.id, seedStatus: existing ? "reused" : "created" });
  }

  return users;
}

async function normalizeDatabaseIdentities(query, users) {
  let transactionStarted = false;
  try {
    await query("BEGIN");
    transactionStarted = true;
    for (const identity of users) {
      await query("DELETE FROM private.user_roles WHERE user_id = $1::uuid", [identity.userId]);
      await query(
        "INSERT INTO private.user_roles (user_id, role) VALUES ($1::uuid, $2::public.app_role)",
        [identity.userId, identity.role],
      );
      await query(
        `INSERT INTO public.profiles (id, display_name, language)
         VALUES ($1::uuid, $2, $3::public.locale)
         ON CONFLICT (id) DO UPDATE
         SET display_name = EXCLUDED.display_name, language = EXCLUDED.language`,
        [identity.userId, identity.displayName, identity.language],
      );

      if (identity.role === "guide") {
        await query(
          `INSERT INTO public.guide_profiles (user_id, display_name, language)
           VALUES ($1::uuid, $2, $3::public.locale)
           ON CONFLICT (user_id) DO UPDATE
           SET display_name = EXCLUDED.display_name, language = EXCLUDED.language`,
          [identity.userId, identity.displayName, identity.language],
        );
      } else {
        await query("DELETE FROM public.guide_profiles WHERE user_id = $1::uuid", [identity.userId]);
      }
    }
    await query("COMMIT");
  } catch {
    if (transactionStarted) {
      try {
        await query("ROLLBACK");
      } catch {
        // Preserve the stable redacted normalization failure.
      }
    }
    throw runtimeAuthSeedError("RUNTIME_AUTH_SEED_DATABASE_FAILED", "identity normalization failed");
  }
}

export async function seedRuntimeAuth(options) {
  const {
    supabaseUrl,
    databaseUrl,
    serviceRoleKey,
    passwords,
    authAdmin,
    query,
    logger = () => {},
  } = options ?? {};

  validateSeedConfiguration({ supabaseUrl, databaseUrl, serviceRoleKey, passwords });
  if (!authAdmin || typeof authAdmin.listUsers !== "function") {
    throw runtimeAuthSeedError("RUNTIME_AUTH_SEED_AUTH_REQUIRED", "Auth admin client is required");
  }
  if (typeof query !== "function") {
    throw runtimeAuthSeedError("RUNTIME_AUTH_SEED_DATABASE_REQUIRED", "database query function is required");
  }

  const users = await ensureRuntimeUsers(authAdmin, passwords);
  await normalizeDatabaseIdentities(query, users);

  for (const identity of users) {
    logger(`[db:seed:runtime-auth] ${identity.email} role=${identity.role} status=${identity.seedStatus}`);
  }
  return users.map(({ email, role, displayName, language, userId }) => ({
    email,
    role,
    displayName,
    language,
    userId,
  }));
}

function parseLocalStatusEnv(output) {
  const selected = {};
  for (const line of String(output).split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(?:"([^"]*)"|'([^']*)'|(.*))$/);
    if (!match || !["API_URL", "SERVICE_ROLE_KEY"].includes(match[1])) continue;
    selected[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return selected;
}

export async function runRuntimeAuthSeedCli({ env = process.env, logger = console.log } = {}) {
  let status;
  try {
    status = runLocalSupabase(["status", "-o", "env"], { capture: true });
  } catch {
    throw runtimeAuthSeedError("RUNTIME_AUTH_SEED_STATUS_FAILED", "local Supabase status failed");
  }
  const localStatus = parseLocalStatusEnv(status.stdout);
  const databaseUrl = env.LOCALENS_DB_URL;
  const serviceRoleKey = localStatus.SERVICE_ROLE_KEY;
  const supabaseUrl = localStatus.API_URL;
  const passwords = {
    customer: env.LOCALENS_RUNTIME_CUSTOMER_PASSWORD,
    guide: env.LOCALENS_RUNTIME_GUIDE_PASSWORD,
    admin: env.LOCALENS_RUNTIME_ADMIN_PASSWORD,
  };
  validateSeedConfiguration({ supabaseUrl, databaseUrl, serviceRoleKey, passwords });
  let authAdmin;
  let client;
  try {
    authAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }).auth.admin;
    client = new Client({ connectionString: databaseUrl, application_name: "localens-runtime-auth-seed" });
  } catch {
    throw runtimeAuthSeedError("RUNTIME_AUTH_SEED_CLIENT_FAILED", "local runtime Auth client construction failed");
  }

  let result;
  let primaryError;
  try {
    try {
      await client.connect();
    } catch {
      throw runtimeAuthSeedError("RUNTIME_AUTH_SEED_CONNECT_FAILED", "local database connection failed");
    }
    result = await seedRuntimeAuth({
      supabaseUrl,
      databaseUrl,
      serviceRoleKey,
      passwords,
      authAdmin,
      query: client.query.bind(client),
      logger,
    });
  } catch (error) {
    primaryError = stableRuntimeAuthSeedError(
      error,
      "RUNTIME_AUTH_SEED_FAILED",
      "local runtime Auth seed failed",
    );
  } finally {
    try {
      await client.end();
    } catch {
      if (!primaryError) {
        primaryError = runtimeAuthSeedError("RUNTIME_AUTH_SEED_TEARDOWN_FAILED", "local database teardown failed");
      }
    }
  }
  if (primaryError) throw primaryError;
  return result;
}

export async function runRuntimeAuthSeedMain({ run = runRuntimeAuthSeedCli, errorLogger = console.error } = {}) {
  try {
    await run();
    return 0;
  } catch (error) {
    const stableError = stableRuntimeAuthSeedError(
      error,
      "RUNTIME_AUTH_SEED_FAILED",
      "local runtime Auth seed failed",
    );
    try {
      errorLogger(stableError.message);
    } catch {
      // A failed logger must not re-expose the original error or change the exit contract.
    }
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runRuntimeAuthSeedMain();
}
