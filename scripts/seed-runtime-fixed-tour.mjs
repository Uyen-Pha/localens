import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import { resolveLocalSupabaseCli, runLocalSupabase } from "./supabase-local.mjs";

const { Client } = pg;
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_SUPABASE_VERSION = "2.115.0";
const LOCAL_SUPABASE_API_PORT = "54321";
const LOCAL_SUPABASE_DB_PORT = "54322";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const RUNTIME_FIXED_TOUR_SEED_ERROR = Symbol("RUNTIME_FIXED_TOUR_SEED_ERROR");

export const RUNTIME_FIXED_TOUR_CUSTOMER = Object.freeze({
  email: "customer-b.runtime-fixed-tour@localens.test",
  role: "customer",
  displayName: "Runtime Test Traveler B",
  language: "vi",
});

export const RUNTIME_FIXED_TOUR_FIXTURE = Object.freeze({
  areaId: "b2200000-0000-4000-8000-000000000001",
  firstPlaceId: "b2200000-0000-4000-8000-000000000011",
  secondPlaceId: "b2200000-0000-4000-8000-000000000012",
  firstOpeningId: "b2200000-0000-4000-8000-000000000021",
  secondOpeningId: "b2200000-0000-4000-8000-000000000022",
  outboundEdgeId: "b2200000-0000-4000-8000-000000000031",
  returnEdgeId: "b2200000-0000-4000-8000-000000000032",
  tourId: "b2200000-0000-4000-8000-000000000041",
  tourVersionId: "b2200000-0000-4000-8000-000000000042",
  departureId: "b2200000-0000-4000-8000-000000000043",
  departureStartAt: "2099-09-05T02:00:00.000Z",
  departureEndAt: "2099-09-05T05:00:00.000Z",
  capacity: 8,
});

function seedError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error[RUNTIME_FIXED_TOUR_SEED_ERROR] = true;
  return error;
}

function stableSeedError(error, code, message) {
  return error?.[RUNTIME_FIXED_TOUR_SEED_ERROR] === true ? error : seedError(code, message);
}

function requireLocalEndpoint(value, { protocols, port, label, rejectSearch = false }) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw seedError("RUNTIME_FIXED_TOUR_SEED_LOCAL_ONLY", `${label} must be a loopback URL`);
  }
  if (
    !protocols.includes(parsed.protocol) ||
    !LOOPBACK_HOSTS.has(parsed.hostname) ||
    parsed.port !== port ||
    (rejectSearch && parsed.search !== "")
  ) {
    throw seedError(
      "RUNTIME_FIXED_TOUR_SEED_LOCAL_ONLY",
      `${label} must use the standard local Supabase loopback endpoint`,
    );
  }
}

function validateConfiguration({ supabaseUrl, databaseUrl, serviceRoleKey, customerPassword }) {
  requireLocalEndpoint(supabaseUrl, {
    protocols: ["http:", "https:"],
    port: LOCAL_SUPABASE_API_PORT,
    label: "Supabase API URL",
  });
  requireLocalEndpoint(databaseUrl, {
    protocols: ["postgres:", "postgresql:"],
    port: LOCAL_SUPABASE_DB_PORT,
    label: "database URL",
    rejectSearch: true,
  });
  if (typeof serviceRoleKey !== "string" || serviceRoleKey.length === 0) {
    throw seedError("RUNTIME_FIXED_TOUR_SEED_SERVICE_KEY_REQUIRED", "local service-role key is required");
  }
  if (typeof customerPassword !== "string" || customerPassword.length === 0) {
    throw seedError("RUNTIME_FIXED_TOUR_SEED_PASSWORD_REQUIRED", "second-customer password is required");
  }
}

function unwrapAdmin(operation, result) {
  if (result?.error) throw seedError("RUNTIME_FIXED_TOUR_SEED_AUTH_FAILED", `${operation} failed`);
  return result?.data;
}

