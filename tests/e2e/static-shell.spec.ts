import { expect, test } from "@playwright/test";

const localizedShells = [
  {
    locale: "en",
    heading: "Your Saigon, planned around you",
    navigation: "Primary navigation",
    skipLink: "Skip to content",
    links: ["Tours", "Personalized trip", "How it works"],
    hrefs: ["/en/tours/", "/en/planner/", "/en/#how-it-works"],
  },
  {
    locale: "vi",
    heading: "Sài Gòn của bạn, được thiết kế quanh bạn",
    navigation: "Điều hướng chính",
    skipLink: "Bỏ qua đến nội dung chính",
    links: ["Tour", "Hành trình cá nhân hóa", "Cách hoạt động"],
    hrefs: ["/vi/tours/", "/vi/planner/", "/vi/#how-it-works"],
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
    for (const [index, link] of shell.links.entries()) {
      await expect(primaryNavigation.getByRole("link", { name: link })).toHaveAttribute("href", shell.hrefs[index]);
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
