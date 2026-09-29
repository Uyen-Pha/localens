import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, renameSync, rmdirSync } from 'node:fs';
import { assertLocalBootstrap } from './lib/local-ci-bootstrap.mjs';
import { assertContainer, assertLocalDockerEndpoint } from './test-research-cancellation-local.mjs';
import { assertNoRemoteMode, runLocalSupabase } from './supabase-local.mjs';

export function runLocalBootstrap(args, { cwd = process.cwd(), env = process.env, probe = spawnSync, run = runLocalSupabase } = {}) {
  assertNoRemoteMode(args);
  const [flag, root, ...command] = args;
  const start = command[0] === 'start' && (command.length === 1 ||
    (command.length === 3 && command[1] === '--exclude' && /^[a-z,-]+$/.test(command[2])));
  const reset = command.join(' ') === 'db reset --local';
  if (flag !== '--workdir' || !root || !path.isAbsolute(root) || !(start || reset)) throw new Error('LOCAL_BOOTSTRAP_ARGUMENT_REJECTED');
  const target = assertLocalBootstrap(root);
  for (const key of ['DOCKER_HOST', 'CONTAINER_HOST']) if (env[key]) assertLocalDockerEndpoint(env[key]);
  const context = probe('docker', ['context', 'inspect', ...(env.DOCKER_CONTEXT ? [env.DOCKER_CONTEXT] : [])], { env, encoding: 'utf8', windowsHide: true });
  if (context.status !== 0) throw new Error('LOCAL_BOOTSTRAP_DOCKER_CONTEXT_REQUIRED');
  assertLocalDockerEndpoint(JSON.parse(context.stdout)[0]?.Endpoints?.docker?.Host);
  const inspected = probe('docker', ['inspect', `supabase_db_${target.projectId}`], { env, encoding: 'utf8', windowsHide: true });
  if (inspected.status === 0) {
    assertContainer({ workdir: root, projectId: target.projectId, dbPort: target.port }, JSON.parse(inspected.stdout)[0]);
  } else if (!start || !/No such (object|container)/i.test(inspected.stderr ?? '')) {
    throw new Error('LOCAL_BOOTSTRAP_CONTAINER_REQUIRED');
  }
  // Boot/reset only the platform first. All application SQL remains unchanged
  // in this owned temporary project; restore it even when the CLI fails.
  const migrations = path.join(root, 'supabase/migrations');
  const staged = path.join(root, 'supabase/.local-bootstrap-migrations');
  if (existsSync(staged)) throw new Error('LOCAL_BOOTSTRAP_STAGING_EXISTS');
  renameSync(migrations, staged);
  let failure;
  try {
    mkdirSync(migrations);
    run(args, { cwd, env });
  } catch (error) {
    failure = error;
  } finally {
    // Never recursively remove unexpected CLI/user files.
    try {
      if (existsSync(migrations)) rmdirSync(migrations);
      renameSync(staged, migrations);
    } catch (cleanupError) {
      failure ??= new Error('LOCAL_BOOTSTRAP_RESTORE_FAILED');
      failure.cleanupError = cleanupError;
      failure.recoveryDirectory = staged;
    }
  }
  if (failure) throw failure;
  assertLocalBootstrap(root);
  const live = probe('docker', ['inspect', `supabase_db_${target.projectId}`], { env, encoding: 'utf8', windowsHide: true });
  if (live.status !== 0) throw new Error('LOCAL_BOOTSTRAP_CONTAINER_REQUIRED');
  assertContainer({ workdir: root, projectId: target.projectId, dbPort: target.port }, JSON.parse(live.stdout)[0]);
  // Local platform prerequisite, not a hosted migration or an application role
  // escalation. The pinned local container owns auth through supabase_admin.
  const provision = probe('docker', ['exec', `supabase_db_${target.projectId}`, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'GRANT USAGE ON SCHEMA auth TO postgres WITH GRANT OPTION;'], { env, encoding: 'utf8', windowsHide: true });
  if (provision.status !== 0) throw new Error('LOCAL_BOOTSTRAP_PLATFORM_PREREQUISITE_FAILED');
  return run(['--workdir', root, 'migration', 'up', '--local'], { cwd, env });
}

export function runLocalBootstrapMain(args, { run = runLocalBootstrap, logger = console.error } = {}) {
  try { run(args); return 0; }
  catch (error) {
    logger(`LOCAL_BOOTSTRAP_FAILED: ${error.code ?? error.message}`);
    if (error.recoveryDirectory) logger(`LOCAL_BOOTSTRAP_RECOVERY_DIRECTORY: ${error.recoveryDirectory}`);
    return Number.isInteger(error.status) && error.status > 0 && error.status <= 255 ? error.status : 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runLocalBootstrapMain(process.argv.slice(2));
}
