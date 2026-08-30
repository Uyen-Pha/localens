import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { renderMatrixMarkdown } from "./generate-data-access-matrix.mjs";

const MIGRATION_NAME = /^(\d{14})(?:[_-].*)?\.sql$/i;
const TEMPLATE_TOKEN = /\{\{[^}\r\n]+\}\}|\$\{[^}\r\n]+\}|<%[=-]?[\s\S]*?%>/;
const RAW_SECRET = /\b(?:sk_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,})\b/i;
const SECRET_ASSIGNMENT = /\b(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|GEMINI_API_KEY|TURNSTILE_SECRET|HMAC_PEPPER|RAW_GUEST_TOKEN|PASSWORD)\b\s*[:=]\s*(?!null\b|undefined\b)(?:'[^']*'|"[^"]*"|[A-Za-z0-9+/_.=-]+)/i;
const IDENTIFIER = `(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*|\uE000\\d+\uE001)`;
const DATABASE_TABLE = new RegExp(`\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENTIFIER})\\s*\\.\\s*(${IDENTIFIER})`, "gi");
const ENABLE_RLS = new RegExp(`\\bALTER\\s+TABLE\\s+(?:ONLY\\s+)?(${IDENTIFIER})\\s*\\.\\s*(${IDENTIFIER})\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY\\b`, "gi");
const FORCE_RLS = new RegExp(`\\bALTER\\s+TABLE\\s+(?:ONLY\\s+)?(${IDENTIFIER})\\s*\\.\\s*(${IDENTIFIER})\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY\\b`, "gi");

export function normalizeLineEndings(text) {
  return text.replace(/\r\n?/g, "\n");
}

function maskRange(text, start, end) {
  return text.slice(start, end).replace(/[^\r\n]/g, " ");
}

function isIdentifierCharacter(value) {
  return value !== undefined && /[A-Za-z0-9_$]/.test(value);
}

