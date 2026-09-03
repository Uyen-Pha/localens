import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";

import type { Database } from "@/lib/infrastructure/supabase/database.types";

const accounts = {
  customer: { email: "customer.runtime@localens.test", passwordEnv: "LOCALENS_RUNTIME_CUSTOMER_PASSWORD" },
  guideA: { email: "guide.runtime@localens.test", passwordEnv: "LOCALENS_RUNTIME_GUIDE_PASSWORD" },
  guideB: { email: "guide-secondary.runtime@localens.test", passwordEnv: "LOCALENS_RUNTIME_GUIDE_PASSWORD" },
  admin: { email: "admin.runtime@localens.test", passwordEnv: "LOCALENS_RUNTIME_ADMIN_PASSWORD" },
} as const;

const fixture = {
  departureId: "b2200000-0000-4000-8000-000000000043",
  titleEn: "Runtime Test Markets and Street Food",
  titleVi: "Chợ và ẩm thực đường phố kiểm thử",
  meetingPoint: "Runtime-test meeting point",
} as const;

type Account = keyof typeof accounts;
type RuntimeClient = SupabaseClient<Database>;
type AssignmentPayload = { booking_id: string; guide_user_id: string; idempotency_key: string };
type AssignmentRow = {
  assignment_id: string;
  booking_id: string;
  guide_user_id: string;
  status: "assigned" | "accepted";
  outcome: "assigned" | "reassigned" | "unchanged" | "replayed";
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for isolated guide-assignment acceptance`);
  return value;
}

function client(): RuntimeClient {
  return createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
  );
}

async function authenticatedClient(account: Account): Promise<RuntimeClient> {
  const runtime = client();
  const { error } = await runtime.auth.signInWithPassword({
    email: accounts[account].email,
    password: requiredEnv(accounts[account].passwordEnv),
  });
  expect(error).toBeNull();
  return runtime;
}

async function signIn(page: Page, account: Account, locale: "en" | "vi"): Promise<void> {
  await page.goto(`/${locale}/sign-in/`);
  await page.getByRole("textbox", { name: "Email" }).fill(accounts[account].email);
  await page.getByLabel(locale === "vi" ? "Mật khẩu" : "Password")
    .fill(requiredEnv(accounts[account].passwordEnv));
  await page.getByRole("button", {
    name: locale === "vi" ? "Đăng nhập" : "Sign in",
    exact: true,
  }).click();
  const destination = account === "admin" ? "admin" : account.startsWith("guide") ? "guide" : "account";
  await expect(page).toHaveURL(new RegExp(`/${locale}/${destination}/?(?:\\?.*)?$`));
}

async function expectNoDemoStorage(page: Page): Promise<void> {
  expect(await page.evaluate(() => ({
    local: Object.keys(localStorage).filter((key) => key.startsWith("localens.portal.demo")),
    session: Object.keys(sessionStorage).filter((key) => key.startsWith("localens.portal.demo")),
  }))).toEqual({ local: [], session: [] });
  await expect(page.getByRole("button", { name: /Reset LocalLens demo|Đặt lại bản demo LocalLens/i })).toHaveCount(0);
}

async function createConfirmedBooking(): Promise<string> {
  const customer = await authenticatedClient("customer");
  const hold = await customer.rpc("begin_fixed_tour_booking", {
    departure_id: fixture.departureId,
    party_size: 1,
    booking_locale: "en",
    idempotency_key: "runtime-guide-assignment-isolated-hold",
  });
  expect(hold.error).toBeNull();
  expect(hold.data).toHaveLength(1);
  const bookingId = (hold.data as Array<{ booking_id: string }>)[0]!.booking_id;
  const payment = await customer.rpc("complete_simulated_fixed_tour_payment", {
    booking_id: bookingId,
    idempotency_key: "runtime-guide-assignment-isolated-payment",
  });
  expect(payment.error).toBeNull();
  expect(payment.data).toHaveLength(1);
  expect((payment.data as Array<{ booking_status: string }>)[0]?.booking_status).toBe("confirmed");
  return bookingId;
}

async function expectGuideSchedule(
  browser: Browser,
  account: "guideA" | "guideB",
  locale: "en" | "vi",
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signIn(page, account, locale);
    const heading = locale === "vi" ? "Tour được phân công" : "Your assigned tours";
    const title = locale === "vi" ? fixture.titleVi : fixture.titleEn;
    const region = page.getByRole("region", { name: heading });
    await expect(region.getByText(title, { exact: true })).toBeVisible();
    await expect(region.getByText(fixture.meetingPoint, { exact: true })).toBeVisible();
    await expect(region.getByRole("button", { name: /accept|complete|tiếp nhận|hoàn thành/i })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("region", { name: heading }).getByText(title, { exact: true })).toBeVisible();
    await expectNoDemoStorage(page);
  } finally {
    await context.close();
  }
}

test("isolated B2.4 assigns A, reassigns B, then safely returns to A with cross-guide isolation", async ({ browser }) => {
  const bookingId = await createConfirmedBooking();
  const adminContext = await browser.newContext();
  try {
    const page = await adminContext.newPage();
    await signIn(page, "admin", "en");
    const region = page.getByRole("region", { name: "Guide assignments" });
    const target = region.getByRole("article").filter({ hasText: fixture.titleEn });
    await expect(target).toHaveCount(1);

    async function submit(): Promise<{ payload: AssignmentPayload; row: AssignmentRow }> {
      const responsePromise = page.waitForResponse((response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/rest/v1/rpc/assign_fixed_departure_guide");
      await target.getByRole("button", { name: "Assign guide", exact: true }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      const payload = response.request().postDataJSON() as AssignmentPayload;
      expect(Object.keys(payload).sort()).toEqual(["booking_id", "guide_user_id", "idempotency_key"]);
      expect(payload.booking_id).toBe(bookingId);
      const body: unknown = await response.json();
      expect(body).toHaveLength(1);
      const row = (body as AssignmentRow[])[0]!;
      expect(Object.keys(row).sort()).toEqual([
        "assignment_id", "booking_id", "guide_user_id", "outcome", "status",
      ]);
      const assignmentStatus = page
        .getByRole("status")
        .filter({ hasText: "Assignment saved from authoritative data." });
      await expect(assignmentStatus).toHaveText("Assignment saved from authoritative data.");
      return { payload, row };
    }

    const firstA = await submit();
    expect(firstA.row.outcome).toBe("assigned");
    expect(firstA.row.guide_user_id).toBe(firstA.payload.guide_user_id);
    const noOpA = await submit();
    expect(noOpA.row).toMatchObject({ assignment_id: firstA.row.assignment_id, outcome: "unchanged" });

    await target.getByLabel(fixture.titleEn).selectOption({ label: "Runtime Guide Two · English" });
    const assignedB = await submit();
    expect(assignedB.row.outcome).toBe("reassigned");
    expect(assignedB.row.guide_user_id).not.toBe(firstA.row.guide_user_id);
    await expect(target.getByText("Runtime Guide Two", { exact: true })).toBeVisible();

    const guideA = await authenticatedClient("guideA");
    const guideAWhileB = await guideA.rpc("get_guide_assigned_bookings");
    expect(guideAWhileB.error).toBeNull();
    expect(guideAWhileB.data).toHaveLength(0);
    await expectGuideSchedule(browser, "guideB", "en");

    await target.getByLabel(fixture.titleEn).selectOption({ label: "Runtime Guide · Vietnamese" });
    const returnedA = await submit();
    expect(returnedA.row.outcome).toBe("reassigned");
    expect(returnedA.row.guide_user_id).toBe(firstA.row.guide_user_id);
    expect(returnedA.payload.idempotency_key).not.toBe(noOpA.payload.idempotency_key);
    expect(returnedA.row.assignment_id).not.toBe(firstA.row.assignment_id);
    expect(returnedA.row.assignment_id).not.toBe(assignedB.row.assignment_id);
    await page.reload();
    await expect(page.getByRole("region", { name: "Guide assignments" }).getByText("Runtime Guide", { exact: true })).toBeVisible();
    await expectNoDemoStorage(page);
  } finally {
    await adminContext.close();
  }

  const guideB = await authenticatedClient("guideB");
  const guideBAfterReturn = await guideB.rpc("get_guide_assigned_bookings");
  expect(guideBAfterReturn.error).toBeNull();
  expect(guideBAfterReturn.data).toHaveLength(0);
  const directProfiles = await guideB.from("guide_profiles").select("user_id");
  expect(directProfiles.data).toBeNull();
  expect(directProfiles.error?.code).toBe("42501");
  await expectGuideSchedule(browser, "guideA", "vi");
});
