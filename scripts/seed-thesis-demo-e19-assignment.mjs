import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

export const E19_FIXTURE_VERSION = "thesis-demo.v2.e19.assignment.v1";
export const E19_BASE_DATASET_VERSION = "thesis-demo.v2";
export const E19_ASSIGNMENT_IDEMPOTENCY_KEY = "thesis-demo:v2:e19:assignment:booking502";
export const E19_CONFIRMATION = "localens-thesis-demo-e19-assignment";
export const E19_MANIFEST_FILE = "thesis-demo.e19-assignment.v1.json";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const BASE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(BASE_DIR, "data", "demo", E19_MANIFEST_FILE);

function fixtureError(code, message) {
  const error = new Error("[" + code + "] " + message);
  error.code = code;
  return error;
}

function invalid(message) {
  throw fixtureError("E19_MANIFEST_INVALID", message);
}

function requireValue(condition, message) {
  if (!condition) invalid(message);
}

function requireExact(actual, expected, label) {
  if (actual !== expected) invalid(label + " must be " + expected);
}

function requireUuid(value, label) {
  requireValue(typeof value === "string" && UUID_RE.test(value), label + " must be a UUID");
}

function requireIso(value, label) {
  requireValue(typeof value === "string", label + " must be an ISO timestamp");
  const parsed = new Date(value);
  requireValue(Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value, label + " must use canonical UTC ISO form");
}

function requireArray(actual, expected, label) {
  requireValue(Array.isArray(actual) && actual.length === expected.length, label + " has an unexpected length");
  expected.forEach((value, index) => requireExact(actual[index], value, label + "[" + index + "]"));
}

export function validateE19AssignmentManifest(value) {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value), "manifest must be an object");
  requireExact(value.schemaVersion, 1, "schemaVersion");
  requireExact(value.fixtureVersion, E19_FIXTURE_VERSION, "fixtureVersion");
  requireExact(value.baseDatasetVersion, E19_BASE_DATASET_VERSION, "baseDatasetVersion");
  requireExact(value.baseManifestEnvironment, "thesis-demo", "baseManifestEnvironment");
  requireExact(value.classification, "synthetic_demo", "classification");
  requireExact(value.purpose, "assignment-only", "purpose");
  requireExact(value.timezone, "Asia/Ho_Chi_Minh", "timezone");
  requireExact(value.ownerAccountKey, "customer-qa", "ownerAccountKey");
  requireExact(value.ownerEmail, "customer.qa@localens.invalid", "ownerEmail");
  requireExact(value.guideAccountKey, "guide-demo", "guideAccountKey");
  requireExact(value.guideEmail, "guide.demo@localens.invalid", "guideEmail");
  requireExact(value.assignmentActorAccountKey, "admin-demo", "assignmentActorAccountKey");
  requireExact(value.assignmentActorEmail, "admin.demo@localens.invalid", "assignmentActorEmail");
  requireExact(value.assignmentIdempotencyKey, E19_ASSIGNMENT_IDEMPOTENCY_KEY, "assignmentIdempotencyKey");
  requireValue(IDEMPOTENCY_RE.test(value.assignmentIdempotencyKey), "assignmentIdempotencyKey has an invalid format");

  const expectedIds = {
    sourceTourId: "d1700000-0000-4000-8000-000000000401",
    sourceTourVersionId: "d1700000-0000-4000-8000-000000000411",
    sourceDepartureId: "d1700000-0000-4000-8000-000000000431",
    sourceBookingId: "d1700000-0000-4000-8000-000000000502",
    sourceHoldId: "d1700000-0000-4000-8000-000000000552",
  };
  for (const [label, expected] of Object.entries(expectedIds)) {
    requireUuid(value[label], label);
    requireExact(value[label], expected, label);
  }

  requireValue(value.departure && typeof value.departure === "object", "departure is required");
  requireUuid(value.departure.id, "departure.id");
  requireExact(value.departure.id, "d1700000-0000-4000-8000-000001000451", "departure.id");
  requireExact(value.departure.tourVersionId, value.sourceTourVersionId, "departure.tourVersionId");
  requireExact(value.departure.startAt, "2026-10-03T02:00:00.000Z", "departure.startAt");
  requireExact(value.departure.endAt, "2026-10-03T05:00:00.000Z", "departure.endAt");
  requireIso(value.departure.startAt, "departure.startAt");
  requireIso(value.departure.endAt, "departure.endAt");
  requireExact(value.departure.status, "scheduled", "departure.status");
  requireExact(value.departure.capacity, 1, "departure.capacity");
  requireValue(new Date(value.departure.endAt).valueOf() > new Date(value.departure.startAt).valueOf(), "departure interval must be positive");

  requireValue(value.booking && typeof value.booking === "object", "booking is required");
  requireUuid(value.booking.id, "booking.id");
  requireUuid(value.booking.holdId, "booking.holdId");
  requireExact(value.booking.id, "d1700000-0000-4000-8000-000001000502", "booking.id");
  requireExact(value.booking.holdId, "d1700000-0000-4000-8000-000001000552", "booking.holdId");
  requireExact(value.booking.partySize, 1, "booking.partySize");
  requireExact(value.booking.status, "confirmed", "booking.status");
  requireExact(value.booking.holdStatus, "consumed", "booking.holdStatus");
  requireIso(value.booking.createdAt, "booking.createdAt");
  requireExact(value.booking.createdAt, "2026-10-03T00:00:01.000Z", "booking.createdAt");
  requireValue(new Date(value.booking.createdAt).valueOf() < new Date(value.departure.startAt).valueOf(), "booking.createdAt must precede departure");

  const preserve = value.preserve;
  requireValue(preserve && typeof preserve === "object", "preserve is required");
  requireArray(preserve.teacherDepartureIds, [
    "d1700000-0000-4000-8000-000000000421",
    "d1700000-0000-4000-8000-000000000422",
    "d1700000-0000-4000-8000-000000000423",
  ], "preserve.teacherDepartureIds");
  requireArray(preserve.qaDepartureIds, [
    "d1700000-0000-4000-8000-000000000431",
    "d1700000-0000-4000-8000-000000000432",
  ], "preserve.qaDepartureIds");
  requireArray(preserve.qaBookingIds, [
    "d1700000-0000-4000-8000-000000000711",
    "d1700000-0000-4000-8000-000000000712",
    "d1700000-0000-4000-8000-000000000713",
    "d1700000-0000-4000-8000-000000000714",
  ], "preserve.qaBookingIds");
  requireArray(preserve.qaHoldIds, [
    "d1700000-0000-4000-8000-000000000781",
    "d1700000-0000-4000-8000-000000000782",
    "d1700000-0000-4000-8000-000000000783",
    "d1700000-0000-4000-8000-000000000784",
  ], "preserve.qaHoldIds");
  requireArray(preserve.fixtureBookingIds, [
    "d1700000-0000-4000-8000-000000000501",
    "d1700000-0000-4000-8000-000000000502",
  ], "preserve.fixtureBookingIds");
  requireArray(preserve.assignmentIds, ["d1700000-0000-4000-8000-000000000601"], "preserve.assignmentIds");
  requireArray(preserve.qaSlotIds, ["qa-01", "qa-02", "qa-03", "qa-04"], "preserve.qaSlotIds");

  const allProtectedIds = [
    ...preserve.teacherDepartureIds,
    ...preserve.qaDepartureIds,
    ...preserve.qaBookingIds,
    ...preserve.qaHoldIds,
    ...preserve.fixtureBookingIds,
    ...preserve.assignmentIds,
  ];
  requireValue(!allProtectedIds.includes(value.departure.id), "new departure overlaps a protected ID");
  requireValue(!allProtectedIds.includes(value.booking.id), "new booking overlaps a protected ID");
  requireValue(!allProtectedIds.includes(value.booking.holdId), "new hold overlaps a protected ID");

  const constraints = value.constraints;
  requireValue(constraints && typeof constraints === "object", "constraints are required");
  for (const key of [
    "mustReusePublishedTourVersion",
    "mustNotCreateAccountOrRole",
    "mustNotCreateQaSlot",
    "mustNotCreateInitialAssignment",
    "mustNotModifyExistingGraph",
  ]) requireExact(constraints[key], true, "constraints." + key);

  return value;
}

