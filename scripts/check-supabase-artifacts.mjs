import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const MIGRATION_NAME = /^(\d{14})(?:[_-].*)?\.sql$/i;
const TEMPLATE_TOKEN = /\{\{[^}\r\n]+\}\}|\$\{[^}\r\n]+\}|<%[=-]?[\s\S]*?%>/;
const RAW_SECRET = /\b(?:sk_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,})\b/i;
const SECRET_ASSIGNMENT = /\b(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|GEMINI_API_KEY|TURNSTILE_SECRET|HMAC_PEPPER|RAW_GUEST_TOKEN|PASSWORD)\b\s*[:=]\s*(?!null\b|undefined\b)(?:'[^']*'|"[^"]*"|[A-Za-z0-9+/_.=-]+)/i;
const IDENTIFIER = `(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)`;
const PUBLIC_TABLE = new RegExp(`\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENTIFIER})\\s*\\.\\s*(${IDENTIFIER})`, "gi");
const ENABLE_RLS = new RegExp(`\\bALTER\\s+TABLE\\s+(?:ONLY\\s+)?(${IDENTIFIER})\\s*\\.\\s*(${IDENTIFIER})\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY\\b`, "gi");

function maskRange(text, start, end) {
  return text.slice(start, end).replace(/[^\r\n]/g, " ");
}

function isIdentifierCharacter(value) {
  return value !== undefined && /[A-Za-z0-9_$]/.test(value);
}

