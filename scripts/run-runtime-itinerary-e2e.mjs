import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import { prepareRedactedArtifacts } from "./redact-ci-artifacts.mjs";
import {
  createRuntimeAuthPasswords,
  ensureDockerCliOnPath,
  requirePinnedLocalSupabase,
  startOwnedRuntimeServer,
  stopOwnedRuntimeServer,
} from "./run-runtime-auth-e2e.mjs";
import { seedRuntimeAuth } from "./seed-runtime-auth.mjs";
import { seedRuntimeFixedTour } from "./seed-runtime-fixed-tour.mjs";
import { requireLocalSupabaseCli, runLocalSupabase } from "./supabase-local.mjs";

const { Client } = pg;

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const CONTAINER_PROVIDER_HOSTS = new Set([
  "host.docker.internal",
  "host.containers.internal",
]);
const STANDARD_SUPABASE_PORTS = new Set([54321, 54322]);
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_ENDPOINT_ENV = "LOCALLENS_GEMINI_TEST_ENDPOINT_BASE";
const OTHER_CUSTOMER_PASSWORD_ENV = "LOCALENS_RUNTIME_ITINERARY_OTHER_CUSTOMER_PASSWORD";
const FIXED_TOUR_PASSWORD_ENV = "LOCALENS_RUNTIME_FIXED_TOUR_CUSTOMER_PASSWORD";
const MAX_CAPTURE_BYTES = 256 * 1024;
const MAX_PROVIDER_BODY_BYTES = 128 * 1024;
const PROCESS_START_TIMEOUT_MS = 120_000;
const RUNTIME_ITINERARY_ERROR = Symbol("RUNTIME_ITINERARY_ERROR");

const BASE_ENV_ALLOWLIST = Object.freeze([
  "PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "COMSPEC",
  "TEMP", "TMP", "USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA", "ProgramFiles",
  "PROGRAMFILES", "ProgramW6432", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "CI",
  "DOCKER_CONTEXT", "DOCKER_HOST", "CONTAINER_HOST", "XDG_RUNTIME_DIR",
  "LOCALENS_RUNTIME_CONTAINER_HOST", "LOCALENS_RUNTIME_BROWSER",
]);

const ISOLATED_SERVICE_EXCLUSIONS = [
  "realtime",
  "storage-api",
  "imgproxy",
  "mailpit",
  "postgres-meta",
  "studio",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
].join(",");

const PORT_NAMES = Object.freeze([
  "api",
  "database",
  "shadow",
  "pooler",
  "studio",
  "mailpitHttp",
  "mailpitSmtp",
  "mailpitPop3",
  "analytics",
  "inspector",
  "next",
]);

function runtimeError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error[RUNTIME_ITINERARY_ERROR] = true;
  Object.assign(error, details);
  return error;
}

function stableError(
  error,
  code = "RUNTIME_ITINERARY_FAILED",
  message = "isolated local itinerary runtime acceptance failed",
) {
  if (error?.[RUNTIME_ITINERARY_ERROR] === true) return error;
  const stable = runtimeError(code, message);
  if (error?.cleanupFailed) stable.cleanupFailed = true;
  return stable;
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const status = Number.isInteger(signal.reason?.status) ? signal.reason.status : 2;
  throw runtimeError(
    "RUNTIME_ITINERARY_ABORTED",
    "isolated local itinerary runtime acceptance was interrupted",
    { status },
  );
}

function secret(length = 32, random = randomBytes) {
  return random(length).toString("base64url");
}

