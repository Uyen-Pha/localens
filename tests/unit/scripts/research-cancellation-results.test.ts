// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error Reuse the unchanged release inventory validator.
import { databaseInventory } from '@/scripts/check-supabase-artifacts.mjs';
// @ts-expect-error Executable JavaScript harness is tested through its pure boundaries.
import { assertTapResults, assertSnapshotEqual, extractMigrationTransaction, parseArgs } from '@/scripts/test-research-cancellation-local.mjs';

const rows = (...values: string[]) => [{ rows: values.map((value) => ({ result: value })) }];
describe('research migration transaction boundary', () => {
  it('validates the actual migration wrapper and release timeout contract', () => {
    const source = readFileSync('supabase/migrations/20260928230000_research_booking_cancellation.sql', 'utf8');
    expect(extractMigrationTransaction(source).length).toBeGreaterThan(10);
    const inventory = databaseInventory([{ name: 'research.sql', timestamp: '20260928230000', path: 'supabase/migrations/20260928230000_research_booking_cancellation.sql' }]);
    expect(inventory.unsafeLaterDefinerReplacements).toEqual([]);
  });
  it('extracts only outer control and preserves procedural bodies and quoted semicolons', () => {
    const body = "\nDO $x$ BEGIN PERFORM 'COMMIT;'; BEGIN NULL; END; END $x$;\nSELECT 'ROLLBACK;', E'a\\\'b;', \"BEGIN;\";\n";
    expect(extractMigrationTransaction(`/* BEGIN; /* nested */ */ BEGIN;${body}COMMIT; -- end`)).toEqual([
      "\nDO $x$ BEGIN PERFORM 'COMMIT;'; BEGIN NULL; END; END $x$;",
      "\nSELECT 'ROLLBACK;', E'a\\\'b;', \"BEGIN;\";",
    ]);
  });
  it.each(['BEGIN', 'START TRANSACTION', 'COMMIT', 'COMMIT AND CHAIN', 'END', 'ABORT', 'ROLLBACK', 'ROLLBACK TO s', 'SAVEPOINT s', 'RELEASE s', "PREPARE TRANSACTION 'x'", 'SET TRANSACTION READ ONLY', 'SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY'])('rejects nested transaction control %s', (control) => {
    expect(() => extractMigrationTransaction(`BEGIN; SELECT 1; ${control}; COMMIT;`)).toThrow('MIGRATION_TRANSACTION_CONTROL_REJECTED');
  });
  it.each(['SELECT 1;', 'BEGIN; SELECT 1;', 'SELECT 1; COMMIT;', 'BEGIN; SELECT 1; COMMIT; SELECT 2;', 'BEGIN; SELECT 1; COMMIT', "BEGIN; SELECT 'unterminated; COMMIT;", 'BEGIN; DO $$ BEGIN NULL; END; COMMIT;', 'BEGIN; SELECT 1; /* unterminated'])('rejects missing, malformed or misplaced outer wrapper %s', (sql) => {
    expect(() => extractMigrationTransaction(sql)).toThrow('MIGRATION_WRAPPER_REJECTED');
  });
  it('accepts guarded atomicity mode without permitting combined modes', () => {
    expect(parseArgs(['--workdir', 'D:/LocalLensSqlAudit/20260928-research-baseline', '--atomicity-test']).mode).toBe('atomicity-test');
    expect(() => parseArgs(['--workdir', 'D:/LocalLensSqlAudit/20260928-research-baseline', '--atomicity-test', '--upgrade'])).toThrow('ARGUMENT_REJECTED');
  });
});
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
