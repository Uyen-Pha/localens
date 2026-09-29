export type DbGateStep = 'db:start' | 'db:reset' | 'db:lint' | 'db:test'
  | 'db:concurrency' | 'db:types:check' | 'db:stop';

export type DbGateSpec = {
  name: DbGateStep;
  command: string;
  args: string[];
  localArgs: string[];
  databasePort: number;
  cwd: string;
  env: Record<string, string>;
};

export const DB_GATE_STEPS: DbGateStep[];
export function assertNoRemoteMode(args: string[]): void;
export function exitCodeForError(error: unknown): number;
export function runDbGate(options?: {
  cwd?: string;
  platform?: NodeJS.Platform;
  cliPath?: string;
  env?: Record<string, string | undefined>;
  args?: string[];
  prepare?: (options: { cwd: string; env: Record<string, string> }) => Promise<{
    root: string;
    ports: { database: number };
    dispose: () => Promise<void>;
  }>;
  runner?: (spec: DbGateSpec) => Promise<{ status: number; stdout?: string; stderr?: string }>;
}): Promise<{ ok: true; cliPath: string; calls: DbGateSpec[] }>;
