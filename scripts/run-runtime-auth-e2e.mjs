import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { requireLocalSupabaseCli, runLocalSupabase } from "./supabase-local.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_API_PORT = "54321";
const LOCAL_DATABASE_PORT = "54322";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const PASSWORD_ENV = {
  customer: "LOCALENS_RUNTIME_CUSTOMER_PASSWORD",
  guide: "LOCALENS_RUNTIME_GUIDE_PASSWORD",
  admin: "LOCALENS_RUNTIME_ADMIN_PASSWORD",
};

export const DOCKER_DESKTOP_CLI_DIR = "C:\\Users\\Admin\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin";

function runtimeError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function parseStatusFields(output) {
  const fields = {};
  for (const line of String(output).split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(?:"([^"]*)"|'([^']*)'|(.*))$/);
    if (!match || !["API_URL", "DB_URL", "PUBLISHABLE_KEY", "ANON_KEY"].includes(match[1])) continue;
    fields[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return fields;
}

function requireLoopbackEndpoint(value, { protocols, port, label, allowCredentials }) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw runtimeError("RUNTIME_AUTH_LOCAL_ONLY", `${label} must be a loopback local endpoint`);
  }
  if (
    !protocols.includes(parsed.protocol) ||
    !LOOPBACK_HOSTS.has(parsed.hostname) ||
    parsed.port !== port ||
    parsed.hash !== "" ||
    parsed.search !== "" ||
    (!allowCredentials && (parsed.username !== "" || parsed.password !== ""))
  ) {
    throw runtimeError("RUNTIME_AUTH_LOCAL_ONLY", `${label} must use the verified local Supabase loopback endpoint`);
  }
  return parsed.toString();
}

export function parseLocalRuntimeStatus(output, { databaseUrl } = {}) {
  const fields = parseStatusFields(output);
  const apiUrl = fields.API_URL;
  const selectedDatabaseUrl = databaseUrl ?? fields.DB_URL;
  const publishableKey = fields.PUBLISHABLE_KEY || fields.ANON_KEY;
  requireLoopbackEndpoint(apiUrl, {
    protocols: ["http:", "https:"],
    port: LOCAL_API_PORT,
    label: "Supabase API URL",
    allowCredentials: false,
  });
  requireLoopbackEndpoint(selectedDatabaseUrl, {
    protocols: ["postgres:", "postgresql:"],
    port: LOCAL_DATABASE_PORT,
    label: "database URL",
    allowCredentials: true,
  });
  if (typeof publishableKey !== "string" || publishableKey.length === 0) {
    throw runtimeError("RUNTIME_AUTH_STATUS_INVALID", "local Supabase browser key is missing");
  }
  return { apiUrl, databaseUrl: selectedDatabaseUrl, publishableKey };
}

export function createRuntimeAuthPasswords(env = process.env, random = randomBytes) {
  const passwords = {};
  for (const [role, name] of Object.entries(PASSWORD_ENV)) {
    const supplied = env[name];
    passwords[role] = typeof supplied === "string" && supplied.length > 0
      ? supplied
      : random(32).toString("base64url");
  }
  return passwords;
}

function pathKeyFor(env, platform) {
  return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? (platform === "win32" ? "Path" : "PATH");
}

function defaultDockerProbe(command, { env }) {
  return spawnSync(command, ["--version"], {
    env,
    encoding: "utf8",
    stdio: "ignore",
    windowsHide: true,
  });
}

export function ensureDockerCliOnPath({
  env = process.env,
  platform = process.platform,
  exists = existsSync,
  probe = defaultDockerProbe,
} = {}) {
  const first = probe("docker", { env });
  if (first?.status === 0) return;
  if (first?.error?.code !== "ENOENT") {
    throw runtimeError("RUNTIME_AUTH_DOCKER_UNAVAILABLE", "Docker CLI could not be verified");
  }
  if (platform !== "win32" || !exists(path.join(DOCKER_DESKTOP_CLI_DIR, "docker.exe"))) {
    throw runtimeError("RUNTIME_AUTH_DOCKER_CLI_NOT_FOUND", "the verified Docker Desktop CLI directory is unavailable");
  }
  const key = pathKeyFor(env, platform);
  const entries = String(env[key] ?? "").split(path.delimiter).filter(Boolean);
  if (!entries.some((entry) => path.resolve(entry).toLowerCase() === path.resolve(DOCKER_DESKTOP_CLI_DIR).toLowerCase())) {
    env[key] = [DOCKER_DESKTOP_CLI_DIR, ...entries].join(path.delimiter);
  }
  const second = probe("docker", { env });
  if (second?.status !== 0) {
    throw runtimeError("RUNTIME_AUTH_DOCKER_UNAVAILABLE", "Docker CLI could not be verified after PATH setup");
  }
}

export function requirePinnedLocalSupabase({
  cwd = PROJECT_ROOT,
  readPackage = () => JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")),
  requireLocalCli = requireLocalSupabaseCli,
} = {}) {
  let packageJson;
  try {
    packageJson = readPackage();
  } catch {
    throw runtimeError("RUNTIME_AUTH_SUPABASE_PIN_REQUIRED", "the project Supabase pin could not be verified");
  }
  if (packageJson?.devDependencies?.supabase !== "2.115.0") {
    throw runtimeError("RUNTIME_AUTH_SUPABASE_PIN_REQUIRED", "exact project-local supabase@2.115.0 is required");
  }
  return requireLocalCli({ cwd });
}

