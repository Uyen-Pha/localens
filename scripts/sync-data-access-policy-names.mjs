import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
}
for (const table of matrix.tables) table.policies = [...(policiesByTable.get(table.name.toLowerCase()) ?? [])].sort();
writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`, "utf8");
