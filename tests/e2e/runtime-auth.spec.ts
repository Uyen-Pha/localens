import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const accounts = {
  customer: {
    email: "customer.runtime@localens.test",
    passwordEnv: "LOCALENS_RUNTIME_CUSTOMER_PASSWORD",
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

function passwordFor(role: keyof typeof accounts): string {
  const value = process.env[accounts[role].passwordEnv];
  if (!value) throw new Error(`${accounts[role].passwordEnv} is required for local runtime Auth E2E`);
  return value;
}

async function expectRuntimeIsolation(page: Page): Promise<void> {
  const ownedKeys = await page.evaluate(() => ({
    local: Object.keys(localStorage).filter((key) => key.startsWith("localens.portal.demo")),
    session: Object.keys(sessionStorage).filter((key) => key.startsWith("localens.portal.demo")),
  }));
  expect(ownedKeys).toEqual({ local: [], session: [] });
  await expect(page.getByText(/Choose a demo identity|Chọn danh tính demo/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Reset LocalLens demo|Đặt lại bản demo LocalLens/i })).toHaveCount(0);
  await expect(page.getByText(/seeded demo identities|danh tính demo được tạo sẵn/i)).toHaveCount(0);
}

async function signIn(page: Page, role: keyof typeof accounts, locale: "en" | "vi"): Promise<void> {
  await page.goto(`/${locale}/sign-in/`);
  await expect(page.getByRole("heading", { name: locale === "vi" ? "Đăng nhập LocalLens" : "Sign in to LocalLens" })).toBeVisible();
  await page.getByRole("textbox", { name: "Email" }).fill(accounts[role].email);
  await page.getByLabel(locale === "vi" ? "Mật khẩu" : "Password").fill(passwordFor(role));
  await page.getByRole("button", { name: locale === "vi" ? "Đăng nhập" : "Sign in", exact: true }).click();
}

test.describe.configure({ mode: "serial" });

test.describe("local Supabase runtime authentication", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("customer session persists across reload and a new page while admin access is denied", async () => {
    await signIn(page, "customer", "en");
    await expect(page).toHaveURL(/\/en\/account\/?$/);
    await expect(page.getByRole("heading", { name: "Your secure portal" })).toBeVisible();
    await expect(page.getByText("Runtime Traveler", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Your secure portal" })).toBeVisible();

    const secondPage = await context.newPage();
    await secondPage.goto("/en/account/");
    await expect(secondPage.getByRole("heading", { name: "Your secure portal" })).toBeVisible();
    await expect(secondPage.getByText("Runtime Traveler", { exact: true })).toBeVisible();
    await expectRuntimeIsolation(secondPage);
    await secondPage.close();

    await page.goto("/en/admin/");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(page.getByText("Runtime Administrator", { exact: true })).toHaveCount(0);
    await expectRuntimeIsolation(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in to LocalLens" })).toBeVisible();
  });

  test("guide signs in through Vietnamese runtime UI and signs out", async () => {
    await signIn(page, "guide", "vi");
    await expect(page).toHaveURL(/\/vi\/guide\/?$/);
    await expect(page.getByRole("heading", { name: "Cổng bảo mật của bạn" })).toBeVisible();
    await expect(page.getByText("Runtime Guide", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Runtime bảo mật đã kết nối. Dữ liệu nghiệp vụ của cổng sẽ được bật ở lát cắt đã kiểm chứng tiếp theo.", { exact: true })).toBeVisible();
    await expectRuntimeIsolation(page);
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page.getByRole("heading", { name: "Đăng nhập LocalLens" })).toBeVisible();
  });

  test("administrator reaches the admin shell but is denied the customer route", async () => {
    await signIn(page, "admin", "en");
    await expect(page).toHaveURL(/\/en\/admin\/?$/);
    await expect(page.getByRole("heading", { name: "Your secure portal" })).toBeVisible();
    await expect(page.getByText("Runtime Administrator", { exact: true })).toBeVisible();

    await page.goto("/en/account/");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(page.getByText("Runtime Traveler", { exact: true })).toHaveCount(0);
    await expectRuntimeIsolation(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in to LocalLens" })).toBeVisible();
  });
});
