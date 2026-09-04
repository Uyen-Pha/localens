import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";

import type {
  ItineraryRequest,
  ItineraryResult,
} from "@/lib/domain/itinerary/contracts";
import type { Database } from "@/lib/infrastructure/supabase/database.types";

const accounts = {
  owner: {
    email: "customer.runtime@localens.test",
    passwordEnv: "LOCALENS_RUNTIME_CUSTOMER_PASSWORD",
  },
  otherCustomer: {
    email: "customer-b.runtime-fixed-tour@localens.test",
    passwordEnv: "LOCALENS_RUNTIME_FIXED_TOUR_CUSTOMER_PASSWORD",
  },
} as const;

const identities = {
  primary: {
    address: "192.0.2.11",
    deviceId: "runtime-itinerary-primary-0001",
  },
  malformed: {
    address: "192.0.2.12",
    deviceId: "runtime-itinerary-malformed-01",
  },
  quota: {
    address: "192.0.2.13",
    deviceId: "runtime-itinerary-quota-00001",
  },
} as const;

type Account = keyof typeof accounts;
type RuntimeClient = SupabaseClient<Database>;
type BrowserSession = {
  accessToken: string;
  userId: string;
};
type RequestIdentity = {
  address: string;
  deviceId: string;
};
type FakeProviderScenario = "valid" | "malformed";
type FakeProviderState = {
  requests: number;
  scenario: FakeProviderScenario;
};
type EdgeResult = {
  body: Record<string, unknown>;
  status: number;
};
type RecommendationBody = {
  advisoryOnly: true;
  degraded: boolean;
  messageKey?: string;
  planId: string;
  proposal: ItineraryResult;
  rationales: Record<string, string>;
  revision: 1;
};
type RefinementBody = {
  advisoryOnly: true;
  baseRevision: number;
  degraded: boolean;
  messageKey?: string;
  planId: string;
  proposal: ItineraryResult;
  rationales: Record<string, string>;
  regeneration: "partial" | "full";
  revision: number;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for local itinerary runtime E2E`);
  return value;
}

function passwordFor(account: Account): string {
  return requiredEnv(accounts[account].passwordEnv);
}

function sessionClient(session: BrowserSession): RuntimeClient {
  return createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      },
    },
  );
}

async function signIn(page: Page, account: Account): Promise<BrowserSession> {
  await page.goto("/en/sign-in/");
  await expect(page.getByRole("heading", { name: "Sign in to LocalLens" })).toBeVisible();
  await page.getByRole("textbox", { name: "Email" }).fill(accounts[account].email);
  await page.getByLabel("Password").fill(passwordFor(account));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/account\/?(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Your secure portal" })).toBeVisible();
  await expect(page.getByText(/Choose a demo identity/i)).toHaveCount(0);
  return readBrowserSession(page);
}

async function readBrowserSession(page: Page): Promise<BrowserSession> {
  const session = await page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      try {
        let parsed: unknown = JSON.parse(raw);
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
        const record = parsed as Record<string, unknown>;
        const candidate = typeof record.currentSession === "object"
          && record.currentSession !== null
          && !Array.isArray(record.currentSession)
          ? record.currentSession as Record<string, unknown>
          : record;
        const user = candidate.user;
        if (
          typeof candidate.access_token === "string"
          && typeof user === "object"
          && user !== null
          && !Array.isArray(user)
          && typeof (user as Record<string, unknown>).id === "string"
        ) {
          return {
            accessToken: candidate.access_token,
            userId: (user as Record<string, unknown>).id as string,
          };
        }
      } catch {
        // Ignore unrelated or partially-written browser storage entries.
      }
    }
    return null;
  });
  expect(session, "browser login must persist a Supabase session").not.toBeNull();
  if (session === null) throw new Error("Browser login did not persist a Supabase session");
  return session;
}

function fakeProviderControlUrl(): URL {
  const value = new URL(requiredEnv("LOCALENS_RUNTIME_GEMINI_CONTROL_URL"));
  if (
    value.protocol !== "http:"
    || !["127.0.0.1", "localhost", "[::1]"].includes(value.hostname)
    || value.username !== ""
    || value.password !== ""
  ) {
    throw new Error("LOCALENS_RUNTIME_GEMINI_CONTROL_URL must be a credential-free loopback HTTP URL");
  }
  return value;
}

function runtimeAppOrigin(): string {
  const value = new URL(requiredEnv("PLAYWRIGHT_BASE_URL"));
  if (
    value.protocol !== "http:"
    || !["127.0.0.1", "localhost", "[::1]"].includes(value.hostname)
    || value.port === ""
    || value.username !== ""
    || value.password !== ""
  ) {
    throw new Error("PLAYWRIGHT_BASE_URL must be a credential-free loopback HTTP URL");
  }
  return value.origin;
}

async function configureFakeProvider(
  request: APIRequestContext,
  scenario: FakeProviderScenario,
): Promise<void> {
  const response = await request.post(fakeProviderControlUrl().toString(), {
    data: { reset: true, scenario },
    headers: {
      "x-localens-control-token": requiredEnv("LOCALENS_RUNTIME_GEMINI_CONTROL_TOKEN"),
    },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ requests: 0, scenario });
}

async function fakeProviderState(request: APIRequestContext): Promise<FakeProviderState> {
  const response = await request.get(fakeProviderControlUrl().toString(), {
    headers: {
      "x-localens-control-token": requiredEnv("LOCALENS_RUNTIME_GEMINI_CONTROL_TOKEN"),
    },
  });
  expect(response.status()).toBe(200);
  return await response.json() as FakeProviderState;
}

async function buildRequest(client: RuntimeClient): Promise<ItineraryRequest> {
  const binding = await client
    .from("current_itinerary_snapshot_v")
    .select("catalog_snapshot_id")
    .limit(2);
  expect(binding.error).toBeNull();
  expect(binding.data).toHaveLength(1);
  const catalogSnapshotId = binding.data?.[0]?.catalog_snapshot_id;
  if (typeof catalogSnapshotId !== "string") {
    throw new Error("Runtime itinerary seed must publish exactly one current catalog binding");
  }

  const areas = await client
    .from("catalog_snapshot_areas_v")
    .select("area_id")
    .eq("snapshot_id", catalogSnapshotId)
    .order("area_id", { ascending: true });
  expect(areas.error).toBeNull();
  const areaIds = [...new Set((areas.data ?? []).flatMap((row) =>
    typeof row.area_id === "string" ? [row.area_id] : []
  ))].slice(0, 12);
  expect(areaIds.length).toBeGreaterThan(0);

  return {
    startAt: "2026-09-05T09:00:00+07:00",
    durationMinutes: 360,
    areas: areaIds,
    budget: { currency: "VND", amountMinor: 2_000_000 },
    partySize: 2,
    guideLanguage: "en",
    priorityWeights: {
      history: 0,
      traditional_craft: 0,
      traditional_market: 4,
      // This gate isolates itinerary ranking. The shared fixed-tour fixture
      // intentionally has no sellable vendor/menu rows for food selection.
      street_food: 0,
    },
    pace: "balanced",
    dietaryRequirements: [],
    mobilityRequirements: [],
    lockedStopIds: [],
  };
}

async function postEdge(
  request: APIRequestContext,
  path: "recommend-itinerary" | "refine-itinerary",
  session: BrowserSession,
  identity: RequestIdentity,
  data: unknown,
): Promise<EdgeResult> {
  const response = await request.post(
    `${requiredEnv("NEXT_PUBLIC_SUPABASE_URL")}/functions/v1/${path}`,
    {
      data,
      headers: {
        apikey: requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
        Authorization: `Bearer ${session.accessToken}`,
        Origin: runtimeAppOrigin(),
        "x-forwarded-for": identity.address,
        "x-localens-device-id": identity.deviceId,
      },
    },
  );
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${path}, received HTTP ${response.status()}`);
  }
  expect(body).toEqual(expect.any(Object));
  return { body: body as Record<string, unknown>, status: response.status() };
}