function isLocalContainerSocket(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (/^(?:npipe|unix):\/\//i.test(value)) return true;
  try {
    const parsed = new URL(value);
    return ["http:", "https:", "tcp:"].includes(parsed.protocol)
      && LOOPBACK_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function selectRuntimeItineraryBaseEnv(env = process.env) {
  const selected = {};
  for (const key of BASE_ENV_ALLOWLIST) {
    if (typeof env[key] === "string" && env[key].length > 0) selected[key] = env[key];
  }
  for (const key of ["DOCKER_HOST", "CONTAINER_HOST"]) {
    if (selected[key] !== undefined && !isLocalContainerSocket(selected[key])) {
      throw runtimeError(
        "RUNTIME_ITINERARY_CONTAINER_REMOTE",
        "the isolated runtime requires a local container socket",
      );
    }
  }
  selected.NEXT_TELEMETRY_DISABLED = "1";
  return selected;
}

export function createRuntimeItinerarySecrets(env = process.env, random = randomBytes) {
  const auth = createRuntimeAuthPasswords(env, random);
  const suppliedOther = env[OTHER_CUSTOMER_PASSWORD_ENV] ?? env[FIXED_TOUR_PASSWORD_ENV];
  const otherCustomer = typeof suppliedOther === "string" && suppliedOther.length > 0
    ? suppliedOther
    : secret(32, random);
  return {
    ...auth,
    otherCustomer,
    geminiApiKey: secret(32, random),
    geminiControlToken: secret(32, random),
    quotaHmacKey: secret(48, random),
  };
}

function closeTcpServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

export async function reserveRuntimeItineraryPorts() {
  const servers = [];
  try {
    for (let index = 0; index < PORT_NAMES.length; index += 1) {
      const server = createTcpServer();
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      servers.push(server);
    }
    const values = servers.map((server) => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw runtimeError("RUNTIME_ITINERARY_PORT_RESERVATION_FAILED", "a local port was unavailable");
      }
      return address.port;
    });
    const ports = Object.fromEntries(PORT_NAMES.map((name, index) => [name, values[index]]));
    if (STANDARD_SUPABASE_PORTS.has(ports.api) || STANDARD_SUPABASE_PORTS.has(ports.database)) {
      throw runtimeError(
        "RUNTIME_ITINERARY_PORT_ISOLATION_FAILED",
        "isolated Supabase ports must not overlap the demo stack",
      );
    }
    let released = false;
    return {
      ports,
      async release() {
        if (released) return;
        released = true;
        await Promise.all(servers.map(closeTcpServer));
      },
    };
  } catch (error) {
    await Promise.allSettled(servers.map(closeTcpServer));
    throw stableError(error, "RUNTIME_ITINERARY_PORT_RESERVATION_FAILED", "local ports could not be reserved");
  }
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setRootTomlValue(source, key, encodedValue) {
  const lines = source.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const sectionIndex = lines.findIndex((line) => /^\s*\[/.test(line));
  const boundary = sectionIndex === -1 ? lines.length : sectionIndex;
  const pattern = new RegExp(`^\\s*${escapePattern(key)}\\s*=`);
  const existingIndex = lines.slice(0, boundary).findIndex((line) => pattern.test(line));
  if (existingIndex >= 0) lines[existingIndex] = `${key} = ${encodedValue}`;
  else lines.splice(boundary, 0, `${key} = ${encodedValue}`, "");
  return `${lines.join("\n")}\n`;
}

function setSectionTomlValue(source, section, key, encodedValue) {
  const lines = source.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const header = `[${section}]`;
  let sectionIndex = lines.findIndex((line) => line.trim() === header);
  if (sectionIndex < 0) {
    if (lines.at(-1) !== "") lines.push("");
    lines.push(header, `${key} = ${encodedValue}`);
    return `${lines.join("\n")}\n`;
  }
  let sectionEnd = lines.length;
  for (let index = sectionIndex + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index])) {
      sectionEnd = index;
      break;
    }
  }
  const pattern = new RegExp(`^\\s*${escapePattern(key)}\\s*=`);
  const relativeIndex = lines
    .slice(sectionIndex + 1, sectionEnd)
    .findIndex((line) => pattern.test(line));
  if (relativeIndex >= 0) {
    lines[sectionIndex + 1 + relativeIndex] = `${key} = ${encodedValue}`;
  } else {
    lines.splice(sectionIndex + 1, 0, `${key} = ${encodedValue}`);
  }
  return `${lines.join("\n")}\n`;
}

export function buildIsolatedSupabaseConfig(source, { projectId, ports }) {
  if (!/^[a-z0-9][a-z0-9-]{7,47}$/.test(projectId)) {
    throw runtimeError("RUNTIME_ITINERARY_PROJECT_ID_INVALID", "the isolated project id is invalid");
  }
  for (const name of PORT_NAMES) {
    const port = ports?.[name];
    if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
      throw runtimeError("RUNTIME_ITINERARY_PORT_INVALID", "the isolated project port map is invalid");
    }
  }
  if (new Set(PORT_NAMES.map((name) => ports[name])).size !== PORT_NAMES.length) {
    throw runtimeError("RUNTIME_ITINERARY_PORT_INVALID", "isolated project ports must be unique");
  }
  if (STANDARD_SUPABASE_PORTS.has(ports.api) || STANDARD_SUPABASE_PORTS.has(ports.database)) {
    throw runtimeError(
      "RUNTIME_ITINERARY_PORT_ISOLATION_FAILED",
      "isolated Supabase ports must not overlap the demo stack",
    );
  }

  const nextOrigin = `http://127.0.0.1:${ports.next}`;
  let config = setRootTomlValue(source, "project_id", JSON.stringify(projectId));
  const updates = [
    ["api", "enabled", "true"],
    ["api", "port", String(ports.api)],
    ["db", "port", String(ports.database)],
    ["db", "shadow_port", String(ports.shadow)],
    ["db.pooler", "enabled", "false"],
    ["db.pooler", "port", String(ports.pooler)],
    ["studio", "enabled", "false"],
    ["studio", "port", String(ports.studio)],
    ["local_smtp", "enabled", "false"],
    ["local_smtp", "port", String(ports.mailpitHttp)],
    ["local_smtp", "smtp_port", String(ports.mailpitSmtp)],
    ["local_smtp", "pop3_port", String(ports.mailpitPop3)],
    ["analytics", "enabled", "false"],
    ["analytics", "port", String(ports.analytics)],
    ["edge_runtime", "enabled", "true"],
    ["edge_runtime", "inspector_port", String(ports.inspector)],
    ["realtime", "enabled", "false"],
    ["storage", "enabled", "false"],
    ["auth", "site_url", JSON.stringify(nextOrigin)],
    ["auth", "additional_redirect_urls", JSON.stringify([`${nextOrigin}/**`])],
  ];
  for (const [section, key, value] of updates) {
    config = setSectionTomlValue(config, section, key, value);
  }
  return config;
}

function assertSourceDirectory(directory, label) {
  if (!existsSync(directory)) {
    throw runtimeError("RUNTIME_ITINERARY_SOURCE_MISSING", `${label} is unavailable`);
  }
}

