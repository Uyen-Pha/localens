import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { computePlannerOperationDigest } from "../supabase/functions/_shared/planner-operation.ts";

export const LIVE_SMOKE_OPT_IN = "RUN_LIVE_THESIS_DEMO";

const EXPECTED_PROJECT_NAME = "localens-thesis-demo";
const MANAGEMENT_ORIGIN = "https://api.supabase.com";
const MAX_PRE_PROVIDER_HTTP = 20;
const MAX_PLANNER_INVOCATIONS = 4;
const MAX_PROVIDER_ELIGIBLE_ATTEMPTS = 2;
const MAX_PRODUCT_MUTATIONS = 9;
const CORRELATION_HEADERS = ["x-correlation-id", "x-request-id", "cf-ray"];
const ACCOUNT_CONTRACT = Object.freeze({
  customer: Object.freeze({ email: "customer.demo@localens.invalid", role: "customer" }),
  qaCustomer: Object.freeze({ email: "customer.qa@localens.invalid", role: "customer" }),
  guide: Object.freeze({ email: "guide.demo@localens.invalid", role: "guide" }),
  admin: Object.freeze({ email: "admin.demo@localens.invalid", role: "admin" }),
});

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataset = JSON.parse(readFileSync(join(repoRoot, "data", "demo", "thesis-demo.v1.json"), "utf8"));
const QA_SLOTS = new Map(dataset.qa.slots.map((slot) => [slot.id, Object.freeze({ ...slot })]));

export class ThesisDemoSmokeError extends Error {
  constructor(code) {
    super(code);
    this.name = "ThesisDemoSmokeError";
    this.code = code;
  }
}

function fail(code) {
  throw new ThesisDemoSmokeError(code);
}

function nonEmpty(value) {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function exactHttpsUrl(value, { host, originOnly = false } = {}) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.username !== ""
      || url.password !== ""
      || url.hash !== ""
      || (host !== undefined && url.hostname !== host)
      || (originOnly && (url.pathname !== "/" || url.search !== ""))
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function validateOptions(options) {
  if (options?.target?.expectedProjectName !== EXPECTED_PROJECT_NAME) fail("SMOKE_TARGET_UNVERIFIED");
  if (!nonEmpty(options?.target?.projectRef) || !nonEmpty(options?.target?.organizationId)) {
    fail("SMOKE_TARGET_UNVERIFIED");
  }
  const runtimeUrl = exactHttpsUrl(options?.target?.supabaseUrl, {
    host: `${options.target.projectRef}.supabase.co`,
    originOnly: true,
  });
  if (runtimeUrl === null) fail("SMOKE_TARGET_INSECURE");
  if (exactHttpsUrl(options?.target?.allowedOrigin, { originOnly: true }) === null) {
    fail("SMOKE_TARGET_INSECURE");
  }
  if (options?.mode !== "live-success" && options?.mode !== "fallback-only") fail("SMOKE_MODE_INVALID");
  if (options.liveOptIn !== LIVE_SMOKE_OPT_IN) fail("SMOKE_LIVE_OPT_IN_REQUIRED");
  const slot = QA_SLOTS.get(options.qaSlot);
  if (slot === undefined) fail("SMOKE_QA_SLOT_UNSAFE");

  for (const [key, contract] of Object.entries(ACCOUNT_CONTRACT)) {
    const account = options?.accounts?.[key];
    if (account?.email !== contract.email || !nonEmpty(account?.password)) fail("SMOKE_ACCOUNTS_INCOMPLETE");
  }
  for (const name of ["publishableKey", "serviceRoleKey", "managementToken"]) {
    if (!nonEmpty(options?.credentials?.[name])) fail("SMOKE_CREDENTIALS_INCOMPLETE");
  }
  return { runtimeUrl, slot };
}

function knownSecrets(options) {
  const values = [
    ...Object.values(options.credentials),
    ...Object.values(options.accounts).map(({ password }) => password),
  ];
  return new Set(values.filter((value) => nonEmpty(value)));
}

function appearsCredentialShaped(value) {
  return /(?:sb_secret_|sbp_|eyJ[a-zA-Z0-9_-]{12,}|access[-_]token)/i.test(value);
}

function safeLogger(logger, secrets) {
  return (line) => {
    const text = String(line);
    if (appearsCredentialShaped(text) || [...secrets].some((secret) => text.includes(secret))) {
      fail("SMOKE_SECRET_LOG_BLOCKED");
    }
    logger(text);
  };
}

function headerValue(headers, name) {
  if (headers?.get instanceof Function) return headers.get(name);
  if (headers === null || typeof headers !== "object") return null;
  const normalized = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === normalized);
  return entry?.[1] ?? null;
}

