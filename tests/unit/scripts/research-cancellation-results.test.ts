// @vitest-environment node
import { describe, expect, it } from 'vitest';
// @ts-expect-error Executable JavaScript harness is tested through its pure boundaries.
import { assertTapResults, assertSnapshotEqual } from '@/scripts/test-research-cancellation-local.mjs';

const rows = (...values: string[]) => [{ rows: values.map((value) => ({ result: value })) }];
describe('research result validation', () => {
  it('accepts complete passing TAP', () => {
    expect(assertTapResults(rows('ok 1 - one', 'ok 2 - two', '1..2'))).toHaveLength(3);
  });
  it.each([
    ['not ok 1 - missing RPC', '1..1'],
    ['ok 1 - first', '1..2'],
    ['ok 1 - first'],
    ['1..0'],
    ['ok 1 - first', 'ok 1 - duplicate', '1..2'],
    ['ok 1 - first', 'Bail out! failure', '1..1'],
  ])('rejects failed or incomplete TAP %j', (...lines) => {
    expect(() => assertTapResults(rows(...lines))).toThrow('RESEARCH_TAP_FAILED');
  });
  it('compares all stored business fields independent of object key order', () => {
    expect(() => assertSnapshotEqual({ bookings: [{ amount: 100, paid_at: null }] },
      { bookings: [{ paid_at: null, amount: 100 }] })).not.toThrow();
  });
  it.each([
    { bookings: [{ amount: 99, paid_at: null }] },
    { bookings: [{ amount: 100, paid_at: 'changed' }] },
    { bookings: [] },
  ])('rejects any upgrade mutation or missing row', (after) => {
    expect(() => assertSnapshotEqual({ bookings: [{ amount: 100, paid_at: null }] }, after)).toThrow('UPGRADE_DATA_CHANGED');
  });
});
