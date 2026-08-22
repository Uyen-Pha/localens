import { expect, test } from "@playwright/test";

const localizedShells = [
  {
    locale: "en",
    heading: "Discover Ho Chi Minh City through local eyes.",
    navigation: "Primary navigation",
    skipLink: "Skip to content",
    links: ["Explore", "Fixed tours", "Plan my trip"],
  },
  {
    locale: "vi",
    heading: "Khám phá Thành phố Hồ Chí Minh qua góc nhìn người bản địa.",
    navigation: "Điều hướng chính",
    skipLink: "Bỏ qua đến nội dung chính",
    links: ["Khám phá", "Tour cố định", "Lên kế hoạch chuyến đi"],
  },
] as const;

for (const shell of localizedShells) {
  test(`${shell.locale} serves the localized static shell`, async ({ page }) => {
    const response = await page.goto(`/${shell.locale}/`);

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: shell.heading })).toBeVisible();

    const primaryNavigation = page.getByRole("navigation", {
      name: shell.navigation,
    });
    await expect(primaryNavigation).toBeVisible();
    for (const link of shell.links) {
      await expect(primaryNavigation.getByRole("link", { name: link })).toBeVisible();
    }

    const skipLink = page.getByRole("link", { name: shell.skipLink });
    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
  });
}

test("unsupported locales serve the static 404 page", async ({ page }) => {
  const response = await page.goto("/fr/");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /404/i })).toBeVisible();
});
