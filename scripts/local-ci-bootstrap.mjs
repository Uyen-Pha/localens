import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  return run(args, { cwd, env });
}

export function runLocalBootstrapMain(args, { run = runLocalBootstrap, logger = console.error } = {}) {
  try { run(args); return 0; }
  catch (error) {
    logger(`LOCAL_BOOTSTRAP_FAILED: ${error.code ?? error.message}`);
    return Number.isInteger(error.status) && error.status > 0 && error.status <= 255 ? error.status : 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runLocalBootstrapMain(process.argv.slice(2));
}