async function callAuthAdmin(operation, call) {
  try {
    return unwrapAdmin(operation, await call());
  } catch (error) {
    if (error?.[RUNTIME_FIXED_TOUR_SEED_ERROR] === true) throw error;
    throw seedError("RUNTIME_FIXED_TOUR_SEED_AUTH_FAILED", `${operation} failed`);
  }
}

async function findCustomer(authAdmin) {
  let page = 1;
  const perPage = 1000;
  while (true) {
    const data = await callAuthAdmin("list local Auth users", () => authAdmin.listUsers({ page, perPage }));
    const users = Array.isArray(data?.users) ? data.users : [];
    const found = users.find(({ email }) => email === RUNTIME_FIXED_TOUR_CUSTOMER.email);
    if (found) return found;
    if (!data?.nextPage || users.length < perPage) return null;
    page = data.nextPage;
  }
}

async function ensureCustomer(authAdmin, customerPassword) {
  const existing = await findCustomer(authAdmin);
  const attributes = {
    email: RUNTIME_FIXED_TOUR_CUSTOMER.email,
    password: customerPassword,
    email_confirm: true,
  };
  const data = existing
    ? await callAuthAdmin("update second local customer", () => authAdmin.updateUserById(existing.id, attributes))
    : await callAuthAdmin("create second local customer", () => authAdmin.createUser(attributes));
  if (!data?.user?.id) {
    throw seedError("RUNTIME_FIXED_TOUR_SEED_AUTH_FAILED", "second local customer has no id");
  }
  return { userId: data.user.id, seedStatus: existing ? "reused" : "created" };
}

async function compensateCreatedCustomer(authAdmin, userId) {
  try {
    await callAuthAdmin("remove partially seeded second customer", () => authAdmin.deleteUser(userId));
  } catch {
    // Preserve the primary stable database error; compensation is best-effort.
  }
}

const GRAPH_EXISTS_SQL = `SELECT EXISTS (
  SELECT 1
  FROM public.departures AS departure
  JOIN public.tour_versions AS version ON version.id = departure.tour_version_id
  JOIN public.tours AS tour ON tour.id = version.tour_id
  JOIN public.catalog_snapshots AS catalog ON catalog.id = version.catalog_snapshot_id
  WHERE departure.id = $1::uuid
    AND departure.start_at = $2::timestamptz
    AND departure.end_at = $3::timestamptz
    AND tour.id = $4::uuid
    AND tour.slug = 'runtime-test-markets-and-street-food'
    AND tour.status = 'published'::public.tour_status
    AND version.status = 'published'::public.tour_version_status
    AND catalog.status = 'published'::public.snapshot_status
) AS exists`;

const IDENTITY_SQL = Object.freeze([
  "DELETE FROM private.user_roles WHERE user_id = $1::uuid",
  `INSERT INTO private.user_roles (user_id, role)
   VALUES ($1::uuid, 'customer'::public.app_role)`,
  `INSERT INTO public.profiles (id, display_name, language)
   VALUES ($1::uuid, 'Runtime Test Traveler B', 'vi'::public.locale)
   ON CONFLICT (id) DO UPDATE
   SET display_name = EXCLUDED.display_name, language = EXCLUDED.language`,
  "DELETE FROM public.guide_profiles WHERE user_id = $1::uuid",
]);

const AREA_SQL = `
INSERT INTO public.areas (id, slug)
VALUES ('b2200000-0000-4000-8000-000000000001'::uuid, 'runtime-test-central-hcmc');
INSERT INTO public.area_translations (area_id, locale, name, description) VALUES
  ('b2200000-0000-4000-8000-000000000001'::uuid, 'en', 'Runtime Test Central HCMC', 'Synthetic local-only runtime-test area; not a commercial catalog fact.'),
  ('b2200000-0000-4000-8000-000000000001'::uuid, 'vi', 'Khu trung tâm kiểm thử runtime', 'Khu vực tổng hợp chỉ dùng cho kiểm thử runtime cục bộ, không phải dữ liệu thương mại.');`;