function requireOwnedTemporaryPath(target, prefix) {
  const resolved = path.resolve(target);
  const temporaryRoot = path.resolve(tmpdir());
  if (
    path.dirname(resolved) !== temporaryRoot
    || !path.basename(resolved).startsWith(prefix)
  ) {
    throw runtimeError(
      "RUNTIME_ITINERARY_CLEANUP_SCOPE_INVALID",
      "owned temporary cleanup target is outside the runner scope",
    );
  }
  return resolved;
}

export function prepareIsolatedSupabaseProject({
  cwd = PROJECT_ROOT,
  projectRoot,
  projectId,
  ports,
  createProjectRoot = () => mkdtempSync(path.join(tmpdir(), "localens-runtime-itinerary-")),
  removeProjectRoot = (target) => rmSync(
    requireOwnedTemporaryPath(target, "localens-runtime-itinerary-"),
    { recursive: true, force: true },
  ),
} = {}) {
  const ownsRoot = projectRoot === undefined;
  const root = projectRoot ?? createProjectRoot();
  try {
    const sourceConfig = path.join(cwd, "supabase", "config.toml");
    const sourceMigrations = path.join(cwd, "supabase", "migrations");
    const sourceFunctions = path.join(cwd, "supabase", "functions");
    const sourceTests = path.join(cwd, "supabase", "tests");
    const sourceLib = path.join(cwd, "lib");
    for (const [directory, label] of [
      [sourceConfig, "Supabase config"],
      [sourceMigrations, "Supabase migrations"],
      [sourceFunctions, "Supabase functions"],
      [sourceTests, "Supabase tests"],
      [sourceLib, "runtime library"],
    ]) {
      assertSourceDirectory(directory, label);
    }

    const targetSupabase = path.join(root, "supabase");
    mkdirSync(targetSupabase, { recursive: true });
    cpSync(sourceMigrations, path.join(targetSupabase, "migrations"), { recursive: true });
    cpSync(sourceTests, path.join(targetSupabase, "tests"), { recursive: true });
    cpSync(path.join(sourceFunctions, "_shared"), path.join(targetSupabase, "functions", "_shared"), {
      recursive: true,
    });
    for (const name of ["recommend-itinerary", "refine-itinerary"]) {
      cpSync(path.join(sourceFunctions, name), path.join(targetSupabase, "functions", name), {
        recursive: true,
      });
    }
    cpSync(sourceLib, path.join(root, "lib"), { recursive: true });
    const config = buildIsolatedSupabaseConfig(readFileSync(sourceConfig, "utf8"), {
      projectId,
      ports,
    });
    writeFileSync(path.join(targetSupabase, "config.toml"), config, "utf8");
    return { root, projectId, ports };
  } catch (error) {
    if (ownsRoot) {
      try {
        removeProjectRoot(root);
      } catch {
        const stable = stableError(error);
        stable.cleanupFailed = true;
        throw stable;
      }
    }
    throw error;
  }
}

function parseStatusFields(output) {
  const fields = {};
  for (const line of String(output).split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(?:"([^"]*)"|'([^']*)'|(.*))$/);
    if (!match) continue;
    if (![
      "API_URL",
      "DB_URL",
      "PUBLISHABLE_KEY",
      "ANON_KEY",
      "SERVICE_ROLE_KEY",
    ].includes(match[1])) continue;
    fields[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return fields;
}

function requireExpectedLoopbackEndpoint(value, { protocols, port, label, allowCredentials }) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw runtimeError("RUNTIME_ITINERARY_LOCAL_ONLY", `${label} must be an isolated loopback endpoint`);
  }
  if (
    !protocols.includes(parsed.protocol)
    || !LOOPBACK_HOSTS.has(parsed.hostname)
    || parsed.port !== String(port)
    || parsed.hash !== ""
    || parsed.search !== ""
    || (!allowCredentials && (parsed.username !== "" || parsed.password !== ""))
  ) {
    throw runtimeError(
      "RUNTIME_ITINERARY_LOCAL_ONLY",
      `${label} does not match the isolated project port map`,
    );
  }
  return parsed;
}

export function parseIsolatedRuntimeStatus(output, ports) {
  const fields = parseStatusFields(output);
  const api = requireExpectedLoopbackEndpoint(fields.API_URL, {
    protocols: ["http:", "https:"],
    port: ports.api,
    label: "Supabase API URL",
    allowCredentials: false,
  });
  const database = requireExpectedLoopbackEndpoint(fields.DB_URL, {
    protocols: ["postgres:", "postgresql:"],
    port: ports.database,
    label: "database URL",
    allowCredentials: true,
  });
  const publishableKey = fields.PUBLISHABLE_KEY || fields.ANON_KEY;
  const anonKey = fields.ANON_KEY || fields.PUBLISHABLE_KEY;
  const serviceRoleKey = fields.SERVICE_ROLE_KEY;
  if (![publishableKey, anonKey, serviceRoleKey].every((value) => (
    typeof value === "string" && value.length > 0 && value.length <= 4096
  ))) {
    throw runtimeError("RUNTIME_ITINERARY_STATUS_INVALID", "isolated Supabase keys are unavailable");
  }
  return {
    apiUrl: api.origin,
    databaseUrl: database.toString(),
    publishableKey,
    anonKey,
    serviceRoleKey,
  };
}

