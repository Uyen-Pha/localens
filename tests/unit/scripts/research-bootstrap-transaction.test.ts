// @vitest-environment node
import { expect, it } from 'vitest';
// @ts-expect-error Executable test harness module.
import { bootstrapBody } from '@/scripts/lib/research-bootstrap-transaction.mjs';

it('keeps migration commits under harness ownership while preserving function bodies', () => {
  expect(bootstrapBody('BEGIN; SELECT 1; COMMIT;')).toHaveLength(1);
  expect(bootstrapBody('SELECT 1;')).toHaveLength(1);
  expect(bootstrapBody('DO $$ BEGIN PERFORM 1; END $$;')).toHaveLength(1);
  expect(() => bootstrapBody('BEGIN; SELECT 1; COMMIT; SELECT 2; COMMIT;')).toThrow();
  expect(() => bootstrapBody('SELECT 1; COMMIT;')).toThrow();
});
