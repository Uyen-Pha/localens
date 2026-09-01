export type RuntimeAuthRole = "customer" | "guide" | "admin";
export type RuntimeAuthLanguage = "en" | "vi";

export interface RuntimeAuthIdentity {
  email: string;
  role: RuntimeAuthRole;
  displayName: string;
  language: RuntimeAuthLanguage;
}

export interface SeededRuntimeAuthIdentity extends RuntimeAuthIdentity {
  userId: string;
}

export const RUNTIME_AUTH_IDENTITIES: ReadonlyArray<RuntimeAuthIdentity>;

export function seedRuntimeAuth(options: Record<string, unknown>): Promise<SeededRuntimeAuthIdentity[]>;

export function runRuntimeAuthSeedCli(options?: {
  env?: Record<string, string | undefined>;
  logger?: (message: string) => void;
}): Promise<SeededRuntimeAuthIdentity[]>;

export function runRuntimeAuthSeedMain(options?: {
  run?: () => Promise<unknown>;
  errorLogger?: (message: string) => void;
}): Promise<number>;
