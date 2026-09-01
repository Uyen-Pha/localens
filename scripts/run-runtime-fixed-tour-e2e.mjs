import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createRuntimeAuthPasswords,
  ensureDockerCliOnPath,
  parseLocalRuntimeStatus,
  requirePinnedLocalSupabase,
  startOwnedRuntimeServer,
} from "./run-runtime-auth-e2e.mjs";
import { requireLocalSupabaseCli, runLocalSupabase } from "./supabase-local.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_DATABASE_PORT = "54322";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const FIXED_TOUR_PASSWORD_ENV = "LOCALENS_RUNTIME_FIXED_TOUR_CUSTOMER_PASSWORD";
const RUNTIME_FIXED_TOUR_ERROR = Symbol("RUNTIME_FIXED_TOUR_ERROR");

const BASE_ENV_ALLOWLIST = Object.freeze([
  "PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "COMSPEC",
  "TEMP", "TMP", "USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA", "ProgramFiles",
  "PROGRAMFILES", "ProgramW6432", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "CI",
]);

function runtimeError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error[RUNTIME_FIXED_TOUR_ERROR] = true;
  Object.assign(error, details);
  return error;
}

function stableError(error, code = "RUNTIME_FIXED_TOUR_FAILED", message = "runtime fixed-tour acceptance failed") {
  return error?.[RUNTIME_FIXED_TOUR_ERROR] === true ? error : runtimeError(code, message);
}

export function createRuntimeFixedTourPasswords(env = process.env, random = randomBytes) {
  const auth = createRuntimeAuthPasswords(env, random);
  const supplied = env[FIXED_TOUR_PASSWORD_ENV];
  const customerB = typeof supplied === "string" && supplied.length > 0
    ? supplied
    : random(32).toString("base64url");
  return { ...auth, customerB };
}

export function selectRuntimeFixedTourBaseEnv(env = process.env, _platform = process.platform) {
  const selected = {};
  for (const key of BASE_ENV_ALLOWLIST) {
    if (typeof env[key] === "string" && env[key].length > 0) selected[key] = env[key];
  }
  selected.NEXT_TELEMETRY_DISABLED = "1";
  return selected;
}

function validateExplicitDatabaseUrl(value) {
  if (!value) return;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw runtimeError("RUNTIME_FIXED_TOUR_LOCAL_ONLY", "database URL must be a local loopback endpoint");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !LOOPBACK_HOSTS.has(parsed.hostname) ||
    parsed.port !== LOCAL_DATABASE_PORT ||
    parsed.hash !== "" ||
    parsed.search !== ""
  ) {
    throw runtimeError("RUNTIME_FIXED_TOUR_LOCAL_ONLY", "database URL must use the standard local loopback endpoint");
  }
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
  if (name === "db:test") return script("supabase-local.mjs", "test", "db", "--local");
  if (name === "db:seed:runtime-auth") return script("seed-runtime-auth.mjs");
  if (name === "db:seed:runtime-fixed-tour") return script("seed-runtime-fixed-tour.mjs");
  if (name === "db:stop") return script("supabase-local.mjs", "stop", "--no-backup");
  if (name === "test:e2e:runtime-fixed-tour:playwright") {
    return {
      name,
      command: process.execPath,
      args: [
        path.join(cwd, "node_modules", "@playwright", "test", "cli.js"),
        "test",
        "tests/e2e/runtime-fixed-tour.spec.ts",
        "--config=playwright.runtime-fixed-tour.config.ts",
      ],
      cwd,
      env,
      stdio: "inherit",
    };
  }
  throw runtimeError("RUNTIME_FIXED_TOUR_STEP_UNKNOWN", `unknown step: ${name}`);
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
  logger(`[runtime-fixed-tour] ${name}`);
  let result;
  try {
    result = await runStep(stepSpec(name, cwd, env));
  } catch {
    throw runtimeError("RUNTIME_FIXED_TOUR_STEP_FAILED", `${name} could not be started`, {
      step: name,
      status: 2,
    });
  }
  if (result?.status !== 0) {
    throw runtimeError("RUNTIME_FIXED_TOUR_STEP_FAILED", `${name} exited with status ${result?.status ?? 1}`, {
      step: name,
      status: result?.status ?? 1,
    });
  }
}

