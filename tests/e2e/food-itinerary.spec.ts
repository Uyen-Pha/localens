import { expect, test, type Locator, type Page } from "@playwright/test";

import { E2E_PLANNER_STATE_SESSION_KEY } from "@/lib/application/planner/demo-planner";
import { PERSONALIZATION_SESSION_KEY } from "@/lib/application/planner/personalization-session";
import { getDictionary, type CustomRequestCopy, type PlannerCopy } from "@/lib/i18n/dictionaries";
import { FOOD_FIXTURE, createFoodFixturePlannerState } from "./food-fixture";

const UNIT_RANGE_PATTERN = /45[.,]000.*60[.,]000/;
const GROUP_RANGE_PATTERN = /135[.,]000.*180[.,]000/;

function formatVnd(value: number, locale: "en" | "vi"): string {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

async function seedPlanner(
  page: Page,
  locale: "en" | "vi",
  scenario: Parameters<typeof createFoodFixturePlannerState>[1] = "approved",
) {
  const state = createFoodFixturePlannerState(locale, scenario);
  if (state.preferences === null) throw new Error("food fixture must include personalization preferences");

  await page.addInitScript(
    ({ plannerKey, personalizationKey, plannerState, request }) => {
      window.sessionStorage.removeItem(plannerKey);
      window.sessionStorage.removeItem(personalizationKey);
      window.sessionStorage.setItem(plannerKey, JSON.stringify(plannerState));
      window.sessionStorage.setItem(personalizationKey, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        request,
      }));
    },
    {
      plannerKey: E2E_PLANNER_STATE_SESSION_KEY,
      personalizationKey: PERSONALIZATION_SESSION_KEY,
      plannerState: state,
      request: state.preferences,
    },
  );
  return state;
}

function factValue(scope: Locator, label: string): Locator {
  return scope.locator("dt").filter({ hasText: label }).locator("xpath=..").locator("dd").first();
}

function plannerRegion(page: Page, copy: PlannerCopy): Locator {
  return page.getByRole("region", { name: copy.heading });
}

function customRequestRegion(page: Page, copy: CustomRequestCopy): Locator {
  return page.getByRole("region", { name: copy.heading });
}

async function assertApprovedFoodFlow(
  page: Page,
  locale: "en" | "vi",
  scenario: Parameters<typeof createFoodFixturePlannerState>[1] = "approved",
): Promise<void> {
  const state = await seedPlanner(page, locale, scenario);
  await page.goto(`/${locale}/planner`);
  const copy = getDictionary(locale);
  const planner = plannerRegion(page, copy.planner);
  const food = planner.locator(".planner-food").first();
  const totals = planner.locator(".planner-flow__totals");
  const expectedAdmission = formatVnd(state.current.totals.admissionCostVnd, locale);
  const expectedPayable = formatVnd(state.current.totals.customerPayableVnd, locale);

  await expect(food.getByText(FOOD_FIXTURE.vendor[locale], { exact: true })).toBeVisible();
  await expect(food.getByText(FOOD_FIXTURE.menu[locale], { exact: true })).toBeVisible();
  await expect(food.getByText(locale === "en" ? "3 portions" : "3 phần", { exact: true })).toBeVisible();
  await expect(factValue(food, copy.planner.unitPriceLabel)).toHaveText(UNIT_RANGE_PATTERN);
  await expect(factValue(food, copy.planner.estimatedRangeLabel)).toHaveText(GROUP_RANGE_PATTERN);
  await expect(food.getByText(copy.planner.payAtVendorValue, { exact: true })).toBeVisible();
  await expect(factValue(totals, copy.planner.venueAdmissionLabel)).toHaveText(expectedAdmission);
  await expect(factValue(totals, copy.planner.foodEstimateLabel)).toHaveText(
    GROUP_RANGE_PATTERN,
  );
  await expect(factValue(totals, copy.planner.localLensPayableLabel)).toHaveText(expectedPayable);
  await expect(factValue(totals, copy.planner.payAtVendorLabel)).toHaveText(
    GROUP_RANGE_PATTERN,
  );

  await planner.getByRole("link", { name: copy.planner.requestQuoteLabel }).click();
  const custom = customRequestRegion(page, copy.customRequest);
  const selected = custom.locator(".custom-request-flow__card").first();

  await expect(selected.getByText(FOOD_FIXTURE.vendor[locale], { exact: true })).toBeVisible();
  await expect(selected.getByText(FOOD_FIXTURE.menu[locale], { exact: true })).toBeVisible();
  await expect(factValue(selected, copy.customRequest.localLensPayableLabel)).toHaveText(expectedPayable);
  await expect(factValue(selected, copy.customRequest.payAtVendorLabel)).toHaveText(
    GROUP_RANGE_PATTERN,
  );

  await custom.getByRole("button", { name: copy.customRequest.continueLocalDemoLabel }).click();
  await custom.getByRole("button", { name: copy.customRequest.submitRequestLabel }).click();
  await custom.getByRole("button", { name: copy.customRequest.simulateQuoteLabel }).click();
  const quote = custom.getByRole("region", { name: copy.customRequest.quoteHeading });
  await expect(factValue(quote, copy.customRequest.quoteTotalLabel)).toHaveText(expectedPayable);
  await custom.getByRole("button", { name: copy.customRequest.acceptQuoteLabel }).click();
  await custom.getByRole("button", { name: copy.customRequest.openStripeMockLabel }).click();

  const stripe = page.getByRole("region", { name: copy.customRequest.stripeMockHeading });
  await expect(stripe).toBeVisible();
  await expect(stripe.getByText(FOOD_FIXTURE.vendor[locale], { exact: true })).toHaveCount(0);
  await expect(stripe.getByText(FOOD_FIXTURE.menu[locale], { exact: true })).toHaveCount(0);
  await expect(stripe).not.toContainText(locale === "en" ? "135,000" : "135.000");
  await expect(stripe).not.toContainText(locale === "en" ? "180,000" : "180.000");
}

