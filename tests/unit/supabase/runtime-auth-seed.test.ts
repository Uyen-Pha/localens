import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

const cliDependencyMocks = vi.hoisted(() => ({
  runLocalSupabase: vi.fn(),
  createClient: vi.fn(),
  Client: vi.fn(),
}));

vi.mock("../../../scripts/supabase-local.mjs", () => ({
  runLocalSupabase: cliDependencyMocks.runLocalSupabase,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: cliDependencyMocks.createClient,
}));
vi.mock("pg", () => ({
  default: { Client: cliDependencyMocks.Client },
}));

import {
  RUNTIME_AUTH_IDENTITIES,
  runRuntimeAuthSeedCli,
  runRuntimeAuthSeedMain,
  seedRuntimeAuth,
} from "../../../scripts/seed-runtime-auth.mjs";

const assertSeedRuntimeAuthOptionsContract = () => {
  // @ts-expect-error seedRuntimeAuth requires the complete local seed dependency contract.
  void seedRuntimeAuth({});
};
void assertSeedRuntimeAuthOptionsContract;

const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SERVICE_ROLE_KEY = `runtime-service-role-${randomUUID()}`;
const PASSWORDS = {
  customer: `runtime-customer-${randomUUID()}`,
  guide: `runtime-guide-${randomUUID()}`,
  admin: `runtime-admin-${randomUUID()}`,
};

function createAuthAdmin() {
  const users = new Map<string, { id: string; email: string }>();
  let nextId = 1;

  return {
    users,
    listUsers: vi.fn(async (): Promise<{
      data: { users: Array<{ id: string; email: string }>; nextPage: null };
      error: Error | null;
    }> => ({
      data: { users: [...users.values()], nextPage: null },
      error: null,
    })),
    createUser: vi.fn(async ({ email }: { email: string }) => {
      const user = { id: `00000000-0000-0000-0000-${String(nextId).padStart(12, "0")}`, email };
      nextId += 1;
      users.set(email, user);
      return { data: { user }, error: null };
    }),
    updateUserById: vi.fn(async (id: string) => ({
      data: { user: [...users.values()].find((user) => user.id === id) },
      error: null,
    })),
  };
}

function createDatabaseQuery() {
  const roles = new Map<string, Set<string>>();
  const profiles = new Map<string, string>();
  const guideProfiles = new Map<string, { displayName: string; language: string }>();
  const statements: string[] = [];

  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    statements.push(sql);
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    const [userId, value, language] = values as string[];

    if (normalized.startsWith("delete from private.user_roles")) roles.delete(userId);
    if (normalized.startsWith("insert into private.user_roles")) roles.set(userId, new Set([value]));
    if (normalized.startsWith("insert into public.profiles")) profiles.set(userId, value);
    if (normalized.startsWith("delete from public.guide_profiles")) guideProfiles.delete(userId);
    if (normalized.startsWith("insert into public.guide_profiles")) {
      guideProfiles.set(userId, { displayName: value, language });
    }

    return { rowCount: 1, rows: [] };
  });

  return { query, roles, profiles, guideProfiles, statements };
}

function validOptions(overrides: Record<string, unknown> = {}) {
  const authAdmin = createAuthAdmin();
  const database = createDatabaseQuery();
  return {
    supabaseUrl: LOCAL_SUPABASE_URL,
    databaseUrl: LOCAL_DATABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    passwords: PASSWORDS,
    authAdmin,
    query: database.query,
    logger: vi.fn(),
    ...overrides,
  };
}

function createCliHarness() {
  const authAdmin = createAuthAdmin();
  const database = createDatabaseQuery();
  const client = {
    connect: vi.fn(async () => {}),
    query: database.query,
    end: vi.fn(async () => {}),
  };
  const logger = vi.fn();
  const env = {
    LOCALENS_DB_URL: LOCAL_DATABASE_URL,
    LOCALENS_RUNTIME_CUSTOMER_PASSWORD: PASSWORDS.customer,
    LOCALENS_RUNTIME_GUIDE_PASSWORD: PASSWORDS.guide,
    LOCALENS_RUNTIME_ADMIN_PASSWORD: PASSWORDS.admin,
  };

  cliDependencyMocks.runLocalSupabase.mockReset();
  cliDependencyMocks.runLocalSupabase.mockReturnValue({
    status: 0,
    stdout: `API_URL="${LOCAL_SUPABASE_URL}"\nSERVICE_ROLE_KEY="${SERVICE_ROLE_KEY}"\n`,
    stderr: "",
  });
  cliDependencyMocks.createClient.mockReset();
  cliDependencyMocks.createClient.mockReturnValue({ auth: { admin: authAdmin } });
  cliDependencyMocks.Client.mockReset();
  cliDependencyMocks.Client.mockImplementation(function clientConstructor() { return client; });

  return { authAdmin, database, client, env, logger };
}

function expectError(cause: unknown): Error {
  expect(cause).toBeInstanceOf(Error);
  if (!(cause instanceof Error)) throw new TypeError("Expected runtime Auth seed to reject with an Error");
  return cause;
}

