import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page, type Request } from "@playwright/test";

import type { Database } from "@/lib/infrastructure/supabase/database.types";
import { bookingCancellationCopy } from "@/lib/i18n/booking-cancellation";
import { fixedTourRuntimeCopy } from "@/lib/i18n/fixed-tour-runtime";

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
  guideSecondary: {
    email: "guide-secondary.runtime@localens.test",
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
type PaymentPayload = { booking_id: string; idempotency_key: string };
type PaymentRow = {
  booking_id: string;
  booking_status: "confirmed" | "expired";
  payment_status: "paid" | null;
  simulated_at: string;
  state: "completed" | "expired" | "replayed";
};
type CancellationPayload = { booking_id: string; reason_code: string; idempotency_key: string };
type CancellationRow = {
  id: string;
  booking_id: string;
  customer_user_id: string;
  source_kind: "departure" | "quote";
  reason_code: string | null;
  other_reason: string | null;
  idempotency_key: string;
  cancelled_at: string;
  booking_status: "cancelled";
  state: "created" | "replayed";
};
type GuideAssignmentPayload = { booking_id: string; guide_user_id: string; idempotency_key: string };
type GuideAssignmentRow = {
  assignment_id: string;
  booking_id: string;
  guide_user_id: string;
  status: "assigned" | "accepted";
  outcome: "assigned" | "reassigned" | "unchanged" | "replayed";
};

let customerAPayload: HoldPayload;
let customerABooking: HoldRow;
let customerBBooking: HoldRow;
let customerAPaymentPayload: PaymentPayload;
let customerAPayment: PaymentRow;

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
  const destination = account === "admin"
    ? "admin"
    : account === "guide" || account === "guideSecondary"
      ? "guide"
      : "account";
  await expect(page).toHaveURL(new RegExp(`/${locale}/${destination}/?(?:\\?.*)?$`));
}

