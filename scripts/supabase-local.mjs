import { existsSync, realpathSync } from "node:fs";
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
  return existsSync(candidate) && isSafeLocalCliPath(candidate, { cwd, platform }) ? candidate : null;
}

function isSafeLocalCliPath(candidate, { cwd = process.cwd(), platform = process.platform } = {}) {
  const binName = platform === "win32" ? "supabase.cmd" : "supabase";
  const expected = path.resolve(cwd, "node_modules", ".bin", binName);
  if (path.resolve(candidate) !== expected) return false;
  if (!existsSync(candidate)) return true;
  try {
    const realCandidate = realpathSync.native(candidate);
    const realProjectRoot = realpathSync.native(cwd);
    const relative = path.relative(realProjectRoot, realCandidate);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}

export function requireLocalSupabaseCli(options = {}) {
  const cliPath = options.cliPath;
  if (cliPath !== undefined) {
    if (!isSafeLocalCliPath(cliPath, options)) {
      throw task16Error(
        "SUPABASE_CLI_PATH_REJECTED",
        "explicit Supabase CLI path must be the project-local node_modules/.bin entry",
      );
    }
    return path.resolve(cliPath);
  }
  const resolvedCliPath = resolveLocalSupabaseCli(options);
  if (resolvedCliPath) return resolvedCliPath;
  if (!cliPath) {
    throw task16Error(
      "SUPABASE_CLI_NOT_FOUND",
      "project-local Supabase CLI is required; install the pinned dev dependency only after a local container runtime is available",
    );
  }
  return resolvedCliPath;
}

function requireWindowsSupabaseJsEntrypoint({ cwd = process.cwd() } = {}) {
  const candidate = path.resolve(cwd, "node_modules", "supabase", "dist", "supabase.js");
  if (!existsSync(candidate)) {
    throw task16Error(
      "SUPABASE_JS_ENTRYPOINT_NOT_FOUND",
      "project-local Supabase JavaScript entrypoint is required on Windows",
    );
  }
  try {
    const realCandidate = realpathSync.native(candidate);
    const realProjectRoot = realpathSync.native(cwd);
    const relative = path.relative(realProjectRoot, realCandidate);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw task16Error(
        "SUPABASE_JS_ENTRYPOINT_REJECTED",
        "project-local Supabase JavaScript entrypoint must remain inside the project",
      );
    }
    return realCandidate;
  } catch (error) {
    if (error?.code === "SUPABASE_JS_ENTRYPOINT_REJECTED") throw error;
    throw task16Error(
      "SUPABASE_JS_ENTRYPOINT_REJECTED",
      "project-local Supabase JavaScript entrypoint could not be verified",
    );
  }
}

export function runLocalSupabase(args, options = {}) {
  const tokens = Array.isArray(args) ? args.map((value) => String(value)) : [];
  assertNoRemoteMode(tokens);
  const cliPath = requireLocalSupabaseCli(options);
  const platform = options.platform ?? process.platform;
  const command = platform === "win32" ? process.execPath : cliPath;
  const commandArgs =
    platform === "win32"
      ? [requireWindowsSupabaseJsEntrypoint({ cwd: options.cwd ?? process.cwd() }), ...tokens]
      : tokens;
  const capture = options.capture === true;
  const spawn = options.spawn ?? spawnSync;
  const result = spawn(command, commandArgs, {
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
