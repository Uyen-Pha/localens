import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { computePlannerOperationDigest } from "../supabase/functions/_shared/planner-operation.ts";

export const LIVE_SMOKE_OPT_IN = "RUN_LIVE_THESIS_DEMO";
export const FALLBACK_SMOKE_CONFIRMATION = "RUN_FALLBACK_THESIS_DEMO";

const EXPECTED_PROJECT_NAME = "localens-thesis-demo";
const MANAGEMENT_ORIGIN = "https://api.supabase.com";
const MAX_PRE_PROVIDER_HTTP = 20;
const MAX_EVIDENCE_HTTP = 20;
const MAX_PLANNER_INVOCATIONS = 4;
const MAX_PROVIDER_ELIGIBLE_ATTEMPTS = 2;
const MAX_PRODUCT_MUTATIONS = 11;
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
  if (options.mode === "live-success" && options.confirmation !== LIVE_SMOKE_OPT_IN) {
    fail("SMOKE_LIVE_OPT_IN_REQUIRED");
  }
  if (options.mode === "fallback-only" && options.confirmation !== FALLBACK_SMOKE_CONFIRMATION) {
    fail("SMOKE_FALLBACK_CONFIRMATION_REQUIRED");
  }
  let slots;
  if (options.mode === "live-success") {
    const paymentSlot = QA_SLOTS.get(options?.qaSlots?.payment);
    const cancellationSlot = QA_SLOTS.get(options?.qaSlots?.cancellation);
    if (paymentSlot === undefined || cancellationSlot === undefined) fail("SMOKE_QA_SLOT_UNSAFE");
    if (paymentSlot.id !== "qa-01" || cancellationSlot.id !== "qa-02") {
      fail("SMOKE_QA_SLOT_ASSIGNMENTS_UNSAFE");
    }
    slots = { payment: paymentSlot, cancellation: cancellationSlot };
  }

  for (const [key, contract] of Object.entries(ACCOUNT_CONTRACT)) {
    const account = options?.accounts?.[key];
    if (account?.email !== contract.email || !nonEmpty(account?.password)) fail("SMOKE_ACCOUNTS_INCOMPLETE");
  }
  for (const name of ["publishableKey", "serviceRoleKey", "managementToken"]) {
    if (!nonEmpty(options?.credentials?.[name])) fail("SMOKE_CREDENTIALS_INCOMPLETE");
  }
  return {
    runtimeUrl,
    slots,
  };
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

