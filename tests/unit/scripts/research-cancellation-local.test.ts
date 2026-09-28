// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Executable JavaScript harness boundaries are covered by focused tests.
import * as harness from '@/scripts/test-research-cancellation-local.mjs';

const script = path.resolve('scripts/test-research-cancellation-local.mjs');
const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

describe('research baseline local harness', () => {
  it('stops before installation when the original definer owner cannot bypass forced RLS', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ owner: 'postgres', rolsuper: false, rolbypassrls: false }] });
    await expect(harness.assertOriginalOwnerCapability({ query })).rejects.toThrow('MISSING_SOURCE_DEPENDENCY');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/^SELECT /);
  });

  it('accepts the original postgres BYPASSRLS capability without requiring superuser', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ owner: 'postgres', rolsuper: false, rolbypassrls: true }] });
    await expect(harness.assertOriginalOwnerCapability({ query })).resolves.toBeUndefined();
  });
  it.each(['tcp://198.51.100.10:2375', 'ssh://remote.example', 'npipe:////remote/pipe/docker_engine'])(
    'rejects a nonlocal Docker endpoint %s', async (endpoint) => {
      expect(() => harness.assertLocalDockerEndpoint(endpoint)).toThrow('REMOTE_DOCKER_REJECTED');
    },
  );

  it.each(['public.research_demo_booking(uuid,boolean)', 'public.research_demo_checkout(uuid,jsonb)'])(
    'fails closed when required RPC %s is missing', async (missing) => {
      const available = harness.REQUIRED_RPCS.filter((signature: string) => signature !== missing);
      expect(() => harness.assertRequiredRpcs(available)).toThrow(`MISSING_RPC: ${missing}`);
    },
  );

  it('rejects an occupied database using only a read query, without a reset or delete', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ occupied: true }] });
    await expect(harness.assertEmptyDatabase({ query })).rejects.toThrow('NONEMPTY_DATABASE_REJECTED');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/^SELECT /);
    expect(query.mock.calls[0][0]).not.toMatch(/\b(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/i);
  });

  it('rejects an old container or mismatched port even if its name resembles the new project', async () => {
    const target = { projectId: 'localens-research-baseline-test', dbPort: 55442, workdir: process.cwd() };
    const container = { Name: '/supabase_db_localens-research-baseline-test', State: { Running: true }, Config: { Labels: { 'com.supabase.cli.project': 'localens-old', 'com.supabase.cli.workdir': process.cwd() } }, NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55442' }] } } };
    expect(() => harness.assertContainer(target, container)).toThrow('CONTAINER_IDENTITY_REJECTED');
    container.Config.Labels['com.supabase.cli.project'] = target.projectId;
    container.NetworkSettings.Ports['5432/tcp'][0].HostPort = '55422';
    expect(() => harness.assertContainer(target, container)).toThrow('CONTAINER_PORT_REJECTED');
    container.NetworkSettings.Ports['5432/tcp'][0].HostPort = '55442';
    expect(() => harness.assertContainer(target, container)).not.toThrow();
  });

  it('recognizes the CLI 40-character ID while retaining ownership, workdir and port checks', () => {
    const target = { projectId: 'localens-research-baseline-7c927fcb-791d-4c86-8769-001f4bf6a507', dbPort: 55442, workdir: process.cwd() };
    const container = { Name: '/supabase_db_localens-research-baseline-7c927fcb-791d', State: { Running: true }, Config: { Labels: { 'com.supabase.cli.project': 'localens-research-baseline-7c927fcb-791d', 'com.supabase.cli.workdir': process.cwd() } }, NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55442' }] } } };
    expect(harness.containerName(target)).toBe('supabase_db_localens-research-baseline-7c927fcb-791d');
    expect(() => harness.assertContainer(target, container)).not.toThrow();
    container.Config.Labels['com.supabase.cli.workdir'] = path.dirname(process.cwd());
    expect(() => harness.assertContainer(target, container)).toThrow('CONTAINER_WORKDIR_REJECTED');
  });

  it('rejects tampered SQL before any database execution', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'research-hash-'));
    cpSync(path.resolve('supabase/tests/fixtures/research-baseline'), dir, { recursive: true });
    writeFileSync(path.join(dir, '20260924180000_research_quote_checkout.sql'), '-- changed');
    expect(() => harness.loadInventory(dir)).toThrow('FIXTURE_HASH_MISMATCH');
  });
  it.each(['https://example.supabase.co', 'postgres://postgres:secret@example.com/postgres', '//server/share', 'relative/path'])(
    'rejects nonlocal or relative workdir %s without exposing credentials', (workdir) => {
      const result = run('--workdir', workdir);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('LOCAL_DIRECTORY_REQUIRED');
      expect(result.stderr).not.toContain('secret');
    },
  );

  it.each(['--db-url', '--remote', '--reset', '--linked', '--project-ref'])(
    'rejects unsupported potentially destructive option %s', (option) => {
      const result = run(option, 'postgres://secret@remote/db');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('ARGUMENT_REJECTED');
      expect(result.stderr).not.toContain('secret');
    },
  );

  it('refuses an existing directory during prepare and leaves its contents intact', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'research-existing-'));
    const before = readdirSync(dir);
    const result = run('--workdir', dir, '--prepare');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('EXISTING_DIRECTORY_REJECTED');
    expect(readdirSync(dir)).toEqual(before);
  });

  it('refuses the current old stack before trying any database command', () => {
    const result = run('--workdir', process.cwd(), '--apply');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('UNOWNED_PROJECT_REJECTED');
  });

  it('prepares an isolated config and inventories hashes offline without resetting or starting anything', () => {
    const parent = mkdtempSync(path.join(tmpdir(), 'research-prepare-'));
    const dir = path.join(parent, 'new');
    const prepared = run('--workdir', dir, '--prepare');
    expect(prepared.status, prepared.stderr).toBe(0);
    const config = readFileSync(path.join(dir, 'supabase/config.toml'), 'utf8');
    expect(config).toMatch(/project_id = "localens-research-baseline-[a-f0-9-]+"/);
    expect(config).toContain('port = 55441');
    expect(config).toContain('port = 55442');
    expect(config).toContain('shadow_port = 55440');
    const before = readdirSync(dir);
    const inventory = run('--workdir', dir);
    expect(inventory.status, inventory.stderr).toBe(0);
    const result = JSON.parse(inventory.stdout);
    expect(result.schemas).toEqual(['auth', 'public', 'private']);
    expect(result.files.length).toBeGreaterThan(3);
    expect(result.files.every((file: { sha256: string }) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    expect(result.requiredRpcs).toContain('public.research_demo_booking(uuid,boolean)');
    expect(result.requiredRpcs).toContain('public.research_demo_checkout(uuid,jsonb)');
    expect(readdirSync(dir)).toEqual(before);
    expect(run('--workdir', dir, '--prepare').status).toBe(2);
  });
});
