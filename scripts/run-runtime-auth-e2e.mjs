import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { requireLocalSupabaseCli, runLocalSupabase } from "./supabase-local.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_API_PORT = "54321";
const LOCAL_DATABASE_PORT = "54322";
const RUNTIME_SERVER_URL = "http://127.0.0.1:3200/en/sign-in/";
const RUNTIME_SERVER_TIMEOUT_MS = 120_000;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const PASSWORD_ENV = {
  customer: "LOCALENS_RUNTIME_CUSTOMER_PASSWORD",
  guide: "LOCALENS_RUNTIME_GUIDE_PASSWORD",
  admin: "LOCALENS_RUNTIME_ADMIN_PASSWORD",
};

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

export function dockerCliDirectories(env = process.env, platform = process.platform) {
  if (platform !== "win32") return [];
  const windowsPath = path.win32;
  const candidates = [];
  if (env.LOCALAPPDATA) {
    candidates.push(
      windowsPath.join(env.LOCALAPPDATA, "Programs", "DockerDesktop", "resources", "bin"),
      windowsPath.join(env.LOCALAPPDATA, "Programs", "Docker", "Docker", "resources", "bin"),
    );
  }
  for (const root of [env.ProgramFiles, env.ProgramW6432]) {
    if (root) candidates.push(windowsPath.join(root, "Docker", "Docker", "resources", "bin"));
  }
  return [...new Set(candidates.map((candidate) => windowsPath.normalize(candidate)))];
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
  const key = pathKeyFor(env, platform);
  const delimiter = platform === "win32" ? ";" : path.delimiter;
  const originalEntries = String(env[key] ?? "").split(delimiter).filter(Boolean);
  let foundCandidate = false;
  for (const directory of dockerCliDirectories(env, platform)) {
    const executable = (platform === "win32" ? path.win32 : path).join(directory, platform === "win32" ? "docker.exe" : "docker");
    if (!exists(executable)) continue;
    foundCandidate = true;
    const entries = originalEntries.filter((entry) => path.resolve(entry).toLowerCase() !== path.resolve(directory).toLowerCase());
    const candidateEnv = { ...env, [key]: [directory, ...entries].join(delimiter) };
    const candidateProbe = probe("docker", { env: candidateEnv });
    if (candidateProbe?.status === 0) {
      env[key] = candidateEnv[key];
      return;
    }
  }
  throw runtimeError(
    foundCandidate ? "RUNTIME_AUTH_DOCKER_UNAVAILABLE" : "RUNTIME_AUTH_DOCKER_CLI_NOT_FOUND",
    foundCandidate ? "Docker CLI could not be verified after PATH setup" : "a verified Docker Desktop CLI directory is unavailable",
  );
}

function defaultSupabaseVersionProbe(cliPath, { cwd, env, platform }) {
  const command = platform === "win32" ? env.ComSpec ?? process.env.ComSpec ?? "cmd.exe" : cliPath;
  const args = platform === "win32" ? ["/d", "/s", "/c", `""${cliPath}" --version"`] : ["--version"];
  return spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    windowsVerbatimArguments: platform === "win32",
  });
}

export function requirePinnedLocalSupabase({
  cwd = PROJECT_ROOT,
  readPackage = () => JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")),
  requireLocalCli = requireLocalSupabaseCli,
  versionProbe = defaultSupabaseVersionProbe,
  env = process.env,
  platform = process.platform,
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
  const cliPath = requireLocalCli({ cwd, platform });
  let result;
  try {
    result = versionProbe(cliPath, { cwd, env, platform });
  } catch {
    throw runtimeError("RUNTIME_AUTH_SUPABASE_VERSION_MISMATCH", "project-local Supabase CLI version could not be verified");
  }
  if (result?.status !== 0 || !/^2\.115\.0(?:\r?\n)?$/.test(String(result?.stdout ?? ""))) {
    throw runtimeError("RUNTIME_AUTH_SUPABASE_VERSION_MISMATCH", "project-local Supabase CLI must report exactly 2.115.0");
  }
  return cliPath;
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

function signalOwnedRuntimeServer(child, signal, {
  platform = process.platform,
  ownedProcessGroup = false,
  killProcess = process.kill,
} = {}) {
  try {
    if (
      platform !== "win32"
      && ownedProcessGroup
      && Number.isInteger(child.pid)
      && child.pid > 0
    ) {
      return killProcess(-child.pid, signal);
    }
    return child.kill(signal);
  } catch {
    return false;
  }
}

function forceOwnedRuntimeProcessTree(child) {
  if (!Number.isInteger(child.pid) || child.pid <= 0) return false;
  const result = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  if (result.status === 0) return true;
  return signalOwnedRuntimeServer(child, "SIGKILL");
}

function waitForOwnedRuntimeServerClose(child, confirmMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const deadlineTimer = setTimeout(() => {
      child.removeListener("close", finish);
      reject(runtimeError(
        "RUNTIME_AUTH_SERVER_CLEANUP_FAILED",
        "owned runtime server could not be confirmed stopped",
      ));
    }, confirmMs);
    const finish = () => {
      clearTimeout(deadlineTimer);
      resolve();
    };
    child.once("close", finish);
  });
}

