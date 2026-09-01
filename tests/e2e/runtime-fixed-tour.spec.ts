import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page, type Request } from "@playwright/test";

import type { Database } from "@/lib/infrastructure/supabase/database.types";

const accounts = {
  customerA: {
    email: "customer.runtime@localens.test",
    passwordEnv: "LOCALENS_RUNTIME_CUSTOMER_PASSWORD",
  },
  customerB: {
    email: "customer-b.runtime-fixed-tour@localens.test",
    passwordEnv: "LOCALENS_RUNTIME_FIXED_TOUR_CUSTOMER_PASSWORD",
  },
  guide: {
    email: "guide.runtime@localens.test",
    passwordEnv: "LOCALENS_RUNTIME_GUIDE_PASSWORD",
  },
  admin: {
    email: "admin.runtime@localens.test",
    passwordEnv: "LOCALENS_RUNTIME_ADMIN_PASSWORD",
  },
} as const;

const fixture = {
  departureId: "b2200000-0000-4000-8000-000000000043",
  enTitle: "Runtime Test Markets and Street Food",
  viTitle: "Chợ và ẩm thực đường phố kiểm thử",
  enMeetingPoint: "Runtime-test meeting point",
  viMeetingPoint: "Điểm hẹn kiểm thử runtime",
  policy: "Runtime-test hold only; no real payment or commercial cancellation applies.",
} as const;

type Account = keyof typeof accounts;
type RuntimeClient = SupabaseClient<Database>;
type HoldPayload = {
  departure_id: string;
  party_size: number;
  booking_locale: "en" | "vi";
  idempotency_key: string;
};
type HoldRow = { booking_id: string; hold_expires_at: string; state: "created" | "resumed" };

let customerAPayload: HoldPayload;
let customerABooking: HoldRow;
let customerBBooking: HoldRow;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for local runtime fixed-tour E2E`);
  return value;
}

function passwordFor(account: Account): string {
  return requiredEnv(accounts[account].passwordEnv);
}

function publicClient(): RuntimeClient {
  return createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
  );
}

async function authenticatedClient(account: Account): Promise<RuntimeClient> {
  const client = publicClient();
  const { error } = await client.auth.signInWithPassword({
    email: accounts[account].email,
    password: passwordFor(account),
  });
  expect(error).toBeNull();
  return client;
}

async function signIn(page: Page, account: Account, locale: "en" | "vi"): Promise<void> {
  await page.goto(`/${locale}/sign-in/`);
  await expect(page.getByRole("heading", {
    name: locale === "vi" ? "Đăng nhập LocalLens" : "Sign in to LocalLens",
  })).toBeVisible();
  await page.getByRole("textbox", { name: "Email" }).fill(accounts[account].email);
  await page.getByLabel(locale === "vi" ? "Mật khẩu" : "Password").fill(passwordFor(account));
  await page.getByRole("button", {
    name: locale === "vi" ? "Đăng nhập" : "Sign in",
    exact: true,
  }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/account/?(?:\\?.*)?$`));
}

async function expectNoDemoOrPaymentSuccess(page: Page): Promise<void> {
  const demoStorage = await page.evaluate(() => ({
    local: Object.keys(localStorage).filter((key) => key.startsWith("localens.portal.demo")),
    session: Object.keys(sessionStorage).filter((key) => key.startsWith("localens.portal.demo")),
  }));
  expect(demoStorage).toEqual({ local: [], session: [] });
  await expect(page.getByText(/payment succeeded|demo payment|thanh toán thành công|thanh toán mô phỏng/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Reset LocalLens demo|Đặt lại bản demo LocalLens/i })).toHaveCount(0);
}

function expectExactHoldPayload(value: unknown): asserts value is HoldPayload {
  expect(value).toEqual(expect.objectContaining({
    departure_id: fixture.departureId,
    party_size: expect.any(Number),
    booking_locale: expect.stringMatching(/^(?:en|vi)$/),
    idempotency_key: expect.any(String),
  }));
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([
    "booking_locale",
    "departure_id",
    "idempotency_key",
    "party_size",
  ]);
}

function expectExactHoldResponse(value: unknown, expectedState?: HoldRow["state"]): asserts value is HoldRow {
  expect(value).toEqual(expect.objectContaining({
    booking_id: expect.any(String),
    hold_expires_at: expect.any(String),
    state: expectedState ?? expect.stringMatching(/^(?:created|resumed)$/),
  }));
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([
    "booking_id",
    "hold_expires_at",
    "state",
  ]);
}