function correlationId(response) {
  if (response?.headers?.correlationId !== undefined) return response.headers.correlationId;
  for (const name of CORRELATION_HEADERS) {
    const value = headerValue(response?.headers, name);
    if (value !== null) return value;
  }
  return "absent";
}

function bearerHeaders(options, token) {
  return {
    apikey: options.credentials.publishableKey,
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    origin: options.target.allowedOrigin,
  };
}

function serviceHeaders(options) {
  return {
    apikey: options.credentials.serviceRoleKey,
    authorization: `Bearer ${options.credentials.serviceRoleKey}`,
    "content-type": "application/json",
  };
}

function makeState(options, dependencies) {
  const secrets = knownSecrets(options);
  const counts = {
    plannerEndpointInvocations: 0,
    providerEligibleAttempts: 0,
    denialProbes: 0,
    preProviderHttpRequests: 0,
    productMutationRequests: 0,
  };
  const gates = [];
  const log = safeLogger(dependencies.logger ?? (() => {}), secrets);
  const providerOperations = new Set();

  const pass = (name, response) => {
    const status = "pass";
    gates.push({ name, status });
    const correlation = response === undefined ? "absent" : correlationId(response);
    log(`gate=${name} status=${status} correlation=${correlation}`);
  };

  const request = async (spec, accounting = {}) => {
    if (accounting.preProvider === true) {
      counts.preProviderHttpRequests += 1;
      if (counts.preProviderHttpRequests > MAX_PRE_PROVIDER_HTTP) fail("SMOKE_PRE_PROVIDER_BUDGET_EXCEEDED");
    }
    if (accounting.planner === true) {
      counts.plannerEndpointInvocations += 1;
      if (counts.plannerEndpointInvocations > MAX_PLANNER_INVOCATIONS) fail("SMOKE_PLANNER_BUDGET_EXCEEDED");
    }
    if (accounting.denial === true) counts.denialProbes += 1;
    if (accounting.productMutation === true) {
      counts.productMutationRequests += 1;
      if (counts.productMutationRequests > MAX_PRODUCT_MUTATIONS) fail("SMOKE_PRODUCT_MUTATION_BUDGET_EXCEEDED");
    }
    if (accounting.providerOperation !== undefined && !providerOperations.has(accounting.providerOperation)) {
      providerOperations.add(accounting.providerOperation);
      counts.providerEligibleAttempts += 1;
      if (counts.providerEligibleAttempts > MAX_PROVIDER_ELIGIBLE_ATTEMPTS) fail("SMOKE_PROVIDER_BUDGET_EXCEEDED");
    }

    let response;
    try {
      response = await dependencies.request(spec);
    } catch {
      fail("SMOKE_HTTP_FAILED");
    }
    if (!Number.isInteger(response?.status)) fail("SMOKE_HTTP_FAILED");
    if (response.status >= 300 && response.status < 400) {
      const location = headerValue(response.headers, "location");
      if (!nonEmpty(location)) fail("SMOKE_REDIRECT_UNEXPECTED");
      let redirect;
      try {
        redirect = new URL(location, spec.url);
      } catch {
        fail("SMOKE_REDIRECT_UNEXPECTED");
      }
      if (redirect.host !== new URL(spec.url).host) fail("SMOKE_REDIRECT_CROSS_HOST");
      fail("SMOKE_REDIRECT_UNEXPECTED");
    }
    return response;
  };

  return { counts, gates, log, pass, request, secrets };
}

function requireStatus(response, expected, code = "SMOKE_HTTP_FAILED") {
  const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.includes(response.status)) fail(code);
  return response;
}

function requireSingleRow(response, code) {
  const rows = response?.json;
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0] === null || typeof rows[0] !== "object") fail(code);
  return rows[0];
}