const PLACES_SQL = `
INSERT INTO public.places (
  id, area_id, slug, status, price_vnd_per_person, visit_duration_minutes,
  source_url, verified_at, attribution
) VALUES
  ('b2200000-0000-4000-8000-000000000011'::uuid, 'b2200000-0000-4000-8000-000000000001'::uuid,
   'runtime-test-market-stop', 'draft', 50000, 75, 'https://example.com/runtime-test/market-stop',
   '2099-01-01', 'LocalLens synthetic runtime-test fixture'),
  ('b2200000-0000-4000-8000-000000000012'::uuid, 'b2200000-0000-4000-8000-000000000001'::uuid,
   'runtime-test-street-food-stop', 'draft', 100000, 75, 'https://example.com/runtime-test/street-food-stop',
   '2099-01-01', 'LocalLens synthetic runtime-test fixture');

INSERT INTO public.place_translations (place_id, locale, title, summary, description) VALUES
  ('b2200000-0000-4000-8000-000000000011'::uuid, 'en', 'Runtime Test Market', 'Synthetic market stop for local runtime verification.', 'Test-only market copy. It does not describe or approve a real venue.'),
  ('b2200000-0000-4000-8000-000000000011'::uuid, 'vi', 'Chợ kiểm thử runtime', 'Điểm chợ tổng hợp dùng để xác minh runtime cục bộ.', 'Nội dung chỉ dùng kiểm thử, không mô tả hoặc phê duyệt địa điểm thật.'),
  ('b2200000-0000-4000-8000-000000000012'::uuid, 'en', 'Runtime Test Street Food', 'Synthetic food stop for local runtime verification.', 'Test-only food copy. It does not describe or approve a real venue.'),
  ('b2200000-0000-4000-8000-000000000012'::uuid, 'vi', 'Ẩm thực đường phố kiểm thử', 'Điểm ẩm thực tổng hợp dùng để xác minh runtime cục bộ.', 'Nội dung chỉ dùng kiểm thử, không mô tả hoặc phê duyệt địa điểm thật.');

INSERT INTO public.place_experience_types (place_id, experience_type) VALUES
  ('b2200000-0000-4000-8000-000000000011'::uuid, 'traditional_market'),
  ('b2200000-0000-4000-8000-000000000012'::uuid, 'street_food');
INSERT INTO public.place_guide_languages (place_id, language) VALUES
  ('b2200000-0000-4000-8000-000000000011'::uuid, 'en'),
  ('b2200000-0000-4000-8000-000000000011'::uuid, 'vi'),
  ('b2200000-0000-4000-8000-000000000012'::uuid, 'en'),
  ('b2200000-0000-4000-8000-000000000012'::uuid, 'vi');
INSERT INTO public.place_supports (place_id, support_kind, requirement, status) VALUES
  ('b2200000-0000-4000-8000-000000000011'::uuid, 'mobility', 'step_free', 'unknown'),
  ('b2200000-0000-4000-8000-000000000012'::uuid, 'dietary', 'vegetarian', 'supported');
INSERT INTO public.place_opening_hours (id, place_id, weekday, opens_at, closes_at) VALUES
  ('b2200000-0000-4000-8000-000000000021'::uuid, 'b2200000-0000-4000-8000-000000000011'::uuid, 6, '08:00', '18:00'),
  ('b2200000-0000-4000-8000-000000000022'::uuid, 'b2200000-0000-4000-8000-000000000012'::uuid, 6, '08:00', '18:00');
UPDATE public.places
SET status = 'published'::public.place_status
WHERE id IN (
  'b2200000-0000-4000-8000-000000000011'::uuid,
  'b2200000-0000-4000-8000-000000000012'::uuid
);`;