async function confirmRuntimeServerEndpointStopped(fetchImpl, serverUrl, confirmMs) {
  if (!serverUrl) return;
  const deadline = Date.now() + confirmMs;
  while (true) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw runtimeError(
        "RUNTIME_AUTH_SERVER_CLEANUP_FAILED",
        "owned runtime server endpoint cleanup timed out",
      );
    }
    const controller = new AbortController();
    let timeoutTimer;
    const endpointProbe = Promise.resolve()
      .then(() => fetchImpl(serverUrl, { redirect: "manual", signal: controller.signal }))
      .then(() => "responding", () => "closed");
    const timeoutProbe = new Promise((resolve) => {
      timeoutTimer = setTimeout(() => {
        controller.abort();
        resolve("timeout");
      }, remainingMs);
    });
    const state = await Promise.race([endpointProbe, timeoutProbe]);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (state === "closed") return;
    if (state === "timeout") {
      throw runtimeError(
        "RUNTIME_AUTH_SERVER_CLEANUP_FAILED",
        "owned runtime server endpoint cleanup timed out",
      );
    }
    if (Date.now() >= deadline) {
      throw runtimeError(
        "RUNTIME_AUTH_SERVER_CLEANUP_FAILED",
        "owned runtime server endpoint remained available after cleanup",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function stopOwnedRuntimeServerPosix(child, {
  graceMs,
  forceConfirmMs,
  ownedProcessGroup,
  killProcess,
  platform,
}) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    let forceTimer;
    let deadlineTimer;
    const cleanup = () => {
      if (forceTimer) clearTimeout(forceTimer);
      if (deadlineTimer) clearTimeout(deadlineTimer);
      child.removeListener("close", finish);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(runtimeError(
        "RUNTIME_AUTH_SERVER_CLEANUP_FAILED",
        "owned runtime server could not be confirmed stopped",
      ));
    };
    const forceStop = () => {
      if (settled) return;
      if (child.exitCode !== null || child.signalCode !== null) {
        finish();
        return;
      }
      if (!signalOwnedRuntimeServer(child, "SIGKILL", {
        platform,
        ownedProcessGroup,
        killProcess,
      })) {
        fail();
        return;
      }
      if (settled) return;
      deadlineTimer = setTimeout(() => {
        if (child.exitCode !== null || child.signalCode !== null) finish();
        else fail();
      }, forceConfirmMs);
    };
    child.once("close", finish);
    if (!signalOwnedRuntimeServer(child, "SIGTERM", {
      platform,
      ownedProcessGroup,
      killProcess,
    })) {
      forceStop();
      return;
    }
    if (settled) return;
    forceTimer = setTimeout(forceStop, graceMs);
  });
}

export async function stopOwnedRuntimeServer(child, {
  graceMs = 5_000,
  forceConfirmMs = 1_000,
  platform = process.platform,
  forceOwnedTree = forceOwnedRuntimeProcessTree,
  fetchImpl = fetch,
  serverUrl,
  ownedProcessGroup = false,
  killProcess = process.kill,
} = {}) {
  if (platform === "win32" && child.exitCode === null && child.signalCode === null) {
    const treeStopAccepted = forceOwnedTree(child);
    if (!treeStopAccepted && !serverUrl) {
      throw runtimeError(
        "RUNTIME_AUTH_SERVER_CLEANUP_FAILED",
        "owned runtime server process tree could not be stopped",
      );
    }
    await waitForOwnedRuntimeServerClose(child, forceConfirmMs);
  } else {
    await stopOwnedRuntimeServerPosix(child, {
      graceMs,
      forceConfirmMs,
      ownedProcessGroup,
      killProcess,
      platform,
    });
  }
  await confirmRuntimeServerEndpointStopped(fetchImpl, serverUrl, forceConfirmMs);
}