function expectNoAuthorityLeak(value: unknown): void {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of [
    "actor_id",
    "owner_user_id",
    "user_role",
    "amount_minor",
    "booking_status",
    "canonical_hash",
    "provider_idempotency",
    "service_role",
    "database_url",
    "postgresql://",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

async function createHoldThroughUi(
  page: Page,
  options: {
    locale: "en" | "vi";
    partySize: number;
    title: string;
    meetingPoint: string;
  },
): Promise<{ payload: HoldPayload; row: HoldRow }> {
  await page.goto(`/${options.locale}/tours/`);
  await expect(page.getByRole("heading", {
    name: options.locale === "vi"
      ? "Tour cố định từ cơ sở dữ liệu cục bộ"
      : "Fixed tours from the live local database",
  })).toBeVisible();
  await expect(page.getByRole("heading", { name: options.title, level: 2 })).toBeVisible();
  await expect(page.getByText(options.meetingPoint, { exact: true })).toBeVisible();
  await expect(page.getByText(fixture.policy, { exact: true })).toBeVisible();
  await expect(page.getByText(options.locale === "vi" ? "Còn 8 chỗ" : "8 seats remaining", { exact: true })).toBeVisible();
  await page.getByRole("link", {
    name: options.locale === "vi" ? `Đặt ${options.title}` : `Book ${options.title}`,
    exact: true,
  }).click();

  await expect(page.getByRole("heading", {
    name: options.locale === "vi" ? "Giữ chỗ cho tour cố định" : "Hold a fixed-tour departure",
  })).toBeVisible();
  const party = page.getByRole("spinbutton", {
    name: options.locale === "vi" ? "Số người" : "Party size",
  });
  await party.fill(String(options.partySize));

  const requests: Request[] = [];
  const onRequest = (request: Request) => {
    if (request.method() === "POST" && request.url().includes("/rest/v1/rpc/begin_fixed_tour_booking")) {
      requests.push(request);
    }
  };
  page.on("request", onRequest);
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().includes("/rest/v1/rpc/begin_fixed_tour_booking"));
  await page.getByRole("button", {
    name: options.locale === "vi" ? "Tạo giữ chỗ chờ thanh toán" : "Create pending-payment hold",
    exact: true,
  }).click();
  const response = await responsePromise;
  await expect(page).toHaveURL(new RegExp(`/${options.locale}/account/\\?hold=(?:created|resumed)$`));
  page.off("request", onRequest);

  expect(requests).toHaveLength(1);
  const payload = requests[0]?.postDataJSON();
  expectExactHoldPayload(payload);
  expect(payload.party_size).toBe(options.partySize);
  expect(payload.booking_locale).toBe(options.locale);
  expect(response.ok()).toBe(true);
  const responseBody: unknown = await response.json();
  expect(Array.isArray(responseBody)).toBe(true);
  expect(responseBody).toHaveLength(1);
  const row = (responseBody as unknown[])[0];
  expectExactHoldResponse(row);
  expectNoAuthorityLeak({ payload, row });
  return { payload, row };
}

async function expectAccountHold(
  page: Page,
  options: { locale: "en" | "vi"; title: string; partySize: number },
): Promise<void> {
  const accountHeading = options.locale === "vi"
    ? "Các giữ chỗ tour cố định của bạn"
    : "Your fixed-tour holds";
  await expect(page.getByRole("heading", { name: accountHeading })).toBeVisible();
  const article = page.getByRole("article").filter({ hasText: options.title });
  await expect(article).toBeVisible();
  await expect(article.getByText(String(options.partySize), { exact: true })).toBeVisible();
  await expect(article.getByRole("note")).toContainText(
    options.locale === "vi" ? "Đang chờ thanh toán" : "Pending payment",
  );
  await expectNoDemoOrPaymentSuccess(page);
}

async function expectNewContextPersistence(
  browser: Browser,
  options: { account: "customerA" | "customerB"; locale: "en" | "vi"; title: string; partySize: number },
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signIn(page, options.account, options.locale);
    await expectAccountHold(page, options);
  } finally {
    await context.close();
  }
}