const TRAVEL_SQL = `
INSERT INTO public.travel_edges (
  id, from_place_id, to_place_id, mode, minutes, group_cost_vnd, verified_at
) VALUES
  ('b2200000-0000-4000-8000-000000000031'::uuid, 'b2200000-0000-4000-8000-000000000011'::uuid,
   'b2200000-0000-4000-8000-000000000012'::uuid, 'walk', 15, 0, '2099-01-01T00:00:00Z'),
  ('b2200000-0000-4000-8000-000000000032'::uuid, 'b2200000-0000-4000-8000-000000000012'::uuid,
   'b2200000-0000-4000-8000-000000000011'::uuid, 'walk', 15, 0, '2099-01-01T00:00:00Z');
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  (SELECT user_id::text FROM private.user_roles WHERE role = 'admin'::public.app_role ORDER BY user_id LIMIT 1),
  true
);
SELECT private.create_catalog_snapshot();
SELECT private.create_travel_snapshot();`;

const TOUR_SQL = `
INSERT INTO public.tours (id, slug, status)
VALUES ('b2200000-0000-4000-8000-000000000041'::uuid, 'runtime-test-markets-and-street-food', 'draft');
INSERT INTO public.tour_translations (tour_id, locale, title, summary, meeting_point) VALUES
  ('b2200000-0000-4000-8000-000000000041'::uuid, 'en', 'Runtime Test Markets and Street Food', 'Synthetic fixed tour for local runtime hold verification only.', 'Runtime-test meeting point'),
  ('b2200000-0000-4000-8000-000000000041'::uuid, 'vi', 'Chợ và ẩm thực đường phố kiểm thử', 'Tour cố định tổng hợp chỉ dùng xác minh giữ chỗ runtime cục bộ.', 'Điểm hẹn kiểm thử runtime');
INSERT INTO public.tour_versions (
  id, tour_id, catalog_snapshot_id, status, duration_minutes, price_vnd_per_person,
  inclusions, exclusions, cancellation_policy, source_url, verified_at, attribution, license
)
SELECT
  'b2200000-0000-4000-8000-000000000042'::uuid,
  'b2200000-0000-4000-8000-000000000041'::uuid,
  id,
  'draft'::public.tour_version_status,
  180,
  650000,
  ARRAY['Runtime-test local guide', 'Synthetic tasting budget']::text[],
  ARRAY['Transport to the test meeting point']::text[],
  'Runtime-test hold only; no real payment or commercial cancellation applies.',
  'https://example.com/runtime-test/fixed-tour',
  '2099-01-01',
  'LocalLens synthetic runtime-test fixture',
  'Test-only synthetic data'
FROM public.catalog_snapshots
WHERE status = 'published'::public.snapshot_status
ORDER BY published_at DESC, id DESC
LIMIT 1;
INSERT INTO public.tour_version_translations (tour_version_id, locale, title, summary, meeting_point) VALUES
  ('b2200000-0000-4000-8000-000000000042'::uuid, 'en', 'Runtime Test Markets and Street Food', 'Synthetic fixed tour for local runtime hold verification only.', 'Runtime-test meeting point'),
  ('b2200000-0000-4000-8000-000000000042'::uuid, 'vi', 'Chợ và ẩm thực đường phố kiểm thử', 'Tour cố định tổng hợp chỉ dùng xác minh giữ chỗ runtime cục bộ.', 'Điểm hẹn kiểm thử runtime');
INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id)
SELECT 'b2200000-0000-4000-8000-000000000042'::uuid, catalog_snapshot_id, stops.position, stops.place_id
FROM public.tour_versions
CROSS JOIN (VALUES
  (1::smallint, 'b2200000-0000-4000-8000-000000000011'::uuid),
  (2::smallint, 'b2200000-0000-4000-8000-000000000012'::uuid)
) AS stops(position, place_id)
WHERE id = 'b2200000-0000-4000-8000-000000000042'::uuid;
UPDATE public.tour_versions
SET status = 'published'::public.tour_version_status, published_at = pg_catalog.clock_timestamp()
WHERE id = 'b2200000-0000-4000-8000-000000000042'::uuid;
UPDATE public.tours
SET status = 'published'::public.tour_status
WHERE id = 'b2200000-0000-4000-8000-000000000041'::uuid;
INSERT INTO public.departures (id, tour_version_id, start_at, end_at, status, capacity)
VALUES (
  'b2200000-0000-4000-8000-000000000043'::uuid,
  'b2200000-0000-4000-8000-000000000042'::uuid,
  '2099-09-05T02:00:00.000Z'::timestamptz,
  '2099-09-05T05:00:00.000Z'::timestamptz,
  'scheduled'::public.departure_status,
  8
);`;