async function verifyTarget(options, state) {
  const url = `${MANAGEMENT_ORIGIN}/v1/projects/${encodeURIComponent(options.target.projectRef)}`;
  const response = await state.request({
    gate: "target",
    url,
    method: "GET",
    headers: { authorization: `Bearer ${options.credentials.managementToken}` },
  }, { preProvider: true });
  requireStatus(response, 200, "SMOKE_TARGET_UNVERIFIED");
  const project = response.json;
  if (
    project?.ref !== options.target.projectRef
    || project?.organization_id !== options.target.organizationId
    || project?.name !== EXPECTED_PROJECT_NAME
    || project?.status !== "ACTIVE_HEALTHY"
  ) fail("SMOKE_TARGET_UNVERIFIED");
  state.pass("target", response);
}

async function authenticate(options, state) {
  const sessions = {};
  for (const key of Object.keys(ACCOUNT_CONTRACT)) {
    const account = options.accounts[key];
    const response = await state.request({
      gate: `auth.${key}`,
      url: `${options.target.supabaseUrl}/auth/v1/token?grant_type=password`,
      method: "POST",
      headers: {
        apikey: options.credentials.publishableKey,
        "content-type": "application/json",
        origin: options.target.allowedOrigin,
      },
      body: JSON.stringify({ email: account.email, password: account.password }),
    }, { preProvider: true });
    requireStatus(response, 200);
    if (!nonEmpty(response.json?.access_token) || !nonEmpty(response.json?.user?.id)) fail("SMOKE_AUTH_FAILED");
    sessions[key] = { token: response.json.access_token, userId: response.json.user.id };
    state.secrets.add(response.json.access_token);
    state.pass(`auth-${key}`, response);
  }
  return sessions;
}

async function verifyRoles(options, sessions, state) {
  for (const [key, contract] of Object.entries(ACCOUNT_CONTRACT)) {
    const response = await state.request({
      gate: `role.${key}`,
      url: `${options.target.supabaseUrl}/rest/v1/rpc/get_portal_identity`,
      method: "POST",
      headers: bearerHeaders(options, sessions[key].token),
      body: "{}",
    }, { preProvider: true });
    requireStatus(response, 200);
    const identity = requireSingleRow(response, "SMOKE_ROLE_MISMATCH");
    if (identity.user_id !== sessions[key].userId || identity.role !== contract.role) fail("SMOKE_ROLE_MISMATCH");
    state.pass(`role-${key}`, response);
  }
}

function plannerInput() {
  return {
    startAt: "2026-09-12T08:00:00+07:00",
    durationMinutes: 480,
    areas: [dataset.area.id],
    budget: { currency: "VND", amountMinor: 2_000_000 },
    partySize: 2,
    guideLanguage: "vi",
    priorityWeights: {
      street_food: 1,
      history: 4,
      traditional_craft: 2,
      traditional_market: 3,
    },
    pace: "balanced",
    dietaryRequirements: [],
    mobilityRequirements: [],
    lockedStopIds: [],
  };
}

async function runDenialProbes(options, sessions, state, slot) {
  const endpoint = `${options.target.supabaseUrl}/functions/v1/recommend-itinerary`;
  const outsideId = "00000000-0000-4000-8000-000000000099";
  const validBody = JSON.stringify({ operationId: slot.runId, input: plannerInput() });
  const customerHeaders = bearerHeaders(options, sessions.customer.token);
  const probes = [
    {
      gate: "denial.missing-jwt",
      expected: 401,
      spec: { url: endpoint, method: "POST", headers: { apikey: options.credentials.publishableKey, "content-type": "application/json", origin: options.target.allowedOrigin }, body: validBody },
    },
    {
      gate: "denial.invalid-token",
      expected: 401,
      spec: { url: endpoint, method: "POST", headers: bearerHeaders(options, "invalid-expired-token"), body: validBody },
    },
    {
      gate: "denial.wrong-origin",
      expected: 403,
      spec: { url: endpoint, method: "POST", headers: { ...customerHeaders, origin: "https://wrong-origin.invalid" }, body: validBody },
    },
    {
      gate: "denial.invalid-payload",
      expected: 400,
      spec: { url: endpoint, method: "POST", headers: customerHeaders, body: JSON.stringify({ operationId: slot.runId }) },
    },
    {
      gate: "denial.outside-allowlist",
      expected: 422,
      spec: { url: endpoint, method: "POST", headers: customerHeaders, body: JSON.stringify({ operationId: outsideId, input: { ...plannerInput(), areas: [outsideId] } }) },
    },
    {
      gate: "denial.cross-owner-read",
      expected: 200,
      spec: { url: `${options.target.supabaseUrl}/rest/v1/customer_bookings_v?id=eq.${dataset.fixtures.pendingPaymentBooking.id}&select=id`, method: "GET", headers: bearerHeaders(options, sessions.customer.token) },
      validate: (response) => Array.isArray(response.json) && response.json.length === 0,
    },
    {
      gate: "denial.cross-owner-write",
      expected: [401, 403],
      spec: { url: `${options.target.supabaseUrl}/rest/v1/bookings?id=eq.${dataset.fixtures.pendingPaymentBooking.id}`, method: "PATCH", headers: { ...bearerHeaders(options, sessions.customer.token), prefer: "return=minimal" }, body: JSON.stringify({ id: dataset.fixtures.pendingPaymentBooking.id }) },
    },
  ];

  for (const probe of probes) {
    const response = await state.request({ gate: probe.gate, ...probe.spec }, { preProvider: true, denial: true });
    requireStatus(response, probe.expected, "SMOKE_DENIAL_FAILED");
    if (probe.validate !== undefined && !probe.validate(response)) fail("SMOKE_DENIAL_FAILED");
    state.pass(probe.gate, response);
  }
  state.pass("permissions");
}