export function loadE19AssignmentManifest() {
  return validateE19AssignmentManifest(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")));
}

function normalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]),
    );
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(normalize(value));
}

async function rows(query, sql, values = []) {
  const result = await query(sql, values);
  return Array.isArray(result?.rows) ? result.rows : [];
}

function rowLock(enabled, clause = "FOR SHARE") {
  return enabled ? clause : "";
}

function requireRows(found, count, code, label) {
  if (found.length !== count) throw fixtureError(code, label + " expected " + count + " row(s)");
  return found[0];
}

function timestamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) throw fixtureError("E19_BASE_GRAPH_INVALID", "database timestamp is invalid");
  return date.valueOf();
}

function sameTimestamp(actual, expected) {
  return timestamp(actual) === timestamp(expected);
}

function sameText(actual, expected) {
  return actual === expected || String(actual) === String(expected);
}

function assertBaseFacts(facts, manifest, expectedProjectRef = null) {
  const marker = requireRows(facts.marker, 1, "E19_BASE_MARKER_MISSING", "base manifest");
  if (marker.environment !== manifest.baseManifestEnvironment
      || marker.dataset_version !== manifest.baseDatasetVersion
      || (expectedProjectRef !== null && marker.project_ref !== expectedProjectRef)) {
    throw fixtureError("E19_BASE_MARKER_MISMATCH", "base manifest does not match thesis-demo.v2");
  }

  const departure = requireRows(facts.departure, 1, "E19_BASE_GRAPH_INVALID", "source departure");
  if (departure.id !== manifest.sourceDepartureId
      || departure.tour_version_id !== manifest.sourceTourVersionId
      || departure.status !== "scheduled") {
    throw fixtureError("E19_BASE_GRAPH_INVALID", "source departure is not the reviewed scheduled departure");
  }

  const tour = requireRows(facts.tour, 1, "E19_BASE_GRAPH_INVALID", "source tour version");
  if (tour.tour_id !== manifest.sourceTourId
      || tour.tour_version_id !== manifest.sourceTourVersionId
      || tour.tour_status !== "published"
      || tour.tour_version_status !== "published") {
    throw fixtureError("E19_BASE_GRAPH_INVALID", "source tour version is not published");
  }

  const booking = requireRows(facts.booking, 1, "E19_BASE_GRAPH_INVALID", "source booking");
  if (booking.id !== manifest.sourceBookingId
      || booking.owner_email !== manifest.ownerEmail
      || booking.source_kind !== "departure"
      || booking.source_id !== manifest.sourceDepartureId
      || booking.departure_id !== manifest.sourceDepartureId
      || booking.quote_id !== null
      || booking.tour_version_id !== manifest.sourceTourVersionId
      || booking.status !== "confirmed"
      || Number(booking.party_size) !== 1
      || Number(booking.hold_duration_seconds) !== 2100
      || booking.checkout_currency !== "vnd"
      || booking.fx_snapshot_id !== null
      || booking.fx_vnd_per_usd !== null
      || booking.catalog_snapshot_id === null
      || booking.travel_snapshot_id === null) {
    throw fixtureError("E19_BASE_GRAPH_INVALID", "source booking does not match the assigned-guide fixture shape");
  }
  if (!sameTimestamp(booking.hold_expires_at, new Date(timestamp(booking.created_at) + 35 * 60 * 1000))) {
    throw fixtureError("E19_BASE_GRAPH_INVALID", "source booking hold expiry is invalid");
  }

  const hold = requireRows(facts.hold, 1, "E19_BASE_GRAPH_INVALID", "source hold");
  if (hold.id !== manifest.sourceHoldId
      || hold.booking_id !== manifest.sourceBookingId
      || hold.departure_id !== manifest.sourceDepartureId
      || Number(hold.party_size) !== 1
      || hold.status !== "consumed"
      || hold.consumed_at === null
      || hold.released_at !== null
      || !sameTimestamp(hold.expires_at, new Date(timestamp(hold.created_at) + 35 * 60 * 1000))) {
    throw fixtureError("E19_BASE_GRAPH_INVALID", "source hold does not match the committed hold shape");
  }

  for (const expected of [
    { email: manifest.ownerEmail, role: "customer", guide: false },
    { email: manifest.guideEmail, role: "guide", guide: true },
    { email: manifest.assignmentActorEmail, role: "admin", guide: false },
  ]) {
    const users = facts.identities.filter((row) => row.email === expected.email);
    if (users.length !== 1) {
      throw fixtureError("E19_BASE_IDENTITY_INVALID", expected.email + " is not the expected existing account");
    }
    const userId = users[0].user_id;
    const roleRows = facts.identityRoles.filter((row) => row.user_id === userId);
    const guideRows = facts.identityGuides.filter((row) => row.user_id === userId);
    if (roleRows.length !== 1
        || roleRows[0].role !== expected.role
        || (expected.guide ? guideRows.length !== 1 : guideRows.length !== 0)) {
      throw fixtureError("E19_BASE_IDENTITY_INVALID", expected.email + " is not the expected existing account");
    }
  }
}