async function seedDatabase(query, userId) {
  let transactionStarted = false;
  try {
    await query("BEGIN");
    transactionStarted = true;
    for (const identityStatement of IDENTITY_SQL) {
      await query(identityStatement, [userId]);
    }
    const existing = await query(GRAPH_EXISTS_SQL, [
      RUNTIME_FIXED_TOUR_FIXTURE.departureId,
      RUNTIME_FIXED_TOUR_FIXTURE.departureStartAt,
      RUNTIME_FIXED_TOUR_FIXTURE.departureEndAt,
      RUNTIME_FIXED_TOUR_FIXTURE.tourId,
    ]);
    const graphExists = existing?.rows?.[0]?.exists === true;
    if (!graphExists) {
      await query(AREA_SQL);
      await query(PLACES_SQL);
      await query(TRAVEL_SQL);
      await query(TOUR_SQL);
    }
    await query("COMMIT");
    return graphExists ? "reused" : "created";
  } catch {
    if (transactionStarted) {
      try {
        await query("ROLLBACK");
      } catch {
        // Preserve the stable primary database error.
      }
    }
    throw seedError("RUNTIME_FIXED_TOUR_SEED_DATABASE_FAILED", "transactional fixture seed failed");
  }
}

export async function seedRuntimeFixedTour(options) {
  const {
    supabaseUrl,
    databaseUrl,
    serviceRoleKey,
    customerPassword,
    authAdmin,
    query,
    logger = () => {},
  } = options ?? {};
  validateConfiguration({ supabaseUrl, databaseUrl, serviceRoleKey, customerPassword });
  if (
    !authAdmin ||
    typeof authAdmin.listUsers !== "function" ||
    typeof authAdmin.createUser !== "function" ||
    typeof authAdmin.updateUserById !== "function" ||
    typeof authAdmin.deleteUser !== "function"
  ) {
    throw seedError("RUNTIME_FIXED_TOUR_SEED_AUTH_REQUIRED", "Auth admin client is required");
  }
  if (typeof query !== "function") {
    throw seedError("RUNTIME_FIXED_TOUR_SEED_DATABASE_REQUIRED", "database query function is required");
  }

  const customer = await ensureCustomer(authAdmin, customerPassword);
  let state;
  try {
    state = await seedDatabase(query, customer.userId);
  } catch (error) {
    if (customer.seedStatus === "created") await compensateCreatedCustomer(authAdmin, customer.userId);
    throw error;
  }
  logger(
    `[db:seed:runtime-fixed-tour] ${RUNTIME_FIXED_TOUR_CUSTOMER.email} ` +
      `status=${customer.seedStatus} fixture=${state} departure=${RUNTIME_FIXED_TOUR_FIXTURE.departureStartAt}`,
  );
  return {
    customer: { ...RUNTIME_FIXED_TOUR_CUSTOMER, userId: customer.userId, seedStatus: customer.seedStatus },
    fixture: RUNTIME_FIXED_TOUR_FIXTURE,
    state,
  };
}

