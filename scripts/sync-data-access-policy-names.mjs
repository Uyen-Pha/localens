import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { databaseInventory, migrationFiles } from "./check-supabase-artifacts.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const matrixPath = resolve(root, "docs/security/data-access-matrix.json");
const migrationDir = resolve(root, "supabase/migrations");
const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
const policiesByTable = new Map();
for (const file of readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort()) {
  const source = readFileSync(resolve(migrationDir, file), "utf8");
  for (const match of source.matchAll(/\bCREATE\s+POLICY\s+([A-Za-z_][A-Za-z0-9_]*)\s+ON\s+((?:public|private)\.[A-Za-z_][A-Za-z0-9_]*)/gi)) {
    const table = match[2].toLowerCase();
    const policies = policiesByTable.get(table) ?? new Set();
    policies.add(match[1]);
    policiesByTable.set(table, policies);
  }
  for (const match of source.matchAll(/FOREACH\s+\w+\s+IN\s+ARRAY\s+ARRAY\[([\s\S]*?)\][\s\S]*?EXECUTE\s+format\(\s*'CREATE\s+POLICY\s+([A-Za-z_][A-Za-z0-9_]*)\s+ON\s+(public|private)\.%I[\s\S]*?\s+TO\s+([A-Za-z_][A-Za-z0-9_]*)/gi)) {
    for (const tableMatch of match[1].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)) {
      const table = `${match[3].toLowerCase()}.${tableMatch[1].toLowerCase()}`;
      const policies = policiesByTable.get(table) ?? new Set();
      policies.add(match[2]);
      policiesByTable.set(table, policies);
    }
  }
}
const inventory = databaseInventory(migrationFiles(root));
for (const table of matrix.tables) {
  table.owner = table.owner ?? matrix.defaults?.owner ?? "postgres";
  table.policies = [...(policiesByTable.get(table.name.toLowerCase()) ?? [])].sort();
}
matrix.grantManifest = "docs/security/grants-manifest.json";
matrix.grantCount = inventory.grants.length;
writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`, "utf8");
writeFileSync(resolve(root, matrix.grantManifest), `${JSON.stringify({
  version: 1,
  source: "Final explicit GRANT/REVOKE state derived from ordered Supabase migrations; dynamic RLS policies are enumerated in data-access-matrix.json.",
  grants: inventory.grants,
}, null, 2)}\n`, "utf8");