async function readBaseFacts(query, manifest, lockRows = true) {
  return {
    marker: await rows(query, `
      /* e19:base-manifest */
      SELECT project_ref, environment, dataset_version, seed_base_date
      FROM private.thesis_demo_manifest
      WHERE environment = $1
      ${rowLock(lockRows)}
    `, [manifest.baseManifestEnvironment]),
    departure: await rows(query, `
      /* e19:source-departure */
      SELECT id, tour_version_id, start_at, end_at, status::text AS status, capacity
      FROM public.departures
      WHERE id = $1
      ${rowLock(lockRows)}
    `, [manifest.sourceDepartureId]),
    tour: await rows(query, `
      /* e19:source-tour */
      SELECT tours.id AS tour_id, tours.status::text AS tour_status,
        versions.id AS tour_version_id, versions.status::text AS tour_version_status,
        versions.published_at, versions.price_vnd_per_person
      FROM public.tours AS tours
      JOIN public.tour_versions AS versions ON versions.tour_id = tours.id
      WHERE tours.id = $1 AND versions.id = $2
      ${rowLock(lockRows)}
    `, [manifest.sourceTourId, manifest.sourceTourVersionId]),
    booking: await rows(query, `
      /* e19:source-booking */
      SELECT bookings.id, bookings.owner_user_id, users.email AS owner_email,
        bookings.source_kind, bookings.source_id, bookings.departure_id, bookings.quote_id,
        bookings.status::text AS status, bookings.tour_version_id,
        bookings.title_en, bookings.title_vi, bookings.cancellation_policy,
        bookings.catalog_snapshot_id, bookings.travel_snapshot_id,
        bookings.fx_snapshot_id, bookings.fx_vnd_per_usd,
        bookings.per_person_vnd_minor, bookings.total_vnd_minor,
        bookings.checkout_currency::text AS checkout_currency,
        bookings.checkout_amount_minor, bookings.party_size, bookings.language::text AS language,
        bookings.meeting_point, bookings.hold_duration_seconds,
        bookings.hold_expires_at, bookings.created_at
      FROM public.bookings AS bookings
      JOIN auth.users AS users ON users.id = bookings.owner_user_id
      WHERE bookings.id = $1
      ${rowLock(lockRows)}
    `, [manifest.sourceBookingId]),
    hold: await rows(query, `
      /* e19:source-hold */
      SELECT id, booking_id, departure_id, party_size, status::text AS status,
        expires_at, created_at, consumed_at, released_at
      FROM private.capacity_holds
      WHERE id = $1
      ${rowLock(lockRows)}
    `, [manifest.sourceHoldId]),
    identities: await rows(query, `
      /* e19:identities */
      SELECT users.id AS user_id, users.email
      FROM auth.users AS users
      WHERE users.email = ANY($1::text[])
      ORDER BY users.email
      ${rowLock(lockRows, "FOR SHARE OF users")}
    `, [[manifest.ownerEmail, manifest.guideEmail, manifest.assignmentActorEmail]]),
    identityRoles: await rows(query, `
      /* e19:identity-roles */
      SELECT user_id, role::text AS role
      FROM private.user_roles
      WHERE user_id IN (
        SELECT id
        FROM auth.users
        WHERE email IN (
          'customer.qa@localens.invalid',
          'guide.demo@localens.invalid',
          'admin.demo@localens.invalid'
        )
      )
      ORDER BY user_id, role
      ${rowLock(lockRows)}
    `, []),
    identityGuides: await rows(query, `
      /* e19:identity-guides */
      SELECT user_id
      FROM public.guide_profiles
      WHERE user_id IN (
        SELECT id
        FROM auth.users
        WHERE email IN (
          'customer.qa@localens.invalid',
          'guide.demo@localens.invalid',
          'admin.demo@localens.invalid'
        )
      )
      ORDER BY user_id
      ${rowLock(lockRows)}
    `, []),
  };
}

