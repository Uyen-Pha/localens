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

async function expectPersistedRole(
  page: Page,
  context: BrowserContext,
  options: { locale: "en" | "vi"; route: "account" | "guide" | "admin"; displayName: string },
): Promise<void> {
  const heading = options.locale === "vi" ? "Cổng bảo mật của bạn" : "Your secure portal";
  const disclosure = options.locale === "vi"
    ? "Runtime bảo mật đã kết nối. Dữ liệu nghiệp vụ của cổng sẽ được bật ở lát cắt đã kiểm chứng tiếp theo."
    : "Secure runtime connected. Operational portal data is enabled in the next verified slice.";
  await page.reload();
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(page.getByText(options.displayName, { exact: true })).toBeVisible();
  await expect(page.getByText(disclosure, { exact: true })).toBeVisible();
  await expectRuntimeIsolation(page);

  const secondPage = await context.newPage();
  await secondPage.goto(`/${options.locale}/${options.route}/`);
  await expect(secondPage.getByRole("heading", { name: heading })).toBeVisible();
  await expect(secondPage.getByText(options.displayName, { exact: true })).toBeVisible();
  await expect(secondPage.getByText(disclosure, { exact: true })).toBeVisible();
  await expectRuntimeIsolation(secondPage);
  await secondPage.close();
}

async function expectDeniedRoutes(
  page: Page,
  options: {
    locale: "en" | "vi";
    routes: readonly ("account" | "guide" | "admin")[];
    ownRoute: "account" | "guide" | "admin";
    ownDisplayName: string;
    ownRoleLabel: string;
    otherDisplayNames: readonly string[];
  },
): Promise<void> {
  const heading = options.locale === "vi" ? "Truy cập bị từ chối" : "Access denied";
  const linkName = options.locale === "vi" ? "Mở cổng của bạn" : "Open your portal";
  const runtimeHeading = options.locale === "vi" ? "Cổng bảo mật của bạn" : "Your secure portal";
  const roleTerm = options.locale === "vi" ? "Vai trò" : "Role";
  const disclosure = options.locale === "vi"
    ? "Runtime bảo mật đã kết nối. Dữ liệu nghiệp vụ của cổng sẽ được bật ở lát cắt đã kiểm chứng tiếp theo."
    : "Secure runtime connected. Operational portal data is enabled in the next verified slice.";
  for (const route of options.routes) {
    await page.goto(`/${options.locale}/${route}/`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    const recoveryLink = page.getByRole("link", { name: linkName, exact: true });
    await expect(recoveryLink).toHaveAttribute(
      "href",
      `/${options.locale}/${options.ownRoute}/`,
    );
    for (const displayName of options.otherDisplayNames) {
      await expect(page.getByText(displayName, { exact: true })).toHaveCount(0);
    }
    await expectRuntimeIsolation(page);
    await recoveryLink.click();
    await expect(page).toHaveURL(new RegExp(`/${options.locale}/${options.ownRoute}/?$`));
    await expect(page.getByRole("heading", { name: runtimeHeading })).toBeVisible();
    await expect(page.getByText(options.ownDisplayName, { exact: true })).toBeVisible();
    const roleEntry = page.getByText(roleTerm, { exact: true }).locator("..");
    await expect(roleEntry.getByText(options.ownRoleLabel, { exact: true })).toBeVisible();
    await expect(page.getByText(disclosure, { exact: true })).toBeVisible();
    await expectRuntimeIsolation(page);
  }
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

  test("customer persists across reload/new page and is denied guide and admin routes", async () => {
    await signIn(page, "customer", "en");
    await expect(page).toHaveURL(/\/en\/account\/?$/);
    await expect(page.getByRole("heading", { name: "Your secure portal" })).toBeVisible();
    await expect(page.getByText("Runtime Traveler", { exact: true })).toBeVisible();

    await expectPersistedRole(page, context, {
      locale: "en", route: "account", displayName: "Runtime Traveler",
    });
    await expectDeniedRoutes(page, {
      locale: "en",
      routes: ["guide", "admin"],
      ownRoute: "account",
      ownDisplayName: "Runtime Traveler",
      ownRoleLabel: "Customer",
      otherDisplayNames: ["Runtime Guide", "Runtime Administrator"],
    });
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in to LocalLens" })).toBeVisible();
  });

  test("guide uses Vietnamese UI, persists, and is denied customer and admin routes", async () => {
    await signIn(page, "guide", "vi");
    await expect(page).toHaveURL(/\/vi\/guide\/?$/);
    await expect(page.getByRole("heading", { name: "Cổng bảo mật của bạn" })).toBeVisible();
    await expect(page.getByText("Runtime Guide", { exact: true })).toBeVisible();
    await expectPersistedRole(page, context, {
      locale: "vi", route: "guide", displayName: "Runtime Guide",
    });
    await expectDeniedRoutes(page, {
      locale: "vi",
      routes: ["account", "admin"],
      ownRoute: "guide",
      ownDisplayName: "Runtime Guide",
      ownRoleLabel: "Hướng dẫn viên",
      otherDisplayNames: ["Runtime Traveler", "Runtime Administrator"],
    });
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page.getByRole("heading", { name: "Đăng nhập LocalLens" })).toBeVisible();
  });

  test("administrator persists across reload/new page and is denied customer and guide routes", async () => {
    await signIn(page, "admin", "en");
    await expect(page).toHaveURL(/\/en\/admin\/?$/);
    await expect(page.getByRole("heading", { name: "Your secure portal" })).toBeVisible();
    await expect(page.getByText("Runtime Administrator", { exact: true })).toBeVisible();

    await expectPersistedRole(page, context, {
      locale: "en", route: "admin", displayName: "Runtime Administrator",
    });
    await expectDeniedRoutes(page, {
      locale: "en",
      routes: ["account", "guide"],
      ownRoute: "admin",
      ownDisplayName: "Runtime Administrator",
      ownRoleLabel: "Administrator",
      otherDisplayNames: ["Runtime Traveler", "Runtime Guide"],
    });
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in to LocalLens" })).toBeVisible();
  });
});
