import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { startOwnedRuntimeServer } from "./run-runtime-auth-e2e.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_BASE_URL = "http://127.0.0.1:3300";
const DEMO_READY_URL = `${DEMO_BASE_URL}/en/`;
const DEMO_WARMUP_PATHS = Object.freeze([
  "/en/",
  "/vi/",
  "/en/tours/",
  "/en/planner/",
  "/en/sign-in/",
  "/en/account/",
  "/en/custom-request/",
  "/en/admin/",
  "/en/guide/",
  "/en/booking/?departure=demo-departure-markets-and-street-food-2026-09-05&partySize=1",
]);
const DEMO_E2E_ERROR = Symbol("DEMO_E2E_ERROR");
const ENV_ALLOWLIST = Object.freeze([
  "PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "COMSPEC",
  "TEMP", "TMP", "USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA", "ProgramFiles",
  "PROGRAMFILES", "ProgramW6432", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "CI",
  "LOCALENS_RUNTIME_BROWSER",
]);

function demoError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error[DEMO_E2E_ERROR] = true;
  Object.assign(error, details);
  return error;
}

function stableError(error) {
  if (error?.[DEMO_E2E_ERROR] === true) return error;
  const stable = demoError("DEMO_E2E_FAILED", "demo browser acceptance failed");
  if (error?.cleanupFailed || error?.serverCleanupError) stable.cleanupFailed = true;
  return stable;
}

function baseEnvironment(env) {
  const selected = {};
  for (const key of ENV_ALLOWLIST) {
    if (typeof env[key] === "string" && env[key].length > 0) selected[key] = env[key];
  }
  selected.NEXT_TELEMETRY_DISABLED = "1";
  return selected;
}

function runPlaywrightChild(cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(cwd, "node_modules", "@playwright", "test", "cli.js"),
      "test",
    ], {
      cwd,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status: status ?? 1 }));
  });
}

async function warmDemoServer(fetchImpl = fetch) {
  for (const route of DEMO_WARMUP_PATHS) {
    const response = await fetchImpl(`${DEMO_BASE_URL}${route}`, { redirect: "manual" });
    if (!response.ok) throw new Error("owned demo route warmup failed");
  }
}

export async function runDemoE2E(options = {}) {
  const cwd = options.cwd ?? PROJECT_ROOT;
  const env = options.env ?? process.env;
  const logger = options.logger ?? console.log;
  const startServer = options.startServer ?? ((serverEnv) => startOwnedRuntimeServer(serverEnv, {
    cwd,
    mode: "demo",
    port: 3300,
    serverUrl: DEMO_READY_URL,
  }));
  const warmServer = options.warmServer ?? (() => warmDemoServer());
  const runPlaywright = options.runPlaywright ?? ((playwrightEnv) => runPlaywrightChild(cwd, playwrightEnv));
  const controlEnv = baseEnvironment(env);
  const serverEnv = {
    ...controlEnv,
    NEXT_PUBLIC_LOCALLENS_RUNTIME: "demo",
    NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES: "1",
  };
  const playwrightEnv = {
    ...controlEnv,
    PLAYWRIGHT_BASE_URL: DEMO_BASE_URL,
    NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES: "1",
  };
  let server;
  let primaryError;
  let cleanupError;

  try {
    logger("[demo-e2e] server:start");
    server = await startServer(serverEnv);
    logger("[demo-e2e] server:warm");
    await warmServer();
    logger("[demo-e2e] playwright");
    const result = await runPlaywright(playwrightEnv);
    if (result?.status !== 0) {
      throw demoError("DEMO_E2E_PLAYWRIGHT_FAILED", `Playwright exited with status ${result?.status ?? 1}`, {
        status: result?.status ?? 1,
      });
    }
  } catch (error) {
    primaryError = stableError(error);
  } finally {
    if (server) {
      logger("[demo-e2e] server:stop");
      try {
        await server.stop();
      } catch {
        cleanupError = demoError(
          "DEMO_E2E_CLEANUP_FAILED",
          "owned demo server cleanup could not be confirmed",
        );
      }
    }
  }

  if (primaryError) {
    if (cleanupError) primaryError.cleanupFailed = true;
    throw primaryError;
  }
  if (cleanupError) throw cleanupError;
}

export async function runDemoE2EMain({ run = runDemoE2E, errorLogger = console.error } = {}) {
  try {
    await run();
    return 0;
  } catch (error) {
    const stable = stableError(error);
    try {
      errorLogger(stable.message);
      if (stable.cleanupFailed) {
        errorLogger("DEMO_E2E_CLEANUP_FAILED: owned demo server cleanup could not be confirmed");
      }
    } catch {
      // Logging failure must not change the stable exit contract.
    }
    return stable.status ?? 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runDemoE2EMain();
}
