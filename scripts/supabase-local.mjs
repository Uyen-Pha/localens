import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REMOTE_MODE_TOKENS = new Set([
  "link",
  "unlink",
  "remote",
  "push",
  "pull",
  "--linked",
  "--remote",
  "--project-ref",
  "--db-url",
]);

function task16Error(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  Object.assign(error, details);
  return error;
}

export function assertNoRemoteMode(args) {
  const tokens = Array.isArray(args) ? args.map((value) => String(value)) : [];
  for (const token of tokens) {
    const normalized = token.toLowerCase();
    if (
      REMOTE_MODE_TOKENS.has(normalized) ||
      normalized.startsWith("--project-ref=") ||
      normalized.startsWith("--db-url=") ||
      normalized.startsWith("http://") ||
      normalized.startsWith("https://") ||
      normalized.startsWith("postgres://") ||
      normalized.startsWith("postgresql://")
    ) {
      throw task16Error("REMOTE_MODE_REJECTED", `remote or linked Supabase mode is forbidden: ${token}`);
    }
  }
}

export function resolveLocalSupabaseCli({ cwd = process.cwd(), platform = process.platform } = {}) {
  const binName = platform === "win32" ? "supabase.cmd" : "supabase";
  const candidate = path.resolve(cwd, "node_modules", ".bin", binName);
  return existsSync(candidate) ? candidate : null;
}

export function requireLocalSupabaseCli(options = {}) {
  const cliPath = options.cliPath ?? resolveLocalSupabaseCli(options);
  if (!cliPath) {
    throw task16Error(
      "SUPABASE_CLI_NOT_FOUND",
      "project-local Supabase CLI is required; install the pinned dev dependency only after a local container runtime is available",
    );
  }
  return cliPath;
}

export function runLocalSupabase(args, options = {}) {
  const tokens = Array.isArray(args) ? args.map((value) => String(value)) : [];
  assertNoRemoteMode(tokens);
  const cliPath = requireLocalSupabaseCli(options);
  const capture = options.capture === true;
  const result = spawnSync(cliPath, tokens, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  const status = result.status ?? 1;
  if (status !== 0) {
    throw task16Error("SUPABASE_COMMAND_FAILED", `local Supabase command exited with status ${status}`, {
      status,
      stdout: capture ? result.stdout ?? "" : "",
      stderr: capture ? result.stderr ?? "" : "",
    });
  }
  return {
    status,
    stdout: capture ? result.stdout ?? "" : "",
    stderr: capture ? result.stderr ?? "" : "",
  };
}

function main() {
  try {
    const args = process.argv.slice(2);
    assertNoRemoteMode(args);
    runLocalSupabase(args);
  } catch (error) {
    const code = error?.code ?? "SUPABASE_LOCAL_FAILED";
    const message = error?.message ?? String(error);
    console.error(message.startsWith(`${code}:`) ? message : `${code}: ${message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