test.describe("food itinerary acceptance paths", () => {
  test("EN approved food selection carries group quantity, range and pay-at-vendor boundary", async ({ page }) => {
    await assertApprovedFoodFlow(page, "en");
  });

  test("VI approved food selection carries localized names, group quantity and range", async ({ page }) => {
    await assertApprovedFoodFlow(page, "vi");
  });

  test("mixed route carries a nonzero LocalLens payable amount into the quote", async ({ page }) => {
    await assertApprovedFoodFlow(page, "en", "mixed");
  });

  test("research-only food records fail closed without a proposal or invented vendor facts", async ({ page }) => {
    await seedPlanner(page, "en", "research-only");
    await page.goto("/en/planner");
    const copy = getDictionary("en").planner;
    const planner = plannerRegion(page, copy);

    await expect(planner.locator(".planner-flow__no-proposal")).toHaveText(copy.noProposalLabel);
    await expect(planner.locator(".planner-timeline__item")).toHaveCount(0);
    await expect(planner.getByText(FOOD_FIXTURE.vendor.en, { exact: true })).toHaveCount(0);
    await expect(planner.getByText(FOOD_FIXTURE.menu.en, { exact: true })).toHaveCount(0);
    await expect(planner).not.toContainText("Research-only Banh Mi Stall");
  });

  test("refinement preserves locked food snapshot while changing an unlocked stop", async ({ page }) => {
    const state = await seedPlanner(page, "en", "mixed");
    expect(state.current.items.filter((item) => item.foodSelection !== null)).toHaveLength(1);
    expect(state.current.items.length).toBeGreaterThanOrEqual(2);
    await page.goto("/en/planner");

    const copy = getDictionary("en").planner;
    const planner = plannerRegion(page, copy);
    const foodItem = state.current.items.find((item) => item.foodSelection !== null);
    const museumItem = state.current.items.find((item) => item.foodSelection === null);
    if (foodItem === undefined || museumItem === undefined) throw new Error("mixed fixture did not produce both stops");
    if (foodItem.foodSelection === null) throw new Error("mixed fixture food selection missing");
    expect(foodItem.foodSelection).toMatchObject({
      quantity: FOOD_FIXTURE.groupQuantity,
      priceVndMin: FOOD_FIXTURE.unitPrice.min,
      priceVndMax: FOOD_FIXTURE.unitPrice.max,
    });

    const timelineFood = planner.locator(".planner-timeline__item").filter({ hasText: foodItem.title });
    const timelineMuseum = planner.locator(".planner-timeline__item").filter({ hasText: museumItem.title });
    const originalMuseumActivity = await timelineMuseum.getByTestId("planner-activity").textContent();
    await timelineFood.getByRole("button", { name: `${copy.lockLabel}: ${foodItem.title}` }).click();
    await expect(timelineFood.getByRole("button", { name: `${copy.unlockLabel}: ${foodItem.title}` })).toHaveAttribute("aria-pressed", "true");

    await planner.getByLabel(copy.feedbackLabel).fill("Keep the food stop, but slow down the museum visit.");
    await planner.getByRole("button", { name: copy.refineLabel }).click();
    await expect(planner.locator(".planner-flow__status")).toHaveText(copy.revisionCreatedMessage);

    await expect(timelineFood.getByText(FOOD_FIXTURE.vendor.en, { exact: true })).toBeVisible();
    await expect(timelineFood.getByText(FOOD_FIXTURE.menu.en, { exact: true })).toBeVisible();
    await expect(timelineFood.getByText("3 portions", { exact: true })).toBeVisible();
    await expect(factValue(timelineFood.locator(".planner-food"), copy.unitPriceLabel)).toHaveText(UNIT_RANGE_PATTERN);
    await expect(factValue(timelineFood.locator(".planner-food"), copy.estimatedRangeLabel)).toHaveText(GROUP_RANGE_PATTERN);
    await expect(timelineFood.getByRole("button", { name: `${copy.unlockLabel}: ${foodItem.title}` })).toHaveAttribute("aria-pressed", "true");
    await expect(timelineMuseum.getByTestId("planner-activity")).not.toHaveText(originalMuseumActivity ?? "");
  });

  test("unlocked food removal clears the food and pay-at-vendor totals", async ({ page }) => {
    const state = await seedPlanner(page, "en", "mixed");
    const foodItem = state.current.items.find((item) => item.foodSelection !== null);
    if (foodItem === undefined) throw new Error("mixed fixture did not produce a food stop");
    await page.goto("/en/planner");

    const copy = getDictionary("en").planner;
    const planner = plannerRegion(page, copy);
    const timelineFood = planner.locator(".planner-timeline__item").filter({ hasText: foodItem.title });
    const totals = planner.locator(".planner-flow__totals");

    await planner.getByLabel(copy.feedbackLabel).fill("Remove the food stop.");
    await planner.getByRole("button", { name: copy.refineLabel }).click();
    await expect(planner.locator(".planner-flow__status")).toHaveText(copy.revisionCreatedMessage);
    await expect(timelineFood.locator(".planner-food")).toHaveCount(0);
    await expect(timelineFood.getByText(copy.foodNotSelectedLabel, { exact: true })).toBeVisible();
    await expect(factValue(totals, copy.foodEstimateLabel)).toHaveText(copy.foodNotSelectedLabel);
    await expect(factValue(totals, copy.payAtVendorLabel)).toHaveText(formatVnd(0, "en"));
    await expect(factValue(totals, copy.localLensPayableLabel)).toHaveText(
      formatVnd(state.current.totals.customerPayableVnd, "en"),
    );
  });

  test("museum-only route keeps food unselected and reports admission separately", async ({ page }) => {
    await seedPlanner(page, "vi", "museum");
    await page.goto("/vi/planner");
    const copy = getDictionary("vi").planner;
    const planner = plannerRegion(page, copy);
    const museum = planner.locator(".planner-timeline__item").first();
    const totals = planner.locator(".planner-flow__totals");

    await expect(museum.locator(".planner-food")).toHaveCount(0);
    await expect(museum.getByText(copy.foodNotSelectedLabel, { exact: true })).toBeVisible();
    await expect(factValue(totals, copy.venueAdmissionLabel)).toHaveText(/120\.000/);
    await expect(factValue(totals, copy.foodEstimateLabel)).toHaveText(copy.foodNotSelectedLabel);
  });
});
