// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync, symlinkSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { prepareIsolatedSupabaseProject } from '@/scripts/run-runtime-itinerary-e2e.mjs';
import type { RuntimeItineraryPorts } from '@/scripts/run-runtime-itinerary-e2e.mjs';
import { spawnSync } from 'node:child_process';
import { prepareLocalBootstrap } from '@/scripts/lib/local-ci-bootstrap.mjs';
import { runLocalBootstrap } from '@/scripts/local-ci-bootstrap.mjs';
import * as bootstrapCli from '@/scripts/local-ci-bootstrap.mjs';
import { runDbGate } from '@/scripts/run-db-gate.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
it('supplies historical prerequisites before workflow replay without changing source migrations', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'localens-runtime-itinerary-bootstrap-test-'));
  roots.push(root);
  const ports: RuntimeItineraryPorts = {
    api: 56400, database: 56401, shadow: 56402, pooler: 56403,
    studio: 56404, mailpitHttp: 56405, mailpitSmtp: 56406,
    mailpitPop3: 56407, analytics: 56408, inspector: 56409, next: 56410,
  };
  prepareIsolatedSupabaseProject({ cwd: process.cwd(), projectRoot: root, projectId: 'localens-itinerary-bootstrap-test', ports });
  const directory = path.join(root, 'supabase/migrations');
  const files = readdirSync(directory).sort();
  expect(files).toContain('20260905140001_local_ci_manifest.sql');
  expect(files).toContain('20260916073001_local_ci_catalog.sql');
  expect(files.indexOf('20260905140001_local_ci_manifest.sql')).toBeLessThan(files.indexOf('20260916100000_research_demo_workflow.sql'));
  expect(files.indexOf('20260916073001_local_ci_catalog.sql')).toBeLessThan(files.indexOf('20260916100000_research_demo_workflow.sql'));
  for (const name of readdirSync(path.join(process.cwd(), 'supabase/migrations'))) {
    expect(readFileSync(path.join(directory, name))).toEqual(readFileSync(path.join(process.cwd(), 'supabase/migrations', name)));
  }
}, 30000);
it.each([
  ['--linked'], ['--workdir', process.cwd(), 'db', 'reset', '--local'],
  ['--workdir', process.cwd(), 'db', 'push'],
])('rejects unowned or remote invocation before calling Supabase: %j', (...args) => {
  const result = spawnSync(process.execPath, [path.join(process.cwd(), 'scripts/local-ci-bootstrap.mjs'), ...args], { encoding: 'utf8' });
  expect(result.status).toBe(2);
  expect(result.stderr).toMatch(/LOCAL_BOOTSTRAP|REMOTE_MODE_REJECTED/);
});

function target() {
  const root = mkdtempSync(path.join(tmpdir(), 'localens-runtime-itinerary-guard-'));
  roots.push(root);
  mkdirSync(path.join(root, 'supabase/migrations'), { recursive: true });
  writeFileSync(path.join(root, 'supabase/config.toml'), 'project_id = "localens-itinerary-guard"\n[db]\nport = 56401\n');
  for (const name of ['20260905140000_thesis_demo_manifest.sql', '20260916073000_research_demo_catalog.sql']) {
    writeFileSync(path.join(root, 'supabase/migrations', name), 'SELECT 1;');
  }
  prepareLocalBootstrap(root);
  return root;
}

it('rejects a linked target and changed config before any process runs', () => {
  const root = target();
  const options = { probe: () => { throw new Error('unexpected process'); } };
  mkdirSync(path.join(root, 'supabase/.temp'));
  writeFileSync(path.join(root, 'supabase/.temp/project-ref'), 'hosted-ref');
  expect(() => runLocalBootstrap(['--workdir', root, 'start'], options)).toThrow('LOCAL_BOOTSTRAP_UNOWNED_DIRECTORY');
  rmSync(path.join(root, 'supabase/.temp/project-ref'));
  writeFileSync(path.join(root, 'supabase/config.toml'), 'project_id = "hosted"');
  expect(() => runLocalBootstrap(['--workdir', root, 'start'], options)).toThrow('LOCAL_BOOTSTRAP_CONFIG_CHANGED');
});

it.each(['supabase/.temp/linked-project.json', 'supabase/linked-project.json', 'linked-project.json'])('rejects linked marker %s', (marker) => {
  const root = target();
  mkdirSync(path.dirname(path.join(root, marker)), { recursive: true });
  writeFileSync(path.join(root, marker), '{}');
  expect(() => runLocalBootstrap(['--workdir', root, 'start'], { probe: () => { throw new Error('unexpected process'); } })).toThrow('LOCAL_BOOTSTRAP_UNOWNED_DIRECTORY');
});

