// @vitest-environment node

import { describe, expect, it } from "vitest";

// @ts-expect-error -- the production entrypoint is executable .mjs and has no declaration artifact.
import * as thesisDemoSmoke from "@/scripts/smoke-thesis-demo.mjs";

const {
  FALLBACK_SMOKE_CONFIRMATION,
  LIVE_SMOKE_OPT_IN,
  runThesisDemoSmoke,
  runThesisDemoSmokeMain,
} = thesisDemoSmoke;

const PROJECT_REF = "abcdefghijklmnopqrst";
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000090";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const ALLOWED_ORIGIN = "https://localens.invalid";
const PUBLISHABLE_KEY = "sb_publishable_test_only_123456789";
const SERVICE_ROLE_KEY = "sb_secret_test_only_123456789";
const MANAGEMENT_TOKEN = "sbp_test_only_12345678901234567890";
const PLAN_ID = "d1700000-0000-4000-8000-000000000801";
const PLACE_ID = "d1700000-0000-4000-8000-000000000101";
const ITEM_ID = PLACE_ID;
const OTHER_PLACE_ID = "d1700000-0000-4000-8000-000000000102";
const REVISION_ID = "d1700000-0000-4000-8000-000000000821";
const REVISION_TWO_ID = "d1700000-0000-4000-8000-000000000822";
const PAYMENT_BOOKING_ID = "d1700000-0000-4000-8000-000000000711";
const CANCELLATION_BOOKING_ID = "d1700000-0000-4000-8000-000000000712";
const RECOMMEND_OPERATION_ID = "d1700000-0000-4000-8000-000000000701";
const REFINE_OPERATION_ID = "d1700000-0000-4000-8000-000000000702";
const FALLBACK_OPERATION_ID = "d1700000-0000-4000-8000-000000000703";
const LOCKED_START_AT = "2026-09-12T09:00:00+07:00";
const LOCKED_END_AT = "2026-09-12T10:00:00+07:00";
const EQUIVALENT_START_AT = "2026-09-12T02:00:00.000Z";
const EQUIVALENT_END_AT = "2026-09-12T03:00:00.000Z";
const CHANGED_FOOD_SELECTION = {
  vendorId: "vendor-banh-mi-legacy",
  menuItemId: "menu-banh-mi-legacy",
  quantity: 2,
  priceVndMin: "30000",
  priceVndMax: "40000",
  paymentMode: "pay_at_vendor",
  activity: "Taste and discuss the selected dish",
};

const ACCOUNT_IDS = {
  customer: "d1700000-0000-4000-8000-000000000901",
  qaCustomer: "d1700000-0000-4000-8000-000000000902",
  guide: "d1700000-0000-4000-8000-000000000903",
  admin: "d1700000-0000-4000-8000-000000000904",
} as const;