async function expectNoDemoStorage(page: Page): Promise<void> {
  const demoStorage = await page.evaluate(() => ({
    local: Object.keys(localStorage).filter((key) => key.startsWith("localens.portal.demo")),
    session: Object.keys(sessionStorage).filter((key) => key.startsWith("localens.portal.demo")),
  }));
  expect(demoStorage).toEqual({ local: [], session: [] });
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

function expectExactGuideAssignmentPayload(value: unknown): asserts value is GuideAssignmentPayload {
  expect(value).toEqual(expect.objectContaining({
    booking_id: expect.any(String),
    guide_user_id: expect.any(String),
    idempotency_key: expect.any(String),
  }));
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([
    "booking_id",
    "guide_user_id",
    "idempotency_key",
  ]);
}

function expectExactGuideAssignmentRow(value: unknown): asserts value is GuideAssignmentRow {
  expect(value).toEqual(expect.objectContaining({
    assignment_id: expect.any(String),
    booking_id: expect.any(String),
    guide_user_id: expect.any(String),
    status: expect.stringMatching(/^(?:assigned|accepted)$/),
    outcome: expect.stringMatching(/^(?:assigned|reassigned|unchanged|replayed)$/),
  }));
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([
    "assignment_id",
    "booking_id",
    "guide_user_id",
    "outcome",
    "status",
  ]);
}

function expectNoPaymentAuthorityLeak(value: unknown): void {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of [
    "actor_id",
    "owner_user_id",
    "user_role",
    "amount_minor",
    "currency",
    "outcome",
    "provider_",
    "card",
    "service_role",
    "database_url",
    "postgresql://",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

function expectExactPaymentPayload(value: unknown): asserts value is PaymentPayload {
  expect(value).toEqual(expect.objectContaining({
    booking_id: expect.any(String),
    idempotency_key: expect.any(String),
  }));
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([
    "booking_id",
    "idempotency_key",
  ]);
}

function expectExactPaymentResponse(value: unknown, expectedState?: PaymentRow["state"]): asserts value is PaymentRow {
  expect(value).toEqual(expect.objectContaining({
    booking_id: expect.any(String),
    booking_status: expect.stringMatching(/^(?:confirmed|expired)$/),
    simulated_at: expect.any(String),
    state: expectedState ?? expect.stringMatching(/^(?:completed|expired|replayed)$/),
  }));
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([
    "booking_id",
    "booking_status",
    "payment_status",
    "simulated_at",
    "state",
  ]);
  expect(["paid", null]).toContain((value as Record<string, unknown>).payment_status);
}

function expectExactCancellationPayload(value: unknown): asserts value is CancellationPayload {
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([
    "booking_id",
    "idempotency_key",
    "reason_code",
  ]);
  expect(value).toEqual(expect.objectContaining({
    booking_id: expect.any(String),
    reason_code: expect.any(String),
    idempotency_key: expect.any(String),
  }));
}

function expectExactCancellationRow(value: unknown): asserts value is CancellationRow {
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([
    "booking_id",
    "booking_status",
    "cancelled_at",
    "customer_user_id",
    "id",
    "idempotency_key",
    "other_reason",
    "reason_code",
    "source_kind",
    "state",
  ]);
  expect(value).toEqual(expect.objectContaining({
    id: expect.any(String),
    booking_id: expect.any(String),
    customer_user_id: expect.any(String),
    source_kind: expect.stringMatching(/^(?:departure|quote)$/),
    cancelled_at: expect.any(String),
    booking_status: "cancelled",
    state: expect.stringMatching(/^(?:created|replayed)$/),
  }));
}

async function createHoldThroughUi(
  page: Page,
  options: {
    locale: "en" | "vi";
    partySize: number;
    seatsRemaining: number;
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
  await expect(page.getByText(
    options.locale === "vi"
      ? `Còn ${options.seatsRemaining} chỗ`
      : `${options.seatsRemaining} seats remaining`,
    { exact: true },
  )).toBeVisible();
  await page.getByRole("link", {
    name: options.locale === "vi" ? `Đặt ${options.title}` : `Book ${options.title}`,
    exact: true,
  }).click();

  await expect(page.getByRole("heading", {
    name: options.locale === "vi" ? "Giữ chỗ cho tour cố định" : "Hold a fixed-tour departure",
  })).toBeVisible({ timeout: 15_000 });
  const party = page.getByRole("spinbutton", {
    name: options.locale === "vi" ? "Số người" : "Party size",
  });
  await party.fill(String(options.partySize));

  const requests: Request[] = [];
  const onRequest = (request: Request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/rest/v1/rpc/begin_fixed_tour_booking"
    ) {
      requests.push(request);
    }
  };
  page.on("request", onRequest);
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === "/rest/v1/rpc/begin_fixed_tour_booking");
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
  expect(response.status()).toBe(200);
  const responseBody: unknown = await response.json();
  expect(Array.isArray(responseBody)).toBe(true);
  expect(responseBody).toHaveLength(1);
  const row = (responseBody as unknown[])[0];
  expectExactHoldResponse(row);
  expectNoAuthorityLeak({ payload, row });
  return { payload, row };
}

async function expectAccountBooking(
  page: Page,
  options: {
    locale: "en" | "vi";
    title: string;
    partySize: number;
    state: "pending" | "paid";
  },
): Promise<void> {
  const accountHeading = options.locale === "vi"
    ? "Các giữ chỗ tour cố định của bạn"
    : "Your fixed-tour holds";
  await expect(page.getByRole("heading", { name: accountHeading })).toBeVisible();
  const article = page.getByRole("article").filter({ hasText: options.title });
  await expect(article).toBeVisible();
  await expect(article.getByText(String(options.partySize), { exact: true })).toBeVisible();
  const copy = fixedTourRuntimeCopy(options.locale);
  const expectDefinitionValue = async (label: string, value: string): Promise<void> => {
    const labelNode = article.getByText(label, { exact: true });
    await expect(labelNode).toHaveCount(1);
    await expect(labelNode.locator("xpath=following-sibling::dd[1]")).toHaveText(value);
  };
  if (options.state === "pending") {
    await expectDefinitionValue(copy.bookingStatus, copy.bookingStatusLabels.pending_payment);
    await expectDefinitionValue(copy.paymentStatus, copy.paymentPending);
    await expect(article.getByRole("note")).toHaveText(copy.simulationDisclosure);
    await expect(article.getByRole("button", { name: copy.completePayment, exact: true })).toBeVisible();
  } else {
    await expectDefinitionValue(copy.bookingStatus, copy.bookingStatusLabels.confirmed);
    await expectDefinitionValue(copy.paymentStatus, copy.paymentPaid);
    await expect(article.getByText(copy.simulatedAt, { exact: true })).toBeVisible();
    await expect(article.getByRole("note")).toHaveText(copy.simulationDisclosure);
    await expect(article.getByRole("button", { name: copy.completePayment, exact: true })).toHaveCount(0);
  }
  await expectNoDemoStorage(page);
}

async function completePaymentThroughUi(
  page: Page,
  options: { locale: "en" | "vi"; bookingId: string; title: string; partySize: number },
): Promise<{ payload: PaymentPayload; row: PaymentRow }> {
  await expectAccountBooking(page, { ...options, state: "pending" });
  const copy = fixedTourRuntimeCopy(options.locale);
  const requests: Request[] = [];
  const onRequest = (request: Request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/rest/v1/rpc/complete_simulated_fixed_tour_payment"
    ) requests.push(request);
  };
  page.on("request", onRequest);
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === "/rest/v1/rpc/complete_simulated_fixed_tour_payment");
  await page.getByRole("button", { name: copy.completePayment, exact: true }).click();
  const response = await responsePromise;
  page.off("request", onRequest);

  expect(requests).toHaveLength(1);
  const payload = requests[0]?.postDataJSON();
  expectExactPaymentPayload(payload);
  expect(payload.booking_id).toBe(options.bookingId);
  expect(response.status()).toBe(200);
  const responseBody: unknown = await response.json();
  expect(Array.isArray(responseBody)).toBe(true);
  expect(responseBody).toHaveLength(1);
  const row = (responseBody as unknown[])[0];
  expectExactPaymentResponse(row, "completed");
  expect(row.booking_id).toBe(options.bookingId);
  expect(row.booking_status).toBe("confirmed");
  expect(row.payment_status).toBe("paid");
  expectNoPaymentAuthorityLeak({ payload, row });
  await expectAccountBooking(page, { ...options, state: "paid" });
  return { payload, row };
}