async function readPreservedGraph(query, manifest, lockRows = true) {
  const departureIds = [...manifest.preserve.teacherDepartureIds, ...manifest.preserve.qaDepartureIds];
  const bookingIds = [...manifest.preserve.fixtureBookingIds, ...manifest.preserve.qaBookingIds];
  const holdIds = [
    ...manifest.preserve.qaHoldIds,
    "d1700000-0000-4000-8000-000000000551",
    manifest.sourceHoldId,
  ];
  return {
    marker: await rows(query, `
      /* e19:preserved-marker */
      SELECT project_ref, environment, dataset_version, seed_base_date
      FROM private.thesis_demo_manifest
      WHERE environment = $1
      ${rowLock(lockRows)}
    `, [manifest.baseManifestEnvironment]),
    tour: await rows(query, `
      /* e19:preserved-tour */
      SELECT tours.id AS tour_id, tours.status::text AS tour_status,
        versions.id AS tour_version_id, versions.tour_id,
        versions.status::text AS tour_version_status, versions.published_at,
        versions.price_vnd_per_person, versions.catalog_snapshot_id
      FROM public.tours AS tours
      JOIN public.tour_versions AS versions ON versions.tour_id = tours.id
      WHERE tours.id = $1 AND versions.id = $2
      ${rowLock(lockRows)}
    `, [manifest.sourceTourId, manifest.sourceTourVersionId]),
    departures: await rows(query, `
      /* e19:preserved-departures */
      SELECT id, tour_version_id, start_at, end_at, status::text AS status, capacity
      FROM public.departures
      WHERE id = ANY($1::uuid[])
      ORDER BY id
      ${rowLock(lockRows)}
    `, [departureIds]),
    bookings: await rows(query, `
      /* e19:preserved-bookings */
      SELECT id, owner_user_id, source_kind, source_id, departure_id, quote_id,
        status::text AS status, tour_version_id, party_size,
        total_vnd_minor, checkout_currency::text AS checkout_currency,
        checkout_amount_minor, hold_duration_seconds, hold_expires_at, created_at
      FROM public.bookings
      WHERE id = ANY($1::uuid[])
      ORDER BY id
      ${rowLock(lockRows)}
    `, [bookingIds]),
    holds: await rows(query, `
      /* e19:preserved-holds */
      SELECT id, booking_id, departure_id, party_size, status::text AS status,
        expires_at, created_at, consumed_at, released_at
      FROM private.capacity_holds
      WHERE id = ANY($1::uuid[])
      ORDER BY id
      ${rowLock(lockRows)}
    `, [holdIds]),
    assignments: await rows(query, `
      /* e19:preserved-assignments */
      SELECT id, booking_id, guide_user_id, status::text AS status,
        to_jsonb(assignments) AS row_data
      FROM public.guide_assignments AS assignments
      WHERE id = ANY($1::uuid[])
      ORDER BY id
      ${rowLock(lockRows)}
    `, [manifest.preserve.assignmentIds]),
    lifecycle: await rows(query, `
      /* e19:preserved-lifecycle */
      SELECT relation, row_key, row_data
      FROM (
        SELECT 'private.checkout_attempts'::text AS relation,
          id::text AS row_key, to_jsonb(attempts) AS row_data, booking_id
        FROM private.checkout_attempts AS attempts
        WHERE booking_id = ANY($1::uuid[])
        UNION ALL
        SELECT 'private.checkout_idempotency', id::text, to_jsonb(idempotency), booking_id
        FROM private.checkout_idempotency AS idempotency
        WHERE booking_id = ANY($1::uuid[])
        UNION ALL
        SELECT 'public.payments', id::text, to_jsonb(payments), booking_id
        FROM public.payments AS payments
        WHERE booking_id = ANY($1::uuid[])
        UNION ALL
        SELECT 'private.simulated_payment_receipts', id::text, to_jsonb(receipts), booking_id
        FROM private.simulated_payment_receipts AS receipts
        WHERE booking_id = ANY($1::uuid[])
        UNION ALL
        SELECT 'private.fixed_tour_cancellation_requests', id::text, to_jsonb(requests), booking_id
        FROM private.fixed_tour_cancellation_requests AS requests
        WHERE booking_id = ANY($1::uuid[])
        UNION ALL
        SELECT 'private.booking_cancellations', id::text, to_jsonb(cancellations), booking_id
        FROM private.booking_cancellations AS cancellations
        WHERE booking_id = ANY($1::uuid[])
        UNION ALL
        SELECT 'private.guide_assignment_idempotency', idempotency_key, to_jsonb(assignment_ledger), booking_id
        FROM private.guide_assignment_idempotency AS assignment_ledger
        WHERE booking_id = ANY($1::uuid[])
      ) AS lifecycle
      ORDER BY relation, row_key
    `, [bookingIds]),
    qaSlots: await rows(query, `
      /* e19:preserved-slots */
      SELECT slot_id, to_jsonb(slots) AS row_data
      FROM private.thesis_demo_qa_slots AS slots
      WHERE slot_id = ANY($1::text[])
      ORDER BY slot_id
      ${rowLock(lockRows)}
    `, [manifest.preserve.qaSlotIds]),
  };
}