function lexSql(text) {
  const tokens = [];
  const errors = [];
  let index = 0;
  const push = (type, start, end) => tokens.push({ type, text: text.slice(start, end), start, end });

  while (index < text.length) {
    const start = index;
    const current = text[index];
    const next = text[index + 1];

    if (current === "-" && next === "-") {
      index += 2;
      while (index < text.length && text[index] !== "\n") index += 1;
      push("comment", start, index);
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      let depth = 1;
      while (index < text.length && depth > 0) {
        if (text[index] === "/" && text[index + 1] === "*") {
          depth += 1;
          index += 2;
        } else if (text[index] === "*" && text[index + 1] === "/") {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      push("comment", start, index);
      if (depth !== 0) errors.push("unterminated block comment");
      continue;
    }

    if (current === "$") {
      const delimiterMatch = text.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (delimiterMatch && !isIdentifierCharacter(text[index - 1])) {
        const delimiter = delimiterMatch[0];
        const bodyStart = index + delimiter.length;
        const close = text.indexOf(delimiter, bodyStart);
        if (close === -1) {
          push("dollar", start, text.length);
          errors.push(`unterminated dollar-quoted body ${delimiter}`);
          index = text.length;
        } else {
          const end = close + delimiter.length;
          push("dollar", start, end);
          index = end;
        }
        continue;
      }
    }

    const escapedString = (current === "E" || current === "e") && next === "'" && !isIdentifierCharacter(text[index - 1]);
    if (current === "'" || escapedString) {
      const stringStart = escapedString ? index : start;
      let cursor = escapedString ? index + 2 : index + 1;
      let closed = false;
      while (cursor < text.length) {
        if (escapedString && text[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (text[cursor] === "'" && text[cursor + 1] === "'") {
          cursor += 2;
          continue;
        }
        if (text[cursor] === "'") {
          cursor += 1;
          closed = true;
          break;
        }
        cursor += 1;
      }
      push("string", stringStart, cursor);
      if (!closed) errors.push("unterminated string literal");
      index = cursor;
      continue;
    }

    if (current === '"') {
      let cursor = index + 1;
      let closed = false;
      while (cursor < text.length) {
        if (text[cursor] === '"' && text[cursor + 1] === '"') {
          cursor += 2;
          continue;
        }
        if (text[cursor] === '"') {
          cursor += 1;
          closed = true;
          break;
        }
        cursor += 1;
      }
      push("identifier", start, cursor);
      if (!closed) errors.push("unterminated quoted identifier");
      index = cursor;
      continue;
    }

    push("code", start, start + 1);
    index += 1;
  }

  return { tokens, errors };
}

function maskedSql(tokens, maskedTypes) {
  return tokens.map((token) => maskedTypes.has(token.type) ? maskRange(token.text, 0, token.text.length) : token.text).join("");
}

function commentsMaskedOnly(tokens) {
  return tokens.map((token) => {
    if (token.type === "comment") return maskRange(token.text, 0, token.text.length);
    if (token.type !== "dollar") return token.text;
    const delimiter = token.text.match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
    if (!delimiter || !token.text.endsWith(delimiter)) return token.text;
    const body = token.text.slice(delimiter.length, -delimiter.length);
    const nested = lexSql(body);
    return delimiter + commentsMaskedOnly(nested.tokens) + delimiter;
  }).join("");
}

function splitStatements(tokens) {
  const statements = [];
  let current = "";
  for (const token of tokens) {
    if (token.type === "comment" || token.type === "string" || token.type === "dollar") {
      current += " ";
      continue;
    }
    if (token.type === "code" && token.text === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
    } else {
      current += token.text;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function isBeginWrapper(statement) {
  return /^BEGIN(?:\s+(?:WORK|TRANSACTION))?$/i.test(statement);
}

function isCommitWrapper(statement) {
  return /^COMMIT(?:\s+(?:WORK|TRANSACTION))?(?:\s+AND\s+(?:NO\s+)?CHAIN)?$/i.test(statement);
}

function normalizeIdentifier(identifier) {
  if (identifier.startsWith('"') && identifier.endsWith('"')) return identifier.slice(1, -1).replaceAll('""', '"');
  return identifier;
}

function isPublicSchema(identifier) {
  return normalizeIdentifier(identifier).toLowerCase() === "public";
}

function tableKey(schema, table) {
  return `${normalizeIdentifier(schema).toLowerCase()}.${normalizeIdentifier(table).toLowerCase()}`;
}

function migrationFiles(root) {
  const directory = join(root, "supabase", "migrations");
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
    .map((entry) => {
      const match = entry.name.match(MIGRATION_NAME);
      return { name: entry.name, path: join(directory, entry.name), timestamp: match?.[1] ?? null };
    })
    .sort((left, right) => (left.timestamp ?? "~").localeCompare(right.timestamp ?? "~") || left.name.localeCompare(right.name));
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
  const seen = new Set();
  for (const file of files) {
    if (!file.timestamp) {
      errors.push(`${file.name}: every migration must have a 14-digit UTC timestamp filename`);
      continue;
    }
    if (!isValidUtcTimestamp(file.timestamp)) {
      errors.push(`${file.name}: migration timestamp is not a valid UTC date/time`);
      continue;
    }
    if (seen.has(file.timestamp)) errors.push(`${file.name}: duplicate migration timestamp ${file.timestamp}`);
    seen.add(file.timestamp);
  }
}

function checkSqlFile(file, errors) {
  const source = readFileSync(file.path, "utf8");
  const { tokens, errors: lexicalErrors } = lexSql(source);
  for (const error of lexicalErrors) errors.push(`${file.name}: ${error}`);

  const structure = maskedSql(tokens, new Set(["comment", "string", "dollar"]));
  const statements = splitStatements(tokens);
  if (!statements[0] || !isBeginWrapper(statements[0])) errors.push(`${file.name}: missing first top-level BEGIN wrapper`);
  if (!statements.at(-1) || !isCommitWrapper(statements.at(-1))) errors.push(`${file.name}: missing last top-level COMMIT wrapper`);

  const tables = [];
  for (const match of structure.matchAll(PUBLIC_TABLE)) {
    if (isPublicSchema(match[1])) tables.push(tableKey(match[1], match[2]));
  }
  const rls = [];
  for (const match of structure.matchAll(ENABLE_RLS)) {
    if (isPublicSchema(match[1])) rls.push(tableKey(match[1], match[2]));
  }

  const secretScan = commentsMaskedOnly(tokens);
  if (TEMPLATE_TOKEN.test(secretScan)) errors.push(`${file.name}: unresolved template token`);
  if (RAW_SECRET.test(secretScan) || SECRET_ASSIGNMENT.test(secretScan)) errors.push(`${file.name}: forbidden raw secret pattern`);
  return { tables, rls };
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
  const publicTables = new Set();
  const rlsTables = new Set();
  for (const file of files) {
    const facts = checkSqlFile(file, errors);
    facts.tables.forEach((table) => publicTables.add(table));
    facts.rls.forEach((table) => rlsTables.add(table));
  }
  for (const table of publicTables) {
    if (!rlsTables.has(table)) errors.push(`public.${table.split(".")[1]} is missing ENABLE ROW LEVEL SECURITY`);
  }

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
    if (argv[index] === "--root") {
      root = argv[index + 1] ?? root;
      index += 1;
    } else if (argv[index] === "--require-seed") {
      requireSeed = true;
    }
  }
  return { root, requireSeed };
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = scanSupabaseArtifacts(options);
  if (!result.ok) {
    for (const error of result.errors) console.error(`[db:static] ${error}`);
    return 1;
  }
  console.log(`[db:static] checked ${result.files.length} migration file(s); seed ${options.requireSeed ? "required" : "optional"}`);
  return 0;
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
if (invoked === resolve(fileURLToPath(import.meta.url))) process.exitCode = main();
