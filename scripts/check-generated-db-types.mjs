import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertNoRemoteMode } from "./supabase-local.mjs";
import { checkGeneratedDatabaseTypes } from "./write-generated-db-types.mjs";

function parseRoot(args) {
  assertNoRemoteMode(args);
  const index = args.indexOf("--root");
  if (index < 0) {
    if (args.length > 0) throw new Error("INVALID_ARGS: expected --root <directory>");
    return process.cwd();
  }
  if (args.length !== index + 2) throw new Error("INVALID_ARGS: expected exactly one value after --root");
  return path.resolve(args[index + 1]);
}

async function main() {
  const rootDir = parseRoot(process.argv.slice(2));
  await checkGeneratedDatabaseTypes({ rootDir });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error?.code ?? "GENERATED_TYPES_CHECK_FAILED";
    const message = error?.message ?? String(error);
    console.error(message.startsWith(`${code}:`) ? message : `${code}: ${message}`);
    process.exitCode = 2;
  });
}
