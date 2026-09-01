import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  RUNTIME_AUTH_IDENTITIES,
  seedRuntimeAuth,
} from "../../../scripts/seed-runtime-auth.mjs";

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
    listUsers: vi.fn(async () => ({
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

    const error = await seedRuntimeAuth(validOptions({ authAdmin, query: database.query })).catch((cause) => cause);

    expect(error).toBeInstanceOf(Error);
    for (const secret of [SERVICE_ROLE_KEY, LOCAL_DATABASE_URL, ...Object.values(PASSWORDS)]) {
      expect(error.message).not.toContain(secret);
    }
  });

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
