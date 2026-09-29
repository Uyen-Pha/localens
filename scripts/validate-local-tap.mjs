export function validateLocalTap(output, expectedAssertions) {
  if (!Number.isSafeInteger(expectedAssertions) || expectedAssertions <= 0) {
    throw new Error('Expected TAP assertion count must be a positive integer');
  }
  if (/^\s*Bail out!|Looks like you failed|planned \d+ tests but ran/im.test(output)) {
    throw new Error('TAP failure, bailout or plan mismatch');
  }
  // Accept psql aligned output as well as plain TAP. no_plan emits its plan
  // at finish(); it must agree with the independently specified suite count.
  const lines = output.split(/\r?\n/).map(line => line.trim());
  const assertions = [];
  const plans = [];
  const rollbacks = [];
  const begins = [];
  for (const [index, line] of lines.entries()) {
    const assertion = /^(not ok|ok)\s+(\d+)\b(?:\s.*)?$/.exec(line);
    const plan = /^1\.\.(\d+)(?:\s+#.*)?$/.exec(line);
    if (assertion) {
      const directive = /#\s*(SKIP|TODO)\b\s*(.*)$/i.exec(line);
      if (assertion[1] === 'not ok' && directive?.[1].toUpperCase() !== 'TODO') {
        throw new Error('TAP assertion failed');
      }
      assertions.push({number: Number(assertion[2]), index, directive: directive?.[1].toUpperCase(), reason: directive?.[2]});
    }
    if (line === 'COMMIT') throw new Error('Unexpected COMMIT in rollback-only test');
    if (line === 'BEGIN') begins.push(index);
    if (plan) plans.push({count: Number(plan[1]), index});
    if (line === 'ROLLBACK') rollbacks.push(index);
  }
  if (assertions.length !== expectedAssertions) {
    throw new Error(`Expected ${expectedAssertions} TAP assertions, got ${assertions.length}`);
  }
  if (assertions.some((assertion, index) => assertion.number !== index + 1)) {
    throw new Error('TAP assertions must be numbered consecutively from 1');
  }
  if (plans.length !== 1 || plans[0].count !== expectedAssertions) {
    throw new Error(`Expected one completed TAP plan of ${expectedAssertions}`);
  }
  const first = assertions[0].index;
  const last = assertions.at(-1).index;
  if (begins.length !== 1 || begins[0] >= Math.min(first, plans[0].index)) {
    throw new Error('Expected one transaction BEGIN before TAP');
  }
  if (plans[0].index > first && plans[0].index < last) {
    throw new Error('TAP plan must precede or follow all assertions');
  }
  if (rollbacks.length !== 1 || rollbacks[0] <= Math.max(last, plans[0].index)) {
    throw new Error('Expected transaction ROLLBACK after completed TAP');
  }
  const skipped = assertions.filter(assertion => assertion.directive === 'SKIP').length;
  const todo = assertions.filter(assertion => assertion.directive === 'TODO').length;
  return {
    total: assertions.length,
    passed: assertions.length - skipped - todo,
    skipped,
    todo,
    directives: assertions.filter(assertion => assertion.directive)
      .map(assertion => `${assertion.directive} ${assertion.number}: ${assertion.reason}`),
  };
}
