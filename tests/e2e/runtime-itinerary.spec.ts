import { mkdir } from "node:fs/promises";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  ItineraryResultSchema,
  type ItineraryRequest,
} from "@/lib/domain/itinerary/contracts";
import type { Database } from "@/lib/infrastructure/supabase/database.types";
import {
  serializeItineraryWireResponse,
  type ItineraryWireResponse,
} from "@/supabase/functions/_shared/itinerary-wire-response";

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
const COLD_ROUTE_TIMEOUT_MS = 15_000;

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
  proposal: ItineraryWireResponse;
  rationales: Record<string, string>;
  revision: 1;
};

const browserErrors = new WeakMap<Page, string[]>();

function installBrowserDiagnostics(page: Page): void {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    errors.push(`requestfailed: ${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`response: ${response.status()} ${response.url()}`);
  });
}

function expectNoBrowserErrors(page: Page): void {
  expect(browserErrors.get(page) ?? []).toEqual([]);
}

async function expectKeyboardReachable(page: Page, target: Locator): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => document.activeElement === element)) {
      const focus = await target.evaluate((element) => {
        const style = getComputedStyle(element);
        return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
      });
      expect(focus.style).not.toBe("none");
      expect(focus.width).toBeGreaterThanOrEqual(3);
      return;
    }
  }
  throw new Error("Natural keyboard traversal did not reach the planner primary action");
}

const qaViewports = [
  { height: 1024, name: "desktop", width: 1440 },
  { height: 1024, name: "tablet", width: 768 },
  { height: 844, name: "mobile", width: 390 },
] as const;

async function captureQaState(page: Page, state: string) {
  const phase = process.env.LOCALENS_CAPTURE_QA_PHASE;
  if (phase === undefined) return;
  if (phase !== "reference" && phase !== "implemented") {
    throw new Error("LOCALENS_CAPTURE_QA_PHASE must be reference or implemented");
  }

  const outputDirectory = path.resolve(
    process.cwd(),
    "docs",
    "design",
    "qa",
    "public-thesis-demo",
    phase,
  );
  await mkdir(outputDirectory, { recursive: true });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.querySelectorAll("nextjs-portal").forEach((element) => element.remove());
  });

  for (const viewport of qaViewports) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBe(viewport.width);
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: path.join(outputDirectory, `${state}-${viewport.name}.png`),
    });
  }
}
type RefinementBody = {
  advisoryOnly: true;
  baseRevision: number;
  degraded: boolean;
  messageKey?: string;
  planId: string;
  proposal: ItineraryWireResponse;
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
  await submitSignIn(page, account);
  await expect(page).toHaveURL(/\/en\/account\/?(?:\?.*)?$/, {
    timeout: COLD_ROUTE_TIMEOUT_MS,
  });
  await expect(page.getByRole("heading", { name: "Your secure portal" })).toBeVisible();
  await expect(page.getByText(/Choose a demo identity/i)).toHaveCount(0);
  return readBrowserSession(page);
}

async function submitSignIn(page: Page, account: Account): Promise<void> {
  await expect(page.getByRole("heading", { name: "Sign in to LocalLens" })).toBeVisible();
  await page.getByRole("textbox", { name: "Email" }).fill(accounts[account].email);
  await page.getByLabel("Password").fill(passwordFor(account));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
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
  expect(result.status, JSON.stringify(result.body)).toBe(200);
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
  expect(body.proposal.totals.groupCostVnd).toMatch(/^(0|[1-9]\d*)$/);
  expect(body.proposal.budgetVnd).toMatch(/^(0|[1-9]\d*)$/);
  expect(
    BigInt(body.proposal.totals.groupCostVnd) <= BigInt(body.proposal.budgetVnd),
  ).toBe(true);
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
  });
  const persistedResult = ItineraryResultSchema.safeParse(revision.data?.[0]?.result_json);
  expect(persistedResult.success).toBe(true);
  if (!persistedResult.success) throw new Error("Persisted revision 1 must contain a valid itinerary result");
  expect(serializeItineraryWireResponse(persistedResult.data)).toEqual(body.proposal);
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
  installBrowserDiagnostics(page);
  const session = await signIn(page, account);
  return { page, session };
}

async function createPlannerPageFromHomepage(
  browser: Browser,
  account: Account,
): Promise<{ page: Page; session: BrowserSession }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  installBrowserDiagnostics(page);
  await page.route("**/functions/v1/**", async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        "x-forwarded-for": identities.primary.address,
      },
    });
  });
  await page.goto("/en/#personalize");

  const form = page.getByRole("form", { name: "Personalized route preferences" });
  const submit = form.getByRole("button", { name: "Preview my route brief", exact: true });
  await expect(submit).toBeEnabled();
  const startDate = form.getByLabel("Preferred start date", { exact: true });
  const safeDefaultDate = await startDate.inputValue();
  const fixtureSaturday = new Date(`${safeDefaultDate}T00:00:00Z`);
  fixtureSaturday.setUTCDate(
    fixtureSaturday.getUTCDate() + (6 - fixtureSaturday.getUTCDay() + 7) % 7,
  );
  await startDate.fill(fixtureSaturday.toISOString().slice(0, 10));
  await expect(form.getByLabel("Preferred start time", { exact: true })).toHaveValue("09:00");
  await form.getByLabel("Hours", { exact: true }).fill("6");
  await form.getByLabel("Budget for your whole group", { exact: true }).fill("2000000");
  await form.getByRole("checkbox", { name: "District 1 & central", exact: true }).check();
  await form.getByLabel("Food & everyday flavor", { exact: true }).fill("0");
  await form.getByLabel("Markets & neighborhood life", { exact: true }).fill("4");
  await submit.click();

  const plannerLink = form.getByRole("link", { name: "Sign in to open the AI planner", exact: true });
  await expect(plannerLink).toBeVisible();
  await expect(form.getByRole("note")).toContainText(
    "Your preferences are saved in this tab. Sign in with a demo customer account to generate and save an AI-assisted itinerary.",
  );
  await plannerLink.click();
  await expect(page).toHaveURL(/\/en\/sign-in\/\?returnTo=/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/en/planner/");

  await submitSignIn(page, account);
  await expect(page).toHaveURL(/\/en\/planner\/?$/);
  await expect(page.getByRole("heading", { name: "Your personalized route proposal" })).toBeVisible();
  return { page, session: await readBrowserSession(page) };
}

async function runPlannerOperation(
  page: Page,
  path: "recommend-itinerary" | "refine-itinerary",
  action: () => Promise<void>,
): Promise<EdgeResult> {
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === "POST"
    && new URL(response.url()).pathname.endsWith(`/functions/v1/${path}`)
  ));
  await action();
  const response = await responsePromise;
  const body = await response.json() as unknown;
  expect(body).toEqual(expect.any(Object));
  return { body: body as Record<string, unknown>, status: response.status() };
}

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("local authenticated itinerary Edge runtime", () => {
  test("hands homepage preferences through sign-in, explicitly generates, refines, reloads, and denies another customer", async ({ browser, request }) => {
    await configureFakeProvider(request, "valid");
    const owner = await createPlannerPageFromHomepage(browser, "owner");
    const ownerClient = sessionClient(owner.session);
    expect(await fakeProviderState(request)).toEqual({ requests: 0, scenario: "valid" });
    const generate = owner.page.getByRole("button", { name: "Generate itinerary", exact: true });
    await expect(generate).toBeVisible();
    await expectKeyboardReachable(owner.page, generate);

    const recommendation = expectRecommendation(
      await runPlannerOperation(owner.page, "recommend-itinerary", () => generate.click()),
      { degraded: false, rankingSource: "ai" },
    );
    await expect(owner.page.getByRole("status")).toHaveText(
      "Gemini assisted with ranking; LocalLens validated the timing and cost.",
    );
    await expect(owner.page.getByRole("note", { name: "Fallback status" })).toHaveCount(0);
    await expect(owner.page.getByRole("heading", { name: "Revision 1" })).toBeVisible();
    await captureQaState(owner.page, "planner-ai-success");
    expectNoRuntimeSecretLeak(recommendation, owner.session);
    const revisionOneId = await expectRevisionOnePersisted(
      ownerClient,
      owner.session,
      recommendation,
    );

    const lockedPlaceId = recommendation.proposal.items[0]?.placeId;
    if (lockedPlaceId === undefined) throw new Error("Recommendation must contain a lockable stop");
    const firstLock = owner.page.getByRole("button", { name: /^Lock stop:/ }).first();
    await firstLock.click();
    await expect(owner.page.getByRole("button", { name: /^Unlock stop:/ }).first())
      .toHaveAttribute("aria-pressed", "true");
    await owner.page.getByRole("textbox", { name: "What should we adjust?", exact: true })
      .fill("Đi chậm hơn và giữ điểm đầu tiên");
    await owner.page.getByRole("combobox", { name: "Refinement scope", exact: true })
      .selectOption("partial");
    const refinementResult = await runPlannerOperation(
      owner.page,
      "refine-itinerary",
      () => owner.page.getByRole("button", { name: "Create revised proposal", exact: true }).click(),
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
    expectNoRuntimeSecretLeak(refinement, owner.session);
    await expect(owner.page.getByRole("heading", { name: "Revision 2" })).toBeVisible();
    await expect(owner.page.getByRole("status")).toHaveText(
      "Gemini assisted with ranking; LocalLens validated the timing and cost.",
    );

    const persistedPlan = await ownerClient
      .from("trip_plans")
      .select("id,latest_revision_no")
      .eq("id", recommendation.planId);
    expect(persistedPlan.error).toBeNull();
    expect(persistedPlan.data).toEqual([{ id: recommendation.planId, latest_revision_no: 2 }]);
    const persistedRevisions = await ownerClient
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

    await owner.page.reload();
    await expect(owner.page.getByRole("heading", { name: "Your personalized route proposal" })).toBeVisible();
    await expect(owner.page.getByRole("heading", { name: "Revision 2", exact: true })).toBeVisible();
    await expect(owner.page.getByRole("status")).toHaveText(
      "Gemini assisted with ranking; LocalLens validated the timing and cost.",
    );
    await expect(owner.page.getByRole("button", { name: "Generate itinerary", exact: true })).toHaveCount(0);
    const reloadedSession = await readBrowserSession(owner.page);
    expect(reloadedSession.userId).toBe(owner.session.userId);
    const reloadedClient = sessionClient(reloadedSession);
    const reloadedPlan = await reloadedClient
      .from("trip_plans")
      .select("id,latest_revision_no")
      .eq("id", recommendation.planId);
    expect(reloadedPlan.error).toBeNull();
    expect(reloadedPlan.data).toEqual([{ id: recommendation.planId, latest_revision_no: 2 }]);
    const reloadedRevisions = await reloadedClient
      .from("trip_plan_revisions")
      .select("revision_no")
      .eq("plan_id", recommendation.planId)
      .order("revision_no", { ascending: true });
    expect(reloadedRevisions.error).toBeNull();
    expect(reloadedRevisions.data).toEqual([{ revision_no: 1 }, { revision_no: 2 }]);
    expect(await fakeProviderState(request)).toEqual({ requests: 2, scenario: "valid" });

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
        operationId: "60000000-0000-4000-8000-000000000001",
        planId: recommendation.planId,
        baseRevision: 2,
        delta: { feedback: "market", scope: "full" },
        lockedItemIds: [],
      },
    );
    expect(deniedRefinement.status, JSON.stringify(deniedRefinement.body)).toBe(404);
    expect(deniedRefinement.body).toMatchObject({
      code: "PLAN_NOT_FOUND",
      retryable: false,
    });
    expectNoRuntimeSecretLeak(deniedRefinement.body, other.session);
    expect(await fakeProviderState(request)).toEqual({ requests: 2, scenario: "valid" });
    expectNoBrowserErrors(owner.page);
    expectNoBrowserErrors(other.page);

    await owner.page.context().close();
    await other.page.context().close();
  });

  test("persists deterministic fallback when the fake Gemini output is malformed", async ({ browser, request }) => {
    await configureFakeProvider(request, "malformed");
    const owner = await createPlannerPageFromHomepage(browser, "owner");
    const ownerClient = sessionClient(owner.session);
    expect(await fakeProviderState(request)).toEqual({ requests: 0, scenario: "malformed" });

    const recommendation = expectRecommendation(
      await runPlannerOperation(
        owner.page,
        "recommend-itinerary",
        () => owner.page.getByRole("button", { name: "Generate itinerary", exact: true }).click(),
      ),
      { degraded: true, rankingSource: "deterministic" },
    );
    expect(recommendation.messageKey).toBe("itinerary.ai_invalid");
    await expect(owner.page.getByRole("status")).toHaveText("Safe deterministic fallback ready.");
    await expect(owner.page.getByRole("note", { name: "Fallback status" })).toHaveText(
      "AI is temporarily unavailable; LocalLens used the safe deterministic fallback.",
    );
    await expect(owner.page.getByText(
      "Gemini assisted with ranking; LocalLens validated the timing and cost.",
      { exact: true },
    )).toHaveCount(0);
    await captureQaState(owner.page, "runtime-planner-fallback");
    expectNoRuntimeSecretLeak(recommendation, owner.session);
    await expectRevisionOnePersisted(ownerClient, owner.session, recommendation);
    expect(await fakeProviderState(request)).toEqual({ requests: 1, scenario: "malformed" });
    expectNoBrowserErrors(owner.page);

    await owner.page.context().close();
  });

  test("terminally rejects the sixth per-identity Gemini reservation without a provider call or persistence", async ({ browser, request }) => {
    await configureFakeProvider(request, "valid");
    const owner = await createSignedInPage(browser, "owner");
    const ownerClient = sessionClient(owner.session);
    const input = await buildRequest(ownerClient);

    const beforePlans = await ownerClient.from("trip_plans").select("id");
    const beforeRevisions = await ownerClient.from("trip_plan_revisions").select("id");
    expect(beforePlans.error).toBeNull();
    expect(beforeRevisions.error).toBeNull();

    const recommendations: RecommendationBody[] = [];
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const recommendation = expectRecommendation(
        await postEdge(request, "recommend-itinerary", owner.session, identities.quota, {
          operationId: `60000000-0000-4000-8000-${String(attempt).padStart(12, "0")}`,
          input,
        }),
        { degraded: false, rankingSource: "ai" },
      );
      recommendations.push(recommendation);
    }

    const rejected = await postEdge(request, "recommend-itinerary", owner.session, identities.quota, {
      operationId: "60000000-0000-4000-8000-000000000006",
      input,
    });
    expect(rejected.status).toBe(429);
    expect(rejected.body).toMatchObject({
      code: "QUOTA_EXCEEDED",
      messageKey: "recommendation.quota_exceeded",
      retryable: true,
      operationState: "rejected",
    });
    expect(new Set(recommendations.map((entry) => entry.planId)).size).toBe(5);
    expect(await fakeProviderState(request)).toEqual({ requests: 5, scenario: "valid" });

    const afterPlans = await ownerClient.from("trip_plans").select("id");
    const afterRevisions = await ownerClient.from("trip_plan_revisions").select("id");
    expect(afterPlans.error).toBeNull();
    expect(afterRevisions.error).toBeNull();
    expect(afterPlans.data).toHaveLength((beforePlans.data?.length ?? 0) + 5);
    expect(afterRevisions.data).toHaveLength((beforeRevisions.data?.length ?? 0) + 5);
    expectNoRuntimeSecretLeak(rejected.body, owner.session);
    expectNoBrowserErrors(owner.page);

    await owner.page.context().close();
  });
});
