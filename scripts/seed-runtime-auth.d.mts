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

export interface RuntimeAuthPasswords {
  customer: string;
  guide: string;
  admin: string;
}

export interface RuntimeAuthUser {
  id: string;
  email?: string;
}

export interface RuntimeAuthUserAttributes {
  email: string;
  password: string;
  email_confirm: true;
}

export type RuntimeAuthListUsersResult =
  | {
      data: { users: RuntimeAuthUser[]; nextPage: number | null };
      error: null;
    }
  | {
      data: { users: [] };
      error: Error;
    };

export type RuntimeAuthUserResult =
  | {
      data: { user: RuntimeAuthUser };
      error: null;
    }
  | {
      data: { user: null };
      error: Error;
    };

export interface RuntimeAuthAdminClient {
  listUsers(parameters: { page: number; perPage: number }): Promise<RuntimeAuthListUsersResult>;
  createUser(attributes: RuntimeAuthUserAttributes): Promise<RuntimeAuthUserResult>;
  updateUserById(userId: string, attributes: RuntimeAuthUserAttributes): Promise<RuntimeAuthUserResult>;
}

export type RuntimeAuthQuery = (sql: string, values?: unknown[]) => Promise<unknown>;
export type RuntimeAuthLogger = (message: string) => void;

export interface SeedRuntimeAuthOptions {
  supabaseUrl: string;
  databaseUrl: string;
  serviceRoleKey: string;
  passwords: RuntimeAuthPasswords;
  authAdmin: RuntimeAuthAdminClient;
  query: RuntimeAuthQuery;
  logger?: RuntimeAuthLogger;
}

export const RUNTIME_AUTH_IDENTITIES: ReadonlyArray<RuntimeAuthIdentity>;

export function seedRuntimeAuth(options: SeedRuntimeAuthOptions): Promise<SeededRuntimeAuthIdentity[]>;

export function runRuntimeAuthSeedCli(options?: {
  env?: Record<string, string | undefined>;
  logger?: RuntimeAuthLogger;
}): Promise<SeededRuntimeAuthIdentity[]>;

export function runRuntimeAuthSeedMain(options?: {
  run?: () => Promise<unknown>;
  errorLogger?: (message: string) => void;
}): Promise<number>;
