import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { databaseInventory, migrationFiles } from "./check-supabase-artifacts.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const matrixPath = resolve(root, "docs/security/data-access-matrix.json");
const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
const inventory = databaseInventory(migrationFiles(root));
const policiesByTable = new Map();
for (const qualifiedPolicy of inventory.policies) {
  const separator = qualifiedPolicy.indexOf(":");
  const table = qualifiedPolicy.slice(0, separator);
  const policy = qualifiedPolicy.slice(separator + 1);
  const policies = policiesByTable.get(table) ?? new Set();
  policies.add(policy);
  policiesByTable.set(table, policies);
}
for (const table of matrix.tables) {
  table.owner = table.owner ?? matrix.defaults?.owner ?? "postgres";
  table.forceRls = table.forceRls ?? matrix.defaults?.forceRls ?? true;
  table.policies = [...(policiesByTable.get(table.name.toLowerCase()) ?? [])].sort();
}
matrix.grantManifest = "docs/security/grants-manifest.json";
matrix.grantCount = inventory.grants.length;
matrix.policyManifest = "docs/security/policies-manifest.json";
matrix.policyCount = inventory.policyDefinitions.length;
writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`, "utf8");
writeFileSync(resolve(root, matrix.grantManifest), `${JSON.stringify({
  version: 1,
  source: "Final explicit GRANT/REVOKE state derived from ordered Supabase migrations; dynamic RLS policies are enumerated in data-access-matrix.json.",
  grants: inventory.grants,
}, null, 2)}\n`, "utf8");
writeFileSync(resolve(root, matrix.policyManifest), `${JSON.stringify({
  version: 1,
  source: "Dynamic catalog/tour owner policies expanded from ordered migration arrays; semantics are compared against the SQL template.",
  policies: inventory.policyDefinitions,
}, null, 2)}\n`, "utf8");
