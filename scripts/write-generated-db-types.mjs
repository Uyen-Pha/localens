import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertNoRemoteMode, requireLocalSupabaseCli, runLocalSupabase } from "./supabase-local.mjs";

const TYPE_COMMAND = ["gen", "types", "--lang", "typescript", "--local"];

function typeError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function targetPath(rootDir) {
  return path.join(rootDir, "lib", "infrastructure", "supabase", "database.types.ts");
}

async function generateOutput(options) {
  const runner = options.runner;
  if (runner) {
    const result = await runner({
      command: options.cliPath,
      args: TYPE_COMMAND,
      cwd: options.rootDir,
    });
    if (result?.status !== 0) {
      throw typeError("SUPABASE_COMMAND_FAILED", `type generation exited with status ${result?.status ?? 1}`, { result });
    }
    return result?.stdout ?? "";
  }
  const result = runLocalSupabase(TYPE_COMMAND, {
    cwd: options.rootDir,
    cliPath: options.cliPath,
    capture: true,
  });
  return result.stdout;
}

function requireNonEmptyOutput(output) {
  if (typeof output !== "string" || output.trim().length === 0) {
    throw typeError("GENERATED_TYPES_EMPTY", "local Supabase CLI returned no TypeScript output");
  }
  return `${output.trimEnd()}\n`;
}

function writeAtomically(filePath, contents) {
  const directory = path.dirname(filePath);
  mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(directory, `.database.types.ts.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  try {
    writeFileSync(temporaryPath, contents, "utf8");
    renameSync(temporaryPath, filePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export async function writeGeneratedDatabaseTypes(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  assertNoRemoteMode(options.args ?? []);
  const cliPath = requireLocalSupabaseCli({ cwd: rootDir, cliPath: options.cliPath });
  const output = requireNonEmptyOutput(await generateOutput({ ...options, rootDir, cliPath }));
  const filePath = targetPath(rootDir);
  writeAtomically(filePath, output);
  return { ok: true, filePath };
}

export async function checkGeneratedDatabaseTypes(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  assertNoRemoteMode(options.args ?? []);
  const cliPath = requireLocalSupabaseCli({ cwd: rootDir, cliPath: options.cliPath });
  const filePath = targetPath(rootDir);
  if (!existsSync(filePath)) {
    throw typeError("GENERATED_TYPES_MISSING", `generated database types are missing: ${filePath}`);
  }
  const expected = requireNonEmptyOutput(await generateOutput({ ...options, rootDir, cliPath }));
  const actual = readFileSync(filePath, "utf8");
  const normalizedActual = actual.replace(/\r\n/g, "\n");
  const normalizedExpected = expected.replace(/\r\n/g, "\n");
  if (normalizedActual !== normalizedExpected) {
    throw typeError("GENERATED_TYPES_DRIFT", "database.types.ts differs from local Supabase schema output", { filePath });
  }
  return { ok: true, filePath };
}

function parseRoot(args) {
  assertNoRemoteMode(args);
  const index = args.indexOf("--root");
  if (index < 0) return process.cwd();
  if (args.length !== index + 2) throw typeError("INVALID_ARGS", "expected exactly one value after --root");
  return path.resolve(args[index + 1]);
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const normalizedArgs = args.filter((value) => value !== "--check");
  const rootDir = parseRoot(normalizedArgs);
  if (check) await checkGeneratedDatabaseTypes({ rootDir });
  else await writeGeneratedDatabaseTypes({ rootDir });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error?.code ?? "GENERATED_TYPES_FAILED";
    const message = error?.message ?? String(error);
    console.error(message.startsWith(`${code}:`) ? message : `${code}: ${message}`);
    process.exitCode = 2;
  });
}
