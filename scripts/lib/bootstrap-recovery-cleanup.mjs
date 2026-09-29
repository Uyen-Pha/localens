import { lstatSync } from 'node:fs';
import path from 'node:path';

// Additional deletion guard; callers must retain their ownership/path checks.
export function assertNoBootstrapRecovery(root) {
  const recoveryDirectory = path.join(root, 'supabase/.local-bootstrap-migrations');
  let entry;
  try {
    entry = lstatSync(recoveryDirectory, { throwIfNoEntry: false });
  } catch (cause) {
    throw Object.assign(new Error(`LOCAL_BOOTSTRAP_RECOVERY_CHECK_FAILED: ${recoveryDirectory}`, { cause }), { recoveryDirectory });
  }
  if (entry) {
    throw Object.assign(new Error(`LOCAL_BOOTSTRAP_RECOVERY_PRESERVED: ${recoveryDirectory}`), { recoveryDirectory });
  }
  return root;
}