export async function runRuntimeFixedTourE2E(options = {}) {
  const cwd = options.cwd ?? PROJECT_ROOT;
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const logger = options.logger ?? console.log;
  const runStep = options.runStep ?? runChildStep;
  const status = options.status ?? ((statusEnv) => runLocalSupabase(["status", "-o", "env"], {
    cwd,
    capture: true,
    env: statusEnv,
  }));
  const prepareDocker = options.prepareDocker ?? ((dockerEnv) => ensureDockerCliOnPath({
    env: dockerEnv,
    platform,
  }));
  const requirePinnedCli = options.requirePinnedCli ?? ((pinOptions) => requirePinnedLocalSupabase(pinOptions));
  const createOutputDirectory = options.createOutputDirectory ?? (() => mkdtempSync(
    path.join(tmpdir(), "localens-runtime-fixed-tour-"),
  ));
  const removeOutputDirectory = options.removeOutputDirectory ?? ((directory) => rmSync(
    directory,
    { recursive: true, force: true },
  ));
  const startServer = options.startServer ?? ((serverEnv) => startOwnedRuntimeServer(serverEnv, { cwd }));

  const explicitDatabaseUrl = env.LOCALENS_DB_URL;
  validateExplicitDatabaseUrl(explicitDatabaseUrl);
  const passwords = createRuntimeFixedTourPasswords(env, options.random ?? randomBytes);
  const controlEnv = selectRuntimeFixedTourBaseEnv(env, platform);
  prepareDocker(controlEnv);
  requirePinnedCli({
    cwd,
    env: controlEnv,
    requireLocalCli: options.requireLocalCli ?? requireLocalSupabaseCli,
    versionProbe: options.versionProbe,
    platform,
  });

  let databaseStarted = false;
  let outputDirectory;
  let runtimeServer;
  let primaryError;
  let cleanupError;

  try {
    await runCheckedStep("db:start", { cwd, env: controlEnv, runStep, logger });
    databaseStarted = true;
    await runCheckedStep("db:reset", { cwd, env: controlEnv, runStep, logger });
    await runCheckedStep("db:test", { cwd, env: controlEnv, runStep, logger });

    let localStatus;
    try {
      localStatus = status(controlEnv);
    } catch {
      throw runtimeError("RUNTIME_FIXED_TOUR_STATUS_FAILED", "capturing local Supabase status failed");
    }
    if (localStatus?.status !== 0) {
      throw runtimeError("RUNTIME_FIXED_TOUR_STATUS_FAILED", "capturing local Supabase status failed");
    }
    const runtime = parseLocalRuntimeStatus(localStatus.stdout, { databaseUrl: explicitDatabaseUrl });

    const authSeedEnv = {
      ...controlEnv,
      LOCALENS_RUNTIME_CUSTOMER_PASSWORD: passwords.customer,
      LOCALENS_RUNTIME_GUIDE_PASSWORD: passwords.guide,
      LOCALENS_RUNTIME_ADMIN_PASSWORD: passwords.admin,
      LOCALENS_DB_URL: runtime.databaseUrl,
    };
    await runCheckedStep("db:seed:runtime-auth", { cwd, env: authSeedEnv, runStep, logger });

    const fixedSeedEnv = {
      ...controlEnv,
      [FIXED_TOUR_PASSWORD_ENV]: passwords.customerB,
      LOCALENS_DB_URL: runtime.databaseUrl,
    };
    await runCheckedStep("db:seed:runtime-fixed-tour", { cwd, env: fixedSeedEnv, runStep, logger });
    await runCheckedStep("db:seed:runtime-fixed-tour", { cwd, env: fixedSeedEnv, runStep, logger });

    outputDirectory = createOutputDirectory();
    const serverEnv = {
      NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: runtime.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: runtime.publishableKey,
      NEXT_TELEMETRY_DISABLED: "1",
    };
    logger("[runtime-fixed-tour] runtime:server:start");
    try {
      runtimeServer = await startServer(serverEnv);
    } catch {
      throw runtimeError("RUNTIME_FIXED_TOUR_SERVER_FAILED", "owned runtime server could not be started");
    }

    const playwrightEnv = {
      ...controlEnv,
      LOCALENS_RUNTIME_CUSTOMER_PASSWORD: passwords.customer,
      LOCALENS_RUNTIME_GUIDE_PASSWORD: passwords.guide,
      LOCALENS_RUNTIME_ADMIN_PASSWORD: passwords.admin,
      [FIXED_TOUR_PASSWORD_ENV]: passwords.customerB,
      LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR: outputDirectory,
      NEXT_PUBLIC_SUPABASE_URL: runtime.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: runtime.publishableKey,
    };
    await runCheckedStep("test:e2e:runtime-fixed-tour:playwright", {
      cwd,
      env: playwrightEnv,
      runStep,
      logger,
    });
  } catch (error) {
    primaryError = stableError(error);
  } finally {
    if (runtimeServer) {
      try {
        await runtimeServer.stop();
      } catch {
        cleanupError = runtimeError(
          "RUNTIME_FIXED_TOUR_SERVER_CLEANUP_FAILED",
          "owned runtime server could not be confirmed stopped",
        );
      }
    }
    if (outputDirectory) {
      try {
        removeOutputDirectory(outputDirectory);
      } catch {
        cleanupError ??= runtimeError(
          "RUNTIME_FIXED_TOUR_OUTPUT_CLEANUP_FAILED",
          "owned Playwright output could not be removed",
        );
      }
    }
    if (databaseStarted && env.LOCALENS_RUNTIME_STOP_DB === "1") {
      try {
        await runCheckedStep("db:stop", { cwd, env: controlEnv, runStep, logger });
      } catch (error) {
        cleanupError ??= stableError(error);
      }
    }
  }

  if (primaryError) {
    if (cleanupError) primaryError.cleanupFailed = true;
    throw primaryError;
  }
  if (cleanupError) throw cleanupError;
}

export async function runRuntimeFixedTourE2EMain({
  run = runRuntimeFixedTourE2E,
  errorLogger = console.error,
} = {}) {
  try {
    await run();
    return 0;
  } catch (error) {
    const stable = stableError(error);
    try {
      errorLogger(stable.message);
    } catch {
      // Logging failure must not change the stable exit contract.
    }
    return stable.status ?? 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runRuntimeFixedTourE2EMain();
}
