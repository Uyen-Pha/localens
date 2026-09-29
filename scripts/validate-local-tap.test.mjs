import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateLocalTap} from './validate-local-tap.mjs';

test('accepts a completed upfront plan in aligned psql output', () => {
  assert.deepEqual(validateLocalTap('BEGIN\n plan\n------\n 1..2\n(1 row)\n ok 1 - first\n ok 2 - second\n finish\n--------\n(0 rows)\nROLLBACK\n', 2), {total: 2, passed: 2, skipped: 0, todo: 0, directives: []});
});
test('accepts no_plan with its final plan emitted by finish', () => {
  assert.deepEqual(validateLocalTap('BEGIN\n ok 1 - first\n ok 2 - second\n 1..2\n(1 row)\nROLLBACK\n', 2), {total: 2, passed: 2, skipped: 0, todo: 0, directives: []});
});
test('counts pgTAP SKIP results without a description dash toward the plan', () => {
  assert.deepEqual(validateLocalTap('BEGIN\nok 1 - first\nok 2 # SKIP historical fixture unavailable\n1..2\nROLLBACK\n', 2), {total: 2, passed: 1, skipped: 1, todo: 0, directives: ['SKIP 2: historical fixture unavailable']});
});
test('reports TODO separately even when its assertion is ok', () => {
  assert.deepEqual(validateLocalTap('BEGIN\n1..2\nok 1 - first\nok 2 - pending # TODO pending coverage\nROLLBACK\n', 2), {total: 2, passed: 1, skipped: 0, todo: 1, directives: ['TODO 2: pending coverage']});
});
test('counts failing TODO separately without masking a real failure', () => {
  const output = 'BEGIN\n1..2\nok 1 - first\nnot ok 2 - pending # TODO pending coverage\nROLLBACK\n';
  assert.deepEqual(validateLocalTap(output, 2), {total: 2, passed: 1, skipped: 0, todo: 1, directives: ['TODO 2: pending coverage']});
  assert.throws(() => validateLocalTap(output.replace('ok 1 - first', 'not ok 1 - first'), 2));
});
for (const output of [
  'BEGIN\n1..1\nok 1 - check\nCOMMIT\nROLLBACK\n',
  '1..1\nok 1 - check\nROLLBACK\n',
  '1..1\nBEGIN\nok 1 - check\nROLLBACK\n',
  'BEGIN\nBEGIN\n1..1\nok 1 - check\nROLLBACK\n',
  'BEGIN\n1..1\nok 1 - check\nROLLBACK\nBEGIN\n',
]) {
  test(`rejects unsafe transaction envelope ${JSON.stringify(output)}`, () => {
    assert.throws(() => validateLocalTap(output, 1));
  });
}
for (const [name, output, expected = 2] of [
  ['empty output', ''],
  ['rollback without TAP', 'BEGIN\nROLLBACK\n'],
  ['zero plan', '1..0\nROLLBACK\n'],
  ['missing plan', 'ok 1 - first\nok 2 - second\nROLLBACK\n'],
  ['truncated assertions', '1..2\nok 1 - first\nROLLBACK\n'],
  ['truncated no_plan with smaller final plan', 'ok 1 - first\n1..1\nROLLBACK\n'],
  ['wrong plan count', '1..3\nok 1 - first\nok 2 - second\nROLLBACK\n'],
  ['extra assertions', '1..2\nok 1 - first\nok 2 - second\nok 3 - extra\nROLLBACK\n'],
  ['duplicate assertion numbers', '1..2\nok 1 - first\nok 1 - duplicate\nROLLBACK\n'],
  ['out of order assertions', '1..2\nok 2 - second\nok 1 - first\nROLLBACK\n'],
  ['duplicate plans', '1..2\nok 1 - first\nok 2 - second\n1..2\nROLLBACK\n'],
  ['plan between assertions', 'ok 1 - first\n1..2\nok 2 - second\nROLLBACK\n'],
  ['missing rollback', '1..2\nok 1 - first\nok 2 - second\n'],
  ['rollback only in description', '1..2\nok 1 - ROLLBACK\nok 2 - second\n'],
  ['rollback before completion', '1..2\nok 1 - first\nROLLBACK\nok 2 - second\n'],
  ['failed assertion', '1..2\nok 1 - first\nnot ok 2 - second\nROLLBACK\n'],
  ['bailout', '1..2\nok 1 - first\nok 2 - second\nBail out! aborted\nROLLBACK\n'],
  ['failure summary', '1..2\nok 1 - first\nok 2 - second\n# Looks like you failed 1 test\nROLLBACK\n'],
  ['plan mismatch summary', '1..2\nok 1 - first\nok 2 - second\n# Looks like you planned 3 tests but ran 2\nROLLBACK\n'],
  ['missing expected count', '1..2\nok 1 - first\nok 2 - second\nROLLBACK\n', undefined],
  ['zero expected count', '1..0\nROLLBACK\n', 0],
]) {
  test(`rejects ${name}`, () => {
    const transactionOutput = output.startsWith('BEGIN\n') ? output : `BEGIN\n${output}`;
    assert.throws(() => validateLocalTap(transactionOutput, name === 'missing expected count' ? undefined : expected));
  });
}
