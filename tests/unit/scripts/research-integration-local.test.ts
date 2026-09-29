// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
// @ts-expect-error JavaScript CLI contracts are covered here.
import { parseIntegrationArgs, assertOriginalRows } from '@/scripts/test-research-integration-local.mjs';

describe('local research integration guard', () => {
  const workdir = resolve('local-research-argument-fixture');
  it('accepts only an explicit absolute local target, never a hosted URL', () => {
    expect(parseIntegrationArgs(['--workdir', workdir])).toEqual({ workdir, red: false });
    expect(() => parseIntegrationArgs(['--workdir', 'https://host.example'])).toThrow();
    expect(() => parseIntegrationArgs(['--workdir', 'relative/local'])).toThrow('LOCAL_DIRECTORY_REQUIRED');
    expect(() => parseIntegrationArgs(['--workdir', workdir, '--apply'])).toThrow();
    expect(() => parseIntegrationArgs([])).toThrow();
  });

  it('allows a diagnostic red run but not duplicate or unknown options', () => {
    expect(parseIntegrationArgs(['--workdir', workdir, '--red']).red).toBe(true);
    expect(() => parseIntegrationArgs(['--workdir', workdir, '--red', '--red'])).toThrow();
  });

  it('fails on changed, inserted or removed legacy rows', () => {
    const original = { bookings: [{ id: 'a', status: 'confirmed', amount: '100' }] };
    expect(() => assertOriginalRows(original, structuredClone(original))).not.toThrow();
    expect(() => assertOriginalRows(original, { bookings: [{ id: 'a', status: 'cancelled', amount: '100' }] })).toThrow('INTEGRATION_DATA_CHANGED');
    expect(() => assertOriginalRows(original, { bookings: [] })).toThrow('INTEGRATION_DATA_CHANGED');
    expect(() => assertOriginalRows(original, { bookings: [...original.bookings, { id: 'b' }] })).toThrow('INTEGRATION_DATA_CHANGED');
  });
});