function expectNoRuntimeSecretLeak(body: unknown, session: BrowserSession): void {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain(session.accessToken);
  expect(serialized.toLowerCase()).not.toMatch(
    /gemini_api_key|service_role|quota_hmac|request\.jwt|owner_user_id|actor_user_id|postgresql:\/\//,
  );
}

function expectRecommendation(
  result: EdgeResult,
  expected: { degraded: boolean; rankingSource: "ai" | "deterministic" },
): RecommendationBody {
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({
    advisoryOnly: true,
    degraded: expected.degraded,
    planId: expect.any(String),
    proposal: {
      items: expect.any(Array),
      rankingSource: expected.rankingSource,
      totals: expect.any(Object),
    },
    rationales: expect.any(Object),
    revision: 1,
  });
  const body = result.body as RecommendationBody;
  expect(body.proposal.items.length).toBeGreaterThan(0);
  expect(body.proposal.totals.groupCostVnd).toBeLessThanOrEqual(body.proposal.budgetVnd);
  return body;
}

async function expectRevisionOnePersisted(
  client: RuntimeClient,
  session: BrowserSession,
  body: RecommendationBody,
): Promise<string> {
  const plan = await client
    .from("trip_plans")
    .select("id,latest_revision_no,owner_user_id")
    .eq("id", body.planId);
  expect(plan.error).toBeNull();
  expect(plan.data).toEqual([{
    id: body.planId,
    latest_revision_no: 1,
    owner_user_id: session.userId,
  }]);

  const revision = await client
    .from("trip_plan_revisions")
    .select("id,plan_id,revision_no,base_revision_no,ranking_source,result_json")
    .eq("plan_id", body.planId)
    .eq("revision_no", 1);
  expect(revision.error).toBeNull();
  expect(revision.data).toHaveLength(1);
  expect(revision.data?.[0]).toMatchObject({
    plan_id: body.planId,
    revision_no: 1,
    base_revision_no: 0,
    ranking_source: body.proposal.rankingSource,
    result_json: body.proposal,
  });
  const revisionId = revision.data?.[0]?.id;
  if (typeof revisionId !== "string") throw new Error("Persisted revision 1 must have an ID");

  const items = await client
    .from("trip_plan_items")
    .select("revision_id,position,place_id")
    .eq("revision_id", revisionId)
    .order("position", { ascending: true });
  expect(items.error).toBeNull();
  expect(items.data).toHaveLength(body.proposal.items.length);
  expect(items.data?.map((item) => item.place_id)).toEqual(
    body.proposal.items.map((item) => item.placeId),
  );
  return revisionId;
}