function validatePlannerResponse(response, { revision, rankingSource }) {
  requireStatus(response, 200);
  const value = response.json;
  if (
    value?.advisoryOnly !== true
    || !nonEmpty(value?.planId)
    || value?.revision !== revision
    || value?.proposal?.rankingSource !== rankingSource
    || !Array.isArray(value?.proposal?.items)
  ) fail("SMOKE_PLANNER_RESPONSE_INVALID");
  return value;
}

async function plannerCall(options, sessions, state, { gate, functionName, body, operationId, providerEligible }) {
  return state.request({
    gate,
    url: `${options.target.supabaseUrl}/functions/v1/${functionName}`,
    method: "POST",
    headers: bearerHeaders(options, sessions.customer.token),
    body,
  }, {
    planner: true,
    ...(providerEligible ? { providerOperation: operationId } : {}),
  });
}

async function readUserRevision(options, sessions, state, { planId, revision, includeItems = false }) {
  const plan = await state.request({
    gate: `read.user-plan-${revision}`,
    url: `${options.target.supabaseUrl}/rest/v1/trip_plans?id=eq.${planId}&select=id,latest_revision_no`,
    method: "GET",
    headers: bearerHeaders(options, sessions.customer.token),
  });
  const planRow = requireSingleRow(requireStatus(plan, 200), "SMOKE_REPLAY_UNPROVEN");
  if (planRow.id !== planId || planRow.latest_revision_no !== revision) fail("SMOKE_REPLAY_UNPROVEN");

  const revisionResponse = await state.request({
    gate: `read.user-revision-${revision}`,
    url: `${options.target.supabaseUrl}/rest/v1/trip_plan_revisions?plan_id=eq.${planId}&revision_no=eq.${revision}&select=id,plan_id,revision_no,ranking_source,result_json`,
    method: "GET",
    headers: bearerHeaders(options, sessions.customer.token),
  });
  const revisionRow = requireSingleRow(requireStatus(revisionResponse, 200), "SMOKE_REPLAY_UNPROVEN");
  if (revisionRow.plan_id !== planId || revisionRow.revision_no !== revision) fail("SMOKE_REPLAY_UNPROVEN");

  let items = [];
  if (includeItems) {
    if (!nonEmpty(revisionRow.id)) fail("SMOKE_REPLAY_UNPROVEN");
    const itemResponse = await state.request({
      gate: "read.user-items-1",
      url: `${options.target.supabaseUrl}/rest/v1/trip_plan_items?revision_id=eq.${revisionRow.id}&select=id,place_id,position&order=position.asc`,
      method: "GET",
      headers: bearerHeaders(options, sessions.customer.token),
    });
    requireStatus(itemResponse, 200);
    if (!Array.isArray(itemResponse.json) || itemResponse.json.length === 0 || !nonEmpty(itemResponse.json[0]?.id)) {
      fail("SMOKE_REPLAY_UNPROVEN");
    }
    items = itemResponse.json;
  }
  return { revisionRow, items };
}