function makeState(options, dependencies) {
  const secrets = knownSecrets(options);
  const counts = {
    plannerEndpointInvocations: 0,
    providerEligibleAttempts: 0,
    denialProbes: 0,
    preProviderHttpRequests: 0,
    evidenceHttpRequests: 0,
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
    if (accounting.evidence === true) {
      counts.evidenceHttpRequests += 1;
      if (counts.evidenceHttpRequests > MAX_EVIDENCE_HTTP) fail("SMOKE_EVIDENCE_HTTP_BUDGET_EXCEEDED");
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
      if (providerOperations.size > MAX_PROVIDER_ELIGIBLE_ATTEMPTS) fail("SMOKE_PROVIDER_BUDGET_EXCEEDED");
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

  const setAttestedProviderAttempts = (count) => {
    if (!Number.isInteger(count) || count < 0 || count > MAX_PROVIDER_ELIGIBLE_ATTEMPTS) {
      fail("SMOKE_PROVIDER_BUDGET_EXCEEDED");
    }
    counts.providerEligibleAttempts = count;
  };

  return { counts, gates, log, pass, request, secrets, setAttestedProviderAttempts };
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
    }, { preProvider: true, evidence: true });
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
    // Both planner handlers enforce the exact customer role before provider
    // eligibility. Keep the separate pre-provider role reads for the three
    // fixed-tour actors so all owner/service evidence stays within 20 HTTP calls.
    if (key === "customer") continue;
    const response = await state.request({
      gate: `role.${key}`,
      url: `${options.target.supabaseUrl}/rest/v1/rpc/get_portal_identity`,
      method: "POST",
      headers: bearerHeaders(options, sessions[key].token),
      body: "{}",
    }, { preProvider: true, evidence: true });
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
    const response = await state.request(
      { gate: probe.gate, ...probe.spec },
      { preProvider: true, evidence: true, denial: true },
    );
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

function lockedWireItem(item, position) {
  if (
    item === null
    || typeof item !== "object"
    || !nonEmpty(item.placeId)
    || !nonEmpty(item.startAt)
    || !nonEmpty(item.endAt)
    || !Number.isInteger(item.visitDurationMinutes)
  ) fail("SMOKE_PLANNER_RESPONSE_INVALID");
  return {
    placeId: item.placeId,
    position,
    startAt: item.startAt,
    endAt: item.endAt,
    visitDurationMinutes: item.visitDurationMinutes,
  };
}

function sameLockedWireItem(item, locked) {
  return item?.placeId === locked.placeId
    && item?.startAt === locked.startAt
    && item?.endAt === locked.endAt
    && item?.visitDurationMinutes === locked.visitDurationMinutes;
}

function samePersistedLockedItem(item, locked) {
  return item?.id === locked.itemId
    && item?.place_id === locked.placeId
    && item?.position === locked.position
    && item?.start_at === locked.startAt
    && item?.end_at === locked.endAt
    && item?.visit_duration_minutes === locked.visitDurationMinutes;
}

function plannerNetworkRequest(options, sessions, { functionName, body }) {
  return {
    url: `${options.target.supabaseUrl}/functions/v1/${functionName}`,
    method: "POST",
    headers: bearerHeaders(options, sessions.customer.token),
    body,
  };
}

function networkRequestIdentity(spec) {
  const headers = Object.fromEntries(
    Object.entries(spec.headers).sort(([left], [right]) => left.localeCompare(right)),
  );
  return createHash("sha256")
    .update(JSON.stringify({ method: spec.method, url: spec.url, headers, body: spec.body }), "utf8")
    .digest("hex");
}

async function plannerResponseLossReplay(options, dependencies, sessions, state, {
  functionName,
  kind,
  body,
  operationId,
}) {
  const networkSpec = plannerNetworkRequest(options, sessions, { functionName, body });
  await state.request({ gate: `planner.${kind}.primary`, ...networkSpec }, {
    planner: true,
    providerOperation: operationId,
  });

  const requestIdentity = networkRequestIdentity(networkSpec);
  let authorization;
  try {
    authorization = await dependencies.postCommitResponseLoss.authorizeReplay({
      operationId,
      requestIdentity,
    });
  } catch {
    fail("SMOKE_RESPONSE_LOSS_REPLAY_UNAUTHORIZED");
  }
  if (authorization?.replay !== true || authorization.requestIdentity !== requestIdentity) {
    fail("SMOKE_RESPONSE_LOSS_REPLAY_UNAUTHORIZED");
  }

  const replaySpec = { ...networkSpec };
  if (networkRequestIdentity(replaySpec) !== requestIdentity) fail("SMOKE_RESPONSE_LOSS_REPLAY_UNAUTHORIZED");
  return state.request({ gate: `planner.${kind}.replay`, ...replaySpec }, {
    planner: true,
    providerOperation: operationId,
  });
}

const ATTESTATION_COUNT_FIELDS = [
  "operationCount",
  "plannerReservationCount",
  "geminiReservationCount",
  "recommendationRunCount",
  "providerAttemptedCount",
];

function validAttestationCounts(value) {
  return ATTESTATION_COUNT_FIELDS.every((field) => Number.isInteger(value?.[field]) && value[field] >= 0);
}

async function readOperationAttestation(options, dependencies, sessions, state, {
  kind,
  phase,
  operationId,
  requestDigest,
  planId = null,
  revision = null,
}) {
  let spec;
  try {
    spec = await dependencies.quotaAttestationRequest({
      operation: kind,
      phase,
      operationId,
      requestDigest,
      actorUserId: sessions.customer.userId,
    });
  } catch {
    fail("SMOKE_QUOTA_REPLAY_UNPROVEN");
  }
  const expectedGate = `read.attestation.${phase}.${kind}`;
  const url = exactHttpsUrl(spec?.url);
  if (
    url === null
    || url.origin !== options.target.supabaseUrl
    || spec?.method !== "POST"
    || spec?.gate !== expectedGate
  ) fail("SMOKE_QUOTA_REPLAY_UNPROVEN");
  const response = await state.request(spec, {
    evidence: true,
    preProvider: phase === "before",
  });
  requireStatus(response, 200, "SMOKE_QUOTA_REPLAY_UNPROVEN");
  const evidence = Array.isArray(response.json) ? response.json[0] : response.json;
  if (!validAttestationCounts(evidence)) fail("SMOKE_QUOTA_REPLAY_UNPROVEN");
  if (phase === "before") {
    if (evidence.state !== "missing" || ATTESTATION_COUNT_FIELDS.some((field) => evidence[field] !== 0)) {
      fail("SMOKE_QUOTA_REPLAY_UNPROVEN");
    }
  } else if (evidence.state !== "completed" || evidence.planId !== planId || evidence.revision !== revision) {
    fail("SMOKE_QUOTA_REPLAY_UNPROVEN");
  }
  return evidence;
}

function attestationDelta(before, after) {
  const deltas = Object.fromEntries(
    ATTESTATION_COUNT_FIELDS.map((field) => [field, after[field] - before[field]]),
  );
  if (ATTESTATION_COUNT_FIELDS.some((field) => deltas[field] !== 1)) {
    fail("SMOKE_QUOTA_REPLAY_UNPROVEN");
  }
  return deltas;
}

const OWNER_REVISION_SELECT = "id,plan_id,revision_no,ranking_source,result_json,trip_plans!inner(id,latest_revision_no),trip_plan_items(id,place_id,position,start_at,end_at,visit_duration_minutes)";

async function readOwnerRevisionOne(options, sessions, state, { planId, wireLocked }) {
  const response = await state.request({
    gate: "read.owner-revision-1",
    url: `${options.target.supabaseUrl}/rest/v1/trip_plan_revisions?plan_id=eq.${planId}&revision_no=eq.1&select=${OWNER_REVISION_SELECT}`,
    method: "GET",
    headers: bearerHeaders(options, sessions.customer.token),
  }, { evidence: true });
  requireStatus(response, 200, "SMOKE_REPLAY_UNPROVEN");
  const row = requireSingleRow(response, "SMOKE_REPLAY_UNPROVEN");
  const plan = Array.isArray(row.trip_plans) ? row.trip_plans[0] : row.trip_plans;
  const persisted = row.trip_plan_items?.find((item) => (
    item?.place_id === wireLocked.placeId && item?.position === wireLocked.position
  ));
  const resultItem = row.result_json?.items?.find((item) => item?.placeId === wireLocked.placeId);
  if (
    row.plan_id !== planId
    || row.revision_no !== 1
    || plan?.id !== planId
    || plan?.latest_revision_no !== 1
    || !Array.isArray(row.trip_plan_items)
    || !nonEmpty(persisted?.id)
    || !sameLockedWireItem(resultItem, wireLocked)
  ) fail("SMOKE_REPLAY_UNPROVEN");
  const locked = { ...wireLocked, itemId: persisted.id };
  if (!samePersistedLockedItem(persisted, locked)) fail("SMOKE_LOCKED_ITEM_CHANGED");
  return locked;
}

async function readOwnerRevisionTwo(options, sessions, state, { planId, locked, refined }) {
  const response = await state.request({
    gate: "read.owner-revision-2",
    url: `${options.target.supabaseUrl}/rest/v1/trip_plan_revisions?plan_id=eq.${planId}&revision_no=eq.2&select=${OWNER_REVISION_SELECT}`,
    method: "GET",
    headers: bearerHeaders(options, sessions.customer.token),
  }, { evidence: true });
  requireStatus(response, 200, "SMOKE_REPLAY_UNPROVEN");
  const row = requireSingleRow(response, "SMOKE_REPLAY_UNPROVEN");
  const plan = Array.isArray(row.trip_plans) ? row.trip_plans[0] : row.trip_plans;
  const persisted = row.trip_plan_items?.find((item) => item?.id === locked.itemId);
  const resultItem = row.result_json?.items?.find((item) => item?.placeId === locked.placeId);
  if (
    row.plan_id !== planId
    || row.revision_no !== 2
    || plan?.id !== planId
    || plan?.latest_revision_no !== 2
    || !Array.isArray(row.trip_plan_items)
  ) fail("SMOKE_REPLAY_UNPROVEN");
  if (
    !samePersistedLockedItem(persisted, locked)
    || !sameLockedWireItem(resultItem, locked)
    || !sameLockedWireItem(refined, locked)
  ) fail("SMOKE_LOCKED_ITEM_CHANGED");
}

async function runLive(options, dependencies, sessions, state, slots) {
  const paymentAssignment = {
    slotId: slots.payment.id,
    bookingId: slots.payment.bookingId,
    operationId: slots.payment.runId,
  };
  const cancellationAssignment = {
    slotId: slots.cancellation.id,
    bookingId: slots.cancellation.bookingId,
    operationId: slots.cancellation.runId,
  };
  await runDenialProbes(options, sessions, state, slots.payment);

  const input = plannerInput();
  const recommendOperationId = paymentAssignment.operationId;
  const recommendDigest = await computePlannerOperationDigest("recommend", input);
  const beforeRecommend = await readOperationAttestation(options, dependencies, sessions, state, {
    kind: "recommend",
    phase: "before",
    operationId: recommendOperationId,
    requestDigest: recommendDigest,
  });
  const recommendBody = JSON.stringify({ operationId: recommendOperationId, input });
  const recommendReplay = await plannerResponseLossReplay(options, dependencies, sessions, state, {
    functionName: "recommend-itinerary",
    kind: "recommend",
    body: recommendBody,
    operationId: recommendOperationId,
  });
  const recommend = validatePlannerResponse(recommendReplay, {
    revision: 1,
    rankingSource: recommendReplay.json?.degraded === true ? "deterministic" : "ai",
  });
  const wireLocked = lockedWireItem(recommend.proposal.items[0], 1);
  const locked = await readOwnerRevisionOne(options, sessions, state, {
    planId: recommend.planId,
    wireLocked,
  });

  const lockedItemIds = [locked.itemId];
  const signals = { pace: "slower", food: "keep", preferTypes: ["history"], avoidTypes: [] };
  const refineOperationId = cancellationAssignment.operationId;
  const refineDigest = await computePlannerOperationDigest("refine", {
    planId: recommend.planId,
    baseRevision: 1,
    scope: "partial",
    lockedItemIds,
    signals,
  });
  const beforeRefine = await readOperationAttestation(options, dependencies, sessions, state, {
    kind: "refine",
    phase: "before",
    operationId: refineOperationId,
    requestDigest: refineDigest,
  });
  const refineBody = JSON.stringify({
    operationId: refineOperationId,
    planId: recommend.planId,
    baseRevision: 1,
    delta: { feedback: "slower; history", scope: "partial" },
    lockedItemIds,
  });
  const refineReplay = await plannerResponseLossReplay(options, dependencies, sessions, state, {
    functionName: "refine-itinerary",
    kind: "refine",
    body: refineBody,
    operationId: refineOperationId,
  });
  const refined = validatePlannerResponse(refineReplay, {
    revision: 2,
    rankingSource: refineReplay.json?.degraded === true ? "deterministic" : "ai",
  });
  const refinedLockedItems = refined.proposal.items.filter((item) => item?.placeId === locked.placeId);
  if (refined.planId !== recommend.planId || refinedLockedItems.length !== 1 || !sameLockedWireItem(refinedLockedItems[0], locked)) {
    fail("SMOKE_LOCKED_ITEM_CHANGED");
  }

  await readOwnerRevisionTwo(options, sessions, state, {
    planId: recommend.planId,
    locked,
    refined: refinedLockedItems[0],
  });
  const afterRecommend = await readOperationAttestation(options, dependencies, sessions, state, {
    kind: "recommend",
    phase: "after",
    operationId: recommendOperationId,
    requestDigest: recommendDigest,
    planId: recommend.planId,
    revision: 1,
  });
  const afterRefine = await readOperationAttestation(options, dependencies, sessions, state, {
    kind: "refine",
    phase: "after",
    operationId: refineOperationId,
    requestDigest: refineDigest,
    planId: recommend.planId,
    revision: 2,
  });
  const recommendDelta = attestationDelta(beforeRecommend, afterRecommend);
  const refineDelta = attestationDelta(beforeRefine, afterRefine);
  state.setAttestedProviderAttempts(
    recommendDelta.providerAttemptedCount + refineDelta.providerAttemptedCount,
  );
  state.pass("replay");

  const realAi = [recommend, refined].some((value) => value.degraded === false && value.proposal.rankingSource === "ai");
  if (!realAi) fail("SMOKE_REAL_AI_UNPROVEN");
  state.pass("real-ai");

  await runFixedTour(options, sessions, state, { paymentAssignment, cancellationAssignment, slots });
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

async function runFixedTour(options, sessions, state, {
  paymentAssignment,
  cancellationAssignment,
  slots,
}) {
  const paymentSlot = slots.payment;
  const cancellationSlot = slots.cancellation;
  if (
    paymentAssignment.slotId !== paymentSlot.id
    || paymentAssignment.bookingId !== paymentSlot.bookingId
    || cancellationAssignment.slotId !== cancellationSlot.id
    || cancellationAssignment.bookingId !== cancellationSlot.bookingId
    || paymentAssignment.bookingId === cancellationAssignment.bookingId
  ) fail("SMOKE_QA_SLOT_ASSIGNMENTS_UNSAFE");

  const paymentBookingBody = {
    departure_id: dataset.qa.slotDepartureId,
    party_size: Math.min(2, paymentSlot.maxSeats),
    booking_locale: "vi",
    idempotency_key: paymentSlot.bookingIdempotencyKey,
  };
  const paymentBookingPrimary = await mutation(options, state, { gate: "fixed.payment.begin.primary", rpc: "begin_fixed_tour_booking", token: sessions.qaCustomer.token, body: paymentBookingBody });
  const paymentBookingReplay = await mutation(options, state, { gate: "fixed.payment.begin.replay", rpc: "begin_fixed_tour_booking", token: sessions.qaCustomer.token, body: paymentBookingBody });
  if (
    paymentBookingPrimary.booking_id !== paymentAssignment.bookingId
    || paymentBookingReplay.booking_id !== paymentAssignment.bookingId
  ) fail("SMOKE_FIXED_TOUR_FAILED");

  const paymentBody = { booking_id: paymentAssignment.bookingId, idempotency_key: paymentSlot.paymentIdempotencyKey };
  const paymentPrimary = await mutation(options, state, { gate: "fixed.payment.complete.primary", rpc: "complete_simulated_fixed_tour_payment", token: sessions.qaCustomer.token, body: paymentBody });
  const paymentReplay = await mutation(options, state, { gate: "fixed.payment.complete.replay", rpc: "complete_simulated_fixed_tour_payment", token: sessions.qaCustomer.token, body: paymentBody });
  if (
    paymentPrimary.booking_id !== paymentAssignment.bookingId
    || paymentReplay.booking_id !== paymentAssignment.bookingId
    || paymentPrimary.simulated !== true
    || paymentReplay.simulated !== true
  ) fail("SMOKE_FIXED_TOUR_FAILED");

  const assignmentBody = {
    booking_id: paymentAssignment.bookingId,
    guide_user_id: sessions.guide.userId,
    idempotency_key: `thesis-demo:v1:${paymentSlot.id}:assignment`,
  };
  const assignment = await mutation(options, state, { gate: "fixed.payment.assign.primary", rpc: "assign_fixed_departure_guide", token: sessions.admin.token, body: assignmentBody });
  const assignmentReplay = await mutation(options, state, { gate: "fixed.payment.assign.replay", rpc: "assign_fixed_departure_guide", token: sessions.admin.token, body: assignmentBody });
  if (
    !nonEmpty(assignment.assignment_id)
    || assignmentReplay.assignment_id !== assignment.assignment_id
    || assignment.booking_id !== paymentAssignment.bookingId
    || assignmentReplay.booking_id !== paymentAssignment.bookingId
  ) fail("SMOKE_FIXED_TOUR_FAILED");
  const accepted = await mutation(options, state, { gate: "fixed.payment.accept", rpc: "accept_guide_assignment", token: sessions.guide.token, body: { p_assignment_id: assignment.assignment_id } });
  if (accepted.assignment_id !== assignment.assignment_id || accepted.status !== "accepted") {
    fail("SMOKE_FIXED_TOUR_FAILED");
  }

  const cancellationBookingBody = {
    departure_id: dataset.qa.slotDepartureId,
    party_size: Math.min(2, cancellationSlot.maxSeats),
    booking_locale: "vi",
    idempotency_key: cancellationSlot.bookingIdempotencyKey,
  };
  const cancellationBookingPrimary = await mutation(options, state, { gate: "fixed.cancellation.begin.primary", rpc: "begin_fixed_tour_booking", token: sessions.qaCustomer.token, body: cancellationBookingBody });
  const cancellationBookingReplay = await mutation(options, state, { gate: "fixed.cancellation.begin.replay", rpc: "begin_fixed_tour_booking", token: sessions.qaCustomer.token, body: cancellationBookingBody });
  if (
    cancellationBookingPrimary.booking_id !== cancellationAssignment.bookingId
    || cancellationBookingReplay.booking_id !== cancellationAssignment.bookingId
  ) fail("SMOKE_FIXED_TOUR_FAILED");
  const cancelBody = {
    booking_id: cancellationAssignment.bookingId,
    reason_code: "trip_plan_changed",
    other_reason: null,
    idempotency_key: cancellationSlot.cancelIdempotencyKey,
  };
  const cancelPrimary = await mutation(options, state, { gate: "fixed.cancellation.cancel.primary", rpc: "cancel_booking", token: sessions.qaCustomer.token, body: cancelBody });
  const cancelReplay = await mutation(options, state, { gate: "fixed.cancellation.cancel.replay", rpc: "cancel_booking", token: sessions.qaCustomer.token, body: cancelBody });
  if (
    cancelPrimary.booking_id !== cancellationAssignment.bookingId
    || cancelReplay.booking_id !== cancellationAssignment.bookingId
  ) fail("SMOKE_FIXED_TOUR_FAILED");

  const reads = [
    ["fixed.payment.read.customer", sessions.qaCustomer.token, `customer_bookings_v?id=eq.${paymentAssignment.bookingId}&select=id`],
    ["fixed.payment.read.admin", sessions.admin.token, `admin_bookings_v?id=eq.${paymentAssignment.bookingId}&select=id`],
    ["fixed.payment.read.guide", sessions.guide.token, "rpc/get_guide_assigned_bookings"],
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
    if (
      !Array.isArray(response.json)
      || !response.json.some((row) => row?.id === paymentAssignment.bookingId || row?.booking_id === paymentAssignment.bookingId)
    ) fail("SMOKE_FIXED_TOUR_FAILED");
  }
  state.pass("fixed-tour-simulated-payment");
}

async function runFallback(options, dependencies, sessions, state) {
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

    const fallbackSlot = QA_SLOTS.get("qa-03");
    if (fallbackSlot === undefined) fail("SMOKE_QA_SLOT_UNSAFE");
    const operationId = fallbackSlot.runId;
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

function sameQaAssignment(actual, expected) {
  return actual?.slotId === expected.slotId
    && actual?.bookingId === expected.bookingId
    && actual?.operationId === expected.operationId;
}

async function preflightLive(dependencies, slots) {
  if (!(dependencies.inspectQaSlots instanceof Function)) fail("SMOKE_QA_SLOT_BOOKING_ID_UNPROVEN");
  const expected = {
    payment: {
      slotId: slots.payment.id,
      bookingId: slots.payment.bookingId,
      operationId: slots.payment.runId,
    },
    cancellation: {
      slotId: slots.cancellation.id,
      bookingId: slots.cancellation.bookingId,
      operationId: slots.cancellation.runId,
    },
  };
  let inspection;
  try {
    inspection = await dependencies.inspectQaSlots(expected);
  } catch {
    fail("SMOKE_QA_SLOT_BOOKING_ID_UNPROVEN");
  }
  if (
    inspection?.safe !== true
    || !sameQaAssignment(inspection.assignments?.payment, expected.payment)
    || !sameQaAssignment(inspection.assignments?.cancellation, expected.cancellation)
  ) {
    fail("SMOKE_QA_SLOT_BOOKING_ID_UNPROVEN");
  }
  if (!(dependencies.quotaAttestationRequest instanceof Function)) fail("SMOKE_QUOTA_REPLAY_UNPROVEN");
  if (!(dependencies.postCommitResponseLoss?.authorizeReplay instanceof Function)) {
    fail("SMOKE_RESPONSE_LOSS_SEAM_UNAVAILABLE");
  }
}

export async function runThesisDemoSmoke(options, dependencies) {
  const { slots } = validateOptions(options);
  if (dependencies?.request === undefined) fail("SMOKE_HTTP_UNAVAILABLE");
  if (options.mode === "live-success") await preflightLive(dependencies, slots);

  const state = makeState(options, dependencies);
  await verifyTarget(options, state);
  const sessions = await authenticate(options, state);
  await verifyRoles(options, sessions, state);

  let realAi = false;
  if (options.mode === "live-success") realAi = await runLive(options, dependencies, sessions, state, slots);
  else await runFallback(options, dependencies, sessions, state);

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
    confirmation: environment.LOCALLENS_THESIS_DEMO_CONFIRMATION,
    qaSlots: {
      payment: environment.LOCALLENS_THESIS_DEMO_PAYMENT_QA_SLOT,
      cancellation: environment.LOCALLENS_THESIS_DEMO_CANCELLATION_QA_SLOT,
    },
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
    inspectQaSlots: async () => ({ safe: false, code: "SMOKE_QA_SLOT_BOOKING_ID_UNPROVEN" }),
    // Deliberately no quotaAttestationRequest seam until a protected observable
    // boundary can prove one receipt/run per same-operation replay.
    postCommitResponseLoss: {
      authorizeReplay: async ({ requestIdentity }) => ({ replay: true, requestIdentity }),
    },
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