async function expectConflict(client: RuntimeClient, payload: HoldPayload): Promise<void> {
  const { data, error } = await client.rpc("begin_fixed_tour_booking", payload);
  expect(data).toBeNull();
  expect(error).not.toBeNull();
  expect(error?.code).toBe("P0001");
  expect(error?.message).toContain("IDEMPOTENCY_CONFLICT");
  expectNoAuthorityLeak(error);
}

test.describe.configure({ mode: "serial" });

test.describe("B2.2a local runtime fixed-tour acceptance", () => {
  test.beforeAll(() => {
    for (const forbiddenEnv of [
      "LOCALENS_DB_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SERVICE_ROLE_KEY",
      "NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES",
    ]) {
      expect(process.env[forbiddenEnv]).toBeUndefined();
    }
  });

  test("English customer A creates party-one hold and persists after reload and relogin", async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await signIn(page, "customerA", "en");
      const result = await createHoldThroughUi(page, {
        locale: "en",
        partySize: 1,
        title: fixture.enTitle,
        meetingPoint: fixture.enMeetingPoint,
      });
      customerAPayload = result.payload;
      customerABooking = result.row;
      await expectAccountHold(page, { locale: "en", title: fixture.enTitle, partySize: 1 });
      await page.reload();
      await expectAccountHold(page, { locale: "en", title: fixture.enTitle, partySize: 1 });
    } finally {
      await context.close();
    }
    await expectNewContextPersistence(browser, {
      account: "customerA",
      locale: "en",
      title: fixture.enTitle,
      partySize: 1,
    });
  });

  test("Vietnamese customer B creates party-two hold and persists localized data after relogin", async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await signIn(page, "customerB", "vi");
      const result = await createHoldThroughUi(page, {
        locale: "vi",
        partySize: 2,
        title: fixture.viTitle,
        meetingPoint: fixture.viMeetingPoint,
      });
      customerBBooking = result.row;
      await expectAccountHold(page, { locale: "vi", title: fixture.viTitle, partySize: 2 });
      await page.reload();
      await expectAccountHold(page, { locale: "vi", title: fixture.viTitle, partySize: 2 });
    } finally {
      await context.close();
    }
    await expectNewContextPersistence(browser, {
      account: "customerB",
      locale: "vi",
      title: fixture.viTitle,
      partySize: 2,
    });
  });

  test("owner view isolates A and B and public RPC rejects anonymous, guide, and admin", async () => {
    const customerA = await authenticatedClient("customerA");
    const customerB = await authenticatedClient("customerB");
    const aRows = await customerA.from("customer_bookings_v").select("id,party_size,language");
    const bRows = await customerB.from("customer_bookings_v").select("id,party_size,language");
    expect(aRows.error).toBeNull();
    expect(bRows.error).toBeNull();
    expect(aRows.data).toEqual([{ id: customerABooking.booking_id, party_size: 1, language: "en" }]);
    expect(bRows.data).toEqual([{ id: customerBBooking.booking_id, party_size: 2, language: "vi" }]);

    const deniedPayload: HoldPayload = {
      departure_id: fixture.departureId,
      party_size: 1,
      booking_locale: "en",
      idempotency_key: "runtime-fixed-tour-denied-role-check",
    };
    for (const account of [null, "guide", "admin"] as const) {
      const client = account === null ? publicClient() : await authenticatedClient(account);
      const { data, error } = await client.rpc("begin_fixed_tour_booking", deniedPayload);
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expectNoAuthorityLeak(error);
    }
  });

  test("public RPC resumes exact replay and conflicts on each changed payload field", async () => {
    const customerA = await authenticatedClient("customerA");
    const replay = await customerA.rpc("begin_fixed_tour_booking", customerAPayload);
    expect(replay.error).toBeNull();
    expect(replay.data).toHaveLength(1);
    const replayRow = (replay.data as unknown[])[0];
    expectExactHoldResponse(replayRow, "resumed");
    expect(replayRow.booking_id).toBe(customerABooking.booking_id);
    expectNoAuthorityLeak({ payload: customerAPayload, row: replayRow });

    await expectConflict(customerA, { ...customerAPayload, party_size: 2 });
    await expectConflict(customerA, { ...customerAPayload, booking_locale: "vi" });
    await expectConflict(customerA, {
      ...customerAPayload,
      departure_id: "b2200000-0000-4000-8000-000000000099",
    });
  });
});