export function lexSql(text) {
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

function normalizedStructure(tokens) {
  const quotedIdentifiers = new Map();
  let identifierIndex = 0;
  const text = tokens.map((token) => {
    if (token.type === "identifier") {
      const surrogate = `\uE000${identifierIndex}\uE001`;
      quotedIdentifiers.set(surrogate, token.text);
      identifierIndex += 1;
      return surrogate;
    }
    if (token.type === "comment" || token.type === "string" || token.type === "dollar") {
      return maskRange(token.text, 0, token.text.length);
    }
    return token.text;
  }).join("");
  return { text, quotedIdentifiers };
}

function commentsMaskedOnly(tokens, errors = []) {
  return tokens.map((token) => {
    if (token.type === "comment") return maskRange(token.text, 0, token.text.length);
    if (token.type !== "dollar") return token.text;
    const delimiter = token.text.match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
    if (!delimiter || !token.text.endsWith(delimiter)) return token.text;
    const body = token.text.slice(delimiter.length, -delimiter.length);
    const nested = lexSql(body);
    for (const error of nested.errors) errors.push(`nested dollar body: ${error}`);
    return delimiter + commentsMaskedOnly(nested.tokens, errors) + delimiter;
  }).join("");
}

export function splitStatements(tokens) {
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

function splitSqlList(value) {
  const result = [];
  let current = "";
  let depth = 0;
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (character === "," && depth === 0) {
      if (current.trim()) result.push(current.trim());
      current = "";
    } else current += character;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function normalizeGrantRole(role) {
  return role.trim().replace(/^"|"$/g, "").toLowerCase();
}

function normalizeGrantTarget(target) {
  return target.trim().replace(/\s+/g, "").replace(/^ONLY/i, "").toLowerCase();
}

export function parseGrantStatement(statement) {
  const normalizedStatement = statement.replace(/\s+/g, " ").trim();
  const match = normalizedStatement.match(/^(GRANT|REVOKE)\s+(.+?)\s+ON\s+(.+?)\s+(TO|FROM)\s+(.+)$/i);
  if (!match) return [];
  const action = match[1].toLowerCase();
  const privilegeText = match[2].trim();
  const objectText = match[3].trim();
  const roles = splitSqlList(match[5].replace(/\s+WITH\s+GRANT\s+OPTION$/i, "")).map(normalizeGrantRole);
  let objectType = "table";
  let targetText = objectText;
  const allMatch = objectText.match(/^ALL\s+(TABLES|SEQUENCES|FUNCTIONS)\s+IN\s+SCHEMA\s+(.+)$/i);
  if (allMatch) {
    objectType = `all_${allMatch[1].toLowerCase()}`;
    targetText = allMatch[2];
  } else {
    const typed = objectText.match(/^(TABLE|VIEW|FUNCTION|SEQUENCE|SCHEMA)\s+(.+)$/i);
    if (typed) {
      objectType = typed[1].toLowerCase();
      targetText = typed[2];
    }
  }
  const privileges = splitSqlList(privilegeText.replace(/^GRANT\s+OPTION\s+FOR\s+/i, "")).map((privilege) => {
    const normalized = privilege.replace(/\s+/g, " ").trim().toLowerCase();
    const columns = normalized.match(/^(select|insert|update|delete|references|trigger)\s*\((.*)\)$/i);
    return columns
      ? { privilege: columns[1].toLowerCase(), columns: splitSqlList(columns[2]).map((column) => column.replace(/\s+/g, "").toLowerCase()).sort() }
      : { privilege: normalized.replace(/\s+privileges?$/, ""), columns: [] };
  });
  const targets = splitSqlList(targetText).map((target) => normalizeGrantTarget(target));
  return targets.flatMap((target) => roles.flatMap((grantee) => privileges.map(({ privilege, columns }) => ({
    action,
    objectType,
    objectName: target,
    privilege,
    columns,
    grantee,
  }))));
}

function grantKey(grant) {
  return [grant.objectType, grant.objectName, grant.privilege, grant.columns.join(","), grant.grantee].join("|");
}

function applyGrantRecords(state, records) {
  for (const record of records) {
    if (record.action === "grant") {
      state.set(grantKey(record), { ...record, action: undefined });
      continue;
    }
    for (const [key, current] of state) {
      const objectMatches = record.objectType.startsWith("all_")
        ? current.objectType === record.objectType.slice(4, -1) && current.objectName.startsWith(`${record.objectName}.`)
        : current.objectType === record.objectType && current.objectName === record.objectName;
      const privilegeMatches = record.privilege === "all" || current.privilege === record.privilege;
      const columnsMatch = record.columns.length === 0 || current.columns.join(",") === record.columns.join(",");
      if (objectMatches && privilegeMatches && columnsMatch && current.grantee === record.grantee) state.delete(key);
    }
  }
}

function parseDynamicPolicies(source) {
  const policies = [];
  const loopPattern = /FOREACH\s+\w+\s+IN\s+ARRAY\s+ARRAY\[([\s\S]*?)\][\s\S]*?EXECUTE\s+format\(\s*'CREATE\s+POLICY\s+([A-Za-z_][A-Za-z0-9_]*)\s+ON\s+(public|private)\.%I\s+FOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\s+TO\s+([A-Za-z_][A-Za-z0-9_]*)\s+USING\s*\(([^)]*)\)\s+WITH\s+CHECK\s*\(([^)]*)\)'/gi;
  for (const match of source.matchAll(loopPattern)) {
    const role = match[5].toLowerCase();
    const using = match[6].replaceAll("%L", `'${role}'`).replaceAll("%I", "table_name").replace(/\s+/g, " ").trim();
    const withCheck = match[7].replaceAll("%L", `'${role}'`).replaceAll("%I", "table_name").replace(/\s+/g, " ").trim();
    for (const table of match[1].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)) policies.push({
      schema: match[3].toLowerCase(),
      table: table[1].toLowerCase(),
      policy: match[2].toLowerCase(),
      command: match[4].toUpperCase(),
      roles: [role],
      using,
      withCheck,
    });
  }
  return policies;
}

function isBeginWrapper(statement) {
  return /^BEGIN(?:\s+(?:WORK|TRANSACTION))?$/i.test(statement);
}

function isCommitWrapper(statement) {
  return /^COMMIT(?:\s+(?:WORK|TRANSACTION))?(?:\s+AND\s+(?:NO\s+)?CHAIN)?$/i.test(statement);
}

function normalizeIdentifier(identifier, quotedIdentifiers) {
  const original = quotedIdentifiers.get(identifier) ?? identifier;
  if (original.startsWith('"') && original.endsWith('"')) return original.slice(1, -1).replaceAll('""', '"');
  return original;
}

function tableKey(schema, table, quotedIdentifiers) {
  return `${normalizeIdentifier(schema, quotedIdentifiers).toLowerCase()}.${normalizeIdentifier(table, quotedIdentifiers).toLowerCase()}`;
}

export function migrationFiles(root) {
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

  const structure = normalizedStructure(tokens);
  const statements = splitStatements(tokens);
  if (!statements[0] || !isBeginWrapper(statements[0])) errors.push(`${file.name}: missing first top-level BEGIN wrapper`);
  if (!statements.at(-1) || !isCommitWrapper(statements.at(-1))) errors.push(`${file.name}: missing last top-level COMMIT wrapper`);

  const tables = [];
  for (const match of structure.text.matchAll(DATABASE_TABLE)) {
    const schema = normalizeIdentifier(match[1], structure.quotedIdentifiers).toLowerCase();
    if (schema === "public" || schema === "private") tables.push(tableKey(match[1], match[2], structure.quotedIdentifiers));
  }
  const rls = [];
  for (const match of structure.text.matchAll(ENABLE_RLS)) {
    const schema = normalizeIdentifier(match[1], structure.quotedIdentifiers).toLowerCase();
    if (schema === "public" || schema === "private") rls.push(tableKey(match[1], match[2], structure.quotedIdentifiers));
  }
  const forceRls = [];
  for (const match of structure.text.matchAll(FORCE_RLS)) {
    const schema = normalizeIdentifier(match[1], structure.quotedIdentifiers).toLowerCase();
    if (schema === "public" || schema === "private") forceRls.push(tableKey(match[1], match[2], structure.quotedIdentifiers));
  }

  const nestedLexerErrors = [];
  const secretScan = commentsMaskedOnly(tokens, nestedLexerErrors);
  for (const error of nestedLexerErrors) errors.push(`${file.name}: ${error}`);
  if (TEMPLATE_TOKEN.test(secretScan)) errors.push(`${file.name}: unresolved template token`);
  if (RAW_SECRET.test(secretScan) || SECRET_ASSIGNMENT.test(secretScan)) errors.push(`${file.name}: forbidden raw secret pattern`);
  return { tables, rls, forceRls };
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

export function databaseInventory(files) {
  const tables = new Set();
  const views = new Set();
  const functions = new Set();
  const functionSignatures = new Set();
  const policies = new Set();
  const viewModes = new Map();
  const viewOwners = new Map();
  const functionOwners = new Map();
  const tableOwners = new Map();
  const forceRls = new Set();
  const policyDefinitions = [];
  const grantState = new Map();
  const unsafeLaterDefinerReplacements = [];
  const objectEventPattern = /\b(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?|CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+|DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?|DROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?|DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?)((?:public|private)\.[A-Za-z_][A-Za-z0-9_]*)/gi;
  const viewPattern = /\bCREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(public\.[A-Za-z_][A-Za-z0-9_]*)/gi;
  const functionSignaturePattern = /\bALTER\s+FUNCTION\s+((?:public|private)\.[^;]+?)\s+OWNER\s+TO\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
  const viewOwnerPattern = /\bALTER\s+VIEW\s+(public\.[A-Za-z_][A-Za-z0-9_]*)\s+OWNER\s+TO\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
  const tableOwnerPattern = /\bALTER\s+TABLE\s+((?:public|private)\.[A-Za-z_][A-Za-z0-9_]*)\s+OWNER\s+TO\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
  const policyPattern = /\bCREATE\s+POLICY\s+([A-Za-z_][A-Za-z0-9_]*)\s+ON\s+((?:public|private)\.[A-Za-z_][A-Za-z0-9_]*)/gi;
  for (const file of files) {
    const source = readFileSync(file.path, "utf8");
    for (const match of source.matchAll(objectEventPattern)) {
      const keyword = match[1].trim().toLowerCase().replace("create or replace ", "create ");
      const name = match[2].toLowerCase();
      if (keyword.startsWith("drop table")) tables.delete(name);
      else if (keyword.startsWith("drop view")) { views.delete(name); viewModes.delete(name); viewOwners.delete(name); }
      else if (keyword.startsWith("drop function")) {
        functions.delete(name);
        for (const signature of functionSignatures) if (signature.startsWith(`${name}(`)) functionSignatures.delete(signature);
      } else if (keyword.startsWith("create table")) tables.add(name);
      else if (keyword.startsWith("create view")) views.add(name);
      else if (keyword.startsWith("create function")) functions.add(name);
    }
    for (const match of source.matchAll(viewPattern)) {
      const name = match[1].toLowerCase();
      const tail = source.slice(match.index + match[0].length, match.index + match[0].length + 220);
      const invoker = tail.match(/WITH\s*\(\s*security_invoker\s*=\s*(true|false)/i)?.[1];
      const barrier = tail.match(/security_barrier\s*=\s*(true|false)/i)?.[1];
      if (invoker || barrier) viewModes.set(name, { securityInvoker: invoker === "true", securityBarrier: barrier === "true" });
    }
    for (const match of source.matchAll(functionSignaturePattern)) {
      const signature = match[1].replace(/\s+/g, "").toLowerCase();
      functionSignatures.add(signature);
      functionOwners.set(signature, match[2]);
    }
    for (const match of source.matchAll(viewOwnerPattern)) viewOwners.set(match[1].toLowerCase(), match[2]);
    for (const match of source.matchAll(policyPattern)) policies.add(`${match[2].toLowerCase()}:${match[1].toLowerCase()}`);
    for (const dynamicPolicy of parseDynamicPolicies(source)) {
      policies.add(`${dynamicPolicy.schema}.${dynamicPolicy.table}:${dynamicPolicy.policy}`);
      policyDefinitions.push({
        table: `${dynamicPolicy.schema}.${dynamicPolicy.table}`,
        name: dynamicPolicy.policy,
        command: dynamicPolicy.command,
        roles: dynamicPolicy.roles,
        using: dynamicPolicy.using,
        withCheck: dynamicPolicy.withCheck,
      });
    }
    for (const match of source.matchAll(tableOwnerPattern)) tableOwners.set(match[1].toLowerCase(), match[2]);
    const structure = normalizedStructure(lexSql(source).tokens);
    for (const match of structure.text.matchAll(FORCE_RLS)) {
      const schema = normalizeIdentifier(match[1], structure.quotedIdentifiers).toLowerCase();
      if (schema === "public" || schema === "private") forceRls.add(tableKey(match[1], match[2], structure.quotedIdentifiers));
    }
    const { tokens } = lexSql(source);
    const statements = splitStatements(tokens);
    for (const statement of statements) applyGrantRecords(grantState, parseGrantStatement(statement));
    if (file.timestamp > "20260823110000") {
      const replacementPattern = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+((?:public|private)\.[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\))[\s\S]*?\bSECURITY\s+DEFINER\b[\s\S]*?\bAS\s+\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/gi;
      for (const replacement of source.matchAll(replacementPattern)) {
        if (!/statement_timeout\s*=\s*'5s'/i.test(replacement[0])) unsafeLaterDefinerReplacements.push({ file: file.name, signature: replacement[1].replace(/\s+/g, "").toLowerCase() });
      }
    }
  }
  const grants = [...grantState.values()].sort((left, right) => grantKey(left).localeCompare(grantKey(right)));
  policyDefinitions.sort((left, right) => `${left.table}|${left.name}`.localeCompare(`${right.table}|${right.name}`));
  return { tables, views, functions, functionSignatures, functionOwners, policies, policyDefinitions, viewModes, viewOwners, tableOwners, forceRls, grants, unsafeLaterDefinerReplacements };
}

function checkDataAccessMatrix(root, files, errors) {
  const matrixPath = join(root, "docs", "security", "data-access-matrix.json");
  if (!existsSync(matrixPath)) return;
  let matrix;
  try {
    matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
  } catch (error) {
    errors.push(`data-access-matrix.json: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
    return;
  }
  const inventory = databaseInventory(files);
  for (const replacement of inventory.unsafeLaterDefinerReplacements ?? []) errors.push(`${replacement.file}: later SECURITY DEFINER replacement ${replacement.signature} must pin statement_timeout = '5s'`);
  const listNames = (items) => new Set((items ?? []).map((item) => (typeof item === "string" ? item : item.name).toLowerCase()));
  const tableNames = listNames(matrix.tables);
  const viewNames = listNames(matrix.views);
  const rpcNames = listNames(matrix.rpcs);
  const rpcSignatures = new Set((matrix.rpcs ?? []).map((item) => item.signature?.replace(/\s+/g, "").toLowerCase()).filter(Boolean));
  const internalSignatures = new Set((matrix.internalFunctions ?? []).map((name) => name.replace(/\s+/g, "").toLowerCase()));
  const accountedFunctions = new Set([...rpcNames, ...internalSignatures].map((name) => name.split("(")[0]));
  const accountedSignatures = new Set([...rpcSignatures, ...internalSignatures]);
  const missing = (actual, declared, label) => {
    for (const name of actual) if (!declared.has(name)) errors.push(`data-access-matrix.json: missing ${label} ${name}`);
    for (const name of declared) if (!actual.has(name)) errors.push(`data-access-matrix.json: stale ${label} ${name}`);
  };
  missing(inventory.tables, tableNames, "table");
  missing(inventory.views, viewNames, "view");
  missing(inventory.functions, accountedFunctions, "function/RPC");
  for (const signature of inventory.functionSignatures) if (!accountedSignatures.has(signature)) errors.push(`data-access-matrix.json: missing exact function signature ${signature}`);
  for (const signature of accountedSignatures) if (!inventory.functionSignatures.has(signature)) errors.push(`data-access-matrix.json: stale exact function signature ${signature}`);
  for (const item of matrix.tables ?? []) {
    if (!item.name || !Array.isArray(item.policies) || item.policies.length === 0) errors.push(`data-access-matrix.json: ${item.name ?? "table"} needs explicit policy names`);
    for (const policy of item.policies ?? []) {
      if (!inventory.policies.has(`${item.name.toLowerCase()}:${policy.toLowerCase()}`)) errors.push(`data-access-matrix.json: ${item.name} references missing policy ${policy}`);
    }
    const actualPolicies = [...inventory.policies].filter((policy) => policy.startsWith(`${item.name.toLowerCase()}:`)).map((policy) => policy.slice(item.name.length + 1)).sort();
    const declaredPolicies = [...(item.policies ?? [])].map((policy) => policy.toLowerCase()).sort();
    if (actualPolicies.join("|") !== declaredPolicies.join("|")) errors.push(`data-access-matrix.json: ${item.name} policy drift (actual=${actualPolicies.join(",")}; matrix=${declaredPolicies.join(",")})`);
    const actualOwner = inventory.tableOwners.get(item.name.toLowerCase()) ?? matrix.defaults?.owner ?? "postgres";
    const declaredOwner = item.owner ?? matrix.defaults?.owner;
    if (!declaredOwner) errors.push(`data-access-matrix.json: ${item.name} has no table owner`);
    else if (actualOwner !== declaredOwner) errors.push(`data-access-matrix.json: ${item.name} owner drift (actual=${actualOwner}; matrix=${declaredOwner})`);
    else if (!matrix.roleProfiles?.[declaredOwner]) errors.push(`data-access-matrix.json: ${item.name} owner ${declaredOwner} has no role profile`);
    if (item.forceRls !== true) errors.push(`data-access-matrix.json: ${item.name} must explicitly declare forceRls=true`);
    for (const key of ["apiExposure", "writerOperation"]) if (item[key] === undefined && matrix.defaults?.[key] === undefined) errors.push(`data-access-matrix.json: ${item.name} missing ${key}`);
  }
  for (const item of matrix.views ?? []) {
    const mode = inventory.viewModes.get(item.name.toLowerCase());
    if (!mode) errors.push(`data-access-matrix.json: ${item.name} has no explicit security_invoker/security_barrier source declaration`);
    else if (mode.securityInvoker !== item.securityInvoker || mode.securityBarrier !== item.securityBarrier) errors.push(`data-access-matrix.json: ${item.name} security mode drift (matrix invoker=${item.securityInvoker}, barrier=${item.securityBarrier}; SQL invoker=${mode.securityInvoker}, barrier=${mode.securityBarrier})`);
    const actualOwner = inventory.viewOwners.get(item.name.toLowerCase()) ?? "postgres";
    if (actualOwner !== (item.owner ?? matrix.defaults?.owner)) errors.push(`data-access-matrix.json: ${item.name} owner drift (actual=${actualOwner}; matrix=${item.owner ?? matrix.defaults?.owner})`);
  }
  for (const rpc of matrix.rpcs ?? []) {
    const owner = matrix.roleProfiles?.[rpc.owner];
    if (!owner) errors.push(`data-access-matrix.json: ${rpc.name} owner ${rpc.owner} has no role profile`);
    else if (owner.rolcanlogin || owner.rolbypassrls || ["postgres", "service_role"].includes(rpc.owner)) errors.push(`data-access-matrix.json: ${rpc.name} has unsafe owner ${rpc.owner}`);
    if (!Array.isArray(rpc.readerRoles) || rpc.readerRoles.length === 0) errors.push(`data-access-matrix.json: ${rpc.name} needs explicit reader/execute roles`);
    if (!rpc.signature || !inventory.functionSignatures.has(rpc.signature.replace(/\s+/g, "").toLowerCase())) errors.push(`data-access-matrix.json: ${rpc.name} missing exact live signature`);
    if (rpc.signature && inventory.functionOwners.get(rpc.signature.replace(/\s+/g, "").toLowerCase()) !== rpc.owner) errors.push(`data-access-matrix.json: ${rpc.signature} owner drift`);
  }
  for (const signature of internalSignatures) {
    const owner = inventory.functionOwners.get(signature);
    const profile = owner ? matrix.roleProfiles?.[owner] : undefined;
    if (!owner || !profile) errors.push(`data-access-matrix.json: ${signature} owner ${owner ?? "missing"} has no role profile`);
    else if (profile.rolcanlogin || profile.rolbypassrls || ["postgres", "service_role"].includes(owner)) errors.push(`data-access-matrix.json: internal definer ${signature} has unsafe owner ${owner}`);
  }
  for (const key of ["corsAllowlist", "requestBodyLimit", "turnstile", "secrets", "correlationRedaction", "staticBundle", "credentialBoundary"]) {
    if (!matrix.edgeBoundaryChecklist?.[key]) errors.push(`data-access-matrix.json: missing Edge boundary check ${key}`);
  }
  const grantManifestPath = join(root, matrix.grantManifest ?? "docs/security/grants-manifest.json");
  if (!existsSync(grantManifestPath)) errors.push("data-access-matrix.json: grant manifest is missing");
  else {
    let manifest;
    try { manifest = JSON.parse(readFileSync(grantManifestPath, "utf8")); }
    catch (error) { errors.push(`grants-manifest.json: invalid JSON (${error instanceof Error ? error.message : String(error)})`); }
    const actualGrants = JSON.stringify(inventory.grants ?? []);
    const declaredGrants = JSON.stringify(manifest?.grants ?? []);
    if (actualGrants !== declaredGrants) errors.push(`grant manifest drift (actual=${inventory.grants?.length ?? 0}; matrix=${manifest?.grants?.length ?? 0})`);
    if (matrix.grantCount !== (manifest?.grants?.length ?? 0)) errors.push(`data-access-matrix.json: grantCount drift (matrix=${matrix.grantCount ?? "missing"}; manifest=${manifest?.grants?.length ?? 0})`);
  }
  const policyManifestPath = join(root, matrix.policyManifest ?? "docs/security/policies-manifest.json");
  if (!existsSync(policyManifestPath)) errors.push("data-access-matrix.json: policy manifest is missing");
  else {
    let manifest;
    try { manifest = JSON.parse(readFileSync(policyManifestPath, "utf8")); }
    catch (error) { errors.push(`policies-manifest.json: invalid JSON (${error instanceof Error ? error.message : String(error)})`); }
    const actualPolicies = JSON.stringify(inventory.policyDefinitions ?? []);
    const declaredPolicies = JSON.stringify(manifest?.policies ?? []);
    if (actualPolicies !== declaredPolicies) errors.push(`policy manifest drift (actual=${inventory.policyDefinitions?.length ?? 0}; matrix=${manifest?.policies?.length ?? 0})`);
    if (matrix.policyCount !== (manifest?.policies?.length ?? 0)) errors.push(`data-access-matrix.json: policyCount drift (matrix=${matrix.policyCount ?? "missing"}; manifest=${manifest?.policies?.length ?? 0})`);
  }
  const generatedPath = join(root, matrix.generatedMarkdown ?? "docs/security/data-access-matrix.md");
  if (!existsSync(generatedPath)) errors.push("data-access-matrix.md: generated artifact is missing");
  else if (normalizeLineEndings(readFileSync(generatedPath, "utf8")) !== normalizeLineEndings(renderMatrixMarkdown(matrix))) errors.push("data-access-matrix.md: generated Markdown drift; run node scripts/generate-data-access-matrix.mjs");

  const task13 = files.find((file) => file.name.startsWith("20260823110000_"));
  if (!task13) errors.push("data-access-matrix.json: Task 13 RLS/RPC security migration is missing");
  else {
    const sql = readFileSync(task13.path, "utf8");
    if (!/ALTER\s+DEFAULT\s+PRIVILEGES(?:\s+FOR\s+ROLE\s+postgres)?\s+IN\s+SCHEMA\s+private/i.test(sql)) errors.push("Task 13 migration: private default privileges are not revoked for migration owner");
    if (matrix.migrationOwner !== "postgres" || !/ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+postgres/i.test(sql)) errors.push("Task 13 migration: default privilege owner is not explicitly pinned to postgres");
    if (!/statement_timeout\s*=\s*%L|statement_timeout\s*=\s*'5s'/i.test(sql)) errors.push("Task 13 migration: definer statement_timeout hardening is missing");
    if (!/SET\s+search_path\s*=\s*''''/i.test(sql)) errors.push("Task 13 migration: fixed empty search_path hardening is missing");
    if (!/ALTER\s+TABLE\s+%I\.%I\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql) || !/n\.nspname\s+IN\s*\('public',\s*'private'\)/i.test(sql)) errors.push("Task 13 migration: final public/private FORCE RLS coverage is missing");
    if (!/service_role[\s\S]{0,160}never used as RLS evidence|service_role[\s\S]{0,160}REVOKE/i.test(`${sql}\n${readFileSync(matrixPath, "utf8")}`)) errors.push("Task 13: service_role boundary is undocumented");

    const finalGrants = inventory.grants ?? [];
    const hasGrant = ({ objectName, privilege, grantee, columns = [] }) => finalGrants.some((grant) => grant.objectName === objectName.toLowerCase() && grant.privilege === privilege.toLowerCase() && grant.grantee === grantee.toLowerCase() && (columns.length === 0 || grant.columns.join(",") === columns.map((column) => column.toLowerCase()).sort().join(",")));
    const rpcSignatures = new Set((matrix.rpcs ?? []).map((rpc) => rpc.signature.replace(/\s+/g, "").toLowerCase()));
    const grantedPublicRpcSignatures = new Set();
    for (const grant of finalGrants.filter((candidate) => candidate.objectType === "function" && candidate.objectName.startsWith("public.") && candidate.privilege === "execute")) {
      const signature = grant.objectName.replace(/\s+/g, "").toLowerCase();
      grantedPublicRpcSignatures.add(signature);
      if (!rpcSignatures.has(signature)) errors.push(`Task 13 grant drift: public RPC ${signature} is not in the matrix`);
    }
    for (const rpc of matrix.rpcs ?? []) {
      const signature = rpc.signature.replace(/\s+/g, "").toLowerCase();
      for (const role of rpc.readerRoles ?? []) if (!hasGrant({ objectName: signature, privilege: "execute", grantee: role })) errors.push(`Task 13 grant drift: ${signature} is missing execute role ${role}`);
    }
    for (const signature of rpcSignatures) if (!grantedPublicRpcSignatures.has(signature)) errors.push(`Task 13 grant drift: matrix RPC ${signature} has no final execute grant`);

    const viewNamesByExposure = new Set((matrix.views ?? []).filter((view) => view.readerRoles?.length).map((view) => view.name.toLowerCase()));
    for (const view of matrix.views ?? []) {
      for (const role of view.readerRoles ?? []) {
        const granted = hasGrant({ objectName: view.name, privilege: "select", grantee: role });
        if (!granted) errors.push(`Task 13 grant drift: ${view.name} is missing SELECT grant for ${role}`);
      }
    }
    for (const grant of finalGrants.filter((candidate) => candidate.privilege === "select" && candidate.objectName.startsWith("public.") && candidate.objectName.endsWith("_v"))) {
      if (viewNamesByExposure.has(grant.objectName) === false) errors.push(`Task 13 grant drift: unlisted public view grant ${grant.objectName}`);
    }
    for (const table of matrix.tables ?? []) {
      for (const grant of table.grants ?? []) {
        const arrow = grant.match(/^\s*SELECT\s*->\s*(\w+)\s*$/i);
        if (!arrow) continue;
        if (!hasGrant({ objectName: table.name, privilege: "select", grantee: arrow[1] })) errors.push(`Task 13 grant drift: ${table.name} is missing ${grant}`);
      }
    }
    for (const view of matrix.views ?? []) {
      for (const exception of view.baseGrantException ?? []) {
        const [tableName, columns] = exception.split(":");
        const expectedColumns = columns.replace(/[()\s]/g, "").split(",").filter(Boolean);
        for (const role of view.readerRoles ?? []) if (!hasGrant({ objectName: tableName, privilege: "select", grantee: role, columns: expectedColumns })) errors.push(`Task 13 grant drift: ${view.name} base column exception ${exception} is not granted to ${role}`);
      }
    }
    const matrixTestPath = join(root, "supabase", "tests", "database", "rls_matrix_test.sql");
    if (!existsSync(matrixTestPath)) errors.push("rls_matrix_test.sql: Task 13 executable pgTAP artifact is missing");
    else {
      const matrixTest = readFileSync(matrixTestPath, "utf8");
      for (const marker of ["SELECT plan(", "INSERT INTO auth.users", "SET LOCAL ROLE authenticated", "customer A", "customer B", "guide A", "guide B", "admin summary", "self-escalate", "pg_temp"]) {
        if (!matrixTest.toLowerCase().includes(marker.toLowerCase())) errors.push(`rls_matrix_test.sql: missing row-context marker ${marker}`);
      }
    }
  }
}

export function scanSupabaseArtifacts({ root = process.cwd(), requireSeed = false } = {}) {
  const resolvedRoot = resolve(root);
  const errors = [];
  const files = migrationFiles(resolvedRoot);
  checkMigrationNames(files, errors);
  const databaseTables = new Set();
  const rlsTables = new Set();
  const forceRlsTables = new Set();
  const enforceForceRls = existsSync(join(resolvedRoot, "docs", "security", "data-access-matrix.json"));
  for (const file of files) {
    const facts = checkSqlFile(file, errors);
    facts.tables.forEach((table) => databaseTables.add(table));
    facts.rls.forEach((table) => rlsTables.add(table));
    facts.forceRls.forEach((table) => forceRlsTables.add(table));
  }

  checkDataAccessMatrix(resolvedRoot, files, errors);
  for (const table of databaseTables) {
    if (!rlsTables.has(table)) errors.push(`${table} is missing ENABLE ROW LEVEL SECURITY`);
    if (enforceForceRls && !forceRlsTables.has(table)) errors.push(`${table} is missing FORCE ROW LEVEL SECURITY`);
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