function expectStableRedactedError(cause: unknown, code: string) {
  const error = expectError(cause);
  expect("code" in error ? error.code : undefined).toBe(code);
  for (const secret of [SERVICE_ROLE_KEY, LOCAL_DATABASE_URL, ...Object.values(PASSWORDS)]) {
    expect(error.message).not.toContain(secret);
  }
}

describe("runtime Auth seed", () => {
  it.each([
    {
      label: "Supabase API",
      overrides: { supabaseUrl: "https://project.supabase.co" },
    },
    {
      label: "PostgreSQL",
      overrides: { databaseUrl: "postgresql://postgres:secret@project.supabase.co:5432/postgres" },
    },
  ])("rejects a non-loopback $label endpoint before writes", async ({ overrides }) => {
    const authAdmin = createAuthAdmin();
    const database = createDatabaseQuery();

    await expect(seedRuntimeAuth(validOptions({ authAdmin, query: database.query, ...overrides })))
      .rejects.toMatchObject({ code: "RUNTIME_AUTH_SEED_LOCAL_ONLY" });

    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
  });

  it.each([
    `${LOCAL_DATABASE_URL}?host=example.com`,
    `${LOCAL_DATABASE_URL}?port=5432`,
  ])("rejects PostgreSQL endpoint overrides before writes: %s", async (databaseUrl) => {
    const authAdmin = createAuthAdmin();
    const database = createDatabaseQuery();

    await expect(seedRuntimeAuth(validOptions({ authAdmin, query: database.query, databaseUrl })))
      .rejects.toMatchObject({ code: "RUNTIME_AUTH_SEED_LOCAL_ONLY" });

    expect(authAdmin.listUsers).not.toHaveBeenCalled();
    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "Supabase API",
      overrides: { supabaseUrl: "http://127.0.0.1:54322" },
    },
    {
      label: "PostgreSQL",
      overrides: { databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54321/postgres" },
    },
  ])("rejects a loopback $label URL on the wrong port before writes", async ({ overrides }) => {
    const authAdmin = createAuthAdmin();
    const database = createDatabaseQuery();

    await expect(seedRuntimeAuth(validOptions({ authAdmin, query: database.query, ...overrides })))
      .rejects.toMatchObject({ code: "RUNTIME_AUTH_SEED_LOCAL_ONLY" });

    expect(authAdmin.listUsers).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
  });

  it("rejects missing role passwords before writes", async () => {
    const authAdmin = createAuthAdmin();
    const database = createDatabaseQuery();

    await expect(seedRuntimeAuth(validOptions({
      authAdmin,
      query: database.query,
      passwords: { ...PASSWORDS, guide: "" },
    }))).rejects.toMatchObject({ code: "RUNTIME_AUTH_SEED_PASSWORDS_REQUIRED" });

    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
  });

  it.each(["auth", "database"])("does not expose credentials from a failing %s dependency", async (boundary) => {
    const leakedMessage = [SERVICE_ROLE_KEY, LOCAL_DATABASE_URL, ...Object.values(PASSWORDS)].join(" ");
    const authAdmin = createAuthAdmin();
    const database = createDatabaseQuery();
    if (boundary === "auth") {
      authAdmin.listUsers.mockResolvedValueOnce({ data: { users: [], nextPage: null }, error: new Error(leakedMessage) });
    } else {
      database.query.mockRejectedValueOnce(new Error(leakedMessage));
    }

    const cause: unknown = await seedRuntimeAuth(validOptions({ authAdmin, query: database.query }))
      .catch((caught: unknown) => caught);
    const error = expectError(cause);

    for (const secret of [SERVICE_ROLE_KEY, LOCAL_DATABASE_URL, ...Object.values(PASSWORDS)]) {
      expect(error.message).not.toContain(secret);
    }
  });

  it.each(["Supabase", "PostgreSQL"])("redacts a failing %s client constructor", async (boundary) => {
    const harness = createCliHarness();
    const leakedMessage = [SERVICE_ROLE_KEY, LOCAL_DATABASE_URL, ...Object.values(PASSWORDS)].join(" ");
    if (boundary === "Supabase") {
      cliDependencyMocks.createClient.mockImplementationOnce(() => { throw new Error(leakedMessage); });
    } else {
      cliDependencyMocks.Client.mockImplementationOnce(function failingClientConstructor() {
        throw new Error(leakedMessage);
      });
    }

    const cause: unknown = await runRuntimeAuthSeedCli({ env: harness.env, logger: harness.logger })
      .catch((caught: unknown) => caught);

    expectStableRedactedError(cause, "RUNTIME_AUTH_SEED_CLIENT_FAILED");
  });

  it("redacts connect failure and still attempts teardown", async () => {
    const harness = createCliHarness();
    const leakedMessage = [SERVICE_ROLE_KEY, LOCAL_DATABASE_URL, ...Object.values(PASSWORDS)].join(" ");
    harness.client.connect.mockRejectedValueOnce(new Error(leakedMessage));

    const cause: unknown = await runRuntimeAuthSeedCli({ env: harness.env, logger: harness.logger })
      .catch((caught: unknown) => caught);

    expectStableRedactedError(cause, "RUNTIME_AUTH_SEED_CONNECT_FAILED");
    expect(harness.client.end).toHaveBeenCalledTimes(1);
  });

  it("preserves a redacted database failure when rollback also fails", async () => {
    const harness = createCliHarness();
    const leakedMessage = [SERVICE_ROLE_KEY, LOCAL_DATABASE_URL, ...Object.values(PASSWORDS)].join(" ");
    harness.database.query.mockReset();
    harness.database.query.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN") return { rowCount: 0, rows: [] };
      throw new Error(leakedMessage);
    });

    const cause: unknown = await runRuntimeAuthSeedCli({ env: harness.env, logger: harness.logger })
      .catch((caught: unknown) => caught);

    expectStableRedactedError(cause, "RUNTIME_AUTH_SEED_DATABASE_FAILED");
    expect(harness.database.query).toHaveBeenCalledWith("ROLLBACK");
    expect(harness.client.end).toHaveBeenCalledTimes(1);
  });

  it("redacts teardown failure after a successful seed", async () => {
    const harness = createCliHarness();
    const leakedMessage = [SERVICE_ROLE_KEY, LOCAL_DATABASE_URL, ...Object.values(PASSWORDS)].join(" ");
    harness.client.end.mockRejectedValueOnce(new Error(leakedMessage));

    const cause: unknown = await runRuntimeAuthSeedCli({ env: harness.env, logger: harness.logger })
      .catch((caught: unknown) => caught);

    expectStableRedactedError(cause, "RUNTIME_AUTH_SEED_TEARDOWN_FAILED");
  });

  it.each([undefined, "RUNTIME_AUTH_SEED_CONNECT_FAILED"])(
    "redacts an unexpected top-level CLI failure with code %s",
    async (spoofedCode) => {
      const leakedMessage = [SERVICE_ROLE_KEY, LOCAL_DATABASE_URL, ...Object.values(PASSWORDS)].join(" ");
      const errorLogger = vi.fn();
      const unexpectedError = Object.assign(new Error(leakedMessage), { code: spoofedCode });

      const exitCode = await runRuntimeAuthSeedMain({
        run: async () => { throw unexpectedError; },
        errorLogger,
      });

      expect(exitCode).toBe(2);
      expect(errorLogger).toHaveBeenCalledWith("RUNTIME_AUTH_SEED_FAILED: local runtime Auth seed failed");
      const output = errorLogger.mock.calls.flat().join("\n");
      for (const secret of [SERVICE_ROLE_KEY, LOCAL_DATABASE_URL, ...Object.values(PASSWORDS)]) {
        expect(output).not.toContain(secret);
      }
    },
  );

  it("reuses three Auth users and normalizes only identity tables on every run", async () => {
    const authAdmin = createAuthAdmin();
    const database = createDatabaseQuery();
    const logs: string[] = [];
    const options = validOptions({
      authAdmin,
      query: database.query,
      logger: (message: string) => logs.push(message),
    });

    const first = await seedRuntimeAuth(options);
    const customerId = authAdmin.users.get("customer.runtime@localens.test")?.id as string;
    database.roles.set(customerId, new Set(["customer", "admin"]));
    database.guideProfiles.set(customerId, { displayName: "Stale", language: "vi" });
    const second = await seedRuntimeAuth(options);

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(authAdmin.createUser).toHaveBeenCalledTimes(3);
    expect(authAdmin.updateUserById).toHaveBeenCalledTimes(3);
    expect(new Set(first.map(({ userId }) => userId))).toHaveLength(3);

    for (const identity of RUNTIME_AUTH_IDENTITIES) {
      const userId = authAdmin.users.get(identity.email)?.id as string;
      expect([...database.roles.get(userId) ?? []]).toEqual([identity.role]);
      expect(database.profiles.get(userId)).toBe(identity.displayName);
    }

    const guideId = authAdmin.users.get("guide.runtime@localens.test")?.id as string;
    expect(database.guideProfiles.get(guideId)).toEqual({
      displayName: "Runtime Guide",
      language: "vi",
    });
    expect(database.guideProfiles.has(customerId)).toBe(false);

    const sql = database.statements.join("\n");
    expect(sql).toMatch(/private\.user_roles/i);
    expect(sql).toMatch(/public\.profiles/i);
    expect(sql).toMatch(/public\.guide_profiles/i);
    expect(sql).not.toMatch(/catalog|tour|departure|booking|payment/i);

    const output = logs.join("\n");
    for (const identity of RUNTIME_AUTH_IDENTITIES) {
      expect(output).toContain(identity.email);
      expect(output).toContain(identity.role);
    }
    expect(logs.slice(0, 3).every((message) => message.includes("status=created"))).toBe(true);
    expect(logs.slice(3).every((message) => message.includes("status=reused"))).toBe(true);
    for (const secret of [SERVICE_ROLE_KEY, LOCAL_DATABASE_URL, ...Object.values(PASSWORDS)]) {
      expect(output).not.toContain(secret);
    }
  });
});
