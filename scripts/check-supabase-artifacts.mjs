import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const MIGRATION_NAME = /^(\d{14})(?:[_-].*)?\.sql$/i;
const TEMPLATE_TOKEN = /\{\{[^}\r\n]+\}\}|\$\{[^}\r\n]+\}|<%[=-]?[\s\S]*?%>/;
const RAW_SECRET = /\b(?:sk_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,})\b/i;
const SECRET_ASSIGNMENT = /\b(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|GEMINI_API_KEY|TURNSTILE_SECRET|RAW_GUEST_TOKEN|PASSWORD)\b\s*[:=]\s*(['"]?)(?!\{\{|\$\{|\[|<)[A-Za-z0-9+/_.=-]{12,}\1/i;

function maskRange(text, start, end) {
  const fragment = text.slice(start, end);
  return fragment.replace(/[^\r\n]/g, " ");
}

function maskCommentsAndDollarBodies(text) {
  let output = "";
  let index = 0;
  while (index < text.length) {
    if (text.startsWith("--", index)) {
      const end = text.indexOf("\n", index + 2);
      const final = end === -1 ? text.length : end;
      output += maskRange(text, index, final);
      index = final;
      continue;
    }
    if (text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2);
      const final = end === -1 ? text.length : end + 2;
      output += maskRange(text, index, final);
      index = final;
      continue;
    }
    if (text[index] === "$") {
      const match = text.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (match) {
        const delimiter = match[0];
        const bodyStart = index + delimiter.length;
        const close = text.indexOf(delimiter, bodyStart);
        if (close !== -1) {
          const final = close + delimiter.length;
          output += maskRange(text, index, final);
          index = final;
          continue;
        }
      }
    }
    output += text[index];
    index += 1;
  }
  return output;
}

function maskSql(text) {
  const withoutCommentsAndBodies = maskCommentsAndDollarBodies(text);
  let output = "";
  let index = 0;
  while (index < withoutCommentsAndBodies.length) {
    const current = withoutCommentsAndBodies[index];
    if (current === "'") {
      let end = index + 1;
      while (end < withoutCommentsAndBodies.length) {
        if (withoutCommentsAndBodies[end] === "'" && withoutCommentsAndBodies[end + 1] === "'") {
          end += 2;
          continue;
        }
        if (withoutCommentsAndBodies[end] === "'") {
          end += 1;
          break;
        }
        end += 1;
      }
      output += maskRange(withoutCommentsAndBodies, index, end);
      index = end;
      continue;
    }
    if (current === '"') {
      let end = index + 1;
      while (end < withoutCommentsAndBodies.length) {
        if (withoutCommentsAndBodies[end] === '"' && withoutCommentsAndBodies[end + 1] === '"') {
          end += 2;
          continue;
        }
        if (withoutCommentsAndBodies[end] === '"') {
          end += 1;
          break;
        }
        end += 1;
      }
      output += maskRange(withoutCommentsAndBodies, index, end);
      index = end;
      continue;
    }
    output += current;
    index += 1;
  }
  return output;
}

function migrationFiles(root) {
  const directory = join(root, "supabase", "migrations");
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
    .map((entry) => ({ name: entry.name, path: join(directory, entry.name) }));
}

function isValidUtcTimestamp(value) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function checkMigrationNames(files, errors) {
  const timestamps = [];
  for (const file of files) {
    const match = file.name.match(MIGRATION_NAME);
    if (!match) continue;
    if (!isValidUtcTimestamp(match[1])) {
      errors.push(`${file.name}: migration timestamp is not a valid UTC date/time`);
      continue;
    }
    timestamps.push({ timestamp: match[1], name: file.name });
  }
  const seen = new Set();
  for (const item of timestamps) {
    if (seen.has(item.timestamp)) errors.push(`${item.name}: duplicate migration timestamp ${item.timestamp}`);
    seen.add(item.timestamp);
  }
  for (let index = 1; index < timestamps.length; index += 1) {
    if (timestamps[index - 1].timestamp >= timestamps[index].timestamp) {
      errors.push(`migration timestamps must be strictly ordered; ${timestamps[index - 1].name} precedes ${timestamps[index].name}`);
    }
  }
}

function checkSqlFile(file, errors) {
  const source = readFileSync(file.path, "utf8");
  const topLevel = maskSql(source);
  if (!/\bBEGIN\b/i.test(topLevel)) errors.push(`${file.name}: missing top-level BEGIN`);
  if (!/\bCOMMIT\b/i.test(topLevel)) errors.push(`${file.name}: missing top-level COMMIT`);

  const publicTables = [...topLevel.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\s*\.\s*)"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)].map((match) => match[1]);
  for (const table of publicTables) {
    const rls = new RegExp(`\\bALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:"?public"?\\s*\\.\\s*)"?${table}"?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY\\b`, "i");
    if (!rls.test(topLevel)) errors.push(`${file.name}: public.${table} is missing ENABLE ROW LEVEL SECURITY`);
  }

  const secretScan = maskCommentsAndDollarBodies(source);
  if (TEMPLATE_TOKEN.test(secretScan)) errors.push(`${file.name}: unresolved template token`);
  if (RAW_SECRET.test(secretScan) || SECRET_ASSIGNMENT.test(secretScan)) errors.push(`${file.name}: forbidden raw secret pattern`);
}

function checkRequiredSeed(root, errors) {
  const required = [
    "supabase/seed.sql",
    "data/approvals/hcmc-catalog.v1.json",
    "data/sources/source-hashes.v1.json",
  ];
  for (const relative of required) {
    if (!existsSync(join(root, relative))) errors.push(`--require-seed: missing ${relative}`);
  }
  const seedPath = join(root, "supabase", "seed.sql");
  if (existsSync(seedPath)) {
    const seed = readFileSync(seedPath, "utf8");
    if (!/localens[-_:](?:seed|approval|source[-_:]?hash)/i.test(seed)) {
      errors.push("--require-seed: seed.sql is missing LocalLens seed provenance markers");
    }
  }
}

export function scanSupabaseArtifacts({ root = process.cwd(), requireSeed = false } = {}) {
  const resolvedRoot = resolve(root);
  const errors = [];
  const files = migrationFiles(resolvedRoot);
  checkMigrationNames(files, errors);
  for (const file of files) checkSqlFile(file, errors);
  if (requireSeed) {
    checkRequiredSeed(resolvedRoot, errors);
    const seedPath = join(resolvedRoot, "supabase", "seed.sql");
    if (existsSync(seedPath)) checkSqlFile({ name: "supabase/seed.sql", path: seedPath }, errors);
  }
  return { ok: errors.length === 0, errors, files: files.map(({ name }) => name) };
}

function parseArgs(argv) {
  let root = process.cwd();
  let requireSeed = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      root = argv[index + 1] ?? root;
      index += 1;
    } else if (argument === "--require-seed") {
      requireSeed = true;
    }
  }
  return { root, requireSeed };
}

export function main(argv = process.argv.slice(2)) {
  const result = scanSupabaseArtifacts(parseArgs(argv));
  if (!result.ok) {
    for (const error of result.errors) console.error(`[db:static] ${error}`);
    return 1;
  }
  console.log(`[db:static] checked ${result.files.length} migration file(s); seed ${parseArgs(argv).requireSeed ? "required" : "optional"}`);
  return 0;
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
if (invoked === resolve(fileURLToPath(import.meta.url))) process.exitCode = main();
