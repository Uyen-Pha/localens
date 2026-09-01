import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

const dependencyMocks = vi.hoisted(() => ({
  resolveLocalSupabaseCli: vi.fn(),
  runLocalSupabase: vi.fn(),
  createClient: vi.fn(),
  Client: vi.fn(),
}));

vi.mock("../../../scripts/supabase-local.mjs", () => ({
  resolveLocalSupabaseCli: dependencyMocks.resolveLocalSupabaseCli,
  runLocalSupabase: dependencyMocks.runLocalSupabase,
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: dependencyMocks.createClient }));
vi.mock("pg", () => ({ default: { Client: dependencyMocks.Client } }));

// Task 3's approved write set intentionally excludes a sibling declaration file.
// @ts-expect-error The JavaScript module is exercised through this unit-only contract.
import * as runtimeFixedTourSeed from "../../../scripts/seed-runtime-fixed-tour.mjs";

const {
  RUNTIME_FIXED_TOUR_CUSTOMER,
  RUNTIME_FIXED_TOUR_FIXTURE,
  runRuntimeFixedTourSeedCli,
  runRuntimeFixedTourSeedMain,
  seedRuntimeFixedTour,
} = runtimeFixedTourSeed;

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");
const LOCAL_CLI = path.join(PROJECT_ROOT, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SERVICE_ROLE_KEY = `runtime-fixed-tour-service-${randomUUID()}`;
const CUSTOMER_PASSWORD = `runtime-fixed-tour-customer-${randomUUID()}`;

type RuntimeUser = { id: string; email: string };

function createAuthAdmin() {
  const users = new Map<string, RuntimeUser>();
  let nextId = 200;
  return {
    users,
    listUsers: vi.fn(async () => ({ data: { users: [...users.values()], nextPage: null }, error: null })),
    createUser: vi.fn(async ({ email }: { email: string }) => {
      const user = { id: `00000000-0000-0000-0000-${String(nextId).padStart(12, "0")}`, email };
      nextId += 1;
      users.set(email, user);
      return { data: { user }, error: null };
    }),
    updateUserById: vi.fn(async (userId: string) => {
      const user = [...users.values()].find(({ id }) => id === userId) ?? null;
      return user
        ? { data: { user }, error: null }
        : { data: { user: null }, error: new Error("missing runtime test user") };
    }),
    deleteUser: vi.fn(async (userId: string) => {
      const entry = [...users.entries()].find(([, user]) => user.id === userId);
      if (entry) users.delete(entry[0]);
      return { data: {}, error: null };
    }),
  };
}

function createDatabaseQuery({ failOn }: { failOn?: RegExp } = {}) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  let graphExists = false;
  let pendingGraph = false;
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    statements.push({ sql, values });
    if (failOn?.test(sql)) throw new Error(`${SERVICE_ROLE_KEY} ${LOCAL_DATABASE_URL} ${CUSTOMER_PASSWORD}`);
    if (/select\s+exists/i.test(sql)) return { rows: [{ exists: graphExists }] };
    if (/insert\s+into\s+public\.departures/i.test(sql)) pendingGraph = true;
    if (sql === "COMMIT") {
      graphExists = graphExists || pendingGraph;
      pendingGraph = false;
    }
    if (sql === "ROLLBACK") pendingGraph = false;
    return { rows: [], rowCount: 1 };
  });
  return { query, statements, hasGraph: () => graphExists };
}

