import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MARKER = '.local-ci-bootstrap.json';
const hash = (value) => createHash('sha256').update(value).digest('hex');

export function assertBootstrapDirectory(root) {
  const canonical = realpathSync(root);
  const assertNoLinks = (entry) => {
    const info = lstatSync(entry, { throwIfNoEntry: false });
    if (!info) return;
    if (info.isSymbolicLink()) throw new Error('LOCAL_BOOTSTRAP_PATH_ESCAPE');
    const relative = path.relative(canonical, realpathSync(entry));
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('LOCAL_BOOTSTRAP_PATH_ESCAPE');
    if (info.isDirectory()) for (const name of readdirSync(entry)) assertNoLinks(path.join(entry, name));
  };
  if (lstatSync(root).isSymbolicLink()) throw new Error('LOCAL_BOOTSTRAP_PATH_ESCAPE');
  if (path.dirname(canonical) !== realpathSync(tmpdir())
    || !path.basename(canonical).startsWith('localens-runtime-itinerary-')
    || ['supabase/.temp/project-ref', 'supabase/.temp/linked-project.json', 'supabase/linked-project.json', 'linked-project.json']
      .some((name) => lstatSync(path.join(canonical, name), { throwIfNoEntry: false }))) {
    throw new Error('LOCAL_BOOTSTRAP_UNOWNED_DIRECTORY');
  }
  assertNoLinks(path.join(canonical, 'supabase'));
  assertNoLinks(path.join(canonical, MARKER));
  return canonical;
}

// These are disposable local fixtures, never additions to the hosted migration
// chain. Keeping them as separate CLI steps preserves historical SQL and the
// CLI's own migration tracking and reset semantics.
export function prepareLocalBootstrap(root) {
  const canonical = assertBootstrapDirectory(root);
  const config = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
  const projectId = config.match(/^project_id\s*=\s*"(localens-itinerary-[a-z0-9-]+)"\s*$/m)?.[1];
  const dbSection = config.match(/^\[db\]\s*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1];
  const port = Number(dbSection?.match(/^port\s*=\s*(\d+)\s*$/m)?.[1]);
  if (!projectId || projectId.length > 40 || !Number.isInteger(port) || port < 1024 || port > 65535 || port === 54322) {
    throw new Error('LOCAL_BOOTSTRAP_CONFIG_REJECTED');
  }
  const directory = path.join(root, 'supabase/migrations');
  for (const name of ['20260905140000_thesis_demo_manifest.sql', '20260916073000_research_demo_catalog.sql']) {
    if (!existsSync(path.join(directory, name))) throw new Error('LOCAL_BOOTSTRAP_PREREQUISITE_MISSING');
  }
  writeFileSync(path.join(directory, '20260905140001_local_ci_manifest.sql'), `
-- Disposable local CI prerequisite; never deploy this fixture.
BEGIN;
INSERT INTO private.thesis_demo_manifest(project_ref,environment,dataset_version,seed_base_date)
VALUES ('twsdtfotrkljgbfsrmgz','thesis-demo','local-research-baseline-v1',current_date);
COMMIT;
`, { flag: 'wx' });
  writeFileSync(path.join(directory, '20260916073001_local_ci_catalog.sql'), `
-- Disposable local CI prerequisite; never deploy this fixture.
BEGIN;
INSERT INTO private.research_demo_catalog_versions(version,source_version,mapping_version,dataset,place_map)
VALUES ('local-research-baseline-v1','local-fixture-v1','local-map-v1',
'{"dataMode":"internal_simulation","realBookingEnabled":false,"schemaVersion":"local-fixture-v1"}',
'{"LL-R01":"11111111-1111-4111-8111-111111111111"}');
COMMIT;
`, { flag: 'wx' });
  writeFileSync(path.join(root, MARKER), JSON.stringify({ root: canonical, projectId, port, configHash: hash(config) }), { flag: 'wx' });
}

export function assertLocalBootstrap(root) {
  const canonical = assertBootstrapDirectory(root);
  const marker = JSON.parse(readFileSync(path.join(root, MARKER), 'utf8'));
  const config = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
  if (marker.root !== canonical || marker.configHash !== hash(config)) throw new Error('LOCAL_BOOTSTRAP_CONFIG_CHANGED');
  return marker;
}