async function createSignedInPage(
  browser: Browser,
  account: Account,
): Promise<{ page: Page; session: BrowserSession }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const session = await signIn(page, account);
  return { page, session };
}

test.describe.configure({ mode: "serial" });

test.describe("local authenticated itinerary Edge runtime", () => {
  test("recommends, persists, reloads, refines, and denies another customer", async ({ browser, request }) => {
    await configureFakeProvider(request, "valid");
    const owner = await createSignedInPage(browser, "owner");
    const ownerClient = sessionClient(owner.session);
    const input = await buildRequest(ownerClient);

    const recommendation = expectRecommendation(
      await postEdge(request, "recommend-itinerary", owner.session, identities.primary, { input }),
      { degraded: false, rankingSource: "ai" },
    );
    expectNoRuntimeSecretLeak(recommendation, owner.session);
    const revisionOneId = await expectRevisionOnePersisted(
      ownerClient,
      owner.session,
      recommendation,
    );

    await owner.page.reload();
    await expect(owner.page.getByRole("heading", { name: "Your secure portal" })).toBeVisible();
    const reloadedSession = await readBrowserSession(owner.page);
    expect(reloadedSession.userId).toBe(owner.session.userId);
    const reloadedClient = sessionClient(reloadedSession);
    await expectRevisionOnePersisted(reloadedClient, reloadedSession, recommendation);

    const lockedPlaceId = recommendation.proposal.items[0]?.placeId;
    if (lockedPlaceId === undefined) throw new Error("Recommendation must contain a lockable stop");
    const refinementResult = await postEdge(
      request,
      "refine-itinerary",
      reloadedSession,
      identities.primary,
      {
        planId: recommendation.planId,
        baseRevision: 1,
        delta: { feedback: "Đi chậm hơn và giữ điểm đầu tiên", scope: "partial" },
        lockedItemIds: [lockedPlaceId],
      },
    );
    expect(refinementResult.status).toBe(200);
    expect(refinementResult.body).toMatchObject({
      advisoryOnly: true,
      baseRevision: 1,
      degraded: false,
      planId: recommendation.planId,
      proposal: { items: expect.any(Array), rankingSource: "ai" },
      regeneration: "partial",
      revision: 2,
    });
    const refinement = refinementResult.body as RefinementBody;
    expect(refinement.proposal.items.some((item) => item.placeId === lockedPlaceId)).toBe(true);
    expectNoRuntimeSecretLeak(refinement, reloadedSession);

    const persistedPlan = await reloadedClient
      .from("trip_plans")
      .select("id,latest_revision_no")
      .eq("id", recommendation.planId);
    expect(persistedPlan.error).toBeNull();
    expect(persistedPlan.data).toEqual([{ id: recommendation.planId, latest_revision_no: 2 }]);
    const persistedRevisions = await reloadedClient
      .from("trip_plan_revisions")
      .select("id,revision_no,base_revision_no,ranking_source,result_json")
      .eq("plan_id", recommendation.planId)
      .order("revision_no", { ascending: true });
    expect(persistedRevisions.error).toBeNull();
    expect(persistedRevisions.data).toHaveLength(2);
    expect(persistedRevisions.data?.map((revision) => ({
      base: revision.base_revision_no,
      rankingSource: revision.ranking_source,
      revision: revision.revision_no,
    }))).toEqual([
      { base: 0, rankingSource: "ai", revision: 1 },
      { base: 1, rankingSource: "ai", revision: 2 },
    ]);

    const other = await createSignedInPage(browser, "otherCustomer");
    const otherClient = sessionClient(other.session);
    const deniedPlan = await otherClient
      .from("trip_plans")
      .select("id")
      .eq("id", recommendation.planId);
    const deniedRevisions = await otherClient
      .from("trip_plan_revisions")
      .select("id")
      .eq("plan_id", recommendation.planId);
    const deniedItems = await otherClient
      .from("trip_plan_items")
      .select("revision_id")
      .eq("revision_id", revisionOneId);
    expect(deniedPlan.error).toBeNull();
    expect(deniedRevisions.error).toBeNull();
    expect(deniedItems.error).toBeNull();
    expect(deniedPlan.data).toEqual([]);
    expect(deniedRevisions.data).toEqual([]);
    expect(deniedItems.data).toEqual([]);

    const deniedRefinement = await postEdge(
      request,
      "refine-itinerary",
      other.session,
      { address: "192.0.2.14", deviceId: "runtime-itinerary-cross-user-01" },
      {
        planId: recommendation.planId,
        baseRevision: 2,
        delta: { feedback: "Try another route", scope: "full" },
        lockedItemIds: [],
      },
    );
    expect(deniedRefinement.status).toBe(404);
    expect(deniedRefinement.body).toMatchObject({
      code: "PLAN_NOT_FOUND",
      retryable: false,
    });
    expectNoRuntimeSecretLeak(deniedRefinement.body, other.session);
    expect(await fakeProviderState(request)).toEqual({ requests: 2, scenario: "valid" });

    await owner.page.context().close();
    await other.page.context().close();
  });

  test("persists deterministic fallback when the fake Gemini output is malformed", async ({ browser, request }) => {
    await configureFakeProvider(request, "malformed");
    const owner = await createSignedInPage(browser, "owner");
    const ownerClient = sessionClient(owner.session);
    const input = await buildRequest(ownerClient);

    const recommendation = expectRecommendation(
      await postEdge(request, "recommend-itinerary", owner.session, identities.malformed, { input }),
      { degraded: true, rankingSource: "deterministic" },
    );
    expect(recommendation.messageKey).toBe("itinerary.ai_invalid");
    expectNoRuntimeSecretLeak(recommendation, owner.session);
    await expectRevisionOnePersisted(ownerClient, owner.session, recommendation);
    expect(await fakeProviderState(request)).toEqual({ requests: 1, scenario: "malformed" });

    await owner.page.context().close();
  });

  test("falls back after the fifth per-identity Gemini reservation without a sixth provider call", async ({ browser, request }) => {
    await configureFakeProvider(request, "valid");
    const owner = await createSignedInPage(browser, "owner");
    const ownerClient = sessionClient(owner.session);
    const input = await buildRequest(ownerClient);

    const recommendations: RecommendationBody[] = [];
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const recommendation = expectRecommendation(
        await postEdge(request, "recommend-itinerary", owner.session, identities.quota, { input }),
        attempt <= 5
          ? { degraded: false, rankingSource: "ai" }
          : { degraded: true, rankingSource: "deterministic" },
      );
      recommendations.push(recommendation);
    }

    expect(recommendations[5]?.messageKey).toBe("itinerary.ai_invalid");
    expect(new Set(recommendations.map((entry) => entry.planId)).size).toBe(6);
    expect(await fakeProviderState(request)).toEqual({ requests: 5, scenario: "valid" });
    await expectRevisionOnePersisted(
      ownerClient,
      owner.session,
      recommendations[5]!,
    );
    expectNoRuntimeSecretLeak(recommendations[5], owner.session);

    await owner.page.context().close();
  });
});