function assertPreservedBaseline(graph, manifest) {
  if (!graph.bookings.some((row) => row.id === manifest.sourceBookingId)
      || !graph.holds.some((row) => row.id === manifest.sourceHoldId)
      || !graph.assignments.some((row) =>
        row.id === manifest.preserve.assignmentIds[0]
        && row.booking_id === manifest.sourceBookingId
        && row.status === "assigned")) {
    throw fixtureError("E19_BASE_GRAPH_INVALID", "protected assigned-guide fixture is incomplete");
  }
}

async function readExtensionState(query, manifest, lockRows = true) {
  const departure = await rows(query, `
    /* e19:extension-departure */
    SELECT id, tour_version_id, start_at, end_at, status::text AS status, capacity
    FROM public.departures
    WHERE id = $1
    ${rowLock(lockRows)}
  `, [manifest.departure.id]);
  const booking = await rows(query, `
    /* e19:extension-booking */
    SELECT id, owner_user_id, source_kind, source_id, departure_id, quote_id,
      status::text AS status, tour_version_id, title_en, title_vi,
      cancellation_policy, catalog_snapshot_id, travel_snapshot_id,
      fx_snapshot_id, fx_vnd_per_usd, per_person_vnd_minor,
      total_vnd_minor, checkout_currency::text AS checkout_currency,
      checkout_amount_minor, party_size, language::text AS language,
      meeting_point, hold_duration_seconds, hold_expires_at, created_at
    FROM public.bookings
    WHERE id = $1
    ${rowLock(lockRows)}
  `, [manifest.booking.id]);
  const hold = await rows(query, `
    /* e19:extension-hold */
    SELECT id, booking_id, departure_id, party_size, status::text AS status,
      expires_at, created_at, consumed_at, released_at
    FROM private.capacity_holds
    WHERE id = $1
    ${rowLock(lockRows)}
  `, [manifest.booking.holdId]);
  const assignment = await rows(query, `
    /* e19:extension-assignment */
    SELECT id, booking_id, guide_user_id, status::text AS status
    FROM public.guide_assignments
    WHERE booking_id = $1
    ${rowLock(lockRows)}
  `, [manifest.booking.id]);
  const references = await rows(query, `
    /* e19:extension-references */
    SELECT relation, row_key
    FROM (
      SELECT 'private.checkout_attempts'::text AS relation, id::text AS row_key, booking_id
      FROM private.checkout_attempts WHERE booking_id = $1
      UNION ALL
      SELECT 'private.checkout_idempotency', id::text, booking_id
      FROM private.checkout_idempotency WHERE booking_id = $1
      UNION ALL
      SELECT 'public.payments', id::text, booking_id
      FROM public.payments WHERE booking_id = $1
      UNION ALL
      SELECT 'private.simulated_payment_receipts', id::text, booking_id
      FROM private.simulated_payment_receipts WHERE booking_id = $1
      UNION ALL
      SELECT 'private.fixed_tour_cancellation_requests', id::text, booking_id
      FROM private.fixed_tour_cancellation_requests WHERE booking_id = $1
      UNION ALL
      SELECT 'private.booking_cancellations', id::text, booking_id
      FROM private.booking_cancellations WHERE booking_id = $1
      UNION ALL
      SELECT 'private.guide_assignment_idempotency', idempotency_key, booking_id
      FROM private.guide_assignment_idempotency WHERE booking_id = $1
    ) AS refs
    ORDER BY relation, row_key
  `, [manifest.booking.id]);
  const qaSlots = await rows(query, `
    /* e19:extension-qa-slot */
    SELECT slot_id, booking_id
    FROM private.thesis_demo_qa_slots
    WHERE booking_id = $1
    ${rowLock(lockRows)}
  `, [manifest.booking.id]);
  return { departure, booking, hold, assignment, references, qaSlots };
}