function safeEqual(actual, expected) {
  const left = Buffer.from(String(actual));
  const right = Buffer.from(String(expected));
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readBoundedBody(request, maximumBytes = MAX_PROVIDER_BODY_BYTES) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maximumBytes) throw new Error("request too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

function providerInput(requestBody) {
  const body = JSON.parse(requestBody);
  const text = body?.contents?.[0]?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("missing provider input");
  const marker = "\nINPUT_JSON:";
  const markerIndex = text.lastIndexOf(marker);
  if (markerIndex < 0) throw new Error("missing provider marker");
  const input = JSON.parse(text.slice(markerIndex + marker.length));
  if (!Array.isArray(input?.candidates) || input.candidates.length === 0) {
    throw new Error("missing candidates");
  }
  const orderedIds = input.candidates.map((candidate) => candidate?.id);
  if (orderedIds.some((id) => typeof id !== "string" || id.length === 0)) {
    throw new Error("invalid candidate id");
  }
  return { input, orderedIds };
}

function geminiEnvelope(rankResponse) {
  return {
    candidates: [{
      content: {
        role: "model",
        parts: [{ text: JSON.stringify(rankResponse) }],
      },
      finishReason: "STOP",
      index: 0,
    }],
  };
}

export async function startFakeGeminiProvider({
  apiKey,
  controlToken,
  containerHost,
  logger = () => {},
} = {}) {
  if (!CONTAINER_PROVIDER_HOSTS.has(containerHost)) {
    throw runtimeError("RUNTIME_ITINERARY_PROVIDER_HOST_INVALID", "fake provider host is invalid");
  }
  if (typeof apiKey !== "string" || apiKey.length < 32) {
    throw runtimeError("RUNTIME_ITINERARY_PROVIDER_SECRET_INVALID", "fake provider secrets are invalid");
  }
  if (typeof controlToken !== "string" || controlToken.length < 32) {
    throw runtimeError("RUNTIME_ITINERARY_PROVIDER_SECRET_INVALID", "fake provider secrets are invalid");
  }

  const state = { scenario: "valid", requests: 0 };
  const server = createHttpServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && requestUrl.pathname === "/health") {
        sendJson(response, 200, { ok: true });
        return;
      }
      if (requestUrl.pathname === "/control") {
        if (
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress ?? "")
          || !safeEqual(request.headers["x-localens-control-token"], controlToken)
        ) {
          sendJson(response, 401, { ok: false });
          return;
        }
        if (request.method === "GET") {
          sendJson(response, 200, state);
          return;
        }
        if (request.method !== "POST") {
          sendJson(response, 405, { ok: false });
          return;
        }
        const control = JSON.parse(await readBoundedBody(request, 1024));
        if (!["valid", "malformed"].includes(control?.scenario) || control?.reset !== true) {
          sendJson(response, 400, { ok: false });
          return;
        }
        state.scenario = control.scenario;
        state.requests = 0;
        sendJson(response, 200, state);
        return;
      }

      const providerPath = `/v1beta/models/${GEMINI_MODEL}:generateContent`;
      if (request.method !== "POST" || requestUrl.pathname !== providerPath) {
        sendJson(response, 404, { error: "not_found" });
        return;
      }
      if (!safeEqual(request.headers["x-goog-api-key"], apiKey)) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }
      state.requests += 1;
      if (state.scenario === "malformed") {
        sendJson(response, 200, {
          candidates: [{ content: { role: "model", parts: [{ text: "{" }] } }],
        });
        return;
      }

      const { orderedIds } = providerInput(await readBoundedBody(request));
      const rankResponse = {
        orderedIds,
        rationales: Object.fromEntries(orderedIds.map((id) => [
          id,
          "Selected by the isolated LocalLens fake Gemini provider.",
        ])),
        foodSelections: [],
      };
      sendJson(response, 200, geminiEnvelope(rankResponse));
    } catch {
      sendJson(response, 400, { error: "invalid_request" });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "0.0.0.0", resolve);
  }).catch(() => {
    throw runtimeError("RUNTIME_ITINERARY_PROVIDER_START_FAILED", "fake Gemini provider could not start");
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw runtimeError("RUNTIME_ITINERARY_PROVIDER_START_FAILED", "fake Gemini provider port is unavailable");
  }
  const port = address.port;
  logger("[runtime-itinerary] gemini:fake-provider:ready");
  let stopped = false;
  return {
    endpointBase: `http://${containerHost}:${port}/v1beta`,
    controlUrl: `http://127.0.0.1:${port}/control`,
    async stop() {
      if (stopped) return;
      stopped = true;
      server.closeAllConnections?.();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("provider close timeout")), 2_000);
        server.close((error) => {
          clearTimeout(timer);
          if (error) reject(error);
          else resolve();
        });
      }).catch(() => {
        throw runtimeError(
          "RUNTIME_ITINERARY_PROVIDER_CLEANUP_FAILED",
          "fake Gemini provider could not be confirmed stopped",
        );
      });
    },
  };
}

