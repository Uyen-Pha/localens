import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { portalCopy } from "@/components/portals/portal-copy";

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
  await page.getByLabel(locale === "vi" ? "Mật khẩu" : "Password", { exact: true }).fill(passwordFor(role));
  await page.getByRole("button", { name: locale === "vi" ? "Đăng nhập" : "Sign in", exact: true }).click();
}

async function expectPersistedRole(
  page: Page,
  context: BrowserContext,
  options: { locale: "en" | "vi"; route: "account" | "guide" | "admin"; displayName: string },
): Promise<void> {
  await page.reload();
  await expectRoleReady(page, options);
  await expectRuntimeIsolation(page);

  const secondPage = await context.newPage();
  await secondPage.goto(`/${options.locale}/${options.route}/`);
  await expectRoleReady(secondPage, options);
  await expectRuntimeIsolation(secondPage);
  await secondPage.close();
}

async function expectRoleReady(
  page: Page,
  options: { locale: "en" | "vi"; route: "account" | "guide" | "admin"; displayName: string },
): Promise<void> {
  const vi = options.locale === "vi";
  await expect(page).toHaveURL(new RegExp(`/${options.locale}/${options.route}/?$`));
  const main = page.getByRole("main");
  if (options.route === "account") {
    await expect(main.getByRole("heading", { name: `${vi ? "Xin chào" : "Hello"}, ${options.displayName}!`, exact: true })).toBeVisible();
    const profile = main.getByRole("region", { name: vi ? "Thông tin cá nhân & bảo mật" : "Personal information & security", exact: true });
    await expect(profile.getByText(options.displayName, { exact: true })).toBeVisible();
    await expect(profile.getByText(accounts.customer.email, { exact: true })).toBeVisible();
  } else if (options.route === "guide") {
    await expect(main.getByRole("heading", { name: vi ? "Cổng hướng dẫn viên" : "Guide portal", exact: true })).toBeVisible();
    await main.getByRole("navigation", { name: vi ? "Khu vực hướng dẫn viên" : "Guide navigation", exact: true })
      .getByRole("button", { name: vi ? "Thông tin cá nhân Xem và cập nhật thông tin liên hệ" : "Personal information View and update your contact information", exact: true }).click();
    const profile = main.getByRole("region", { name: vi ? "Thông tin cá nhân" : "Personal information", exact: true });
    await expect(profile.getByText(options.displayName, { exact: true })).toBeVisible();
    await expect(profile.getByText(accounts.guide.email, { exact: true })).toBeVisible();
    await expect(main.getByText(vi ? "Vai trò" : "Role", { exact: true }).locator("..").getByText(vi ? "Hướng dẫn viên" : "Guide", { exact: true })).toBeVisible();
  } else {
    // The current Admin prototype uses Vietnamese navigation in both locales.
    await expect(main.getByRole("heading", { name: "Tổng quan quản trị", exact: true })).toBeVisible();
    const email = main.locator("header").getByText(accounts.admin.email, { exact: true });
    await expect(email).toBeVisible();
    await expect(email.locator("..")).toHaveText(`${options.displayName}${accounts.admin.email}`);
  }
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
  for (const route of options.routes) {
    await page.goto(`/${options.locale}/${route}/`);
    if (route === "account") {
      // CustomerAccount rejects staff by redirecting, not by rendering the portal denial screen.
      await expectRoleReady(page, { locale: options.locale, route: options.ownRoute, displayName: options.ownDisplayName });
      await expect(page.getByRole("heading", { name: options.locale === "vi" ? "Thông tin cá nhân & bảo mật" : "Personal information & security", exact: true })).toHaveCount(0);
      for (const displayName of options.otherDisplayNames) {
        await expect(page.getByText(displayName, { exact: true })).toHaveCount(0);
      }
      await expectRuntimeIsolation(page);
      continue;
    }
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    const articleSuffix = options.locale === "en" && options.ownRoute === "admin" ? "n" : "";
    await expect(page.getByText(`${portalCopy(options.locale).signedInAsRole}${articleSuffix} ${options.ownRoleLabel}.`, { exact: true })).toBeVisible();
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
    await expectRoleReady(page, { locale: options.locale, route: options.ownRoute, displayName: options.ownDisplayName });
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
    await expectRoleReady(page, { locale: "en", route: "account", displayName: "Runtime Traveler" });

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
    await page.getByRole("button", { name: "Open account menu", exact: true }).click();
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/sign-in\/?$/);
    await expect(page.getByRole("heading", { name: "Sign in to LocalLens" })).toBeVisible();
  });

  test("guide uses Vietnamese UI, persists, and is denied customer and admin routes", async () => {
    await signIn(page, "guide", "vi");
    await expect(page).toHaveURL(/\/vi\/guide\/?$/);
    await expectRoleReady(page, { locale: "vi", route: "guide", displayName: "Runtime Guide" });
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
    await expect(page.getByRole("heading", { name: "Cổng hướng dẫn viên", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Đăng nhập LocalLens" })).toBeVisible();
  });

  test("administrator persists across reload/new page and is denied customer and guide routes", async () => {
    await signIn(page, "admin", "en");
    await expect(page).toHaveURL(/\/en\/admin\/?$/);
    await expectRoleReady(page, { locale: "en", route: "admin", displayName: "Runtime Administrator" });

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
    await expect(page.getByRole("heading", { name: "Tổng quan quản trị", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Sign in to LocalLens" })).toBeVisible();
  });
});