function assertExtensionComplete(state, facts, manifest) {
  const departure = requireRows(state.departure, 1, "E19_ASSIGNMENT_FIXTURE_DRIFT", "extension departure");
  if (departure.tour_version_id !== manifest.sourceTourVersionId
      || departure.status !== "scheduled"
      || Number(departure.capacity) !== 1
      || !sameTimestamp(departure.start_at, manifest.departure.startAt)
      || !sameTimestamp(departure.end_at, manifest.departure.endAt)) {
    throw fixtureError("E19_ASSIGNMENT_FIXTURE_DRIFT", "extension departure differs from the manifest");
  }
  const source = requireRows(facts.booking, 1, "E19_BASE_GRAPH_INVALID", "source booking");
  const booking = requireRows(state.booking, 1, "E19_ASSIGNMENT_FIXTURE_DRIFT", "extension booking");
  const sameFields = [
    ["owner_user_id", source.owner_user_id],
    ["source_kind", "departure"],
    ["source_id", manifest.departure.id],
    ["departure_id", manifest.departure.id],
    ["quote_id", null],
    ["status", "confirmed"],
    ["tour_version_id", manifest.sourceTourVersionId],
    ["title_en", source.title_en],
    ["title_vi", source.title_vi],
    ["cancellation_policy", source.cancellation_policy],
    ["catalog_snapshot_id", source.catalog_snapshot_id],
    ["travel_snapshot_id", source.travel_snapshot_id],
    ["fx_snapshot_id", source.fx_snapshot_id],
    ["fx_vnd_per_usd", source.fx_vnd_per_usd],
    ["per_person_vnd_minor", source.per_person_vnd_minor],
    ["total_vnd_minor", source.total_vnd_minor],
    ["checkout_currency", source.checkout_currency],
    ["checkout_amount_minor", source.checkout_amount_minor],
    ["party_size", manifest.booking.partySize],
    ["language", source.language],
    ["meeting_point", source.meeting_point],
    ["hold_duration_seconds", 2100],
  ];
  if (booking.id !== manifest.booking.id
      || sameFields.some(([key, expected]) => expected === null
        ? booking[key] !== null
        : !sameText(booking[key], expected))
      || !sameTimestamp(booking.created_at, manifest.booking.createdAt)
      || !sameTimestamp(booking.hold_expires_at, new Date(timestamp(booking.created_at) + 35 * 60 * 1000))) {
    throw fixtureError("E19_ASSIGNMENT_FIXTURE_DRIFT", "extension booking differs from the reviewed 502 shape");
  }
  const hold = requireRows(state.hold, 1, "E19_ASSIGNMENT_FIXTURE_DRIFT", "extension hold");
  if (hold.booking_id !== manifest.booking.id
      || hold.departure_id !== manifest.departure.id
      || Number(hold.party_size) !== manifest.booking.partySize
      || hold.status !== "consumed"
      || hold.consumed_at === null
      || hold.released_at !== null
      || !sameTimestamp(hold.created_at, manifest.booking.createdAt)
      || !sameTimestamp(hold.expires_at, new Date(timestamp(hold.created_at) + 35 * 60 * 1000))) {
    throw fixtureError("E19_ASSIGNMENT_FIXTURE_DRIFT", "extension hold differs from the committed hold shape");
  }
  if (state.assignment.length !== 0 || state.references.length !== 0 || state.qaSlots.length !== 0) {
    throw fixtureError("E19_ASSIGNMENT_FIXTURE_DRIFT", "extension already has a protected assignment or lifecycle reference");
  }
}

async function assertNoOverlap(query, manifest) {
  const conflicts = await rows(query, `
    /* e19:overlap */
    SELECT id, start_at, end_at, 'interval-overlap'::text AS conflict
    FROM public.departures
    WHERE id <> $1
      AND start_at < $2::timestamptz
      AND end_at > $3::timestamptz
    UNION ALL
    SELECT NULL::uuid, latest_end_at, $2::timestamptz, 'not-after-existing'::text
    FROM (
      SELECT max(end_at) AS latest_end_at
      FROM public.departures
      WHERE id <> $1
    ) AS latest
    WHERE latest.latest_end_at IS NOT NULL
      AND latest.latest_end_at >= $2::timestamptz
  `, [manifest.departure.id, manifest.departure.startAt, manifest.departure.endAt]);
  if (conflicts.length !== 0) {
    throw fixtureError("E19_ASSIGNMENT_INTERVAL_OVERLAP", "new departure is not future and nonoverlapping");
  }
}

function absentExtension(state) {
  return state.departure.length === 0
    && state.booking.length === 0
    && state.hold.length === 0
    && state.assignment.length === 0
    && state.references.length === 0
    && state.qaSlots.length === 0;
}

function isFixtureError(error) {
  return error && typeof error.code === "string" && error.code.startsWith("E19_");
}