async function proveOperation(options, sessions, state, { operationId, requestDigest, planId, revision, kind }) {
  const response = await state.request({
    gate: `read.operation.${kind}`,
    url: `${options.target.supabaseUrl}/rest/v1/rpc/get_runtime_planner_operation`,
    method: "POST",
    headers: serviceHeaders(options),
    body: JSON.stringify({
      p_actor_user_id: sessions.customer.userId,
      p_operation_id: operationId,
      p_request_digest: requestDigest,
    }),
  });
  requireStatus(response, 200);
  const operation = Array.isArray(response.json) ? response.json[0] : response.json;
  if (operation?.state !== "completed" || operation?.planId !== planId || operation?.revision !== revision) {
    fail("SMOKE_REPLAY_UNPROVEN");
  }
}

async function proveQuota(readQuotaEvidence, context) {
  let evidence;
  try {
    evidence = await readQuotaEvidence(context);
  } catch {
    fail("SMOKE_QUOTA_REPLAY_UNPROVEN");
  }
  if (
    evidence?.plannerQuotaReceipts !== 1
    || evidence?.geminiQuotaReceipts !== 1
    || evidence?.recommendationRuns !== 1
  ) fail("SMOKE_QUOTA_REPLAY_UNPROVEN");
}

async function runLive(options, dependencies, sessions, state, slot) {
  await runDenialProbes(options, sessions, state, slot);

  const recommendOperationId = slot.runId;
  const input = plannerInput();
  const recommendBody = JSON.stringify({ operationId: recommendOperationId, input });
  await plannerCall(options, sessions, state, {
    gate: "planner.recommend.primary",
    functionName: "recommend-itinerary",
    body: recommendBody,
    operationId: recommendOperationId,
    providerEligible: true,
  });
  const recommendReplay = await plannerCall(options, sessions, state, {
    gate: "planner.recommend.replay",
    functionName: "recommend-itinerary",
    body: recommendBody,
    operationId: recommendOperationId,
    providerEligible: true,
  });
  const recommend = validatePlannerResponse(recommendReplay, {
    revision: 1,
    rankingSource: recommendReplay.json?.degraded === true ? "deterministic" : "ai",
  });
  const firstReadback = await readUserRevision(options, sessions, state, {
    planId: recommend.planId,
    revision: 1,
    includeItems: true,
  });
  const recommendDigest = await computePlannerOperationDigest("recommend", input);
  await proveOperation(options, sessions, state, {
    operationId: recommendOperationId,
    requestDigest: recommendDigest,
    planId: recommend.planId,
    revision: 1,
    kind: "recommend",
  });
  await proveQuota(dependencies.readQuotaEvidence, { kind: "recommend", operationId: recommendOperationId });

  const lockedItemIds = [firstReadback.items[0].id];
  const signals = { pace: "slower", food: "keep", preferTypes: ["history"], avoidTypes: [] };
  const refineOperationId = slot.paymentId;
  const refinePayload = {
    operationId: refineOperationId,
    planId: recommend.planId,
    baseRevision: 1,
    delta: { feedback: "slower; history", scope: "partial" },
    lockedItemIds,
  };
  const refineBody = JSON.stringify(refinePayload);
  await plannerCall(options, sessions, state, {
    gate: "planner.refine.primary",
    functionName: "refine-itinerary",
    body: refineBody,
    operationId: refineOperationId,
    providerEligible: true,
  });
  const refineReplay = await plannerCall(options, sessions, state, {
    gate: "planner.refine.replay",
    functionName: "refine-itinerary",
    body: refineBody,
    operationId: refineOperationId,
    providerEligible: true,
  });
  const refined = validatePlannerResponse(refineReplay, {
    revision: 2,
    rankingSource: refineReplay.json?.degraded === true ? "deterministic" : "ai",
  });
  if (refined.planId !== recommend.planId || !refined.proposal.items.some(({ placeId }) => placeId === firstReadback.items[0].place_id)) {
    fail("SMOKE_REPLAY_UNPROVEN");
  }
  await readUserRevision(options, sessions, state, { planId: recommend.planId, revision: 2 });
  const refineDigest = await computePlannerOperationDigest("refine", {
    planId: recommend.planId,
    baseRevision: 1,
    scope: "partial",
    lockedItemIds,
    signals,
  });
  await proveOperation(options, sessions, state, {
    operationId: refineOperationId,
    requestDigest: refineDigest,
    planId: recommend.planId,
    revision: 2,
    kind: "refine",
  });
  await proveQuota(dependencies.readQuotaEvidence, { kind: "refine", operationId: refineOperationId });
  state.pass("replay");

  const realAi = [recommend, refined].some((value) => value.degraded === false && value.proposal.rankingSource === "ai");
  if (!realAi) fail("SMOKE_REAL_AI_UNPROVEN");
  state.pass("real-ai");

  await runFixedTour(options, sessions, state, slot);
  return true;
}