function parseLocalStatusEnv(output) {
  const selected = {};
  for (const line of String(output).split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(?:"([^"]*)"|'([^']*)'|(.*))$/);
    if (!match || !["API_URL", "SERVICE_ROLE_KEY"].includes(match[1])) continue;
    selected[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return selected;
}

function requirePinnedLocalCli() {
  const cliPath = resolveLocalSupabaseCli({ cwd: PROJECT_ROOT });
  if (!cliPath) {
    throw seedError("RUNTIME_FIXED_TOUR_SEED_CLI_PATH", "exact project-local Supabase CLI is required");
  }
  let version;
  try {
    version = runLocalSupabase(["--version"], { capture: true, cliPath, cwd: PROJECT_ROOT }).stdout.trim();
  } catch {
    throw seedError("RUNTIME_FIXED_TOUR_SEED_CLI_VERSION", "project-local Supabase CLI version check failed");
  }
  if (version !== REQUIRED_SUPABASE_VERSION) {
    throw seedError(
      "RUNTIME_FIXED_TOUR_SEED_CLI_VERSION",
      `project-local Supabase CLI must report exactly ${REQUIRED_SUPABASE_VERSION}`,
    );
  }
  return cliPath;
}

export async function runRuntimeFixedTourSeedCli({ env = process.env, logger = console.log } = {}) {
  const cliPath = requirePinnedLocalCli();
  let status;
  try {
    status = runLocalSupabase(["status", "-o", "env"], {
      capture: true,
      cliPath,
      cwd: PROJECT_ROOT,
    });
  } catch {
    throw seedError("RUNTIME_FIXED_TOUR_SEED_STATUS_FAILED", "local Supabase status failed");
  }
  const localStatus = parseLocalStatusEnv(status.stdout);
  const configuration = {
    supabaseUrl: localStatus.API_URL,
    databaseUrl: env.LOCALENS_DB_URL,
    serviceRoleKey: localStatus.SERVICE_ROLE_KEY,
    customerPassword: env.LOCALENS_RUNTIME_FIXED_TOUR_CUSTOMER_PASSWORD,
  };
  validateConfiguration(configuration);

  let authAdmin;
  let client;
  try {
    authAdmin = createClient(configuration.supabaseUrl, configuration.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }).auth.admin;
    client = new Client({
      connectionString: configuration.databaseUrl,
      application_name: "localens-runtime-fixed-tour-seed",
    });
  } catch {
    throw seedError("RUNTIME_FIXED_TOUR_SEED_CLIENT_FAILED", "local seed client construction failed");
  }

  let result;
  let primaryError;
  try {
    try {
      await client.connect();
    } catch {
      throw seedError("RUNTIME_FIXED_TOUR_SEED_CONNECT_FAILED", "local database connection failed");
    }
    result = await seedRuntimeFixedTour({ ...configuration, authAdmin, query: client.query.bind(client), logger });
  } catch (error) {
    primaryError = stableSeedError(error, "RUNTIME_FIXED_TOUR_SEED_FAILED", "local runtime fixed-tour seed failed");
  } finally {
    try {
      await client.end();
    } catch {
      if (!primaryError) {
        primaryError = seedError("RUNTIME_FIXED_TOUR_SEED_TEARDOWN_FAILED", "local database teardown failed");
      }
    }
  }
  if (primaryError) throw primaryError;
  return result;
}

export async function runRuntimeFixedTourSeedMain({
  run = runRuntimeFixedTourSeedCli,
  errorLogger = console.error,
} = {}) {
  try {
    await run();
    return 0;
  } catch (error) {
    const stableError = stableSeedError(
      error,
      "RUNTIME_FIXED_TOUR_SEED_FAILED",
      "local runtime fixed-tour seed failed",
    );
    try {
      errorLogger(stableError.message);
    } catch {
      // Logging failure must not change the stable exit contract.
    }
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runRuntimeFixedTourSeedMain();
}