export async function runE19AssignmentFixture({
  query,
  manifest: inputManifest = loadE19AssignmentManifest(),
  target = null,
  dryRun = false,
  logger = () => {},
} = {}) {
  if (typeof query !== "function") {
    throw fixtureError("E19_QUERY_REQUIRED", "a database query function is required");
  }
  const manifest = validateE19AssignmentManifest(inputManifest);
  let transactionOpen = false;
  try {
    await query(dryRun
      ? "BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY"
      : "BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE");
    transactionOpen = true;
    await query("SET LOCAL statement_timeout = '15s'");
    await query("SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0))", [manifest.fixtureVersion]);
    if (target !== null) {
      const connection = await rows(query, "SELECT current_database() AS database_name, current_user AS database_user");
      if (connection.length !== 1
          || connection[0].database_name !== target.databaseName
          || connection[0].database_user !== target.databaseUser) {
        throw fixtureError("E19_TARGET_MISMATCH", "database identity does not match the verified target");
      }
    }

    const lockRows = !dryRun;
    const facts = await readBaseFacts(query, manifest, lockRows);
    assertBaseFacts(facts, manifest, target?.projectRef ?? null);
    const before = await readPreservedGraph(query, manifest, lockRows);
    assertPreservedBaseline(before, manifest);
    const current = await readExtensionState(query, manifest, lockRows);
    if (!absentExtension(current)) {
      assertExtensionComplete(current, facts, manifest);
      const afterExisting = await readPreservedGraph(query, manifest, lockRows);
      if (stableJson(before) !== stableJson(afterExisting)) {
        throw fixtureError("E19_EXISTING_GRAPH_CHANGED", "protected graph changed while checking the existing extension");
      }
      await query("ROLLBACK");
      transactionOpen = false;
      return {
        status: "already-present",
        fixtureVersion: manifest.fixtureVersion,
        departureId: manifest.departure.id,
        bookingId: manifest.booking.id,
      };
    }

    await assertNoOverlap(query, manifest);

    if (dryRun) {
      await query("ROLLBACK");
      transactionOpen = false;
      return {
        status: "dry-run",
        fixtureVersion: manifest.fixtureVersion,
        departureId: manifest.departure.id,
        bookingId: manifest.booking.id,
        holdId: manifest.booking.holdId,
        writes: ["public.departures", "public.bookings", "private.capacity_holds"],
      };
    }

    const source = facts.booking[0];
    await query("SET LOCAL ROLE localens_tour_rpc_owner");
    await query(`
      /* e19:insert-departure */
      INSERT INTO public.departures (
        id, tour_version_id, start_at, end_at, status, capacity
      ) VALUES (
        $1::uuid, $2::uuid, $3::timestamptz, $4::timestamptz,
        $5::public.departure_status, $6::integer
      )
    `, [
      manifest.departure.id,
      manifest.departure.tourVersionId,
      manifest.departure.startAt,
      manifest.departure.endAt,
      manifest.departure.status,
      manifest.departure.capacity,
    ]);

    await query("SET LOCAL ROLE localens_checkout_rpc_owner");
    await query(`
      /* e19:insert-booking */
      INSERT INTO public.bookings (
        id, owner_user_id, source_kind, source_id, departure_id, quote_id,
        status, tour_version_id, title_en, title_vi, cancellation_policy,
        catalog_snapshot_id, travel_snapshot_id, fx_snapshot_id, fx_vnd_per_usd,
        per_person_vnd_minor, total_vnd_minor, checkout_currency, checkout_amount_minor,
        party_size, language, meeting_point, hold_duration_seconds, hold_expires_at, created_at
      ) VALUES (
        $1::uuid, $2::uuid, 'departure', $3::uuid, $3::uuid, NULL,
        'confirmed'::public.booking_status, $4::uuid, $5, $6, $7,
        $8::uuid, $9::uuid, $10::uuid, $11,
        $12, $13, $14::public.checkout_currency, $15, $16::integer, $17::public.locale,
        $18, 2100, $19::timestamptz + interval '35 minutes', $19::timestamptz
      )
    `, [
      manifest.booking.id,
      source.owner_user_id,
      manifest.departure.id,
      manifest.sourceTourVersionId,
      source.title_en,
      source.title_vi,
      source.cancellation_policy,
      source.catalog_snapshot_id,
      source.travel_snapshot_id,
      source.fx_snapshot_id,
      source.fx_vnd_per_usd,
      source.per_person_vnd_minor,
      source.total_vnd_minor,
      source.checkout_currency,
      source.checkout_amount_minor,
      manifest.booking.partySize,
      source.language,
      source.meeting_point,
      manifest.booking.createdAt,
    ]);
    await query(`
      /* e19:insert-hold */
      INSERT INTO private.capacity_holds (
        id, booking_id, departure_id, party_size, status, expires_at,
        created_at, consumed_at, released_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4::integer, 'consumed'::public.hold_status,
        $5::timestamptz + interval '35 minutes', $5::timestamptz,
        $5::timestamptz, NULL
      )
    `, [
      manifest.booking.holdId,
      manifest.booking.id,
      manifest.departure.id,
      manifest.booking.partySize,
      manifest.booking.createdAt,
    ]);

    await query("SET LOCAL ROLE postgres");
    const after = await readPreservedGraph(query, manifest);
    if (stableJson(before) !== stableJson(after)) {
      throw fixtureError("E19_EXISTING_GRAPH_CHANGED", "protected graph changed while applying the extension");
    }
    const applied = await readExtensionState(query, manifest);
    assertExtensionComplete(applied, facts, manifest);
    await query("COMMIT");
    transactionOpen = false;
    const result = {
      status: "applied",
      fixtureVersion: manifest.fixtureVersion,
      departureId: manifest.departure.id,
      bookingId: manifest.booking.id,
      holdId: manifest.booking.holdId,
    };
    logger(result);
    return result;
  } catch (error) {
    if (transactionOpen) {
      try {
        await query("ROLLBACK");
      } catch {
        // Preserve the original bounded fixture failure.
      }
      transactionOpen = false;
    }
    if (isFixtureError(error)) throw error;
    throw fixtureError("E19_ASSIGNMENT_TRANSACTION_FAILED", "assignment fixture transaction failed and was rolled back");
  }
}

