import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertNoRemoteMode, requireLocalSupabaseCli } from "./supabase-local.mjs";

export { assertNoRemoteMode } from "./supabase-local.mjs";

export const DB_GATE_STEPS = [
  "db:start",
  "db:reset",
  "db:lint",
  "db:test",
  "db:concurrency",
  "db:types:check",
];

function gateError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function packageManagerCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function packageScriptSpec(name, cwd) {
  return {
    name,
    command: packageManagerCommand(),
    args: ["run", name],
    cwd,
  };
}

function runPackageScript(spec) {
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status: status ?? 1, stdout: "", stderr: "" }));
  });
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
  const args = options.args ?? [];
  assertNoRemoteMode(args);
  const cliPath = requireLocalSupabaseCli({ cwd, cliPath: options.cliPath });
  const runner = options.runner ?? runPackageScript;
  const calls = [];
  let failure = null;

  try {
    for (const name of DB_GATE_STEPS) {
      const spec = packageScriptSpec(name, cwd);
      calls.push(spec);
      const result = await runner(spec);
      const stepFailure = asStepFailure(spec, result);
      if (stepFailure) throw stepFailure;
    }
  } catch (error) {
    failure = error;
  } finally {
    const stopSpec = packageScriptSpec("db:stop", cwd);
    calls.push(stopSpec);
    try {
      const stopResult = await runner(stopSpec);
      const stopFailure = asStepFailure(stopSpec, stopResult);
      if (stopFailure) {
        if (failure) failure.cleanupError = stopFailure;
        else failure = stopFailure;
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
    process.exitCode = 2;
  });
}