async function mutation(options, state, { gate, rpc, token, body }) {
  const response = await state.request({
    gate,
    url: `${options.target.supabaseUrl}/rest/v1/rpc/${rpc}`,
    method: "POST",
    headers: bearerHeaders(options, token),
    body: JSON.stringify(body),
  }, { productMutation: true });
  requireStatus(response, 200);
  return requireSingleRow(response, "SMOKE_FIXED_TOUR_FAILED");
}

async function runFixedTour(options, sessions, state, slot) {
  const bookingBody = {
    departure_id: dataset.qa.slotDepartureId,
    party_size: Math.min(2, slot.maxSeats),
    booking_locale: "vi",
    idempotency_key: slot.bookingIdempotencyKey,
  };
  const bookingPrimary = await mutation(options, state, { gate: "fixed.begin.primary", rpc: "begin_fixed_tour_booking", token: sessions.qaCustomer.token, body: bookingBody });
  const bookingReplay = await mutation(options, state, { gate: "fixed.begin.replay", rpc: "begin_fixed_tour_booking", token: sessions.qaCustomer.token, body: bookingBody });
  if (bookingPrimary.booking_id !== slot.bookingId || bookingReplay.booking_id !== slot.bookingId) fail("SMOKE_FIXED_TOUR_FAILED");

  const paymentBody = { booking_id: slot.bookingId, idempotency_key: slot.paymentIdempotencyKey };
  await mutation(options, state, { gate: "fixed.payment.primary", rpc: "complete_simulated_fixed_tour_payment", token: sessions.qaCustomer.token, body: paymentBody });
  await mutation(options, state, { gate: "fixed.payment.replay", rpc: "complete_simulated_fixed_tour_payment", token: sessions.qaCustomer.token, body: paymentBody });

  const assignmentBody = {
    booking_id: slot.bookingId,
    guide_user_id: sessions.guide.userId,
    idempotency_key: `thesis-demo:v1:${slot.id}:assignment`,
  };
  const assignment = await mutation(options, state, { gate: "fixed.assign.primary", rpc: "assign_fixed_departure_guide", token: sessions.admin.token, body: assignmentBody });
  await mutation(options, state, { gate: "fixed.assign.replay", rpc: "assign_fixed_departure_guide", token: sessions.admin.token, body: assignmentBody });
  if (!nonEmpty(assignment.assignment_id)) fail("SMOKE_FIXED_TOUR_FAILED");
  await mutation(options, state, { gate: "fixed.accept", rpc: "accept_guide_assignment", token: sessions.guide.token, body: { p_assignment_id: assignment.assignment_id } });

  const cancelBody = {
    booking_id: slot.bookingId,
    reason_code: "trip_plan_changed",
    other_reason: null,
    idempotency_key: slot.cancelIdempotencyKey,
  };
  await mutation(options, state, { gate: "fixed.cancel.primary", rpc: "cancel_booking", token: sessions.qaCustomer.token, body: cancelBody });
  await mutation(options, state, { gate: "fixed.cancel.replay", rpc: "cancel_booking", token: sessions.qaCustomer.token, body: cancelBody });

  const reads = [
    ["fixed.read.customer", sessions.qaCustomer.token, `customer_bookings_v?id=eq.${slot.bookingId}&select=id`],
    ["fixed.read.admin", sessions.admin.token, `admin_bookings_v?id=eq.${slot.bookingId}&select=id`],
    ["fixed.read.guide", sessions.guide.token, "rpc/get_guide_assigned_bookings"],
  ];
  for (const [gate, token, path] of reads) {
    const isRpc = path.startsWith("rpc/");
    const response = await state.request({
      gate,
      url: `${options.target.supabaseUrl}/rest/v1/${path}`,
      method: isRpc ? "POST" : "GET",
      headers: bearerHeaders(options, token),
      ...(isRpc ? { body: "{}" } : {}),
    });
    requireStatus(response, 200);
    if (!Array.isArray(response.json)) fail("SMOKE_FIXED_TOUR_FAILED");
  }
  state.pass("fixed-tour-simulated-payment");
}