it.each(['supabase', 'supabase/migrations'])('rejects %s junction escaping the owned directory', (relative) => {
  const root = target();
  const outside = mkdtempSync(path.join(tmpdir(), 'bootstrap-outside-'));
  roots.push(outside);
  const directory = path.join(root, relative);
  cpSync(directory, outside, { recursive: true });
  rmSync(directory, { recursive: true });
  symlinkSync(outside, directory, 'junction');
  expect(() => runLocalBootstrap(['--workdir', root, 'start'], { probe: () => { throw new Error('unexpected process'); } })).toThrow('LOCAL_BOOTSTRAP_PATH_ESCAPE');
});

it('rejects a config file symlink escaping the owned directory', (context) => {
  const root = target();
  const outside = mkdtempSync(path.join(tmpdir(), 'bootstrap-outside-'));
  roots.push(outside);
  const config = path.join(root, 'supabase/config.toml');
  writeFileSync(path.join(outside, 'config.toml'), readFileSync(config));
  rmSync(config);
  try { symlinkSync(path.join(outside, 'config.toml'), config, 'file'); }
  catch (error) {
    if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') {
      context.skip('Windows requires symlink privilege; parent-directory junction escape is tested separately');
      return;
    }
    throw error;
  }
  expect(() => runLocalBootstrap(['--workdir', root, 'start'], { probe: () => { throw new Error('unexpected process'); } })).toThrow('LOCAL_BOOTSTRAP_PATH_ESCAPE');
});

it('propagates CLI failure status through the executable boundary', () => {
  expect(bootstrapCli.runLocalBootstrapMain([], {
    run: () => { throw Object.assign(new Error('CLI failed'), { status: 17 }); }, logger: () => {},
  })).toBe(17);
});

it('rejects remote Docker context and a mismatched container before reset', () => {
  const root = target();
  const args = ['--workdir', root, 'db', 'reset', '--local'];
  expect(() => runLocalBootstrap(args, { env: {}, probe: () => ({ status: 0, stdout: JSON.stringify([{ Endpoints: { docker: { Host: 'ssh://remote' } } }]) }) })).toThrow('REMOTE_DOCKER_REJECTED');
  expect(() => runLocalBootstrap(args, { env: {}, probe: (_command: string, commandArgs: string[]) => ({ status: 0,
    stdout: JSON.stringify(commandArgs[0] === 'context' ? [{ Endpoints: { docker: { Host: 'unix:///var/run/docker.sock' } } }] : [{ Name: '/supabase_db_someone-else' }]) }),
  })).toThrow('CONTAINER_IDENTITY_REJECTED');
});

it('passes only the owned workdir to CLI after checking Docker ownership', () => {
  const root = target();
  const args = ['--workdir', root, 'db', 'reset', '--local'];
  let executed: string[] = [];
  const inspected = { Name: '/supabase_db_localens-itinerary-guard', State: { Running: true },
    Config: { Labels: { 'com.supabase.cli.project': 'localens-itinerary-guard', 'com.supabase.cli.workdir': root } },
    NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '56401' }] } } };
  runLocalBootstrap(args, { env: {}, probe: (_command: string, commandArgs: string[]) => ({ status: 0,
    stdout: JSON.stringify(commandArgs[0] === 'context' ? [{ Endpoints: { docker: { Host: 'unix:///var/run/docker.sock' } } }] : [inspected]) }),
    run: (command: string[]) => { executed = command; return { status: 0 }; },
  });
  expect(executed).toEqual(['--workdir', root, 'db', 'reset', '--local']);
});

it.each([false, true])('gate preserves first failure and removes project only after confirmed stop (stop failure=%s)', async (stopFails) => {
  let disposed = false;
  const calls: string[] = [];
  const original = new Error('bootstrap failure');
  await expect(runDbGate({ cwd: 'C:/repo', platform: 'win32', cliPath: 'C:/repo/node_modules/.bin/supabase.cmd',
    env: {}, prepare: async () => ({ root: 'C:/owned-local', ports: { database: 56401 }, dispose: async () => { disposed = true; } }),
    runner: async (spec: { name: string }) => { calls.push(spec.name); if (spec.name === 'db:start') throw original; return { status: stopFails ? 1 : 0 }; },
  })).rejects.toBe(original);
  expect(calls).toEqual(['db:start', 'db:stop']);
  expect(disposed).toBe(!stopFails);
  if (stopFails) expect(original).toHaveProperty('cleanupError');
});