function stepSpec(name, cwd, env) {
  const script = (file, ...args) => ({
    name,
    command: process.execPath,
    args: [path.join(cwd, "scripts", file), ...args],
    cwd,
    env,
    stdio: name === "db:start" ? "pipe" : "inherit",
  });
  if (name === "db:start") return script("supabase-local.mjs", "start");
  if (name === "db:reset") return script("supabase-local.mjs", "db", "reset", "--local");
  if (name === "db:seed:runtime-auth") return script("seed-runtime-auth.mjs");
  if (name === "db:stop") return script("supabase-local.mjs", "stop", "--no-backup");
  if (name === "test:e2e:runtime-auth:playwright") {
    return {
      name,
      command: process.execPath,
      args: [
        path.join(cwd, "node_modules", "@playwright", "test", "cli.js"),
        "test",
        "tests/e2e/runtime-auth.spec.ts",
        "--config=playwright.runtime.config.ts",
      ],
      cwd,
      env,
    };
  }
  throw runtimeError("RUNTIME_AUTH_STEP_UNKNOWN", `unknown runtime Auth step: ${name}`);
}

function runChildStep(spec) {
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: spec.stdio === "pipe" ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    if (spec.stdio === "pipe") {
      child.stdout?.resume();
      child.stderr?.resume();
    }
    child.once("error", reject);
    child.once("close", (status) => resolve({ status: status ?? 1 }));
  });
}

async function runCheckedStep(name, { cwd, env, runStep, logger }) {
  logger(`[runtime-auth] ${name}`);
  let result;
  try {
    result = await runStep(stepSpec(name, cwd, env));
  } catch {
    throw runtimeError("RUNTIME_AUTH_STEP_FAILED", `${name} could not be started`, { step: name, status: 2 });
  }
  if (result?.status !== 0) {
    throw runtimeError("RUNTIME_AUTH_STEP_FAILED", `${name} exited with status ${result?.status ?? 1}`, {
      step: name,
      status: result?.status ?? 1,
    });
  }
}

export async function runRuntimeAuthE2E(options = {}) {
  const cwd = options.cwd ?? PROJECT_ROOT;
  const env = options.env ?? process.env;
  const logger = options.logger ?? console.log;
  const runStep = options.runStep ?? runChildStep;
  const status = options.status ?? ((statusEnv) => runLocalSupabase(["status", "-o", "env"], {
    cwd,
    capture: true,
    env: statusEnv,
  }));
  const prepareDocker = options.prepareDocker ?? ((dockerEnv) => ensureDockerCliOnPath({ env: dockerEnv }));
  const requireLocalCli = options.requireLocalCli ?? requireLocalSupabaseCli;
  const explicitDatabaseUrl = env.LOCALENS_DB_URL;
  if (explicitDatabaseUrl) {
    requireLoopbackEndpoint(explicitDatabaseUrl, {
      protocols: ["postgres:", "postgresql:"],
      port: LOCAL_DATABASE_PORT,
      label: "database URL",
      allowCredentials: true,
    });
  }
  prepareDocker(env);
  requirePinnedLocalSupabase({ cwd, requireLocalCli });

  const passwords = createRuntimeAuthPasswords(env, options.random ?? randomBytes);
  const baseChildEnv = { ...env };
  delete baseChildEnv.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES;
  baseChildEnv.NEXT_TELEMETRY_DISABLED = "1";
  for (const [role, name] of Object.entries(PASSWORD_ENV)) baseChildEnv[name] = passwords[role];

  let databaseStarted = false;
  let primaryError;
  try {
    await runCheckedStep("db:start", { cwd, env: baseChildEnv, runStep, logger });
    databaseStarted = true;
    await runCheckedStep("db:reset", { cwd, env: baseChildEnv, runStep, logger });

    let localStatus;
    try {
      localStatus = status(baseChildEnv);
    } catch {
      throw runtimeError("RUNTIME_AUTH_STATUS_FAILED", "capturing local Supabase status failed");
    }
    if (localStatus?.status !== 0) {
      throw runtimeError("RUNTIME_AUTH_STATUS_FAILED", "capturing local Supabase status failed");
    }
    const runtime = parseLocalRuntimeStatus(localStatus.stdout, { databaseUrl: explicitDatabaseUrl });
    const seedEnv = { ...baseChildEnv, LOCALENS_DB_URL: runtime.databaseUrl };
    await runCheckedStep("db:seed:runtime-auth", { cwd, env: seedEnv, runStep, logger });

    const playwrightEnv = {
      ...seedEnv,
      NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: runtime.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: runtime.publishableKey,
    };
    await runCheckedStep("test:e2e:runtime-auth:playwright", { cwd, env: playwrightEnv, runStep, logger });
  } catch (error) {
    primaryError = error;
  } finally {
    if (databaseStarted && env.LOCALENS_RUNTIME_STOP_DB === "1") {
      try {
        await runCheckedStep("db:stop", { cwd, env: baseChildEnv, runStep, logger });
      } catch (cleanupError) {
        if (primaryError) primaryError.cleanupError = cleanupError;
        else primaryError = cleanupError;
      }
    }
  }
  if (primaryError) throw primaryError;
  return { ok: true };
}

export async function runRuntimeAuthE2EMain({ run = runRuntimeAuthE2E, errorLogger = console.error } = {}) {
  try {
    await run();
    return 0;
  } catch (error) {
    const code = error?.code ?? "RUNTIME_AUTH_FAILED";
    const message = error?.code ? error.message : `${code}: local runtime Auth E2E failed`;
    errorLogger(message);
    if (error?.cleanupError) errorLogger(`RUNTIME_AUTH_CLEANUP_FAILED: ${error.cleanupError.message}`);
    return error?.status ?? 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runRuntimeAuthE2EMain();
}
