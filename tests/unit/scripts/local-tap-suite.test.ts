// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { prepareIsolatedSupabaseProject } from '@/scripts/run-runtime-itinerary-e2e.mjs';
import { runDbGate } from '@/scripts/run-db-gate.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
it('prepares all 27 executable suites without baseline setup or candidate replay', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'localens-runtime-itinerary-selected-'));
  roots.push(root);
  prepareIsolatedSupabaseProject({ cwd: process.cwd(), projectRoot: root, projectId: 'localens-itinerary-selected',
    ports: { api: 56400, database: 56401, shadow: 56402, pooler: 56403, studio: 56404, mailpitHttp: 56405, mailpitSmtp: 56406, mailpitPop3: 56407, analytics: 56408, inspector: 56409, next: 56410 } });
  const selected = path.join(root, 'supabase/tests-selected');
  let files: string[] = [];
  try { files = readdirSync(selected); } catch { /* Missing selection is the regression. */ }
  const standalone = readdirSync('supabase/tests/database').filter((name) => name.endsWith('_test.sql'));
  expect(files.sort()).toEqual([...standalone, 'remaining-runtime-permissions.sql', 'research_permissions_test.sql', 'research_deadline_integration_test.sql', 'research_booking_cancellation_test.sql'].sort());
  for (const name of standalone) expect(readFileSync(path.join(selected, name))).toEqual(readFileSync(path.join('supabase/tests/database', name)));
  for (const name of files.filter((name) => !standalone.includes(name))) {
    const sql = readFileSync(path.join(selected, name), 'utf8');
    expect(sql.startsWith('BEGIN;\n')).toBe(true);
    expect(sql.endsWith('\nROLLBACK;\n')).toBe(true);
    expect(sql).toContain(readFileSync('supabase/tests/research/fixtures.sql', 'utf8'));
    const source = readFileSync(path.join('supabase/tests', name === 'remaining-runtime-permissions.sql' ? 'database' : 'research', name), 'utf8');
    if (name !== 'research_booking_cancellation_test.sql') expect(sql).toContain(source);
    else {
      expect(sql).toContain('research_fixture_current');
      expect(sql).toContain('DELETE FROM private.user_roles WHERE user_id IN (SELECT id FROM test_actors);');
      expect(sql).toContain(source.slice(source.indexOf('SELECT * FROM finish()')));
    }
    expect(sql).not.toContain('CREATE ROLE');
  }
}, 30000);

it('DB gate explicitly selects only the prepared suite directory', async () => {
  let args: string[] = [];
  await runDbGate({ cwd: 'C:/repo', platform: 'win32', cliPath: 'C:/repo/node_modules/.bin/supabase.cmd', env: {},
    prepare: async () => ({ root: 'C:/owned-local', ports: { database: 56401 }, dispose: async () => {} }),
    runner: async (spec: { name: string; localArgs: string[] }) => { if (spec.name === 'db:test') args = spec.localArgs; return { status: 0 }; },
  });
  expect(args).toEqual(['--workdir', 'C:/owned-local', 'test', 'db', '--local', path.join('C:/owned-local', 'supabase/tests-selected')]);
});