async function runFallback(options, dependencies, sessions, state, slot) {
  const killSwitch = dependencies.killSwitch;
  if (
    killSwitch === undefined
    || !(killSwitch.read instanceof Function)
    || !(killSwitch.set instanceof Function)
    || !(killSwitch.hasSecret instanceof Function)
  ) fail("SMOKE_KILL_SWITCH_UNAVAILABLE");

  let prior;
  let primaryError;
  try {
    prior = await killSwitch.read();
    if (typeof prior !== "boolean") fail("SMOKE_KILL_SWITCH_UNAVAILABLE");
    if (!(await killSwitch.hasSecret("GEMINI_API_KEY"))) fail("SMOKE_GEMINI_KEY_MISSING");
    await killSwitch.set(false);
    if (await killSwitch.read() !== false) fail("SMOKE_KILL_SWITCH_TRANSITION_FAILED");

    const operationId = slot.cancelId;
    const body = JSON.stringify({ operationId, input: plannerInput() });
    const response = await plannerCall(options, sessions, state, {
      gate: "planner.fallback",
      functionName: "recommend-itinerary",
      body,
      operationId,
      providerEligible: false,
    });
    validatePlannerResponse(response, { revision: 1, rankingSource: "deterministic" });
    if (response.json.degraded !== true) fail("SMOKE_FALLBACK_UNPROVEN");
    state.pass("fallback");
  } catch (error) {
    primaryError = error;
  } finally {
    if (typeof prior === "boolean") {
      try {
        await killSwitch.set(prior);
        if (await killSwitch.read() !== prior) fail("SMOKE_KILL_SWITCH_RESTORE_FAILED");
      } catch {
        fail("SMOKE_KILL_SWITCH_RESTORE_FAILED");
      }
    }
  }
  if (primaryError !== undefined) throw primaryError;
}

async function preflightLive(dependencies, slot) {
  if (!(dependencies.inspectQaSlot instanceof Function)) fail("SMOKE_QA_SLOT_BOOKING_ID_UNPROVEN");
  let inspection;
  try {
    inspection = await dependencies.inspectQaSlot(slot.id);
  } catch {
    fail("SMOKE_QA_SLOT_BOOKING_ID_UNPROVEN");
  }
  if (inspection?.safe !== true || inspection.bookingId !== slot.bookingId) {
    fail("SMOKE_QA_SLOT_BOOKING_ID_UNPROVEN");
  }
  if (!(dependencies.readQuotaEvidence instanceof Function)) fail("SMOKE_QUOTA_REPLAY_UNPROVEN");
}

export async function runThesisDemoSmoke(options, dependencies) {
  const { slot } = validateOptions(options);
  if (dependencies?.request === undefined) fail("SMOKE_HTTP_UNAVAILABLE");
  if (options.mode === "live-success") await preflightLive(dependencies, slot);

  const state = makeState(options, dependencies);
  await verifyTarget(options, state);
  const sessions = await authenticate(options, state);
  await verifyRoles(options, sessions, state);

  let realAi = false;
  if (options.mode === "live-success") realAi = await runLive(options, dependencies, sessions, state, slot);
  else await runFallback(options, dependencies, sessions, state, slot);

  state.log(`gate=summary status=pass correlation=absent pre_provider=${state.counts.preProviderHttpRequests} planner=${state.counts.plannerEndpointInvocations} provider=${state.counts.providerEligibleAttempts} product_mutations=${state.counts.productMutationRequests}`);
  return { ok: true, mode: options.mode, realAi, counts: state.counts, gates: state.gates };
}