async function runtimeServerResponds(fetchImpl, serverUrl = RUNTIME_SERVER_URL, signal) {
  let onAbort;
  try {
    if (signal?.aborted) throw new Error();
    const request = fetchImpl(serverUrl, { redirect: "manual", ...(signal ? { signal } : {}) });
    const cancellation = signal ? new Promise((_, reject) => {
      onAbort = () => reject(new Error());
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    }) : null;
    const response = await (cancellation ? Promise.race([request, cancellation]) : request);
    if (signal?.aborted) throw new Error();
    return response.ok || (response.status >= 300 && response.status < 400);
  } catch {
    if (signal?.aborted) throw runtimeError("RUNTIME_AUTH_SERVER_ABORTED", "owned runtime startup was cancelled");
    return false;
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export async function startOwnedRuntimeServer(serverEnv, {
  cwd,
  spawnChild = spawn,
  fetchImpl = fetch,
  mode = "supabase",
  port = 3200,
  serverUrl = RUNTIME_SERVER_URL,
  platform = process.platform,
  forceOwnedTree = forceOwnedRuntimeProcessTree,
  signal,
} = {}) {
  if (!["demo", "supabase"].includes(mode) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw runtimeError("RUNTIME_AUTH_SERVER_CONFIG_INVALID", "owned runtime server configuration is invalid");
  }
  const parsedServerUrl = new URL(serverUrl);
  if (!LOOPBACK_HOSTS.has(parsedServerUrl.hostname) || parsedServerUrl.port !== String(port)) {
    throw runtimeError("RUNTIME_AUTH_SERVER_CONFIG_INVALID", "owned runtime server must use its loopback port");
  }
  if (await runtimeServerResponds(fetchImpl, serverUrl, signal)) {
    throw runtimeError("RUNTIME_AUTH_SERVER_PORT_IN_USE", "runtime server endpoint is already occupied");
  }
  if (signal?.aborted) throw runtimeError("RUNTIME_AUTH_SERVER_ABORTED", "owned runtime startup was cancelled");
  const child = spawnChild(process.execPath, [
    path.join(cwd, "node_modules", "next", "dist", "bin", "next"),
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ], {
    cwd,
    env: {
      ...serverEnv,
      LOCALLENS_NEXT_DIST_DIR: `.next/e2e-${mode}-${port}`,
      NEXT_PUBLIC_LOCALLENS_RUNTIME: mode,
    },
    stdio: "inherit",
    windowsHide: true,
    detached: platform !== "win32",
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    let onClose;
    let onError;
    const onAbort = () => fail(runtimeError("RUNTIME_AUTH_SERVER_ABORTED", "owned runtime startup was cancelled"));
    const deadline = Date.now() + RUNTIME_SERVER_TIMEOUT_MS;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child.removeListener("close", onClose);
      child.removeListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      const rejectStartup = (cleanupError) => {
        if (cleanupError) error.serverCleanupError = cleanupError;
        reject(error);
      };
      void stopOwnedRuntimeServer(child, {
        fetchImpl,
        serverUrl,
        platform,
        forceOwnedTree,
        ownedProcessGroup: platform !== "win32",
      }).then(
        () => rejectStartup(),
        (cleanupError) => rejectStartup(cleanupError),
      );
    };
    onClose = (status) => fail(runtimeError(
      "RUNTIME_AUTH_SERVER_FAILED",
      `owned runtime server exited before readiness with status ${status ?? 1}`,
    ));
    onError = () => fail(runtimeError("RUNTIME_AUTH_SERVER_FAILED", "owned runtime server could not be started"));
    child.once("error", onError);
    child.once("close", onClose);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }

    const poll = async () => {
      if (settled) return;
      try {
        const responds = await runtimeServerResponds(fetchImpl, serverUrl, signal);
        if (settled) return;
        if (responds) {
          settled = true;
          child.removeListener("close", onClose);
          child.removeListener("error", onError);
          signal?.removeEventListener("abort", onAbort);
          resolve({ stop: () => stopOwnedRuntimeServer(child, {
            fetchImpl,
            serverUrl,
            platform,
            forceOwnedTree,
            ownedProcessGroup: platform !== "win32",
          }) });
          return;
        }
      } catch {
        // The owned server is still starting; retry until the bounded deadline.
      }
      if (settled) return;
      if (Date.now() >= deadline) {
        fail(runtimeError("RUNTIME_AUTH_SERVER_TIMEOUT", "owned runtime server did not become ready"));
        return;
      }
      timer = setTimeout(poll, 250);
    };
    void poll();
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
  const createOutputDirectory = options.createOutputDirectory ?? (() => mkdtempSync(path.join(tmpdir(), "localens-runtime-auth-")));
  const removeOutputDirectory = options.removeOutputDirectory ?? ((directory) => rmSync(directory, { recursive: true, force: true }));
  const startServer = options.startServer ?? ((serverEnv) => startOwnedRuntimeServer(serverEnv, { cwd }));
  const explicitDatabaseUrl = env.LOCALENS_DB_URL;
  if (explicitDatabaseUrl) {
    requireLoopbackEndpoint(explicitDatabaseUrl, {
      protocols: ["postgres:", "postgresql:"],
      port: LOCAL_DATABASE_PORT,
      label: "database URL",
      allowCredentials: true,
    });
  }
  const passwords = createRuntimeAuthPasswords(env, options.random ?? randomBytes);
  const controlEnv = { ...env };
  for (const name of Object.keys(controlEnv)) {
    if (/^LOCALENS_RUNTIME_.*_PASSWORD$/.test(name)) delete controlEnv[name];
  }
  delete controlEnv.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES;
  controlEnv.NEXT_TELEMETRY_DISABLED = "1";
  prepareDocker(controlEnv);
  requirePinnedLocalSupabase({
    cwd,
    env: controlEnv,
    requireLocalCli,
    versionProbe: options.versionProbe,
    platform: options.platform ?? process.platform,
  });

  let databaseStarted = false;
  let primaryError;
  let outputDirectory;
  let runtimeServer;
  try {
    try {
      await runCheckedStep("db:start", { cwd, env: controlEnv, runStep, logger });
    } catch {
      logger("[runtime-auth] db:start:retry");
      await runCheckedStep("db:start", { cwd, env: controlEnv, runStep, logger });
    }
    databaseStarted = true;
    await runCheckedStep("db:reset", { cwd, env: controlEnv, runStep, logger });

    let localStatus;
    try {
      localStatus = status(controlEnv);
    } catch {
      throw runtimeError("RUNTIME_AUTH_STATUS_FAILED", "capturing local Supabase status failed");
    }
    if (localStatus?.status !== 0) {
      throw runtimeError("RUNTIME_AUTH_STATUS_FAILED", "capturing local Supabase status failed");
    }
    const runtime = parseLocalRuntimeStatus(localStatus.stdout, { databaseUrl: explicitDatabaseUrl });
    const passwordEnv = Object.fromEntries(
      Object.entries(PASSWORD_ENV).map(([role, name]) => [name, passwords[role]]),
    );
    const seedEnv = { ...controlEnv, ...passwordEnv, LOCALENS_DB_URL: runtime.databaseUrl };
    await runCheckedStep("db:seed:runtime-auth", { cwd, env: seedEnv, runStep, logger });

    outputDirectory = createOutputDirectory();
    const serverEnv = {
      NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: runtime.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: runtime.publishableKey,
      NEXT_TELEMETRY_DISABLED: "1",
    };
    logger("[runtime-auth] runtime:server:start");
    try {
      runtimeServer = await startServer(serverEnv);
    } catch (error) {
      const startupError = runtimeError("RUNTIME_AUTH_SERVER_FAILED", "owned runtime server could not be started");
      if (error?.serverCleanupError) {
        startupError.serverCleanupError = runtimeError(
          "RUNTIME_AUTH_SERVER_CLEANUP_FAILED",
          "owned runtime server cleanup could not be confirmed",
        );
      }
      throw startupError;
    }
    const playwrightEnv = {
      ...controlEnv,
      ...passwordEnv,
      LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR: outputDirectory,
      NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: runtime.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: runtime.publishableKey,
    };
    await runCheckedStep("test:e2e:runtime-auth:playwright", { cwd, env: playwrightEnv, runStep, logger });
  } catch (error) {
    primaryError = error;
  } finally {
    if (runtimeServer) {
      try {
        await runtimeServer.stop();
      } catch {
        const cleanupError = runtimeError("RUNTIME_AUTH_SERVER_CLEANUP_FAILED", "owned runtime server cleanup failed");
        if (primaryError) primaryError.serverCleanupError = cleanupError;
        else primaryError = cleanupError;
      }
    }
    if (outputDirectory) {
      try {
        removeOutputDirectory(outputDirectory);
      } catch {
        const cleanupError = runtimeError("RUNTIME_AUTH_ARTIFACT_CLEANUP_FAILED", "owned Playwright output cleanup failed");
        if (primaryError) primaryError.artifactCleanupError = cleanupError;
        else primaryError = cleanupError;
      }
    }
    if (databaseStarted && env.LOCALENS_RUNTIME_STOP_DB === "1") {
      try {
        await runCheckedStep("db:stop", { cwd, env: controlEnv, runStep, logger });
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
    if (error?.serverCleanupError) errorLogger(`RUNTIME_AUTH_SERVER_CLEANUP_FAILED: ${error.serverCleanupError.message}`);
    if (error?.artifactCleanupError) errorLogger(`RUNTIME_AUTH_ARTIFACT_CLEANUP_FAILED: ${error.artifactCleanupError.message}`);
    return error?.status ?? 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runRuntimeAuthE2EMain();
}