export function selectFakeProviderContainerHost({
  env = process.env,
  probe = spawnSync,
} = {}) {
  const explicit = env.LOCALENS_RUNTIME_CONTAINER_HOST;
  if (explicit !== undefined) {
    if (!CONTAINER_PROVIDER_HOSTS.has(explicit)) {
      throw runtimeError(
        "RUNTIME_ITINERARY_PROVIDER_HOST_INVALID",
        "container host override must use a supported local gateway",
      );
    }
    return explicit;
  }
  if (/podman/i.test(`${env.DOCKER_HOST ?? ""} ${env.CONTAINER_HOST ?? ""}`)) {
    return "host.containers.internal";
  }
  let result;
  try {
    result = probe("docker", ["info", "--format", "{{.Name}} {{.OperatingSystem}}"], {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch {
    result = undefined;
  }
  return /podman/i.test(`${result?.stdout ?? ""} ${result?.stderr ?? ""}`)
    ? "host.containers.internal"
    : "host.docker.internal";
}

function collectBounded(stream) {
  let value = "";
  stream?.on("data", (chunk) => {
    if (value.length >= MAX_CAPTURE_BYTES) return;
    value += String(chunk).slice(0, MAX_CAPTURE_BYTES - value.length);
  });
  return () => value;
}

function runChildStep(spec) {
  return new Promise((resolve, reject) => {
    const capture = spec.stdio === "pipe";
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
      detached: spec.platform !== "win32",
    });
    const stdout = capture ? collectBounded(child.stdout) : () => "";
    const stderr = capture ? collectBounded(child.stderr) : () => "";
    let settled = false;
    const cleanupListeners = () => {
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      spec.signal?.removeEventListener("abort", onAbort);
    };
    const onError = (error) => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      reject(error);
    };
    const onClose = (status) => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      resolve({
        status: status ?? 1,
        stdout: stdout(),
        stderr: stderr(),
      });
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      spec.signal?.removeEventListener("abort", onAbort);
      const error = runtimeError(
        "RUNTIME_ITINERARY_ABORTED",
        "owned runtime step was interrupted",
        { status: Number.isInteger(spec.signal?.reason?.status) ? spec.signal.reason.status : 2 },
      );
      void stopOwnedRuntimeServer(child, {
        platform: spec.platform,
        ownedProcessGroup: spec.platform !== "win32",
      }).then(
        () => {
          cleanupListeners();
          reject(error);
        },
        () => {
          error.cleanupFailed = true;
          cleanupListeners();
          reject(error);
        },
      );
    };
    child.once("error", onError);
    child.once("close", onClose);
    spec.signal?.addEventListener("abort", onAbort, { once: true });
    if (spec.signal?.aborted) onAbort();
  });
}

function stepSpec(name, { cwd, workdir, env, outputDirectory, baseUrl, platform, signal }) {
  const supabase = (...args) => ({
    name,
    command: process.execPath,
    args: [path.join(cwd, "scripts", "supabase-local.mjs"), "--workdir", workdir, ...args],
    cwd,
    env,
    stdio: "pipe",
    platform,
    signal,
  });
  if (name === "db:start") {
    return supabase("start", "--exclude", ISOLATED_SERVICE_EXCLUSIONS);
  }
  if (name === "db:reset") return supabase("db", "reset", "--local");
  if (name === "db:test") return supabase("test", "db", "--local");
  if (name === "db:stop") return supabase("stop", "--no-backup");
  if (name === "test:e2e:runtime-itinerary:playwright") {
    return {
      name,
      command: process.execPath,
      args: [
        path.join(cwd, "node_modules", "@playwright", "test", "cli.js"),
        "test",
        "tests/e2e/runtime-itinerary.spec.ts",
        "--config=playwright.runtime-itinerary.config.ts",
        "--workers=1",
        "--retries=0",
        "--reporter=line",
        `--output=${outputDirectory}`,
      ],
      cwd,
      env: { ...env, PLAYWRIGHT_BASE_URL: baseUrl },
      stdio: "inherit",
      platform,
      signal,
    };
  }
  throw runtimeError("RUNTIME_ITINERARY_STEP_UNKNOWN", `unknown isolated runtime step: ${name}`);
}

async function runCheckedStep(name, context) {
  throwIfAborted(context.signal);
  context.logger(`[runtime-itinerary] ${name}`);
  let result;
  try {
    result = await context.runStep(stepSpec(name, context));
  } catch {
    throwIfAborted(context.signal);
    throw runtimeError("RUNTIME_ITINERARY_STEP_FAILED", `${name} could not be started`, {
      step: name,
      status: 2,
    });
  }
  throwIfAborted(context.signal);
  if (result?.status !== 0) {
    throw runtimeError("RUNTIME_ITINERARY_STEP_FAILED", `${name} exited with a nonzero status`, {
      step: name,
      status: result?.status ?? 1,
    });
  }
  return result;
}

function localSupabaseProcessSpec({ cwd, workdir, env, cliPath, platform }) {
  if (platform === "win32") {
    const entrypoint = path.join(cwd, "node_modules", "supabase", "dist", "supabase.js");
    if (!existsSync(entrypoint)) {
      throw runtimeError("RUNTIME_ITINERARY_SUPABASE_CLI_INVALID", "local Supabase entrypoint is unavailable");
    }
    return {
      command: process.execPath,
      args: [entrypoint, "--workdir", workdir],
      cwd,
      env,
    };
  }
  return {
    command: cliPath,
    args: ["--workdir", workdir],
    cwd,
    env,
  };
}