async function defaultRequest(spec) {
  const response = await fetch(spec.url, {
    method: spec.method,
    headers: spec.headers,
    body: spec.body,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  let json = null;
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > 1_000_000) fail("SMOKE_HTTP_FAILED");
  const text = await response.text();
  if (text.length > 1_000_000) fail("SMOKE_HTTP_FAILED");
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      fail("SMOKE_HTTP_FAILED");
    }
  }
  return { status: response.status, headers: response.headers, json };
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function createManagementKillSwitch(options) {
  const endpoint = `${MANAGEMENT_ORIGIN}/v1/projects/${encodeURIComponent(options.target.projectRef)}/secrets`;
  const headers = {
    authorization: `Bearer ${options.credentials.managementToken}`,
    "content-type": "application/json",
  };
  const readSecrets = async () => {
    const response = await defaultRequest({ url: endpoint, method: "GET", headers });
    requireStatus(response, 200, "SMOKE_KILL_SWITCH_UNAVAILABLE");
    if (!Array.isArray(response.json)) fail("SMOKE_KILL_SWITCH_UNAVAILABLE");
    return response.json;
  };
  return {
    async hasSecret(name) {
      const rows = await readSecrets();
      return rows.some((row) => row?.name === name);
    },
    async read() {
      const rows = await readSecrets();
      const row = rows.find((entry) => entry?.name === "LOCALLENS_GEMINI_ENABLED");
      const value = row?.value;
      if (value === "1" || value === digest("1")) return true;
      if (value === "0" || value === digest("0")) return false;
      fail("SMOKE_KILL_SWITCH_UNAVAILABLE");
    },
    async set(enabled) {
      const response = await defaultRequest({
        url: endpoint,
        method: "POST",
        headers,
        body: JSON.stringify([{ name: "LOCALLENS_GEMINI_ENABLED", value: enabled ? "1" : "0" }]),
      });
      requireStatus(response, [200, 201], "SMOKE_KILL_SWITCH_TRANSITION_FAILED");
    },
  };
}

function optionsFromEnvironment(environment) {
  return {
    mode: environment.LOCALLENS_THESIS_DEMO_SMOKE_MODE,
    liveOptIn: environment.LOCALLENS_THESIS_DEMO_LIVE_OPT_IN,
    qaSlot: environment.LOCALLENS_THESIS_DEMO_QA_SLOT,
    target: {
      supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
      projectRef: environment.LOCALLENS_THESIS_DEMO_PROJECT_REF,
      organizationId: environment.LOCALLENS_THESIS_DEMO_ORGANIZATION_ID,
      expectedProjectName: environment.LOCALLENS_THESIS_DEMO_EXPECTED_PROJECT_NAME,
      allowedOrigin: environment.LOCALLENS_THESIS_DEMO_ALLOWED_ORIGIN,
    },
    credentials: {
      publishableKey: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
      managementToken: environment.SUPABASE_ACCESS_TOKEN,
    },
    accounts: {
      customer: { email: ACCOUNT_CONTRACT.customer.email, password: environment.LOCALLENS_DEMO_CUSTOMER_PASSWORD },
      qaCustomer: { email: ACCOUNT_CONTRACT.qaCustomer.email, password: environment.LOCALLENS_DEMO_QA_CUSTOMER_PASSWORD },
      guide: { email: ACCOUNT_CONTRACT.guide.email, password: environment.LOCALLENS_DEMO_GUIDE_PASSWORD },
      admin: { email: ACCOUNT_CONTRACT.admin.email, password: environment.LOCALLENS_DEMO_ADMIN_PASSWORD },
    },
  };
}

function environmentDependencies(options) {
  return {
    request: defaultRequest,
    logger: (line) => process.stdout.write(`${line}\n`),
    // Dataset v1 cannot prove that begin_fixed_tour_booking will reuse its
    // predeclared booking ID. The real adapter therefore remains fail-closed.
    inspectQaSlot: async () => ({ safe: false, code: "SMOKE_QA_SLOT_BOOKING_ID_UNPROVEN" }),
    // Deliberately no readQuotaEvidence seam until a protected observable
    // boundary can prove one receipt/run per same-operation replay.
    killSwitch: createManagementKillSwitch(options),
  };
}

export async function runThesisDemoSmokeMain({
  run,
  errorLogger = (line) => process.stderr.write(`${line}\n`),
} = {}) {
  try {
    if (run !== undefined) await run();
    else {
      const options = optionsFromEnvironment(process.env);
      await runThesisDemoSmoke(options, environmentDependencies(options));
    }
    return 0;
  } catch (error) {
    const code = error instanceof ThesisDemoSmokeError ? error.code : "cloud smoke did not complete";
    errorLogger(`THESIS_DEMO_SMOKE_FAILED: ${code}`);
    return 2;
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await runThesisDemoSmokeMain();
}
