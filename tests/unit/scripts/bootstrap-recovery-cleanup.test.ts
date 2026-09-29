// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { runDbGate } from '@/scripts/run-db-gate.mjs';
import { runRuntimeItineraryE2E } from '@/scripts/run-runtime-itinerary-e2e.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function project(recovery: boolean) {
  const root = mkdtempSync(path.join(tmpdir(), 'localens-runtime-itinerary-recovery-'));
  roots.push(root);
  const staged = path.join(root, 'supabase/.local-bootstrap-migrations');
  mkdirSync(path.join(root, 'supabase'), { recursive: true });
  if (recovery) {
    mkdirSync(staged);
    writeFileSync(path.join(staged, 'original.sql'), 'SELECT 1;');
  }
  return { root, staged };
}

it.each([true, false])('DB gate preserves recovery=%s after a failed child and successful stop', async (recovery) => {
  const { root, staged } = project(recovery);
  const original = Object.assign(new Error('child failed'), { status: 17 });
  const calls: string[] = [];
  await expect(runDbGate({
    cwd: 'C:/repo', platform: 'win32', cliPath: 'C:/repo/node_modules/.bin/supabase.cmd', env: {},
    prepare: async () => ({ root, ports: { database: 56401 }, dispose: async () => rmSync(root, { recursive: true, force: true }) }),
    runner: async (spec: { name: string }) => { calls.push(spec.name); if (spec.name === 'db:start') throw original; return { status: 0 }; },
  })).rejects.toBe(original);
  expect(calls).toEqual(['db:start', 'db:stop']);
  expect(original.status).toBe(17);
  expect(existsSync(root)).toBe(recovery);
  if (recovery) {
    expect(original).toHaveProperty('cleanupError.recoveryDirectory', staged);
    expect(readFileSync(path.join(staged, 'original.sql'), 'utf8')).toBe('SELECT 1;');
  }
});

it('DB gate fails closed on a dangling recovery junction', async () => {
  const { root, staged } = project(false);
  symlinkSync(path.join(root, 'missing'), staged, 'junction');
  await expect(runDbGate({
    cwd: 'C:/repo', platform: 'win32', cliPath: 'C:/repo/node_modules/.bin/supabase.cmd', env: {},
    prepare: async () => ({ root, ports: { database: 56401 }, dispose: async () => rmSync(root, { recursive: true, force: true }) }),
    runner: async () => ({ status: 0 }),
  })).rejects.toMatchObject({ recoveryDirectory: staged });
  expect(existsSync(root)).toBe(true);
});

it.each([true, false])('runtime default cleanup preserves recovery=%s without replacing the step failure', async (recovery) => {
  const { root, staged } = project(recovery);
  const logs: string[] = [];
  const calls: string[] = [];
  await expect(runRuntimeItineraryE2E({
    cwd: process.cwd(), env: {}, prepareDocker: () => {}, requirePinnedCli: () => 'supabase',
    containerHost: 'host.docker.internal',
    reservePorts: async () => ({ ports: { database: 56401 }, release: async () => {} }),
    prepareProject: () => ({ root, projectId: 'localens-itinerary-recovery', ports: { database: 56401 } }),
    runStep: async (spec: { name: string }) => { calls.push(spec.name); return { status: spec.name === 'db:start' ? 17 : 0 }; },
    logger: (line: string) => logs.push(line),
  })).rejects.toMatchObject({ status: 17 });
  expect(calls).toEqual(['db:start', 'db:start', 'db:stop']);
  expect(existsSync(root)).toBe(recovery);
  if (recovery) {
    expect(logs.some((line) => line.includes(staged))).toBe(true);
    expect(readFileSync(path.join(staged, 'original.sql'), 'utf8')).toBe('SELECT 1;');
  }
});
