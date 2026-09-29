// Regenerate declarations from ordered checked-in SQL; does not connect to a DB.
// This records observed grants, not a security approval. The independent artifact
// gate still rejects unsafe owners, invalid Auth access and missing RLS/timeouts.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { databaseInventory } from './check-supabase-artifacts.mjs';
import { writeMatrixMarkdown } from './generate-data-access-matrix.mjs';

const files = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort()
  .map((name) => ({ name, path: `supabase/migrations/${name}`, timestamp: name.slice(0, 14) }));
const inventory = databaseInventory(files);
const matrixPath = 'docs/security/data-access-matrix.json';
const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
for (const [role, purpose] of Object.entries({
  localens_reviewed_rpc_owner: 'Reviewed prototype booking RPCs; bounded ownership candidate 030000',
  localens_guide_profile_rpc_owner: 'Own-guide profile RPCs; bounded ownership candidate 040000',
  localens_research_persist_rpc_owner: 'Service-only research persistence; bounded ownership candidate 040000',
})) matrix.roleProfiles[role] = {
  rolcanlogin: false, rolbypassrls: false, credential: 'database-definer-owner', bypassJustification: purpose,
};
const oldTables = new Map(matrix.tables.map((item) => [item.name, item]));
matrix.tables = [...inventory.tables].sort().map((name) => ({
  ...(oldTables.get(name) ?? { name, apiExposure: 'RPC-mediated; direct grants subject to RLS',
    writerOperation: 'Existing runtime only; see explicit grant inventory', readerRoles: [], grants: [] }),
  owner: inventory.tableOwners.get(name) ?? matrix.defaults.owner,
  forceRls: inventory.forceRls.has(name),
  policies: [...inventory.policies].filter((key) => key.startsWith(`${name}:`)).map((key) => key.slice(name.length + 1)).sort(),
}));
const publicExec = inventory.grants.filter((grant) => grant.objectType === 'function'
  && grant.objectName.startsWith('public.') && grant.privilege === 'execute');
const rpcSignatures = [...new Set(publicExec.map((grant) => grant.objectName))].sort();
const oldRpcs = new Map(matrix.rpcs.map((item) => [item.signature, item]));
matrix.rpcs = rpcSignatures.map((signature) => ({
  ...(oldRpcs.get(signature) ?? { name: signature.split('(')[0], signature,
    writerOperation: signature === 'public.reviewed_demo_expire()' ? 'Internal scheduled maintenance only' : 'Existing runtime operation; API unchanged',
    credential: signature === 'public.reviewed_demo_expire()' ? 'migration-maintenance-only' : 'existing-runtime-credentials' }),
  owner: inventory.functionOwners.get(signature),
  readerRoles: [...new Set(publicExec.filter((grant) => grant.objectName === signature).map((grant) => grant.grantee))].sort(),
}));
matrix.internalFunctions = [...inventory.functionSignatures].filter((signature) => !rpcSignatures.includes(signature)).sort();
matrix.invokerFunctions = matrix.internalFunctions.filter((signature) => inventory.functionSecurity.get(signature) === 'invoker');
matrix.grantCount = inventory.grants.length;
matrix.policyCount = inventory.policyDefinitions.length;
writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`);
for (const [path, key, value] of [
  [matrix.grantManifest, 'grants', inventory.grants],
  [matrix.policyManifest, 'policies', inventory.policyDefinitions],
]) {
  const document = JSON.parse(readFileSync(path, 'utf8'));
  document[key] = value;
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
}
writeMatrixMarkdown({ matrix });
console.log(`Recorded ${matrix.tables.length} tables, ${matrix.rpcs.length} RPC signatures, ${matrix.internalFunctions.length} internal functions. Run the independent gate and local SQL tests before approval.`);