async function functionRouteReady(fetchImpl, apiUrl, name) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_000);
  try {
    const response = await fetchImpl(`${apiUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: controller.signal,
    });
    return response.status === 401;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function startOwnedItineraryFunctions({
  cwd,
  workdir,
  env,
  envFile,
  apiUrl,
  cliPath,
  platform = process.platform,
  spawnChild = spawn,
  fetchImpl = fetch,
  stopChild = stopOwnedRuntimeServer,
  timeoutMs = PROCESS_START_TIMEOUT_MS,
  signal,
} = {}) {
  const executable = localSupabaseProcessSpec({ cwd, workdir, env, cliPath, platform });
  const child = spawnChild(executable.command, [
    ...executable.args,
    "functions",
    "serve",
    "recommend-itinerary",
    "refine-itinerary",
    "--env-file",
    envFile,
  ], {
    cwd: executable.cwd,
    env: executable.env,
    stdio: "inherit",
    windowsHide: true,
    detached: platform !== "win32",
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const cleanupListeners = () => {
      if (timer) clearTimeout(timer);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      void stopChild(child, {
        platform,
        ownedProcessGroup: platform !== "win32",
      }).then(
        () => reject(error),
        () => {
          error.cleanupFailed = true;
          reject(error);
        },
      );
    };
    const onError = () => fail(runtimeError(
      "RUNTIME_ITINERARY_FUNCTIONS_START_FAILED",
      "owned Edge Functions process could not start",
    ));
    const onClose = () => fail(runtimeError(
      "RUNTIME_ITINERARY_FUNCTIONS_START_FAILED",
      "owned Edge Functions process exited before readiness",
    ));
    const onAbort = () => fail(runtimeError(
      "RUNTIME_ITINERARY_ABORTED",
      "owned Edge Functions startup was interrupted",
      { status: Number.isInteger(signal?.reason?.status) ? signal.reason.status : 2 },
    ));
    child.once("error", onError);
    child.once("close", onClose);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    const deadline = Date.now() + timeoutMs;
    const poll = async () => {
      if (settled) return;
      const ready = await Promise.all([
        functionRouteReady(fetchImpl, apiUrl, "recommend-itinerary"),
        functionRouteReady(fetchImpl, apiUrl, "refine-itinerary"),
      ]);
      if (settled) return;
      if (ready.every(Boolean)) {
        settled = true;
        cleanupListeners();
        resolve({
          stop: () => stopChild(child, {
            platform,
            ownedProcessGroup: platform !== "win32",
          }),
        });
        return;
      }
      if (Date.now() >= deadline) {
        fail(runtimeError(
          "RUNTIME_ITINERARY_FUNCTIONS_TIMEOUT",
          "owned Edge Functions did not become ready",
        ));
        return;
      }
      timer = setTimeout(poll, 250);
    };
    void poll();
  });
}

function envFileValue(value) {
  const text = String(value);
  if (text.length === 0 || /[\r\n\0]/.test(text)) {
    throw runtimeError("RUNTIME_ITINERARY_ENV_INVALID", "test-only Edge environment is invalid");
  }
  return text;
}

export function writeItineraryEdgeEnvFile({ projectRoot, runtime, provider, secrets, nextOrigin }) {
  const values = {
    SUPABASE_URL: "http://kong:8000",
    SUPABASE_ANON_KEY: runtime.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: runtime.serviceRoleKey,
    LOCALLENS_QUOTA_HMAC_KEY: secrets.quotaHmacKey,
    ALLOWED_ORIGINS: nextOrigin,
    LOCALLENS_GEMINI_ENABLED: "1",
    GEMINI_API_KEY: secrets.geminiApiKey,
    GEMINI_MODEL,
    [GEMINI_ENDPOINT_ENV]: provider.endpointBase,
  };
  const envFile = path.join(projectRoot, "supabase", "functions", ".env.runtime-itinerary");
  writeFileSync(
    envFile,
    `${Object.entries(values).map(([key, value]) => `${key}=${envFileValue(value)}`).join("\n")}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  return envFile;
}

export async function seedIsolatedItineraryRuntime({
  runtime,
  passwords,
  createSupabaseClient = createClient,
  createDatabaseClient = (databaseUrl) => new Client({
    connectionString: databaseUrl,
    application_name: "localens-runtime-itinerary-seed",
  }),
  seedAuth = seedRuntimeAuth,
  seedFixedTour = seedRuntimeFixedTour,
  logger = () => {},
} = {}) {
  const authAdmin = createSupabaseClient(runtime.apiUrl, runtime.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.admin;
  const database = createDatabaseClient(runtime.databaseUrl);
  let primaryError;
  try {
    await database.connect();
    const query = database.query.bind(database);
    // The reusable seed functions validate the legacy standard-port CLI contract,
    // while their injected clients below are the actual isolated-stack boundary.
    const validationSupabaseUrl = "http://127.0.0.1:54321";
    const validationDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    await seedAuth({
      supabaseUrl: validationSupabaseUrl,
      databaseUrl: validationDatabaseUrl,
      serviceRoleKey: runtime.serviceRoleKey,
      passwords,
      authAdmin,
      query,
      logger,
    });
    await seedFixedTour({
      supabaseUrl: validationSupabaseUrl,
      databaseUrl: validationDatabaseUrl,
      serviceRoleKey: runtime.serviceRoleKey,
      customerPassword: passwords.otherCustomer,
      authAdmin,
      query,
      logger,
    });
  } catch {
    primaryError = runtimeError("RUNTIME_ITINERARY_SEED_FAILED", "isolated runtime seed failed");
  } finally {
    try {
      await database.end();
    } catch {
      const cleanupError = runtimeError(
        "RUNTIME_ITINERARY_SEED_CLEANUP_FAILED",
        "isolated seed cleanup failed",
      );
      if (primaryError) primaryError.cleanupFailed = true;
      else primaryError = cleanupError;
    }
  }
  if (primaryError) throw primaryError;
}

function defaultStatus({ cwd, workdir, env }) {
  return runLocalSupabase(["--workdir", workdir, "status", "-o", "env"], {
    cwd,
    capture: true,
    env,
  });
}

function createRedactedArtifactDirectory(cwd) {
  const parent = path.join(cwd, "test-results");
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(path.join(parent, "runtime-itinerary-redacted-"));
}

function redactFailureOutput({ cwd, outputDirectory }) {
  const destination = createRedactedArtifactDirectory(cwd);
  // The redactor refuses pre-existing destinations, so remove only the empty
  // directory just created and let it recreate the same owned path.
  rmSync(destination, { recursive: true, force: true });
  prepareRedactedArtifacts(destination, [outputDirectory]);
  return destination;
}

export async function runRuntimeItineraryE2E(options = {}) {
  const cwd = options.cwd ?? PROJECT_ROOT;
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const logger = options.logger ?? console.log;
  const runStep = options.runStep ?? runChildStep;
  const prepareDocker = options.prepareDocker ?? ((dockerEnv) => ensureDockerCliOnPath({
    env: dockerEnv,
    platform,
  }));
  const requirePinnedCli = options.requirePinnedCli ?? ((pinOptions) => requirePinnedLocalSupabase(pinOptions));
  const reservePorts = options.reservePorts ?? reserveRuntimeItineraryPorts;
  const prepareProject = options.prepareProject ?? prepareIsolatedSupabaseProject;
  const removeProject = options.removeProject ?? ((projectRoot) => rmSync(
    requireOwnedTemporaryPath(projectRoot, "localens-runtime-itinerary-"),
    { recursive: true, force: true },
  ));
  const status = options.status ?? defaultStatus;
  const seedRuntime = options.seedRuntime ?? seedIsolatedItineraryRuntime;
  const startProvider = options.startProvider ?? startFakeGeminiProvider;
  const startFunctions = options.startFunctions ?? startOwnedItineraryFunctions;
  const startServer = options.startServer ?? ((serverEnv, serverOptions) => startOwnedRuntimeServer(
    serverEnv,
    { cwd, ...serverOptions },
  ));
  const createOutputDirectory = options.createOutputDirectory ?? (() => mkdtempSync(
    path.join(tmpdir(), "localens-runtime-itinerary-playwright-"),
  ));
  const removeOutputDirectory = options.removeOutputDirectory ?? ((directory) => rmSync(
    requireOwnedTemporaryPath(directory, "localens-runtime-itinerary-playwright-"),
    { recursive: true, force: true },
  ));
  const redactArtifacts = options.redactArtifacts ?? redactFailureOutput;
  const random = options.random ?? randomBytes;
  const signal = options.signal;

  throwIfAborted(signal);
  const controlEnv = selectRuntimeItineraryBaseEnv(env);
  prepareDocker(controlEnv);
  const cliPath = requirePinnedCli({
    cwd,
    env: controlEnv,
    requireLocalCli: options.requireLocalCli ?? requireLocalSupabaseCli,
    versionProbe: options.versionProbe,
    platform,
  });
  const containerHost = options.containerHost ?? selectFakeProviderContainerHost({
    env: controlEnv,
    probe: options.containerProbe,
  });
  const passwords = createRuntimeItinerarySecrets(env, random);

  let reservation;
  let project;
  let stackStartAttempted = false;
  let outputDirectory;
  let provider;
  let functions;
  let runtimeServer;
  let browserAttempted = false;
  let primaryError;
  let cleanupFailed = false;
  let projectCleanupUnsafe = false;

  try {
    reservation = await reservePorts();
    const projectId = `localens-itinerary-${random(8).toString("hex")}`;
    project = prepareProject({ cwd, projectId, ports: reservation.ports });
    await reservation.release();
    reservation = undefined;

    const stepContext = {
      cwd,
      workdir: project.root,
      env: controlEnv,
      logger,
      runStep,
      platform,
      signal,
    };
    stackStartAttempted = true;
    try {
      await runCheckedStep("db:start", stepContext);
    } catch {
      logger("[runtime-itinerary] db:start:retry");
      await runCheckedStep("db:start", stepContext);
    }

    let localStatus;
    try {
      localStatus = await status({ cwd, workdir: project.root, env: controlEnv });
    } catch {
      throw runtimeError(
        "RUNTIME_ITINERARY_STATUS_FAILED",
        "isolated Supabase status could not be captured",
      );
    }
    if (localStatus?.status !== 0) {
      throw runtimeError(
        "RUNTIME_ITINERARY_STATUS_FAILED",
        "isolated Supabase status could not be captured",
      );
    }
    const runtime = parseIsolatedRuntimeStatus(localStatus.stdout, project.ports);
    throwIfAborted(signal);

    // Reset is allowed only after status proves this temporary project is on its
    // nonstandard reserved ports. There is deliberately no standard-stack fallback.
    await runCheckedStep("db:reset", stepContext);
    await runCheckedStep("db:test", stepContext);
    await seedRuntime({ runtime, passwords, logger });
    throwIfAborted(signal);

    provider = await startProvider({
      apiKey: passwords.geminiApiKey,
      controlToken: passwords.geminiControlToken,
      containerHost,
      logger,
    });
    throwIfAborted(signal);
    const nextOrigin = `http://127.0.0.1:${project.ports.next}`;
    const envFile = writeItineraryEdgeEnvFile({
      projectRoot: project.root,
      runtime,
      provider,
      secrets: passwords,
      nextOrigin,
    });
    logger("[runtime-itinerary] functions:serve:start");
    functions = await startFunctions({
      cwd,
      workdir: project.root,
      env: controlEnv,
      envFile,
      apiUrl: runtime.apiUrl,
      cliPath,
      platform,
      signal,
    });

    outputDirectory = createOutputDirectory();
    const serverEnv = {
      NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: runtime.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: runtime.publishableKey,
      NEXT_TELEMETRY_DISABLED: "1",
    };
    logger("[runtime-itinerary] runtime:server:start");
    runtimeServer = await startServer(serverEnv, {
      mode: "supabase",
      port: project.ports.next,
      serverUrl: `${nextOrigin}/en/sign-in/`,
      platform,
      signal,
    });

    const playwrightEnv = {
      ...controlEnv,
      LOCALENS_RUNTIME_CUSTOMER_PASSWORD: passwords.customer,
      LOCALENS_RUNTIME_GUIDE_PASSWORD: passwords.guide,
      LOCALENS_RUNTIME_ADMIN_PASSWORD: passwords.admin,
      [OTHER_CUSTOMER_PASSWORD_ENV]: passwords.otherCustomer,
      [FIXED_TOUR_PASSWORD_ENV]: passwords.otherCustomer,
      LOCALENS_RUNTIME_GEMINI_CONTROL_URL: provider.controlUrl,
      LOCALENS_RUNTIME_GEMINI_CONTROL_TOKEN: passwords.geminiControlToken,
      LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR: outputDirectory,
      NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: runtime.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: runtime.publishableKey,
    };
    browserAttempted = true;
    await runCheckedStep("test:e2e:runtime-itinerary:playwright", {
      ...stepContext,
      env: playwrightEnv,
      outputDirectory,
      baseUrl: nextOrigin,
    });
  } catch (error) {
    if (error?.cleanupFailed || error?.serverCleanupError) {
      cleanupFailed = true;
      projectCleanupUnsafe = true;
    }
    primaryError = stableError(error);
    if (cleanupFailed) primaryError.cleanupFailed = true;
    if (browserAttempted && outputDirectory) {
      try {
        redactArtifacts({ cwd, outputDirectory });
        logger("[runtime-itinerary] artifacts:redacted");
      } catch {
        cleanupFailed = true;
      }
    }
  } finally {
    const clean = async (operation, { preserveProjectOnFailure = false } = {}) => {
      try {
        await operation();
      } catch {
        cleanupFailed = true;
        if (preserveProjectOnFailure) projectCleanupUnsafe = true;
      }
    };
    if (runtimeServer) await clean(() => runtimeServer.stop(), { preserveProjectOnFailure: true });
    if (functions) await clean(() => functions.stop(), { preserveProjectOnFailure: true });
    if (provider) await clean(() => provider.stop(), { preserveProjectOnFailure: true });
    if (stackStartAttempted && project) {
      await clean(() => runCheckedStep("db:stop", {
        cwd,
        workdir: project.root,
        env: controlEnv,
        logger,
        runStep,
      }), { preserveProjectOnFailure: true });
    }
    if (outputDirectory) await clean(() => removeOutputDirectory(outputDirectory));
    if (reservation) await clean(() => reservation.release());
    if (project && projectCleanupUnsafe) {
      logger(`[runtime-itinerary] cleanup:project-preserved:${project.root}`);
    } else if (project) {
      await clean(() => removeProject(project.root));
    }
  }

  if (primaryError) {
    if (cleanupFailed) primaryError.cleanupFailed = true;
    throw primaryError;
  }
  if (cleanupFailed) {
    throw runtimeError(
      "RUNTIME_ITINERARY_CLEANUP_FAILED",
      "owned isolated runtime cleanup could not be confirmed",
    );
  }
  return { ok: true };
}

export async function runRuntimeItineraryE2EMain({
  run = runRuntimeItineraryE2E,
  errorLogger = console.error,
  signals = process,
} = {}) {
  const controller = new AbortController();
  let receivedSignal;
  const receiveSignal = (name, status) => {
    if (receivedSignal) return;
    receivedSignal = { name, status };
    controller.abort(runtimeError(
      "RUNTIME_ITINERARY_ABORTED",
      `isolated local itinerary runtime acceptance received ${name}`,
      { status },
    ));
  };
  const onSigint = () => receiveSignal("SIGINT", 130);
  const onSigterm = () => receiveSignal("SIGTERM", 143);
  signals.once("SIGINT", onSigint);
  signals.once("SIGTERM", onSigterm);
  try {
    await run({ signal: controller.signal });
    return receivedSignal?.status ?? 0;
  } catch (error) {
    const stable = stableError(error);
    try {
      errorLogger(stable.message);
      if (stable.cleanupFailed) {
        errorLogger(
          "RUNTIME_ITINERARY_CLEANUP_FAILED: owned isolated runtime cleanup could not be confirmed",
        );
      }
    } catch {
      // Logging failure must not change the stable exit contract.
    }
    return receivedSignal?.status ?? stable.status ?? 2;
  } finally {
    signals.removeListener("SIGINT", onSigint);
    signals.removeListener("SIGTERM", onSigterm);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runRuntimeItineraryE2EMain();
}