export async function planE19AssignmentFixture(options = {}) {
  return runE19AssignmentFixture({ ...options, dryRun: true });
}

export function validateE19ConnectionTarget(environment) {
  const required = [
    ["LOCALENS_THESIS_DEMO_E19_CONFIRM", E19_CONFIRMATION],
    ["LOCALENS_THESIS_DEMO_E19_DB_URL"],
    ["LOCALENS_THESIS_DEMO_E19_EXPECTED_PROJECT_REF"],
    ["LOCALENS_THESIS_DEMO_E19_EXPECTED_DB_HOST"],
    ["LOCALENS_THESIS_DEMO_E19_EXPECTED_DB_PORT"],
    ["LOCALENS_THESIS_DEMO_E19_EXPECTED_DB_NAME"],
    ["LOCALENS_THESIS_DEMO_E19_EXPECTED_DB_USER"],
    ["LOCALENS_THESIS_DEMO_E19_EXPECTED_SUPABASE_URL"],
  ];
  for (const [name, expected] of required) {
    const actual = environment?.[name];
    if (typeof actual !== "string" || actual.length === 0 || (expected !== undefined && actual !== expected)) {
      throw fixtureError("E19_TARGET_REQUIRED", "complete verified E19 target metadata is required");
    }
  }
  const projectRef = environment.LOCALENS_THESIS_DEMO_E19_EXPECTED_PROJECT_REF;
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(projectRef)) {
    throw fixtureError("E19_TARGET_INVALID", "the verified project ref has an invalid format");
  }
  let databaseUrl;
  let supabaseUrl;
  try {
    databaseUrl = new URL(environment.LOCALENS_THESIS_DEMO_E19_DB_URL);
    supabaseUrl = new URL(environment.LOCALENS_THESIS_DEMO_E19_EXPECTED_SUPABASE_URL);
  } catch {
    throw fixtureError("E19_TARGET_INVALID", "verified E19 target URLs are invalid");
  }
  const expectedHost = environment.LOCALENS_THESIS_DEMO_E19_EXPECTED_DB_HOST;
  const expectedPort = environment.LOCALENS_THESIS_DEMO_E19_EXPECTED_DB_PORT;
  const expectedName = environment.LOCALENS_THESIS_DEMO_E19_EXPECTED_DB_NAME;
  const expectedUser = environment.LOCALENS_THESIS_DEMO_E19_EXPECTED_DB_USER;
  if (!/^[0-9]{2,5}$/.test(expectedPort)
      || !/^[A-Za-z0-9_.-]+$/.test(expectedName)
      || !/^[A-Za-z0-9_.-]+$/.test(expectedUser)
      || !/^[A-Za-z0-9.-]+$/.test(expectedHost)) {
    throw fixtureError("E19_TARGET_INVALID", "verified database target metadata has an invalid format");
  }
  const databaseLogin = decodeURIComponent(databaseUrl.username);
  const expectedSqlRole = expectedUser.endsWith("." + projectRef)
    ? expectedUser.slice(0, -(projectRef.length + 1))
    : expectedUser;
  const expectedPoolerLogin = expectedSqlRole + "." + projectRef;
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)
      || databaseUrl.hostname !== expectedHost
      || databaseUrl.port !== expectedPort
      || ![expectedSqlRole, expectedPoolerLogin].includes(databaseLogin)
      || databaseUrl.pathname !== "/" + expectedName
      || databaseUrl.searchParams.get("sslmode") !== "verify-full"
      || databaseUrl.searchParams.size !== 1
      || ["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseUrl.hostname)) {
    throw fixtureError("E19_TARGET_INVALID", "database URL does not match the verified host, port, database, user, and TLS mode");
  }
  const expectedSupabaseUrl = "https://" + projectRef + ".supabase.co/";
  if (supabaseUrl.toString() !== expectedSupabaseUrl
      || supabaseUrl.protocol !== "https:"
      || supabaseUrl.username
      || supabaseUrl.password
      || supabaseUrl.search
      || supabaseUrl.hash) {
    throw fixtureError("E19_TARGET_INVALID", "runtime URL does not match the verified project ref");
  }
  return {
    databaseUrl: environment.LOCALENS_THESIS_DEMO_E19_DB_URL,
    projectRef,
    databaseHost: expectedHost,
    databasePort: expectedPort,
    databaseName: expectedName,
    databaseUser: expectedSqlRole,
    databaseLogin,
  };
}

async function main() {
  const target = validateE19ConnectionTarget(process.env);
  const dryRun = process.argv.includes("--dry-run");
  const client = new pg.Client({
    connectionString: target.databaseUrl,
    application_name: "localens-thesis-demo-e19-assignment",
    ssl: { rejectUnauthorized: true },
  });
  try {
    await client.connect();
    const result = await runE19AssignmentFixture({
      query: (sql, values) => client.query(sql, values),
      target,
      dryRun,
      logger: (safeResult) => console.log("E19 assignment fixture " + safeResult.status + ": " + safeResult.fixtureVersion),
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    const code = error && typeof error.code === "string" ? error.code : "E19_ASSIGNMENT_TRANSACTION_FAILED";
    console.error(code);
    process.exitCode = 2;
  } finally {
    await client.end().catch(() => {});
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(() => {
    console.error("E19_ASSIGNMENT_TRANSACTION_FAILED");
    process.exitCode = 2;
  });
}