async function expectNewContextPersistence(
  browser: Browser,
  options: { account: "customerA" | "customerB"; locale: "en" | "vi"; title: string; partySize: number },
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signIn(page, options.account, options.locale);
    await expectAccountBooking(page, { ...options, state: "paid" });
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

test.describe("B2.2a-B2.2b local runtime fixed-tour and simulated-payment acceptance", () => {
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

  test("seeded customer sign-in restores the fixed-tour departure and party size", async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const locale = "en" as const;
      const returnTo = `/${locale}/booking/?departure=${fixture.departureId}&partySize=2`;
      const copy = fixedTourRuntimeCopy(locale);

      await page.goto(returnTo);
      await page.getByRole("link", { name: copy.signInRequired, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in/\\?returnTo=`));
      const signInUrl = new URL(page.url());
      expect(signInUrl.pathname).toBe(`/${locale}/sign-in/`);
      expect(signInUrl.searchParams.get("returnTo")).toBe(returnTo);

      await page.getByRole("textbox", { name: "Email" }).fill(accounts.customerA.email);
      await page.getByLabel("Password").fill(passwordFor("customerA"));
      await page.getByRole("button", { name: "Sign in", exact: true }).click();

      await expect(page).toHaveURL(new RegExp(`/${locale}/booking/\\?departure=${fixture.departureId}&partySize=2$`));
      await expect(page.getByRole("spinbutton", { name: copy.partySize })).toHaveValue("2");
      await expect(page.getByRole("heading", { name: copy.bookingHeading })).toBeVisible();
      await expectNoDemoStorage(page);
    } finally {
      await context.close();
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
        seatsRemaining: 8,
        title: fixture.enTitle,
        meetingPoint: fixture.enMeetingPoint,
      });
      customerAPayload = result.payload;
      customerABooking = result.row;
      const payment = await completePaymentThroughUi(page, {
        locale: "en",
        bookingId: customerABooking.booking_id,
        title: fixture.enTitle,
        partySize: 1,
      });
      customerAPaymentPayload = payment.payload;
      customerAPayment = payment.row;
      await page.reload();
      await expectAccountBooking(page, { locale: "en", title: fixture.enTitle, partySize: 1, state: "paid" });
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
        seatsRemaining: 7,
        title: fixture.viTitle,
        meetingPoint: fixture.viMeetingPoint,
      });
      customerBBooking = result.row;
      await completePaymentThroughUi(page, {
        locale: "vi",
        bookingId: customerBBooking.booking_id,
        title: fixture.viTitle,
        partySize: 2,
      });
      await page.reload();
      await expectAccountBooking(page, { locale: "vi", title: fixture.viTitle, partySize: 2, state: "paid" });
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
    const aPayments = await customerA
      .from("customer_simulated_payment_status_v")
      .select("booking_id,booking_status,payment_status");
    const bPayments = await customerB
      .from("customer_simulated_payment_status_v")
      .select("booking_id,booking_status,payment_status");
    expect(aPayments.error).toBeNull();
    expect(bPayments.error).toBeNull();
    expect(aPayments.data).toEqual([{
      booking_id: customerABooking.booking_id,
      booking_status: "confirmed",
      payment_status: "paid",
    }]);
    expect(bPayments.data).toEqual([{
      booking_id: customerBBooking.booking_id,
      booking_status: "confirmed",
      payment_status: "paid",
    }]);

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
      expect(error?.code).toBe("42501");
      expect(error?.message).toMatch(
        account === null
          ? /permission denied for function begin_fixed_tour_booking/i
          : /^checkout authentication required$/,
      );
      expectNoAuthorityLeak(error);
    }

    const deniedPayment: PaymentPayload = {
      booking_id: customerABooking.booking_id,
      idempotency_key: "runtime-payment-denied-role-check",
    };
    for (const account of [null, "guide", "admin"] as const) {
      const client = account === null ? publicClient() : await authenticatedClient(account);
      const { data, error } = await client.rpc("complete_simulated_fixed_tour_payment", deniedPayment);
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe("42501");
      expectNoAuthorityLeak(error);
    }

    const crossOwner = await customerB.rpc("complete_simulated_fixed_tour_payment", {
      booking_id: customerABooking.booking_id,
      idempotency_key: "runtime-payment-cross-owner-check",
    });
    expect(crossOwner.data).toBeNull();
    expect(crossOwner.error?.code).toBe("42501");
    expectNoAuthorityLeak(crossOwner.error);
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

    const paymentReplay = await customerA.rpc(
      "complete_simulated_fixed_tour_payment",
      customerAPaymentPayload,
    );
    expect(paymentReplay.error).toBeNull();
    expect(paymentReplay.data).toHaveLength(1);
    const paymentReplayRow = (paymentReplay.data as unknown[])[0];
    expectExactPaymentResponse(paymentReplayRow, "replayed");
    expect(paymentReplayRow.booking_id).toBe(customerAPayment.booking_id);
    expect(paymentReplayRow.simulated_at).toBe(customerAPayment.simulated_at);
    expectNoPaymentAuthorityLeak({ payload: customerAPaymentPayload, row: paymentReplayRow });

    const paymentConflict = await customerA.rpc("complete_simulated_fixed_tour_payment", {
      ...customerAPaymentPayload,
      idempotency_key: "runtime-payment-conflicting-key",
    });
    expect(paymentConflict.data).toBeNull();
    expect(paymentConflict.error?.code).toBe("P0001");
    expect(paymentConflict.error?.message).toContain("IDEMPOTENCY_CONFLICT");
    expectNoAuthorityLeak(paymentConflict.error);
  });

  test("administrator assigns and reassigns one confirmed booking while only the current guide sees the read-only schedule", async ({ browser }) => {
    let assignmentPayload: GuideAssignmentPayload;
    let assignmentRow: GuideAssignmentRow;
    let reassignmentRow: GuideAssignmentRow;
    let returnAssignmentRow: GuideAssignmentRow;
    const adminContext = await browser.newContext();
    try {
      const page = await adminContext.newPage();
      await signIn(page, "admin", "en");
      const region = page.getByRole("region", { name: "Guide assignments" });
      await expect(region).toBeVisible();
      const target = region.getByRole("article").filter({
        has: page.locator("dd").filter({ hasText: /^1$/ }),
      });
      await expect(target).toHaveCount(1);
      const responsePromise = page.waitForResponse((response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/rest/v1/rpc/assign_fixed_departure_guide");
      await target.getByRole("button", { name: "Assign guide", exact: true }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      assignmentPayload = response.request().postDataJSON();
      expectExactGuideAssignmentPayload(assignmentPayload);
      expect(assignmentPayload.booking_id).toBe(customerABooking.booking_id);
      const body: unknown = await response.json();
      expect(body).toHaveLength(1);
      assignmentRow = (body as unknown[])[0] as GuideAssignmentRow;
      expectExactGuideAssignmentRow(assignmentRow);
      expect(assignmentRow).toMatchObject({
        booking_id: customerABooking.booking_id,
        guide_user_id: assignmentPayload.guide_user_id,
        status: "assigned",
        outcome: "assigned",
      });
      const assignmentStatus = page.getByRole("status").filter({ hasText: "Assignment saved from authoritative data." });
      await expect(assignmentStatus).toHaveText("Assignment saved from authoritative data.");
      await expect(assignmentStatus).toBeFocused();
      await expect(target.getByText("Runtime Guide", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("region", { name: "Guide assignments" }).getByText("Runtime Guide", { exact: true })).toBeVisible();
      await expectNoDemoStorage(page);
    } finally {
      await adminContext.close();
    }

    const admin = await authenticatedClient("admin");
    const replay = await admin.rpc("assign_fixed_departure_guide", assignmentPayload);
    expect(replay.error).toBeNull();
    expect(replay.data).toHaveLength(1);
    expectExactGuideAssignmentRow((replay.data as unknown[])[0]);
    expect((replay.data as unknown[])[0]).toMatchObject({
      assignment_id: assignmentRow.assignment_id,
      booking_id: assignmentRow.booking_id,
      guide_user_id: assignmentRow.guide_user_id,
      status: assignmentRow.status,
      outcome: "replayed",
    });

    const unchanged = await admin.rpc("assign_fixed_departure_guide", {
      ...assignmentPayload,
      idempotency_key: "runtime-guide-assignment-unchanged",
    });
    expect(unchanged.error).toBeNull();
    expect(unchanged.data).toHaveLength(1);
    expect((unchanged.data as unknown[])[0]).toMatchObject({
      assignment_id: assignmentRow.assignment_id,
      outcome: "unchanged",
    });

    const payloadConflict = await admin.rpc("assign_fixed_departure_guide", {
      ...assignmentPayload,
      booking_id: customerBBooking.booking_id,
    });
    expect(payloadConflict.data).toBeNull();
    expect(payloadConflict.error?.code).toBe("P0001");
    expect(payloadConflict.error?.message).toContain("guide_assignment_idempotency_conflict");

    const scheduleConflict = await admin.rpc("assign_fixed_departure_guide", {
      booking_id: customerBBooking.booking_id,
      guide_user_id: assignmentPayload.guide_user_id,
      idempotency_key: "runtime-guide-assignment-overlap",
    });
    expect(scheduleConflict.data).toBeNull();
    expect(scheduleConflict.error?.code).toBe("P0001");
    expect(scheduleConflict.error?.message).toContain("guide_assignment_schedule_conflict");

    for (const account of ["customerA", "guide", "guideSecondary"] as const) {
      const denied = await authenticatedClient(account);
      const queue = await denied.rpc("get_admin_guide_assignment_queue");
      expect(queue.data).toBeNull();
      expect(queue.error?.code).toBe("42501");
    }

    const guideContext = await browser.newContext();
    try {
      const page = await guideContext.newPage();
      await signIn(page, "guide", "vi");
      const region = page.getByRole("region", { name: "Tour được phân công" });
      await expect(region).toBeVisible();
      await expect(region.getByText(fixture.viTitle, { exact: true })).toBeVisible();
      await expect(region.getByText(fixture.enMeetingPoint, { exact: true })).toBeVisible();
      await expect(region.getByRole("button", { name: /tiếp nhận|hoàn thành|accept|complete/i })).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("region", { name: "Tour được phân công" }).getByText(fixture.viTitle, { exact: true })).toBeVisible();
      await expectNoDemoStorage(page);
    } finally {
      await guideContext.close();
    }

    const reassignContext = await browser.newContext();
    try {
      const page = await reassignContext.newPage();
      await signIn(page, "admin", "en");
      const region = page.getByRole("region", { name: "Guide assignments" });
      const target = region.getByRole("article").filter({
        has: page.locator("dd").filter({ hasText: /^1$/ }),
      });
      await expect(target.getByText("Runtime Guide", { exact: true })).toBeVisible();

      async function submitAssignment(): Promise<{ payload: GuideAssignmentPayload; row: GuideAssignmentRow }> {
        const responsePromise = page.waitForResponse((response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/rest/v1/rpc/assign_fixed_departure_guide");
        await target.getByRole("button", { name: "Assign guide", exact: true }).click();
        const response = await responsePromise;
        expect(response.status()).toBe(200);
        const payload = response.request().postDataJSON() as GuideAssignmentPayload;
        expectExactGuideAssignmentPayload(payload);
        const body: unknown = await response.json();
        expect(body).toHaveLength(1);
        const row = (body as unknown[])[0] as GuideAssignmentRow;
        expectExactGuideAssignmentRow(row);
        await expect(page.getByRole("status").filter({ hasText: "Assignment saved from authoritative data." })).toHaveText("Assignment saved from authoritative data.");
        return { payload, row };
      }

      const sameGuide = await submitAssignment();
      expect(sameGuide.payload.guide_user_id).toBe(assignmentPayload.guide_user_id);
      expect(sameGuide.row).toMatchObject({
        assignment_id: assignmentRow.assignment_id,
        outcome: "unchanged",
      });

      await target.getByLabel(fixture.enTitle).selectOption({ label: "Runtime Guide Two · English" });
      const reassignment = await submitAssignment();
      const reassignmentPayload = reassignment.payload;
      expect(reassignmentPayload.booking_id).toBe(assignmentPayload.booking_id);
      expect(reassignmentPayload.guide_user_id).not.toBe(assignmentPayload.guide_user_id);
      reassignmentRow = reassignment.row;
      expect(reassignmentRow).toMatchObject({
        booking_id: assignmentRow.booking_id,
        guide_user_id: reassignmentPayload.guide_user_id,
        status: "assigned",
        outcome: "reassigned",
      });
      expect(reassignmentRow.assignment_id).not.toBe(assignmentRow.assignment_id);
      await expect(target.getByText("Runtime Guide Two", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("region", { name: "Guide assignments" }).getByText("Runtime Guide Two", { exact: true })).toBeVisible();
      await expectNoDemoStorage(page);

      const originalGuide = await authenticatedClient("guide");
      const originalGuideAssignments = await originalGuide.rpc("get_guide_assigned_bookings");
      expect(originalGuideAssignments.error).toBeNull();
      expect(originalGuideAssignments.data).toHaveLength(0);

      const secondaryGuideContext = await browser.newContext();
      try {
        const secondaryPage = await secondaryGuideContext.newPage();
        await signIn(secondaryPage, "guideSecondary", "en");
        const secondaryRegion = secondaryPage.getByRole("region", { name: "Your assigned tours" });
        await expect(secondaryRegion.getByText(fixture.enTitle, { exact: true })).toBeVisible();
        await expect(secondaryRegion.getByText(fixture.enMeetingPoint, { exact: true })).toBeVisible();
        await expect(secondaryRegion.getByRole("button", { name: /accept|complete|tiếp nhận|hoàn thành/i })).toHaveCount(0);
        await secondaryPage.reload();
        await expect(secondaryPage.getByRole("region", { name: "Your assigned tours" }).getByText(fixture.enTitle, { exact: true })).toBeVisible();
        await expectNoDemoStorage(secondaryPage);
      } finally {
        await secondaryGuideContext.close();
      }

      await target.getByLabel(fixture.enTitle).selectOption({ label: "Runtime Guide · Vietnamese" });
      const returned = await submitAssignment();
      expect(returned.payload.idempotency_key).not.toBe(sameGuide.payload.idempotency_key);
      expect(returned.payload.guide_user_id).toBe(assignmentPayload.guide_user_id);
      returnAssignmentRow = returned.row;
      expect(returnAssignmentRow).toMatchObject({
        booking_id: assignmentRow.booking_id,
        guide_user_id: assignmentPayload.guide_user_id,
        status: "assigned",
        outcome: "reassigned",
      });
      expect(returnAssignmentRow.assignment_id).not.toBe(assignmentRow.assignment_id);
      expect(returnAssignmentRow.assignment_id).not.toBe(reassignmentRow.assignment_id);
      await expect(target.getByText("Runtime Guide", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("region", { name: "Guide assignments" }).getByText("Runtime Guide", { exact: true })).toBeVisible();
    } finally {
      await reassignContext.close();
    }

    const finalGuideContext = await browser.newContext();
    try {
      const page = await finalGuideContext.newPage();
      await signIn(page, "guide", "vi");
      const region = page.getByRole("region", { name: "Tour được phân công" });
      await expect(region.getByText(fixture.viTitle, { exact: true })).toBeVisible();
      await expect(region.getByText(fixture.enMeetingPoint, { exact: true })).toBeVisible();
      await expect(region.getByRole("button", { name: /accept|complete|tiếp nhận|hoàn thành/i })).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("region", { name: "Tour được phân công" }).getByText(fixture.viTitle, { exact: true })).toBeVisible();
      await expectNoDemoStorage(page);
    } finally {
      await finalGuideContext.close();
    }

    const originalGuide = await authenticatedClient("guide");
    const originalAssignments = await originalGuide.rpc("get_guide_assigned_bookings");
    expect(originalAssignments.error).toBeNull();
    expect(originalAssignments.data).toHaveLength(1);
    expect((originalAssignments.data as unknown[])[0]).toMatchObject({
      assignment_id: returnAssignmentRow.assignment_id,
      booking_id: customerABooking.booking_id,
    });
    const secondaryGuide = await authenticatedClient("guideSecondary");
    const ownAssignments = await secondaryGuide.rpc("get_guide_assigned_bookings");
    expect(ownAssignments.error).toBeNull();
    expect(ownAssignments.data).toHaveLength(0);
    const adminGuideProjection = await admin.rpc("get_guide_assigned_bookings");
    expect(adminGuideProjection.data).toBeNull();
    expect(adminGuideProjection.error?.code).toBe("42501");
  });

  test("bilingual cancellation is immediate and administrator history stays read-only", async ({ browser }) => {
    const scenarios = [
      { account: "customerA" as const, locale: "en" as const, title: fixture.enTitle, meetingPoint: fixture.enMeetingPoint },
      { account: "customerB" as const, locale: "vi" as const, title: fixture.viTitle, meetingPoint: fixture.viMeetingPoint },
    ];

    for (const scenario of scenarios) {
      const customerContext = await browser.newContext();
      let bookingId = "";
      try {
        const page = await customerContext.newPage();
        await signIn(page, scenario.account, scenario.locale);
        const hold = await createHoldThroughUi(page, {
          locale: scenario.locale,
          partySize: 1,
          seatsRemaining: 5,
          title: scenario.title,
          meetingPoint: scenario.meetingPoint,
        });
        bookingId = hold.row.booking_id;
        const copy = fixedTourRuntimeCopy(scenario.locale);
        const cancellationCopy = bookingCancellationCopy(scenario.locale);
        const article = page.locator(
          `article[aria-labelledby="runtime-booking-${bookingId}"]`,
        );
        await expect(article).toHaveCount(1);
        await article.getByRole("button", { name: cancellationCopy.trigger, exact: true }).click();
        const dialog = page.getByRole("dialog", { name: cancellationCopy.title });
        await dialog.getByRole("combobox", { name: cancellationCopy.reasonLabel }).selectOption("trip_plan_changed");
        const responsePromise = page.waitForResponse((response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/rest/v1/rpc/cancel_booking");
        await dialog.getByRole("button", { name: cancellationCopy.confirm, exact: true }).click();
        const response = await responsePromise;
        expect(response.status()).toBe(200);
        const payload = response.request().postDataJSON();
        expectExactCancellationPayload(payload);
        expect(payload).toMatchObject({ booking_id: bookingId, reason_code: "trip_plan_changed" });
        const responseBody: unknown = await response.json();
        expect(responseBody).toHaveLength(1);
        const row = (responseBody as unknown[])[0];
        expectExactCancellationRow(row);
        expect(row).toMatchObject({ booking_id: bookingId, reason_code: "trip_plan_changed", booking_status: "cancelled" });
        await expect(article.getByText(copy.bookingStatusLabels.cancelled, { exact: true }).first()).toBeVisible();
        await expect(article.getByText(cancellationCopy.cancelledStatus, { exact: true }).first()).toBeVisible();
        await expect(article.getByText(cancellationCopy.reason, { exact: true })).toBeVisible();
        await expect(page.getByRole("status")).toHaveText(cancellationCopy.success);
      } finally {
        await customerContext.close();
      }

      const adminContext = await browser.newContext();
      try {
        const page = await adminContext.newPage();
        await signIn(page, "admin", scenario.locale);
        const copy = fixedTourRuntimeCopy(scenario.locale);
        const cancellationCopy = bookingCancellationCopy(scenario.locale);
        const bookingManagement = page.getByRole("region", { name: cancellationCopy.bookingManagement });
        const bookingItem = bookingManagement
          .getByRole("article", { name: scenario.title })
          .filter({ hasText: bookingId });
        await expect(bookingItem).toContainText(bookingId);
        await expect(bookingItem).toContainText(copy.bookingStatusLabels.cancelled);
        await expect(bookingItem).toContainText(cancellationCopy.reason);
        await expect(bookingItem.getByRole("button")).toHaveCount(0);
        await expect(bookingItem.getByRole("textbox")).toHaveCount(0);
        await expect(bookingItem.getByRole("combobox")).toHaveCount(0);
      } finally {
        await adminContext.close();
      }

      const verifyContext = await browser.newContext();
      try {
        const page = await verifyContext.newPage();
        await signIn(page, scenario.account, scenario.locale);
        const copy = fixedTourRuntimeCopy(scenario.locale);
        const cancellationCopy = bookingCancellationCopy(scenario.locale);
        const article = page.locator(`article[aria-labelledby="runtime-booking-${bookingId}"]`);
        await expect(article).toHaveCount(1);
        await expect(article.getByText(copy.bookingStatusLabels.cancelled, { exact: true }).first()).toBeVisible();
        await expect(article.getByRole("button", { name: cancellationCopy.trigger, exact: true })).toHaveCount(0);
      } finally {
        await verifyContext.close();
      }
    }
  });
});