function validOptions(overrides: Record<string, unknown> = {}) {
  const authAdmin = createAuthAdmin();
  const database = createDatabaseQuery();
  return {
    supabaseUrl: LOCAL_SUPABASE_URL,
    databaseUrl: LOCAL_DATABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    customerPassword: CUSTOMER_PASSWORD,
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
  dependencyMocks.resolveLocalSupabaseCli.mockReset();
  dependencyMocks.resolveLocalSupabaseCli.mockReturnValue(LOCAL_CLI);
  dependencyMocks.runLocalSupabase.mockReset();
  dependencyMocks.runLocalSupabase.mockImplementation((args: string[]) => {
    if (args[0] === "--version") return { status: 0, stdout: "2.115.0\n", stderr: "" };
    return {
      status: 0,
      stdout: `API_URL="${LOCAL_SUPABASE_URL}"\nSERVICE_ROLE_KEY="${SERVICE_ROLE_KEY}"\n`,
      stderr: "",
    };
  });
  dependencyMocks.createClient.mockReset();
  dependencyMocks.createClient.mockReturnValue({ auth: { admin: authAdmin } });
  dependencyMocks.Client.mockReset();
  dependencyMocks.Client.mockImplementation(function clientConstructor() { return client; });
  return {
    authAdmin,
    database,
    client,
    env: {
      LOCALENS_DB_URL: LOCAL_DATABASE_URL,
      LOCALENS_RUNTIME_FIXED_TOUR_CUSTOMER_PASSWORD: CUSTOMER_PASSWORD,
    },
    logger: vi.fn(),
  };
}

function errorFrom(cause: unknown) {
  expect(cause).toBeInstanceOf(Error);
  if (!(cause instanceof Error)) throw new TypeError("Expected Error");
  return cause as Error & { code?: string };
}

function expectRedacted(cause: unknown, code: string) {
  const error = errorFrom(cause);
  expect(error.code).toBe(code);
  for (const secret of [SERVICE_ROLE_KEY, LOCAL_DATABASE_URL, CUSTOMER_PASSWORD]) {
    expect(error.message).not.toContain(secret);
  }
}

describe("runtime fixed-tour seed", () => {
  it.each([
    { supabaseUrl: "https://project.supabase.co" },
    { supabaseUrl: "http://localhost:54322" },
    { databaseUrl: "postgresql://postgres:secret@project.supabase.co:5432/postgres" },
    { databaseUrl: `${LOCAL_DATABASE_URL}?host=example.com` },
  ])("rejects unsafe endpoints before Auth or database writes: %o", async (override) => {
    const authAdmin = createAuthAdmin();
    const database = createDatabaseQuery();
    await expect(seedRuntimeFixedTour(validOptions({ ...override, authAdmin, query: database.query })))
      .rejects.toMatchObject({ code: "RUNTIME_FIXED_TOUR_SEED_LOCAL_ONLY" });
    expect(authAdmin.listUsers).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
  });

  it("requires the exact project-local Supabase 2.115.0 executable before clients are built", async () => {
    const harness = createCliHarness();
    dependencyMocks.runLocalSupabase.mockImplementationOnce(() => ({ status: 0, stdout: "2.116.0\n", stderr: "" }));

    const cause = await runRuntimeFixedTourSeedCli({ env: harness.env, logger: harness.logger }).catch((error: unknown) => error);

    expectRedacted(cause, "RUNTIME_FIXED_TOUR_SEED_CLI_VERSION");
    expect(dependencyMocks.resolveLocalSupabaseCli).toHaveBeenCalledWith({ cwd: PROJECT_ROOT });
    expect(dependencyMocks.runLocalSupabase).toHaveBeenCalledWith(["--version"], expect.objectContaining({
      capture: true,
      cliPath: LOCAL_CLI,
      cwd: PROJECT_ROOT,
    }));
    expect(dependencyMocks.createClient).not.toHaveBeenCalled();
    expect(dependencyMocks.Client).not.toHaveBeenCalled();
  });

  it("fails closed when the exact project-local CLI path cannot be resolved", async () => {
    const harness = createCliHarness();
    dependencyMocks.resolveLocalSupabaseCli.mockReturnValueOnce(null);
    const cause = await runRuntimeFixedTourSeedCli({ env: harness.env }).catch((error: unknown) => error);
    expectRedacted(cause, "RUNTIME_FIXED_TOUR_SEED_CLI_PATH");
    expect(dependencyMocks.runLocalSupabase).not.toHaveBeenCalled();
  });

  it("creates only the second customer and a complete deterministic EN/VI graph", async () => {
    const authAdmin = createAuthAdmin();
    const database = createDatabaseQuery();
    const logs: string[] = [];
    const result = await seedRuntimeFixedTour(validOptions({
      authAdmin,
      query: database.query,
      logger: (message: string) => logs.push(message),
    }));

    expect(result).toMatchObject({
      customer: { email: "customer-b.runtime-fixed-tour@localens.test", role: "customer", language: "vi" },
      fixture: { departureStartAt: "2099-09-05T02:00:00.000Z" },
      state: "created",
    });
    expect(RUNTIME_FIXED_TOUR_CUSTOMER.email).toBe("customer-b.runtime-fixed-tour@localens.test");
    expect(RUNTIME_FIXED_TOUR_FIXTURE.departureStartAt).toBe("2099-09-05T02:00:00.000Z");
    expect(authAdmin.createUser).toHaveBeenCalledTimes(1);
    expect(authAdmin.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: RUNTIME_FIXED_TOUR_CUSTOMER.email,
      password: CUSTOMER_PASSWORD,
      email_confirm: true,
    }));

    const sql = database.statements.map(({ sql }) => sql).join("\n");
    for (const relation of [
      "private.user_roles", "public.profiles", "public.areas", "public.area_translations",
      "public.places", "public.place_translations", "public.place_experience_types",
      "public.place_guide_languages", "public.place_supports", "public.place_opening_hours",
      "public.catalog_snapshots", "public.travel_edges", "public.tours", "public.tour_translations", "public.tour_versions",
      "public.tour_version_translations", "public.tour_version_stops", "public.departures",
    ]) expect(sql).toContain(relation);
    expect(sql).toContain("private.create_catalog_snapshot()");
    expect(sql).toContain("private.create_travel_snapshot()");
    expect(sql).toContain("2099-09-05T02:00:00.000Z");
    expect(sql).toContain("runtime-test");
    expect(sql).toContain("'en'");
    expect(sql).toContain("'vi'");
    expect(database.statements[0]?.sql).toBe("BEGIN");
    expect(database.statements.at(-1)?.sql).toBe("COMMIT");
    expect(database.hasGraph()).toBe(true);

    const orderedPublicationMarkers = [
      "INSERT INTO public.areas",
      "INSERT INTO public.area_translations",
      "INSERT INTO public.places",
      "INSERT INTO public.place_translations",
      "INSERT INTO public.place_experience_types",
      "INSERT INTO public.place_guide_languages",
      "INSERT INTO public.place_supports",
      "INSERT INTO public.place_opening_hours",
      "UPDATE public.places",
      "INSERT INTO public.travel_edges",
      "private.create_catalog_snapshot()",
      "private.create_travel_snapshot()",
      "INSERT INTO public.tours",
      "INSERT INTO public.tour_translations",
      "INSERT INTO public.tour_versions",
      "INSERT INTO public.tour_version_translations",
      "INSERT INTO public.tour_version_stops",
      "UPDATE public.tour_versions",
      "UPDATE public.tours",
      "INSERT INTO public.departures",
    ];
    let previousIndex = -1;
    for (const marker of orderedPublicationMarkers) {
      const markerIndex = sql.indexOf(marker);
      expect(markerIndex, `${marker} must occur after the previous publication step`).toBeGreaterThan(previousIndex);
      previousIndex = markerIndex;
    }
    expect(sql).toMatch(/\(1::smallint,[\s\S]+\(2::smallint,/);
    expect(sql.match(/public\.place_translations/g)).toHaveLength(1);
    expect(sql).toMatch(/public\.catalog_snapshots[\s\S]+status = 'published'/);
    expect(sql).toMatch(/tour_version_translations[\s\S]+'en'[\s\S]+'vi'/);
    expect(sql).toMatch(/tour_version_stops[\s\S]+catalog_snapshot_id[\s\S]+place_id/);
    expect(sql).toMatch(/UPDATE public\.tour_versions[\s\S]+status = 'published'/);
    expect(sql).toMatch(/UPDATE public\.tours[\s\S]+status = 'published'/);

    const output = logs.join("\n");
    expect(output).toContain("customer-b.runtime-fixed-tour@localens.test");
    expect(output).toContain("departure=2099-09-05T02:00:00.000Z");
    for (const secret of [SERVICE_ROLE_KEY, LOCAL_DATABASE_URL, CUSTOMER_PASSWORD]) expect(output).not.toContain(secret);
  });

  it("is idempotent and reuses the same Auth user and deterministic graph", async () => {
    const authAdmin = createAuthAdmin();
    const database = createDatabaseQuery();
    const options = validOptions({ authAdmin, query: database.query });

    const first = await seedRuntimeFixedTour(options);
    const statementCount = database.statements.length;
    const second = await seedRuntimeFixedTour(options);

    expect(second).toEqual({ ...first, customer: { ...first.customer, seedStatus: "reused" }, state: "reused" });
    expect(authAdmin.createUser).toHaveBeenCalledTimes(1);
    expect(authAdmin.updateUserById).toHaveBeenCalledTimes(1);
    const secondRunSql = database.statements.slice(statementCount).map(({ sql }) => sql).join("\n");
    expect(secondRunSql).toMatch(/select\s+exists/i);
    expect(secondRunSql).not.toMatch(/insert\s+into\s+public\.(areas|places|catalog_snapshots|travel_snapshots|tours|departures)/i);
  });

  it("rolls back database failure and compensates a newly-created Auth user", async () => {
    const authAdmin = createAuthAdmin();
    const database = createDatabaseQuery({ failOn: /insert\s+into\s+public\.departures/i });
    const cause = await seedRuntimeFixedTour(validOptions({ authAdmin, query: database.query })).catch((error: unknown) => error);

    expectRedacted(cause, "RUNTIME_FIXED_TOUR_SEED_DATABASE_FAILED");
    expect(database.statements.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
    expect(database.statements.some(({ sql }) => sql === "COMMIT")).toBe(false);
    expect(authAdmin.deleteUser).toHaveBeenCalledTimes(1);
    expect(authAdmin.users.has(RUNTIME_FIXED_TOUR_CUSTOMER.email)).toBe(false);
  });

  it("never deletes a reused second-customer identity when the database transaction fails", async () => {
    const authAdmin = createAuthAdmin();
    authAdmin.users.set(RUNTIME_FIXED_TOUR_CUSTOMER.email, {
      id: "00000000-0000-0000-0000-000000000299",
      email: RUNTIME_FIXED_TOUR_CUSTOMER.email,
    });
    const database = createDatabaseQuery({ failOn: /insert\s+into\s+public\.departures/i });

    const cause = await seedRuntimeFixedTour(validOptions({ authAdmin, query: database.query }))
      .catch((error: unknown) => error);

    expectRedacted(cause, "RUNTIME_FIXED_TOUR_SEED_DATABASE_FAILED");
    expect(errorFrom(cause).message).toBe(
      "RUNTIME_FIXED_TOUR_SEED_DATABASE_FAILED: transactional fixture seed failed",
    );
    expect(authAdmin.updateUserById).toHaveBeenCalledTimes(1);
    expect(authAdmin.deleteUser).not.toHaveBeenCalled();
    expect(authAdmin.users.has(RUNTIME_FIXED_TOUR_CUSTOMER.email)).toBe(true);
  });

  it("preserves the stable primary error when rollback and Auth compensation also fail", async () => {
    const authAdmin = createAuthAdmin();
    const database = createDatabaseQuery({ failOn: /insert\s+into\s+public\.departures|ROLLBACK/i });
    authAdmin.deleteUser.mockRejectedValueOnce(new Error(`${SERVICE_ROLE_KEY} ${CUSTOMER_PASSWORD}`));
    const cause = await seedRuntimeFixedTour(validOptions({ authAdmin, query: database.query })).catch((error: unknown) => error);
    expectRedacted(cause, "RUNTIME_FIXED_TOUR_SEED_DATABASE_FAILED");
    expect(errorFrom(cause).message).toBe(
      "RUNTIME_FIXED_TOUR_SEED_DATABASE_FAILED: transactional fixture seed failed",
    );
  });

  it("redacts CLI status, connect, teardown and unexpected top-level failures", async () => {
    const harness = createCliHarness();
    dependencyMocks.runLocalSupabase.mockImplementationOnce(() => ({ status: 0, stdout: "2.115.0\n", stderr: "" }));
    dependencyMocks.runLocalSupabase.mockImplementationOnce(() => { throw new Error(SERVICE_ROLE_KEY); });
    expectRedacted(
      await runRuntimeFixedTourSeedCli({ env: harness.env }).catch((error: unknown) => error),
      "RUNTIME_FIXED_TOUR_SEED_STATUS_FAILED",
    );

    const connectHarness = createCliHarness();
    connectHarness.client.connect.mockRejectedValueOnce(new Error(LOCAL_DATABASE_URL));
    expectRedacted(
      await runRuntimeFixedTourSeedCli({ env: connectHarness.env }).catch((error: unknown) => error),
      "RUNTIME_FIXED_TOUR_SEED_CONNECT_FAILED",
    );
    expect(connectHarness.client.end).toHaveBeenCalledTimes(1);

    const errorLogger = vi.fn();
    expect(await runRuntimeFixedTourSeedMain({
      run: async () => { throw new Error(`${SERVICE_ROLE_KEY} ${CUSTOMER_PASSWORD}`); },
      errorLogger,
    })).toBe(2);
    expect(errorLogger).toHaveBeenCalledWith("RUNTIME_FIXED_TOUR_SEED_FAILED: local runtime fixed-tour seed failed");
  });

  it("contains no dependency on source or approval data and exposes the package command", () => {
    const source = readFileSync(path.join(PROJECT_ROOT, "scripts", "seed-runtime-fixed-tour.mjs"), "utf8");
    expect(source).not.toMatch(/data[\\/]sources|data[\\/]approvals|readFile(?:Sync)?\s*\(/i);
    expect(source).not.toContain("customer.runtime@localens.test");
    expect(source).not.toContain("guide.runtime@localens.test");
    expect(source).not.toContain("admin.runtime@localens.test");
    const packageJson = JSON.parse(readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(packageJson.scripts["db:seed:runtime-fixed-tour"]).toBe("node scripts/seed-runtime-fixed-tour.mjs");
  });
});
