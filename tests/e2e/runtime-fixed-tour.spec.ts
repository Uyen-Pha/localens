import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page, type Request } from "@playwright/test";

import type { Database } from "@/lib/infrastructure/supabase/database.types";
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
type CancellationRequestPayload = { booking_id: string; reason: string; idempotency_key: string };
type CancellationRequestRow = {
  request_id: string;
  booking_id: string;
  status: "pending";
  reason: string;
  requested_at: string;
  state: "created" | "replayed";
};
type CancellationDecisionPayload = {
  request_id: string;
  decision: "approved" | "rejected";
  note: string | null;
  idempotency_key: string;
};
type CancellationDecisionRow = {
  request_id: string;
  booking_id: string;
  request_status: "approved" | "rejected";
  booking_status: Database["public"]["Enums"]["booking_status"];
  decision_note: string | null;
  decided_at: string;
  state: "approved" | "rejected" | "replayed";
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
  const destination = account === "admin" ? "admin" : account === "guide" ? "guide" : "account";
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

function expectExactCancellationRequestPayload(value: unknown): asserts value is CancellationRequestPayload {
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([
    "booking_id",
    "idempotency_key",
    "reason",
  ]);
  expect(value).toEqual(expect.objectContaining({
    booking_id: expect.any(String),
    reason: expect.any(String),
    idempotency_key: expect.any(String),
  }));
}

function expectExactCancellationRequestRow(value: unknown): asserts value is CancellationRequestRow {
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([
    "booking_id",
    "reason",
    "request_id",
    "requested_at",
    "state",
    "status",
  ]);
  expect(value).toEqual(expect.objectContaining({
    request_id: expect.any(String),
    booking_id: expect.any(String),
    status: "pending",
    reason: expect.any(String),
    requested_at: expect.any(String),
    state: expect.stringMatching(/^(?:created|replayed)$/),
  }));
}

function expectExactCancellationDecisionPayload(value: unknown): asserts value is CancellationDecisionPayload {
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([
    "decision",
    "idempotency_key",
    "note",
    "request_id",
  ]);
  expect(value).toEqual(expect.objectContaining({
    request_id: expect.any(String),
    decision: expect.stringMatching(/^(?:approved|rejected)$/),
    idempotency_key: expect.any(String),
  }));
}

function expectExactCancellationDecisionRow(value: unknown): asserts value is CancellationDecisionRow {
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([
    "booking_id",
    "booking_status",
    "decided_at",
    "decision_note",
    "request_id",
    "request_status",
    "state",
  ]);
  expect(value).toEqual(expect.objectContaining({
    request_id: expect.any(String),
    booking_id: expect.any(String),
    request_status: expect.stringMatching(/^(?:approved|rejected)$/),
    booking_status: expect.stringMatching(/^(?:cancelled|pending_payment)$/),
    decided_at: expect.any(String),
    state: expect.stringMatching(/^(?:approved|rejected|replayed)$/),
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

  test("bilingual cancellation remains a request until an administrator decides", async ({ browser }) => {
    const scenarios = [
      { account: "customerA" as const, locale: "en" as const, title: fixture.enTitle, meetingPoint: fixture.enMeetingPoint, reason: "B2.3 English approval", note: "Approved after review.", decision: "approved" as const },
      { account: "customerB" as const, locale: "vi" as const, title: fixture.viTitle, meetingPoint: fixture.viMeetingPoint, reason: "B2.3 Vietnamese rejection", note: "Từ chối sau khi xem xét.", decision: "rejected" as const },
    ];

    for (const scenario of scenarios) {
      const customerContext = await browser.newContext();
      let bookingId = "";
      let requestId = "";
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
        const article = page.locator(
          `article[aria-labelledby="runtime-booking-${bookingId}"]`,
        );
        await expect(article).toHaveCount(1);
        await article.getByRole("button", { name: copy.requestCancellation, exact: true }).click();
        await expect(article.getByRole("note", { name: copy.cancellationWorkflowLabel })).toHaveText(copy.cancellationDisclosure);
        await article.getByRole("textbox", { name: copy.cancellationReason }).fill(scenario.reason);
        const responsePromise = page.waitForResponse((response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/rest/v1/rpc/request_fixed_tour_cancellation");
        await article.getByRole("button", { name: copy.sendCancellation, exact: true }).click();
        const response = await responsePromise;
        expect(response.status()).toBe(200);
        const payload = response.request().postDataJSON();
        expectExactCancellationRequestPayload(payload);
        expect(payload).toMatchObject({ booking_id: bookingId, reason: scenario.reason });
        const responseBody: unknown = await response.json();
        expect(responseBody).toHaveLength(1);
        const row = (responseBody as unknown[])[0];
        expectExactCancellationRequestRow(row);
        expect(row).toMatchObject({ booking_id: bookingId, reason: scenario.reason, status: "pending" });
        requestId = row.request_id;
        await expect(article.getByText(copy.cancellationStatusLabels.pending, { exact: true })).toBeVisible();
        await expect(article.getByText(copy.bookingStatusLabels.pending_payment, { exact: true })).toBeVisible();
        await expect(page.getByRole("status")).toHaveText(copy.cancellationSent);
      } finally {
        await customerContext.close();
      }

      const adminContext = await browser.newContext();
      try {
        const page = await adminContext.newPage();
        await signIn(page, "admin", scenario.locale);
        const copy = fixedTourRuntimeCopy(scenario.locale);
        const queueItem = page.getByRole("article").filter({ hasText: scenario.reason });
        await expect(queueItem).toHaveCount(1);
        await queueItem.getByRole("textbox", { name: copy.decisionNote }).fill(scenario.note);
        const action = scenario.decision === "approved" ? copy.approveCancellation : copy.rejectCancellation;
        const responsePromise = page.waitForResponse((response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/rest/v1/rpc/decide_fixed_tour_cancellation");
        await queueItem.getByRole("button", { name: action, exact: true }).click();
        const response = await responsePromise;
        expect(response.status()).toBe(200);
        const payload = response.request().postDataJSON();
        expectExactCancellationDecisionPayload(payload);
        expect(payload).toMatchObject({ request_id: requestId, decision: scenario.decision, note: scenario.note });
        const responseBody: unknown = await response.json();
        expect(responseBody).toHaveLength(1);
        const row = (responseBody as unknown[])[0];
        expectExactCancellationDecisionRow(row);
        expect(row).toMatchObject({
          request_id: requestId,
          booking_id: bookingId,
          request_status: scenario.decision,
          booking_status: scenario.decision === "approved" ? "cancelled" : "pending_payment",
          decision_note: scenario.note,
        });
        await expect(queueItem.getByText(copy.cancellationStatusLabels[scenario.decision], { exact: true })).toBeVisible();
        await expect(page.getByRole("status")).toHaveText(copy.cancellationDecisionSaved);
      } finally {
        await adminContext.close();
      }

      const verifyContext = await browser.newContext();
      try {
        const page = await verifyContext.newPage();
        await signIn(page, scenario.account, scenario.locale);
        const copy = fixedTourRuntimeCopy(scenario.locale);
        const article = page.getByRole("article").filter({ hasText: scenario.reason });
        await expect(article).toHaveCount(1);
        await expect(article.getByText(copy.cancellationStatusLabels[scenario.decision], { exact: true })).toBeVisible();
        await expect(article.getByText(
          scenario.decision === "approved" ? copy.bookingStatusLabels.cancelled : copy.bookingStatusLabels.pending_payment,
          { exact: true },
        )).toBeVisible();
        await expect(article.getByRole("button", { name: copy.requestCancellation, exact: true })).toHaveCount(0);
      } finally {
        await verifyContext.close();
      }
    }
  });
});