type RequestRecord = {
  gate: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

function validOptions(overrides: Record<string, unknown> = {}) {
  return {
    mode: "live-success" as const,
    confirmation: LIVE_SMOKE_OPT_IN,
    liveOptIn: LIVE_SMOKE_OPT_IN,
    qaSlot: "qa-01",
    qaSlots: {
      payment: "qa-01",
      cancellation: "qa-02",
    },
    target: {
      supabaseUrl: SUPABASE_URL,
      projectRef: PROJECT_REF,
      organizationId: ORGANIZATION_ID,
      expectedProjectName: "localens-thesis-demo",
      allowedOrigin: ALLOWED_ORIGIN,
    },
    credentials: {
      publishableKey: PUBLISHABLE_KEY,
      serviceRoleKey: SERVICE_ROLE_KEY,
      managementToken: MANAGEMENT_TOKEN,
    },
    accounts: {
      customer: { email: "customer.demo@localens.invalid", password: "customer-password-123" },
      qaCustomer: { email: "customer.qa@localens.invalid", password: "qa-password-123456" },
      guide: { email: "guide.demo@localens.invalid", password: "guide-password-12345" },
      admin: { email: "admin.demo@localens.invalid", password: "admin-password-12345" },
    },
    ...overrides,
  };
}

function wireItem(overrides: Record<string, unknown> = {}) {
  return {
    placeId: PLACE_ID,
    startAt: LOCKED_START_AT,
    endAt: LOCKED_END_AT,
    visitDurationMinutes: 60,
    travelMinutesBefore: 0,
    transitionBufferMinutesBefore: 0,
    travelCostVndBefore: "0",
    placeCostVnd: "80000",
    foodSelection: null,
    foodCostMinVnd: "0",
    foodCostMaxVnd: "0",
    payAtVendorMinVnd: "0",
    payAtVendorMaxVnd: "0",
    customerPayableVnd: "80000",
    score: 4,
    ...overrides,
  };
}

function proposal(rankingSource: "ai" | "deterministic", itemOverrides: Record<string, unknown> = {}) {
  return {
    normalizedStartAt: LOCKED_START_AT,
    budgetVnd: "2000000",
    rankingSource,
    items: [wireItem(itemOverrides)],
    totals: {
      durationMinutes: 60,
      visitMinutes: 60,
      travelMinutes: 0,
      transitionBufferMinutes: 0,
      admissionCostVnd: "80000",
      foodCostMinVnd: "0",
      foodCostMaxVnd: "0",
      travelCostVnd: "0",
      guideCostVnd: "0",
      payAtVendorMinVnd: "0",
      payAtVendorMaxVnd: "0",
      customerPayableVnd: "80000",
      groupCostMinVnd: "80000",
      groupCostMaxVnd: "80000",
      groupCostVnd: "80000",
      score: 4,
    },
    snapshotIds: {
      catalog: "d1700000-0000-4000-8000-000000000061",
      travel: "d1700000-0000-4000-8000-000000000062",
      fx: null,
    },
  };
}

function persistedItem(overrides: Record<string, unknown> = {}) {
  return {
    place_id: PLACE_ID,
    position: 1,
    start_at: LOCKED_START_AT,
    end_at: LOCKED_END_AT,
    visit_duration_minutes: 60,
    ...overrides,
  };
}

function attestation(operation: "recommend" | "refine", phase: "before" | "after", providerDelta = 1) {
  const baseline = 0;
  const delta = phase === "after" ? 1 : 0;
  return {
    state: phase === "after" ? "completed" : "missing",
    planId: phase === "after" ? PLAN_ID : null,
    revision: phase === "after" ? (operation === "recommend" ? 1 : 2) : null,
    operationCount: baseline + delta,
    plannerReservationCount: baseline + delta,
    geminiReservationCount: baseline + delta,
    recommendationRunCount: baseline + delta,
    providerAttemptedCount: baseline + (phase === "after" ? providerDelta : 0),
  };
}

function createHarness({
  degradedLive = false,
  targetRedirect,
  targetCorrelationId = "target-correlation-01",
  failGate,
  qaSlotSafe = true,
  quotaObservable = true,
  attestedProviderDelta = 1,
  responseLossAuthorized = true,
  primaryRecommendStatus,
  malformedPrimaryRecommend = false,
  equivalentTimezoneOffsets = false,
  returnedItemOverrides = {},
  persistedResultItemOverrides = {},
  persistedRowOverrides = {},
  returnedOrderChanged = false,
  persistedOrderChanged = false,
}: {
  degradedLive?: boolean;
  targetRedirect?: string;
  targetCorrelationId?: string;
  failGate?: string;
  qaSlotSafe?: boolean;
  quotaObservable?: boolean;
  attestedProviderDelta?: number;
  responseLossAuthorized?: boolean;
  primaryRecommendStatus?: number;
  malformedPrimaryRecommend?: boolean;
  equivalentTimezoneOffsets?: boolean;
  returnedItemOverrides?: Record<string, unknown>;
  persistedResultItemOverrides?: Record<string, unknown>;
  persistedRowOverrides?: Record<string, unknown>;
  returnedOrderChanged?: boolean;
  persistedOrderChanged?: boolean;
} = {}) {
  const requests: RequestRecord[] = [];
  const logs: string[] = [];
  const killSwitchEvents: string[] = [];
  const responseLossEvents: string[] = [];
  const orchestrationEvents: string[] = [];
  const qaInspectionRequests: unknown[] = [];
  let killSwitchState = true;

  const request = async (spec: RequestRecord) => {
    requests.push(structuredClone(spec));
    orchestrationEvents.push(`request:${spec.gate}`);
    if (spec.gate === failGate) throw new Error(`${SERVICE_ROLE_KEY} dependency detail`);
    if (spec.gate === "target") {
      if (targetRedirect) {
        return { status: 302, headers: { location: targetRedirect, correlationId: targetCorrelationId }, json: null };
      }
      return {
        status: 200,
        headers: { correlationId: targetCorrelationId },
        json: {
          ref: PROJECT_REF,
          organization_id: ORGANIZATION_ID,
          name: "localens-thesis-demo",
          status: "ACTIVE_HEALTHY",
        },
      };
    }
    if (spec.gate.startsWith("auth.")) {
      const account = spec.gate.slice("auth.".length) as keyof typeof ACCOUNT_IDS;
      return {
        status: 200,
        headers: { correlationId: `auth-${account}-01` },
        json: {
          access_token: `access-token-${account}-1234567890`,
          user: { id: ACCOUNT_IDS[account] },
        },
      };
    }
    if (spec.gate.startsWith("role.")) {
      const account = spec.gate.slice("role.".length) as keyof typeof ACCOUNT_IDS;
      const roles = {
        customer: "customer",
        qaCustomer: "customer",
        guide: "guide",
        admin: "admin",
      } as const;
      return {
        status: 200,
        headers: { correlationId: `${spec.gate}-01` },
        json: [{ user_id: ACCOUNT_IDS[account], role: roles[account] }],
      };
    }
    const denialStatuses: Record<string, number> = {
      "denial.missing-jwt": 401,
      "denial.invalid-token": 401,
      "denial.wrong-origin": 403,
      "denial.invalid-payload": 400,
      "denial.outside-allowlist": 422,
      "denial.cross-owner-write": 403,
    };
    if (spec.gate === "denial.cross-owner-read") {
      return { status: 200, headers: { correlationId: "denial-owner-read-01" }, json: [] };
    }
    if (spec.gate in denialStatuses) {
      return {
        status: denialStatuses[spec.gate]!,
        headers: { correlationId: `${spec.gate}-01` },
        json: { code: "DENIED" },
      };
    }
    if (spec.gate === "planner.fallback") {
      return {
        status: 200,
        headers: { correlationId: "fallback-correlation-01" },
        json: {
          advisoryOnly: true,
          degraded: true,
          planId: PLAN_ID,
          proposal: proposal("deterministic"),
          rationales: {},
          revision: 1,
        },
      };
    }
    if (spec.gate === "planner.recommend.primary" && primaryRecommendStatus !== undefined) {
      return {
        status: primaryRecommendStatus,
        headers: { correlationId: "primary-visible-error-01" },
        json: { code: "VISIBLE_PRIMARY_FAILURE" },
      };
    }
    if (spec.gate === "planner.recommend.primary" && malformedPrimaryRecommend) {
      return {
        status: 200,
        headers: { correlationId: "primary-malformed-01" },
        json: {
          advisoryOnly: true,
          planId: PLAN_ID,
          proposal: proposal("ai"),
          rationales: {},
          revision: 1,
        },
      };
    }
    if (spec.gate.startsWith("planner.recommend")) {
      return {
        status: 200,
        headers: { correlationId: `${spec.gate}-01` },
        json: {
          advisoryOnly: true,
          degraded: degradedLive,
          planId: PLAN_ID,
          proposal: proposal(degradedLive ? "deterministic" : "ai"),
          rationales: {},
          revision: 1,
        },
      };
    }
    if (spec.gate.startsWith("planner.refine")) {
      const itemOverrides = {
        ...(equivalentTimezoneOffsets ? { startAt: EQUIVALENT_START_AT, endAt: EQUIVALENT_END_AT } : {}),
        ...returnedItemOverrides,
      };
      const refinedProposal = proposal(degradedLive ? "deterministic" : "ai", itemOverrides);
      if (returnedOrderChanged) {
        refinedProposal.items = [wireItem({ placeId: OTHER_PLACE_ID }), ...refinedProposal.items];
      }
      return {
        status: 200,
        headers: { correlationId: `${spec.gate}-01` },
        json: {
          advisoryOnly: true,
          baseRevision: 1,
          degraded: degradedLive,
          planId: PLAN_ID,
          proposal: refinedProposal,
          rationales: {},
          regeneration: "partial",
          revision: 2,
        },
      };
    }
    if (spec.gate === "read.user-plan-1") {
      return { status: 200, headers: {}, json: [{ id: PLAN_ID, latest_revision_no: 1 }] };
    }
    if (spec.gate === "read.user-plan-2") {
      return { status: 200, headers: {}, json: [{ id: PLAN_ID, latest_revision_no: 2 }] };
    }
    if (spec.gate === "read.user-revision-1") {
      return {
        status: 200,
        headers: {},
        json: [{ id: REVISION_ID, plan_id: PLAN_ID, revision_no: 1, ranking_source: degradedLive ? "deterministic" : "ai", result_json: proposal(degradedLive ? "deterministic" : "ai") }],
      };
    }
    if (spec.gate === "read.user-items-1") {
      return {
        status: 200,
        headers: {},
        json: [persistedItem()],
      };
    }
    if (spec.gate === "read.user-revision-2") {
      return {
        status: 200,
        headers: {},
        json: [{ plan_id: PLAN_ID, revision_no: 2, ranking_source: degradedLive ? "deterministic" : "ai", result_json: proposal(degradedLive ? "deterministic" : "ai") }],
      };
    }
    if (spec.gate.startsWith("read.operation.")) {
      return {
        status: 200,
        headers: {},
        json: { state: "completed", planId: PLAN_ID, revision: spec.gate.endsWith("recommend") ? 1 : 2 },
      };
    }
    if (spec.gate === "read.owner-revision-1") {
      return {
        status: 200,
        headers: {},
        json: [{
          id: REVISION_ID,
          plan_id: PLAN_ID,
          revision_no: 1,
          ranking_source: degradedLive ? "deterministic" : "ai",
          result_json: proposal(degradedLive ? "deterministic" : "ai"),
          trip_plans: { id: PLAN_ID, latest_revision_no: 1 },
          trip_plan_items: [persistedItem(equivalentTimezoneOffsets
            ? { start_at: EQUIVALENT_START_AT, end_at: EQUIVALENT_END_AT }
            : {})],
        }],
      };
    }
    if (spec.gate === "read.owner-revision-2") {
      const resultItemOverrides = {
        ...(equivalentTimezoneOffsets ? { startAt: EQUIVALENT_START_AT, endAt: EQUIVALENT_END_AT } : {}),
        ...persistedResultItemOverrides,
      };
      const persistedProposal = proposal(degradedLive ? "deterministic" : "ai", resultItemOverrides);
      if (persistedOrderChanged) {
        persistedProposal.items = [wireItem({ placeId: OTHER_PLACE_ID }), ...persistedProposal.items];
      }
      return {
        status: 200,
        headers: {},
        json: [{
          id: REVISION_TWO_ID,
          plan_id: PLAN_ID,
          revision_no: 2,
          ranking_source: degradedLive ? "deterministic" : "ai",
          result_json: persistedProposal,
          trip_plans: { id: PLAN_ID, latest_revision_no: 2 },
          trip_plan_items: [persistedItem({
            ...(equivalentTimezoneOffsets ? { start_at: EQUIVALENT_START_AT, end_at: EQUIVALENT_END_AT } : {}),
            ...persistedRowOverrides,
          })],
        }],
      };
    }
    if (spec.gate.startsWith("read.attestation.")) {
      const [, , phase, operation] = spec.gate.split(".") as [string, string, "before" | "after", "recommend" | "refine"];
      return { status: 200, headers: {}, json: attestation(operation, phase, attestedProviderDelta) };
    }
    if (spec.gate.startsWith("fixed.payment.begin")) {
      return { status: 200, headers: {}, json: [{ booking_id: PAYMENT_BOOKING_ID, state: spec.gate.endsWith("replay") ? "replayed" : "created" }] };
    }
    if (spec.gate.startsWith("fixed.payment.complete")) {
      return { status: 200, headers: {}, json: [{ booking_id: PAYMENT_BOOKING_ID, state: spec.gate.endsWith("replay") ? "replayed" : "created", simulated: true }] };
    }
    if (spec.gate.startsWith("fixed.payment.assign")) {
      return { status: 200, headers: {}, json: [{ assignment_id: "d1700000-0000-4000-8000-000000000741", booking_id: PAYMENT_BOOKING_ID, state: spec.gate.endsWith("replay") ? "replayed" : "created" }] };
    }
    if (spec.gate === "fixed.payment.accept") {
      return { status: 200, headers: {}, json: [{ assignment_id: "d1700000-0000-4000-8000-000000000741", status: "accepted" }] };
    }
    if (spec.gate.startsWith("fixed.cancellation.begin")) {
      return { status: 200, headers: {}, json: [{ booking_id: CANCELLATION_BOOKING_ID, state: spec.gate.endsWith("replay") ? "replayed" : "created" }] };
    }
    if (spec.gate.startsWith("fixed.cancellation.cancel")) {
      return { status: 200, headers: {}, json: [{ booking_id: CANCELLATION_BOOKING_ID, state: spec.gate.endsWith("replay") ? "replayed" : "cancelled" }] };
    }
    if (spec.gate.startsWith("fixed.payment.read")) {
      return { status: 200, headers: {}, json: [{ booking_id: PAYMENT_BOOKING_ID }] };
    }
    throw new Error(`unexpected gate ${spec.gate}`);
  };

  const dependencies = {
    request,
    logger: (line: string) => { logs.push(line); },
    inspectQaSlots: async (assignment: unknown) => {
      qaInspectionRequests.push(structuredClone(assignment));
      return qaSlotSafe
        ? {
          safe: true as const,
          assignments: {
            payment: {
              slotId: "qa-01",
              bookingId: PAYMENT_BOOKING_ID,
              operationId: RECOMMEND_OPERATION_ID,
            },
            cancellation: {
              slotId: "qa-02",
              bookingId: CANCELLATION_BOOKING_ID,
              operationId: REFINE_OPERATION_ID,
            },
          },
        }
        : { safe: false as const, code: "SMOKE_QA_SLOT_BOOKING_ID_UNPROVEN" };
    },
    ...(quotaObservable
      ? {
          quotaAttestationRequest: ({
            operation,
            phase,
          }: {
            operation: "recommend" | "refine";
            phase: "before" | "after";
          }): RequestRecord => ({
            gate: `read.attestation.${phase}.${operation}`,
            url: `${SUPABASE_URL}/rest/v1/rpc/get_runtime_planner_operation`,
            method: "POST",
            headers: {
              apikey: SERVICE_ROLE_KEY,
              authorization: `Bearer ${SERVICE_ROLE_KEY}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ operation, phase }),
          }),
        }
      : {}),
    postCommitResponseLoss: {
      authorizeReplay: async ({
        operationId,
        requestIdentity,
      }: {
        operationId: string;
        requestIdentity: string;
      }) => {
        responseLossEvents.push(`${operationId}:${requestIdentity}`);
        orchestrationEvents.push(`response-loss:${operationId}`);
        return responseLossAuthorized
          ? { replay: true as const, requestIdentity }
          : { replay: false as const, requestIdentity };
      },
    },
    killSwitch: {
      read: async () => {
        killSwitchEvents.push(`read:${killSwitchState}`);
        return killSwitchState;
      },
      set: async (enabled: boolean) => {
        killSwitchState = enabled;
        killSwitchEvents.push(`set:${enabled}`);
      },
      hasSecret: async (name: string) => {
        killSwitchEvents.push(`secret:${name}`);
        return name === "GEMINI_API_KEY";
      },
    },
  };

  return {
    dependencies,
    requests,
    logs,
    killSwitchEvents,
    orchestrationEvents,
    responseLossEvents,
    qaInspectionRequests,
  };
}

async function captureCode(work: Promise<unknown>) {
  return work.catch((error: unknown) => (error as { code?: string }).code);
}

function fallbackOptions(overrides: Record<string, unknown> = {}) {
  return validOptions({
    mode: "fallback-only",
    confirmation: FALLBACK_SMOKE_CONFIRMATION,
    qaSlots: undefined,
    ...overrides,
  });
}

describe("bounded thesis-demo cloud smoke", () => {
  it.each([
    ["unverified target", { target: { ...validOptions().target, expectedProjectName: "production" } }, "SMOKE_TARGET_UNVERIFIED"],
    ["non-HTTPS target", { target: { ...validOptions().target, supabaseUrl: `http://${PROJECT_REF}.supabase.co` } }, "SMOKE_TARGET_INSECURE"],
    ["missing role account", { accounts: { ...validOptions().accounts, admin: undefined } }, "SMOKE_ACCOUNTS_INCOMPLETE"],
    ["missing live opt-in", { confirmation: "" }, "SMOKE_LIVE_OPT_IN_REQUIRED"],
    ["unsafe QA slot", { qaSlots: { payment: "qa-01", cancellation: "qa-05" } }, "SMOKE_QA_SLOT_UNSAFE"],
    ["same payment/cancellation slot", { qaSlots: { payment: "qa-01", cancellation: "qa-01" } }, "SMOKE_QA_SLOT_ASSIGNMENTS_UNSAFE"],
    ["swapped payment/cancellation slots", { qaSlots: { payment: "qa-02", cancellation: "qa-01" } }, "SMOKE_QA_SLOT_ASSIGNMENTS_UNSAFE"],
  ])("rejects %s before opening HTTP", async (_label, overrides, expectedCode) => {
    const harness = createHarness();

    const code = await captureCode(runThesisDemoSmoke(validOptions(overrides), harness.dependencies));

    expect(code).toBe(expectedCode);
    expect(harness.requests).toEqual([]);
  });

  it("keeps the known random-booking QA-slot mismatch fail-closed before cloud I/O", async () => {
    const harness = createHarness({ qaSlotSafe: false });

    const code = await captureCode(runThesisDemoSmoke(validOptions(), harness.dependencies));

    expect(code).toBe("SMOKE_QA_SLOT_BOOKING_ID_UNPROVEN");
    expect(harness.requests).toEqual([]);
  });

  it("requires the exact two-slot live inspection seam before cloud I/O", async () => {
    const harness = createHarness();
    const dependencies = { ...harness.dependencies, inspectQaSlots: undefined };

    const code = await captureCode(runThesisDemoSmoke(validOptions(), dependencies));

    expect(code).toBe("SMOKE_QA_SLOT_BOOKING_ID_UNPROVEN");
    expect(harness.requests).toEqual([]);
  });

  it("keeps live replay fail-closed when quota evidence is not observable", async () => {
    const harness = createHarness({ quotaObservable: false });

    const code = await captureCode(runThesisDemoSmoke(validOptions(), harness.dependencies));

    expect(code).toBe("SMOKE_QUOTA_REPLAY_UNPROVEN");
    expect(harness.requests).toEqual([]);
  });

  it("keeps live replay fail-closed when the post-commit response-loss seam is unavailable", async () => {
    const harness = createHarness();
    const dependencies = { ...harness.dependencies, postCommitResponseLoss: undefined };

    const code = await captureCode(runThesisDemoSmoke(validOptions(), dependencies));

    expect(code).toBe("SMOKE_RESPONSE_LOSS_SEAM_UNAVAILABLE");
    expect(harness.requests).toEqual([]);
  });

  it("rejects a redirect to another host without following it", async () => {
    const harness = createHarness({ targetRedirect: "https://attacker.invalid/capture" });

    const code = await captureCode(runThesisDemoSmoke(fallbackOptions(), harness.dependencies));

    expect(code).toBe("SMOKE_REDIRECT_CROSS_HOST");
    expect(harness.requests.map(({ gate }) => gate)).toEqual(["target"]);
  });

  it("refuses a credential-shaped correlation value before it reaches the logger", async () => {
    const harness = createHarness({ targetCorrelationId: SERVICE_ROLE_KEY });

    const code = await captureCode(runThesisDemoSmoke(fallbackOptions(), harness.dependencies));

    expect(code).toBe("SMOKE_SECRET_LOG_BLOCKED");
    expect(harness.logs.join("\n")).not.toContain(SERVICE_ROLE_KEY);
  });

  it("runs fallback independently of live QA-slot, quota, and response-loss seams", async () => {
    const harness = createHarness();
    const { request, logger, killSwitch } = harness.dependencies;

    const result = await runThesisDemoSmoke(fallbackOptions(), {
      request,
      logger,
      killSwitch,
    });

    expect(result).toMatchObject({
      ok: true,
      mode: "fallback-only",
      realAi: false,
      counts: {
        plannerEndpointInvocations: 1,
        providerEligibleAttempts: 0,
        denialProbes: 0,
        preProviderHttpRequests: 8,
        evidenceHttpRequests: 7,
      },
    });
    const fallbackRequests = harness.requests.filter(({ gate }) => gate.startsWith("planner."));
    expect(fallbackRequests).toHaveLength(1);
    expect(JSON.parse(fallbackRequests[0]?.body ?? "{}").operationId).toBe(FALLBACK_OPERATION_ID);
    expect(harness.killSwitchEvents).toEqual([
      "read:true",
      "secret:GEMINI_API_KEY",
      "set:false",
      "read:false",
      "set:true",
      "read:true",
    ]);
  });

  it("requires the fallback-specific protected confirmation before HTTP", async () => {
    const harness = createHarness();

    const code = await captureCode(runThesisDemoSmoke(fallbackOptions({ confirmation: "" }), harness.dependencies));

    expect(code).toBe("SMOKE_FALLBACK_CONFIRMATION_REQUIRED");
    expect(harness.requests).toEqual([]);
  });

  it("restores the kill switch in finally when fallback HTTP fails and never retries", async () => {
    const harness = createHarness({ failGate: "planner.fallback" });

    const code = await captureCode(runThesisDemoSmoke(fallbackOptions(), harness.dependencies));

    expect(code).toBe("SMOKE_HTTP_FAILED");
    expect(harness.requests.filter(({ gate }) => gate === "planner.fallback")).toHaveLength(1);
    expect(harness.killSwitchEvents.slice(-2)).toEqual(["set:true", "read:true"]);
  });

  it("proves bounded live replay, user readback, locked refinement, and finite fixed-tour flow", async () => {
    const harness = createHarness();

    const result = await runThesisDemoSmoke(validOptions(), harness.dependencies);

    expect(result).toMatchObject({
      ok: true,
      mode: "live-success",
      realAi: true,
      counts: {
        plannerEndpointInvocations: 4,
        providerEligibleAttempts: 2,
        denialProbes: 7,
        preProviderHttpRequests: 17,
        evidenceHttpRequests: 20,
        productMutationRequests: 11,
      },
    });
    expect(harness.qaInspectionRequests).toEqual([{
      payment: {
        slotId: "qa-01",
        bookingId: PAYMENT_BOOKING_ID,
        operationId: RECOMMEND_OPERATION_ID,
      },
      cancellation: {
        slotId: "qa-02",
        bookingId: CANCELLATION_BOOKING_ID,
        operationId: REFINE_OPERATION_ID,
      },
    }]);

    const plannerRequests = harness.requests
      .filter(({ gate }) => gate.startsWith("planner.recommend") || gate.startsWith("planner.refine"));
    const withoutGate = ({ url, method, headers, body }: RequestRecord) => ({ url, method, headers, body });
    expect(withoutGate(plannerRequests[0]!)).toEqual(withoutGate(plannerRequests[1]!));
    expect(withoutGate(plannerRequests[2]!)).toEqual(withoutGate(plannerRequests[3]!));
    expect(JSON.parse(plannerRequests[2]?.body ?? "{}").lockedItemIds).toEqual([ITEM_ID]);
    expect(harness.responseLossEvents).toHaveLength(2);
    expect(harness.orchestrationEvents.indexOf("request:planner.recommend.primary")).toBeLessThan(
      harness.orchestrationEvents.indexOf(`response-loss:${RECOMMEND_OPERATION_ID}`),
    );
    expect(harness.orchestrationEvents.indexOf(`response-loss:${RECOMMEND_OPERATION_ID}`)).toBeLessThan(
      harness.orchestrationEvents.indexOf("request:planner.recommend.replay"),
    );

    const evidenceRequests = harness.requests.filter(({ gate }) => (
      gate.startsWith("auth.")
      || gate.startsWith("role.")
      || gate.startsWith("denial.")
      || gate.startsWith("read.owner-revision-")
      || gate.startsWith("read.attestation.")
    ));
    expect(evidenceRequests).toHaveLength(20);
    expect(harness.requests.filter(({ gate }) => gate.startsWith("read.attestation."))).toHaveLength(4);
    expect(harness.requests.filter(({ gate }) => gate.startsWith("read.owner-revision-"))).toHaveLength(2);
    const ownerReadUrls = harness.requests
      .filter(({ gate }) => gate.startsWith("read.owner-revision-"))
      .map(({ url }) => url);
    expect(ownerReadUrls.every((url) => url.includes(
      "trip_plan_items(place_id,position,start_at,end_at,visit_duration_minutes)",
    ))).toBe(true);
    expect(ownerReadUrls.every((url) => !url.includes("trip_plan_items(id,"))).toBe(true);

    const paymentBodies = harness.requests
      .filter(({ gate }) => gate.startsWith("fixed.payment.complete"))
      .map(({ body }) => JSON.parse(body ?? "{}"));
    const cancellationBodies = harness.requests
      .filter(({ gate }) => gate.startsWith("fixed.cancellation.cancel"))
      .map(({ body }) => JSON.parse(body ?? "{}"));
    expect(paymentBodies).toHaveLength(2);
    expect(cancellationBodies).toHaveLength(2);
    expect(paymentBodies.every(({ booking_id }) => booking_id === PAYMENT_BOOKING_ID)).toBe(true);
    expect(cancellationBodies.every(({ booking_id }) => booking_id === CANCELLATION_BOOKING_ID)).toBe(true);
    expect(PAYMENT_BOOKING_ID).not.toBe(CANCELLATION_BOOKING_ID);
    expect(harness.requests.filter(({ gate }) => gate.startsWith("fixed.payment.read"))).toHaveLength(3);
    expect(result.gates.map(({ name, status }: { name: string; status: string }) => `${name}:${status}`)).toEqual(expect.arrayContaining([
      "real-ai:pass",
      "replay:pass",
      "fixed-tour-simulated-payment:pass",
      "permissions:pass",
    ]));
  });

  it("fails closed when attestation does not prove one provider attempt per live operation", async () => {
    const harness = createHarness({ attestedProviderDelta: 0 });

    const code = await captureCode(runThesisDemoSmoke(validOptions(), harness.dependencies));

    expect(code).toBe("SMOKE_QUOTA_REPLAY_UNPROVEN");
    expect(harness.requests.filter(({ gate }) => gate.startsWith("fixed."))).toEqual([]);
  });

  it("requires explicit post-commit replay authorization and makes no replay when denied", async () => {
    const harness = createHarness({ responseLossAuthorized: false });

    const code = await captureCode(runThesisDemoSmoke(validOptions(), harness.dependencies));

    expect(code).toBe("SMOKE_RESPONSE_LOSS_REPLAY_UNAUTHORIZED");
    expect(harness.requests.filter(({ gate }) => gate.startsWith("planner.recommend")).map(({ gate }) => gate)).toEqual([
      "planner.recommend.primary",
    ]);
  });

  it("accepts equivalent timezone offsets for locked start and end instants", async () => {
    const harness = createHarness({ equivalentTimezoneOffsets: true });

    const result = await runThesisDemoSmoke(validOptions(), harness.dependencies);

    expect(result.ok).toBe(true);
    expect(JSON.parse(
      harness.requests.find(({ gate }) => gate === "planner.refine.primary")?.body ?? "{}",
    ).lockedItemIds).toEqual([PLACE_ID]);
  });

  it.each([
    ["returned order", { returnedOrderChanged: true }],
    ["persisted result order", { persistedOrderChanged: true }],
    ["persisted row position", { persistedRowOverrides: { position: 2 } }],
  ])("rejects changed locked item %s", async (_label, harnessOptions) => {
    const harness = createHarness(harnessOptions);

    const code = await captureCode(runThesisDemoSmoke(validOptions(), harness.dependencies));

    expect(code).toBe("SMOKE_LOCKED_ITEM_CHANGED");
    expect(harness.requests.filter(({ gate }) => gate.startsWith("fixed."))).toEqual([]);
  });

  it.each([
    ["returned foodSelection", { returnedItemOverrides: { foodSelection: CHANGED_FOOD_SELECTION } }],
    ["persisted foodSelection", { persistedResultItemOverrides: { foodSelection: CHANGED_FOOD_SELECTION } }],
  ])("rejects changed %s", async (_label, harnessOptions) => {
    const harness = createHarness(harnessOptions);

    const code = await captureCode(runThesisDemoSmoke(validOptions(), harness.dependencies));

    expect(code).toBe("SMOKE_LOCKED_ITEM_CHANGED");
    expect(harness.requests.filter(({ gate }) => gate.startsWith("fixed."))).toEqual([]);
  });

  it.each([
    ["returned place", { returnedItemOverrides: { placeId: OTHER_PLACE_ID } }],
    ["returned time", { returnedItemOverrides: { endAt: "2026-09-12T10:15:00+07:00" } }],
    ["returned duration", { returnedItemOverrides: { visitDurationMinutes: 75 } }],
    ["persisted result place", { persistedResultItemOverrides: { placeId: OTHER_PLACE_ID } }],
    ["persisted result time", { persistedResultItemOverrides: { startAt: "2026-09-12T09:15:00+07:00" } }],
    ["persisted result duration", { persistedResultItemOverrides: { visitDurationMinutes: 75 } }],
    ["persisted row place", { persistedRowOverrides: { place_id: OTHER_PLACE_ID } }],
    ["persisted row time", { persistedRowOverrides: { end_at: "2026-09-12T10:15:00+07:00" } }],
    ["persisted row duration", { persistedRowOverrides: { visit_duration_minutes: 75 } }],
  ])("rejects changed locked %s", async (_label, harnessOptions) => {
    const harness = createHarness(harnessOptions);

    const code = await captureCode(runThesisDemoSmoke(validOptions(), harness.dependencies));

    expect(code).toBe("SMOKE_LOCKED_ITEM_CHANGED");
    expect(harness.requests.filter(({ gate }) => gate.startsWith("fixed."))).toEqual([]);
  });

  it("fails the real-AI gate when both bounded live operations degrade", async () => {
    const harness = createHarness({ degradedLive: true });

    const code = await captureCode(runThesisDemoSmoke(validOptions(), harness.dependencies));

    expect(code).toBe("SMOKE_REAL_AI_UNPROVEN");
    expect(harness.requests.filter(({ gate }) => gate.startsWith("fixed."))).toEqual([]);
  });

  it.each([
    ["HTTP 400", { primaryRecommendStatus: 400 }, "SMOKE_HTTP_FAILED"],
    ["HTTP 429", { primaryRecommendStatus: 429 }, "SMOKE_HTTP_FAILED"],
    ["HTTP 500", { primaryRecommendStatus: 500 }, "SMOKE_HTTP_FAILED"],
    ["thrown network failure", { failGate: "planner.recommend.primary" }, "SMOKE_HTTP_FAILED"],
  ])("does not authorize or replay after %s", async (_label, harnessOptions, expectedCode) => {
    const harness = createHarness(harnessOptions);

    const code = await captureCode(runThesisDemoSmoke(validOptions(), harness.dependencies));

    expect(code).toBe(expectedCode);
    const recommendRequests = harness.requests.filter(({ gate }) => gate.startsWith("planner.recommend"));
    expect(recommendRequests.map(({ gate }) => gate)).toEqual(["planner.recommend.primary"]);
    expect(new Set(recommendRequests.map(({ body }) => JSON.parse(body ?? "{}").operationId)).size).toBe(1);
    expect(harness.responseLossEvents).toEqual([]);
  });

  it("does not authorize replay for a malformed successful primary envelope", async () => {
    const harness = createHarness({ malformedPrimaryRecommend: true });

    const code = await captureCode(runThesisDemoSmoke(validOptions(), harness.dependencies));

    expect(code).toBe("SMOKE_PLANNER_RESPONSE_INVALID");
    expect(harness.requests.filter(({ gate }) => gate.startsWith("planner.recommend")).map(({ gate }) => gate)).toEqual([
      "planner.recommend.primary",
    ]);
    expect(harness.responseLossEvents).toEqual([]);
  });

  it("returns one stable redacted main-process failure line", async () => {
    const lines: string[] = [];

    const exitCode = await runThesisDemoSmokeMain({
      run: async () => { throw new Error(`${SERVICE_ROLE_KEY} ${MANAGEMENT_TOKEN}`); },
      errorLogger: (line: string) => { lines.push(line); },
    });

    expect(exitCode).toBe(2);
    expect(lines).toEqual(["THESIS_DEMO_SMOKE_FAILED: cloud smoke did not complete"]);
  });
});
