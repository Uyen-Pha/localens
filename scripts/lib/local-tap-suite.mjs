import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertLocalBootstrap } from './local-ci-bootstrap.mjs';
import { legacyCancellationFixture, adaptLegacyCancellationActors } from './legacy-cancellation-fixture.mjs';

export function prepareLocalTapSuite(root) {
  assertLocalBootstrap(root);
  const source = path.join(root, 'supabase/tests');
  const selected = path.join(root, 'supabase/tests-selected');
  // Exclusive creation avoids overwriting prior test or recovery evidence.
  mkdirSync(selected);
  for (const name of readdirSync(path.join(source, 'database')).sort()) {
    if (name.endsWith('_test.sql')) copyFileSync(path.join(source, 'database', name), path.join(selected, name));
  }
  const fixtures = readFileSync(path.join(source, 'research/fixtures.sql'), 'utf8');
  for (const [directory, name] of [
    ['database', 'remaining-runtime-permissions.sql'],
    ['research', 'research_permissions_test.sql'],
    ['research', 'research_deadline_integration_test.sql'],
    ['research', 'research_booking_cancellation_test.sql'],
  ]) {
    let suite = readFileSync(path.join(source, directory, name), 'utf8');
    let adapter = '';
    if (name === 'research_booking_cancellation_test.sql') {
      adapter = legacyCancellationFixture;
      suite = adaptLegacyCancellationActors(suite);
    }
    writeFileSync(path.join(selected, name), `BEGIN;\n${fixtures}\n${adapter}\n${suite}\nROLLBACK;\n`, { flag: 'wx' });
  }
  return selected;
}
