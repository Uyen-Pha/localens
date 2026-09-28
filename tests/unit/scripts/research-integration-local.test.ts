// @vitest-environment node
import { describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript CLI contracts are covered here.
import { parseIntegrationArgs, assertOriginalRows } from '@/scripts/test-research-integration-local.mjs';

describe('local research integration guard', () => {
  it('accepts only an explicit existing local target, never a hosted URL', () => {
    expect(parseIntegrationArgs(['--workdir', 'D:/LocalLensSqlAudit/20260928-research-baseline']).red).toBe(false);
    expect(() => parseIntegrationArgs(['--workdir', 'https://host.example'])).toThrow();
    expect(() => parseIntegrationArgs(['--workdir', 'D:/local', '--apply'])).toThrow();
    expect(() => parseIntegrationArgs([])).toThrow();
  });

  it('allows a diagnostic red run but not duplicate or unknown options', () => {
    expect(parseIntegrationArgs(['--workdir', 'D:/local', '--red']).red).toBe(true);
    expect(() => parseIntegrationArgs(['--workdir', 'D:/local', '--red', '--red'])).toThrow();
  });

  it('fails on changed, inserted or removed legacy rows', () => {
    const original = { bookings: [{ id: 'a', status: 'confirmed', amount: '100' }] };
    expect(() => assertOriginalRows(original, structuredClone(original))).not.toThrow();
    expect(() => assertOriginalRows(original, { bookings: [{ id: 'a', status: 'cancelled', amount: '100' }] })).toThrow('INTEGRATION_DATA_CHANGED');
    expect(() => assertOriginalRows(original, { bookings: [] })).toThrow('INTEGRATION_DATA_CHANGED');
    expect(() => assertOriginalRows(original, { bookings: [...original.bookings, { id: 'b' }] })).toThrow('INTEGRATION_DATA_CHANGED');
  });
});
