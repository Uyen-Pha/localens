import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";

import { assertNoRemoteMode, requireLocalSupabaseCli, runLocalSupabase } from "./supabase-local.mjs";
import { prepareIsolatedSupabaseProject, reserveRuntimeItineraryPorts, selectRuntimeItineraryBaseEnv, requireLocalDockerContext } from "./run-runtime-itinerary-e2e.mjs";
import { assertBootstrapDirectory } from "./lib/local-ci-bootstrap.mjs";
import { assertNoBootstrapRecovery } from "./lib/bootstrap-recovery-cleanup.mjs";
import { ensureDockerCliOnPath } from "./run-runtime-auth-e2e.mjs";
import { runConcurrencyGate } from "./test-db-concurrency.mjs";
import { checkGeneratedDatabaseTypes } from "./write-generated-db-types.mjs";

export { assertNoRemoteMode } from "./supabase-local.mjs";

export const DB_GATE_STEPS = [
  "db:start",
  "db:reset",
  "db:lint",
  "db:test",
  "db:concurrency",
  "db:types:check",
];

const CONTROLLED_DATABASE_ENVIRONMENT_KEYS = new Set([
  "LOCALENS_DB_URL",
  "LOCALENS_DB_CONCURRENCY",
]);

function gateError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  Object.assign(error, details);
  return error;
}

export function exitCodeForError(error) {
  return error?.status ?? 2;
}

function packageScriptSpec(
  name,
  cwd,
  project,
  baseEnv = process.env,
) {
  const env = { ...baseEnv };
  for (const key of Object.keys(env)) {
    if (CONTROLLED_DATABASE_ENVIRONMENT_KEYS.has(key.toUpperCase())) delete env[key];
  }
  if (name === "db:concurrency") {
    env.LOCALENS_DB_URL = `postgresql://postgres:postgres@127.0.0.1:${project.ports.database}/postgres`;
    env.LOCALENS_DB_CONCURRENCY = "1";
  }
  const commands = {
    'db:start': ['start', '--exclude', 'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'],
    'db:reset': ['db', 'reset', '--local'],
    'db:lint': ['db', 'lint', '--local', '--level', 'error', '--fail-on', 'error'],
    'db:test': ['test', 'db', '--local', path.join(project.root, 'supabase/tests-selected')],
    'db:types:check': ['gen', 'types', '--lang', 'typescript', '--local'],
    'db:concurrency': [],
    'db:stop': ['stop', '--no-backup'],
  };
  const localArgs = ['--workdir', project.root, ...commands[name]];
  return {
    name,
    command: process.execPath,
    args: [path.join(cwd, 'scripts', ['db:start', 'db:reset'].includes(name) ? 'local-ci-bootstrap.mjs' : 'supabase-local.mjs'), ...localArgs],
    localArgs,
    databasePort: project.ports.database,
    cwd,
    env,
  };
}

function runPackageScript(spec) {
  if (spec.name === 'db:concurrency') return runConcurrencyGate({
    databaseUrl: spec.env.LOCALENS_DB_URL, expectedPort: spec.databasePort,
  }).then(() => ({ status: 0 }));
  if (spec.name === 'db:types:check') return checkGeneratedDatabaseTypes({
    rootDir: spec.cwd,
    runner: async () => runLocalSupabase(spec.localArgs, { cwd: spec.cwd, env: spec.env, capture: true }),
  }).then(() => ({ status: 0 }));
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status: status ?? 1, stdout: "", stderr: "" }));
  });
}

async function prepareGate({ cwd, env }) {
  ensureDockerCliOnPath({ env });
  requireLocalDockerContext({ env });
  const reservation = await reserveRuntimeItineraryPorts();
  try {
    const project = prepareIsolatedSupabaseProject({ cwd, ports: reservation.ports,
      projectId: `localens-itinerary-${randomBytes(8).toString('hex')}` });
    return { ...project, dispose: async () => rmSync(assertBootstrapDirectory(project.root), { recursive: true, force: true }) };
  } finally { await reservation.release(); }
}

function asStepFailure(spec, result) {
  if (!result || result.status === 0 || result.status === undefined) return null;
  return gateError("DB_GATE_STEP_FAILED", `${spec.name} exited with status ${result.status}`, {
    step: spec.name,
    status: result.status,
    result,
  });
}

export async function runDbGate(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const platform = options.platform ?? process.platform;
  const env = selectRuntimeItineraryBaseEnv(options.env ?? process.env);
  const args = options.args ?? [];
  assertNoRemoteMode(args);
  const cliPath = requireLocalSupabaseCli({ cwd, cliPath: options.cliPath, platform });
  const runner = options.runner ?? runPackageScript;
  const project = await (options.prepare ?? prepareGate)({ cwd, env });
  const calls = [];
  let failure = null;

  try {
    for (const name of DB_GATE_STEPS) {
      const spec = packageScriptSpec(name, cwd, project, env);
      calls.push(spec);
      const result = await runner(spec);
      const stepFailure = asStepFailure(spec, result);
      if (stepFailure) throw stepFailure;
    }
  } catch (error) {
    failure = error;
  } finally {
    const stopSpec = packageScriptSpec("db:stop", cwd, project, env);
    calls.push(stopSpec);
    try {
      const stopResult = await runner(stopSpec);
      const stopFailure = asStepFailure(stopSpec, stopResult);
      if (stopFailure) {
        if (failure) failure.cleanupError = stopFailure;
        else failure = stopFailure;
      } else {
        assertNoBootstrapRecovery(project.root);
        await project.dispose();
      }
    } catch (cleanupError) {
      if (failure) failure.cleanupError = cleanupError;
      else failure = cleanupError;
    }
  }

  if (failure) throw failure;
  return { ok: true, cliPath, calls };
}

async function main() {
  const args = process.argv.slice(2);
  assertNoRemoteMode(args);
  if (args.length > 0) throw gateError("INVALID_ARGS", "db:verify accepts no arguments");
  await runDbGate();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error?.code ?? "DB_GATE_FAILED";
    const message = error?.message ?? String(error);
    console.error(message.startsWith(`${code}:`) ? message : `${code}: ${message}`);
    if (error?.cleanupError) console.error(`CLEANUP_FAILED: ${error.cleanupError.message}`);
    process.exitCode = exitCodeForError(error);
  });
}
