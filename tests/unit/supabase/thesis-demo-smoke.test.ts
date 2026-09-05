// @vitest-environment node

import { describe, expect, it } from "vitest";

// @ts-expect-error -- the production entrypoint is executable .mjs and has no declaration artifact.
import * as thesisDemoSmoke from "@/scripts/smoke-thesis-demo.mjs";

const {
  LIVE_SMOKE_OPT_IN,
  ThesisDemoSmokeError,
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
const ITEM_ID = "d1700000-0000-4000-8000-000000000811";
const PLACE_ID = "d1700000-0000-4000-8000-000000000101";
const REVISION_ID = "d1700000-0000-4000-8000-000000000821";

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
    liveOptIn: LIVE_SMOKE_OPT_IN,
    qaSlot: "qa-01",
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

function proposal(rankingSource: "ai" | "deterministic") {
  return {
    rankingSource,
    items: [{ itemId: ITEM_ID, placeId: PLACE_ID }],
  };
}

function createHarness({
  degradedLive = false,
  targetRedirect,
  targetCorrelationId = "target-correlation-01",
  failGate,
  qaSlotSafe = true,
  quotaObservable = true,
}: {
  degradedLive?: boolean;
  targetRedirect?: string;
  targetCorrelationId?: string;
  failGate?: string;
  qaSlotSafe?: boolean;
  quotaObservable?: boolean;
} = {}) {
  const requests: RequestRecord[] = [];
  const logs: string[] = [];
  const killSwitchEvents: string[] = [];
  let killSwitchState = true;

  const request = async (spec: RequestRecord) => {
    requests.push(structuredClone(spec));
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
      return {
        status: 200,
        headers: { correlationId: `${spec.gate}-01` },
        json: {
          advisoryOnly: true,
          baseRevision: 1,
          degraded: degradedLive,
          planId: PLAN_ID,
          proposal: proposal(degradedLive ? "deterministic" : "ai"),
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
        json: [{ id: ITEM_ID, place_id: PLACE_ID, position: 1 }],
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
    if (spec.gate.startsWith("fixed.begin")) {
      return { status: 200, headers: {}, json: [{ booking_id: "d1700000-0000-4000-8000-000000000711", state: spec.gate.endsWith("replay") ? "replayed" : "created" }] };
    }
    if (spec.gate.startsWith("fixed.payment")) {
      return { status: 200, headers: {}, json: [{ booking_id: "d1700000-0000-4000-8000-000000000711", state: spec.gate.endsWith("replay") ? "replayed" : "created", simulated: true }] };
    }
    if (spec.gate.startsWith("fixed.assign")) {
      return { status: 200, headers: {}, json: [{ assignment_id: "d1700000-0000-4000-8000-000000000741", booking_id: "d1700000-0000-4000-8000-000000000711", state: spec.gate.endsWith("replay") ? "replayed" : "created" }] };
    }
    if (spec.gate === "fixed.accept") {
      return { status: 200, headers: {}, json: [{ assignment_id: "d1700000-0000-4000-8000-000000000741", status: "accepted" }] };
    }
    if (spec.gate.startsWith("fixed.cancel")) {
      return { status: 200, headers: {}, json: [{ booking_id: "d1700000-0000-4000-8000-000000000711", state: spec.gate.endsWith("replay") ? "replayed" : "cancelled" }] };
    }
    if (spec.gate.startsWith("fixed.read")) {
      return { status: 200, headers: {}, json: [{ booking_id: "d1700000-0000-4000-8000-000000000711" }] };
    }
    throw new Error(`unexpected gate ${spec.gate}`);
  };

  const dependencies = {
    request,
    logger: (line: string) => { logs.push(line); },
    inspectQaSlot: async () => qaSlotSafe
      ? { safe: true as const, bookingId: "d1700000-0000-4000-8000-000000000711" }
      : { safe: false as const, code: "SMOKE_QA_SLOT_BOOKING_ID_UNPROVEN" },
    ...(quotaObservable
      ? {
          readQuotaEvidence: async () => ({
            plannerQuotaReceipts: 1,
            geminiQuotaReceipts: 1,
            recommendationRuns: 1,
          }),
        }
      : {}),
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

  return { dependencies, requests, logs, killSwitchEvents };
}

async function captureCode(work: Promise<unknown>) {
  return work.catch((error: unknown) => (error as InstanceType<typeof ThesisDemoSmokeError>).code);
}

describe("bounded thesis-demo cloud smoke", () => {
  it.each([
    ["unverified target", { target: { ...validOptions().target, expectedProjectName: "production" } }, "SMOKE_TARGET_UNVERIFIED"],
    ["non-HTTPS target", { target: { ...validOptions().target, supabaseUrl: `http://${PROJECT_REF}.supabase.co` } }, "SMOKE_TARGET_INSECURE"],
    ["missing role account", { accounts: { ...validOptions().accounts, admin: undefined } }, "SMOKE_ACCOUNTS_INCOMPLETE"],
    ["missing live opt-in", { liveOptIn: "" }, "SMOKE_LIVE_OPT_IN_REQUIRED"],
    ["unsafe QA slot", { qaSlot: "qa-05" }, "SMOKE_QA_SLOT_UNSAFE"],
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

  it("keeps live replay fail-closed when quota evidence is not observable", async () => {
    const harness = createHarness({ quotaObservable: false });

    const code = await captureCode(runThesisDemoSmoke(validOptions(), harness.dependencies));

    expect(code).toBe("SMOKE_QUOTA_REPLAY_UNPROVEN");
    expect(harness.requests).toEqual([]);
  });

  it("rejects a redirect to another host without following it", async () => {
    const harness = createHarness({ targetRedirect: "https://attacker.invalid/capture" });

    const code = await captureCode(runThesisDemoSmoke(validOptions({ mode: "fallback-only" }), harness.dependencies));

    expect(code).toBe("SMOKE_REDIRECT_CROSS_HOST");
    expect(harness.requests.map(({ gate }) => gate)).toEqual(["target"]);
  });

  it("refuses a credential-shaped correlation value before it reaches the logger", async () => {
    const harness = createHarness({ targetCorrelationId: SERVICE_ROLE_KEY });

    const code = await captureCode(runThesisDemoSmoke(validOptions({ mode: "fallback-only" }), harness.dependencies));

    expect(code).toBe("SMOKE_SECRET_LOG_BLOCKED");
    expect(harness.logs.join("\n")).not.toContain(SERVICE_ROLE_KEY);
  });

  it("runs fallback under one endpoint invocation and restores the prior switch state", async () => {
    const harness = createHarness();

    const result = await runThesisDemoSmoke(validOptions({ mode: "fallback-only" }), harness.dependencies);

    expect(result).toMatchObject({
      ok: true,
      mode: "fallback-only",
      realAi: false,
      counts: {
        plannerEndpointInvocations: 1,
        providerEligibleAttempts: 0,
        denialProbes: 0,
        preProviderHttpRequests: 9,
      },
    });
    expect(harness.requests.filter(({ gate }) => gate.startsWith("planner."))).toHaveLength(1);
    expect(harness.killSwitchEvents).toEqual([
      "read:true",
      "secret:GEMINI_API_KEY",
      "set:false",
      "read:false",
      "set:true",
      "read:true",
    ]);
  });

  it("restores the kill switch in finally when fallback HTTP fails and never retries", async () => {
    const harness = createHarness({ failGate: "planner.fallback" });

    const code = await captureCode(runThesisDemoSmoke(validOptions({ mode: "fallback-only" }), harness.dependencies));

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
        preProviderHttpRequests: 16,
        productMutationRequests: 9,
      },
    });
    const plannerBodies = harness.requests
      .filter(({ gate }) => gate.startsWith("planner.recommend") || gate.startsWith("planner.refine"))
      .map(({ body }) => body);
    expect(plannerBodies[0]).toBe(plannerBodies[1]);
    expect(plannerBodies[2]).toBe(plannerBodies[3]);
    expect(JSON.parse(plannerBodies[2] ?? "{}").lockedItemIds).toEqual([ITEM_ID]);
    expect(result.gates.map(({ name, status }: { name: string; status: string }) => `${name}:${status}`)).toEqual(expect.arrayContaining([
      "real-ai:pass",
      "replay:pass",
      "fixed-tour-simulated-payment:pass",
      "permissions:pass",
    ]));
  });

  it("fails the real-AI gate when both bounded live operations degrade", async () => {
    const harness = createHarness({ degradedLive: true });

    const code = await captureCode(runThesisDemoSmoke(validOptions(), harness.dependencies));

    expect(code).toBe("SMOKE_REAL_AI_UNPROVEN");
    expect(harness.requests.filter(({ gate }) => gate.startsWith("fixed."))).toEqual([]);
  });

  it("does not retry a timed-out live operation or create a replacement operation", async () => {
    const harness = createHarness({ failGate: "planner.recommend.primary" });

    const code = await captureCode(runThesisDemoSmoke(validOptions(), harness.dependencies));

    expect(code).toBe("SMOKE_HTTP_FAILED");
    const recommendRequests = harness.requests.filter(({ gate }) => gate.startsWith("planner.recommend"));
    expect(recommendRequests.map(({ gate }) => gate)).toEqual(["planner.recommend.primary"]);
    expect(new Set(recommendRequests.map(({ body }) => JSON.parse(body ?? "{}").operationId)).size).toBe(1);
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
