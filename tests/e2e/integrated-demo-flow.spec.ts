import { expect, test, type Page } from "@playwright/test";

import { PORTAL_COPY } from "@/components/portals/portal-copy";
import { getDictionary } from "@/lib/i18n/dictionaries";

type Locale = "en" | "vi";
type DemoRole = "customer" | "guide" | "admin";

const ROLE_SEGMENT: Record<DemoRole, string> = {
  customer: "account",
  guide: "guide",
  admin: "admin",
};

const IDENTITY_DISPLAY_NAME: Record<DemoRole, string> = {
  customer: "Demo Traveler",
  guide: "Demo Guide",
  admin: "Demo Administrator",
};

interface BrowserDiagnostics {
  consoleErrors: string[];
  pageErrors: string[];
  failedResponses: string[];
}

function installDiagnostics(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
    failedResponses: [],
  };

  page.on("console", (message) => {
    if (message.type() === "error") {
      diagnostics.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      diagnostics.failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  return diagnostics;
}

async function assertHealthyPage(page: Page, diagnostics: BrowserDiagnostics): Promise<void> {
  expect(diagnostics.consoleErrors, "unexpected browser console errors").toEqual([]);
  expect(diagnostics.pageErrors, "unexpected page errors").toEqual([]);
  expect(diagnostics.failedResponses, "unexpected failed HTTP responses").toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    "page must not overflow horizontally",
  ).toBe(true);
}

function identityCard(page: Page, displayName: string) {
  return page.getByRole("article").filter({
    has: page.getByRole("heading", { name: displayName, exact: true }),
  });
}

async function selectDemoIdentity(
  page: Page,
  displayName: string,
  actionLabel: string,
): Promise<void> {
  const card = identityCard(page, displayName);
  await expect(card).toHaveCount(1);
  await card.getByRole("link", { name: actionLabel, exact: true }).click();
}

async function chooseIdentity(page: Page, locale: Locale, role: DemoRole): Promise<void> {
  const copy = PORTAL_COPY[locale];
  await selectDemoIdentity(page, IDENTITY_DISPLAY_NAME[role], `${copy.continueAs} ${copy[role]}`);
  await expect(page).toHaveURL(new RegExp(`/${locale}/${ROLE_SEGMENT[role]}/?$`));
}

async function enterDemoIdentity(page: Page, locale: Locale, role: DemoRole): Promise<void> {
  await expect(page.getByRole("heading", { name: PORTAL_COPY[locale].signInHeading, exact: true })).toBeVisible();
  await chooseIdentity(page, locale, role);
}

async function signInAs(page: Page, locale: Locale, role: DemoRole): Promise<void> {
  await page.goto(`/${locale}/sign-in/`);
  await enterDemoIdentity(page, locale, role);
}

async function switchRole(page: Page, locale: Locale, nextRole: DemoRole): Promise<void> {
  const signOut = page.getByRole("button", { name: PORTAL_COPY[locale].signOut, exact: true });
  if (await signOut.count() > 0) {
    await signOut.click();
  } else {
    await page.locator("header.site-header").getByRole("link", { name: getDictionary(locale).navigation.signIn, exact: true }).click();
  }
  await enterDemoIdentity(page, locale, nextRole);
}

async function assertAccessDenied(
  page: Page,
  locale: Locale,
  expectedRole: DemoRole,
  actualRole: DemoRole,
): Promise<void> {
  const copy = PORTAL_COPY[locale];
  const accessDeniedTitle = expectedRole === "customer"
    ? copy.accessDeniedTitle
    : expectedRole === "guide"
      ? copy.guideAccessDeniedTitle
      : copy.adminAccessDeniedTitle;
  const portalHeading = expectedRole === "customer"
    ? copy.customerHeading
    : expectedRole === "guide"
      ? copy.guidePortal
      : copy.adminPortal;
  await page.goto(`/${locale}/${ROLE_SEGMENT[expectedRole]}/`);
  await expect(page.getByRole("heading", { name: accessDeniedTitle, exact: true })).toBeVisible();
  await expect(page.getByText(copy.accessDeniedMessage, { exact: true })).toBeVisible();
  await expect(page.getByText(
    `${copy.signedInAsRole}${locale === "en" && actualRole === "admin" ? "n" : ""} ${copy[actualRole]}.`,
    { exact: true },
  )).toBeVisible();
  await expect(page.getByRole("heading", { name: portalHeading, exact: true })).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/en/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

test("fixed tour browse, payment, admin assignment, and guide visibility stay connected", async ({ page }) => {
  const diagnostics = installDiagnostics(page);
  const fixedTourTitle = "Markets and Street Food";
  const departureId = "demo-departure-markets-and-street-food-2026-09-05";

  await page.goto("/en/tours/");
  await expect(page.getByRole("heading", { name: "Fixed tours in Ho Chi Minh City", exact: true })).toBeVisible();

  const anonymousTourCard = page.getByRole("article").filter({ hasText: fixedTourTitle });
  await expect(anonymousTourCard).toHaveCount(1);
  const tourFacts = anonymousTourCard.locator("details");
  await expect(tourFacts).toHaveCount(1);
  await anonymousTourCard.locator("summary").click();
  await expect(tourFacts).toHaveAttribute("open", "");
  await expect(anonymousTourCard.getByRole("heading", { name: "Stops", exact: true })).toBeVisible();
  await expect(anonymousTourCard.getByRole("link", { name: `Book ${fixedTourTitle}`, exact: true })).toBeVisible();

  await signInAs(page, "en", "customer");
  await page.locator("header.site-header").getByRole("link", { name: "Tours", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fixed tours in Ho Chi Minh City", exact: true })).toBeVisible();
  const signedInTourCard = page.getByRole("article").filter({ hasText: fixedTourTitle });
  await signedInTourCard.getByRole("link", { name: `Book ${fixedTourTitle}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/en/booking/?\\?departure=${departureId}&partySize=1$`));
  await expect(page.getByRole("heading", { name: "Book a fixed tour", exact: true })).toBeVisible();
  await expect(page.getByLabel("People in your party", { exact: true })).toHaveValue("1");

  await page.getByRole("button", { name: "Continue to Test Checkout", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Test checkout", exact: true })).toBeVisible();
  await expect(page.getByText("Not paid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Simulate failed payment", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Demo payment failed", exact: true })).toBeVisible();
  await expect(page.getByText("The simulated payment failed. No charge was made; you can retry this booking.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry demo payment", exact: true }).click();
  await page.getByRole("button", { name: "Simulate successful payment", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Demo payment succeeded", exact: true })).toBeVisible();
  await expect(page.getByText("Paid in test mode", { exact: true })).toBeVisible();
  await expect(page.getByText("Demo booking reference", { exact: true })).toBeVisible();

  await switchRole(page, "en", "admin");
  await expect(page.getByRole("heading", { name: "Admin portal", exact: true })).toBeVisible();
  const assignmentRegion = page.getByRole("region", { name: "Fixed-departure guide assignment", exact: true });
  const fixedAssignment = assignmentRegion.getByRole("listitem").filter({ hasText: departureId });
  await expect(fixedAssignment).toBeVisible();
  await expect(fixedAssignment).toContainText(fixedTourTitle);
  await fixedAssignment.getByRole("combobox", { name: /^Assign guide:/ }).selectOption({ label: "Demo Guide" });
  await fixedAssignment.getByRole("button", { name: "Assign guide", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Guide assignment saved in this demo session." })).toBeVisible();

  await switchRole(page, "en", "guide");
  await expect(page.getByRole("heading", { name: "Guide portal", exact: true })).toBeVisible();
  const scheduleRegion = page.getByRole("region", { name: "Your schedule", exact: true });
  const guideAssignment = scheduleRegion.getByRole("article").filter({ hasText: departureId });
  await expect(guideAssignment).toBeVisible();
  await expect(guideAssignment).toContainText(fixedTourTitle);
  await expect(guideAssignment).toContainText("Assigned");
  await expect(page.getByRole("button", { name: /accept|complete|cancel/i })).toHaveCount(0);
  await assertHealthyPage(page, diagnostics);
});

test("personalized route refinement submits for admin quote review and completes simulated checkout", async ({ page }) => {
  const diagnostics = installDiagnostics(page);

  await signInAs(page, "en", "customer");
  await page.locator("header.site-header").getByRole("link", { name: "LocalLens", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your Saigon, planned around you", exact: true })).toBeVisible();
  const personalizationForm = page.getByRole("form", { name: "Personalized route preferences", exact: true });
  await personalizationForm.getByLabel("Hours", { exact: true }).fill("6");
  await personalizationForm.getByLabel("Preferred start date", { exact: true }).fill("2026-09-05");
  await personalizationForm.getByLabel("Budget for your whole group", { exact: true }).fill("2000000");
  await personalizationForm.getByLabel("People in your party", { exact: true }).fill("2");
  await personalizationForm.getByLabel("District 1 & central", { exact: true }).check();
  await personalizationForm.getByLabel("Food & everyday flavor", { exact: true }).fill("0");
  await personalizationForm.getByLabel("Markets & neighborhood life", { exact: true }).fill("4");
  await personalizationForm.getByRole("button", { name: "Preview my route brief", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your route proposal", exact: true })).toBeVisible();
  await expect(page.getByText("Preview only: your preferences stay on this page and are not sent yet.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the separate simulated refinement demo", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Open the separate simulated refinement demo", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/planner\/?$/);
  await expect(page.getByRole("heading", { name: "Your personalized route proposal", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Revision 1", exact: true })).toBeVisible();
  await expect(page.getByText("This is a suggestion for discussion. It does not confirm or book a tour automatically.", { exact: true }).first()).toBeVisible();

  await page.getByLabel("What should we adjust?", { exact: true }).fill("Keep the market stop and slow the pace.");
  await page.getByRole("button", { name: "Create revised proposal", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "A new simulated proposal revision is ready for review." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Revision 2", exact: true })).toBeVisible();

  // The traveler actively selects the current immutable revision before any
  // request is submitted; admin approval and quote acceptance happen later.
  await page.getByRole("link", { name: "Request a quote for this revision", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/custom-request\/?$/);
  await expect(page.getByRole("heading", { name: "Request a review and quote", exact: true })).toBeVisible();
  const confirmedRevision = page.getByRole("region", { name: "Selected itinerary revision", exact: true });
  await expect(confirmedRevision.getByText("Revision", { exact: true }).locator("xpath=..").getByRole("definition")).toHaveText("2");
  await expect(page.getByRole("heading", { name: "Submit for local admin review", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Submit local demo request", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Admin review pending (simulated)", exact: true })).toBeVisible();
  await expect(page.getByText("Your browser demo request is pending administrator review. The seeded demo admin can now review it.", { exact: true })).toBeVisible();

  await switchRole(page, "en", "admin");
  await expect(page.getByRole("heading", { name: "Admin portal", exact: true })).toBeVisible();
  const personalizedRegion = page.getByRole("region", { name: "Personalized requests", exact: true });
  const pendingRequests = personalizedRegion.getByRole("listitem").filter({ hasText: "Pending review" });
  await expect(pendingRequests).toHaveCount(2);
  const pendingRequest = pendingRequests.last();
  const requestId = (await pendingRequest.getByRole("heading", { level: 3 }).textContent())?.trim();
  if (requestId === undefined || requestId.length === 0) throw new Error("The submitted request has no visible identifier.");
  const requestCard = personalizedRegion.getByRole("listitem").filter({ hasText: requestId });
  await requestCard.getByRole("combobox", { name: /^Decision:/ }).selectOption({ label: "Approved" });
  await requestCard.getByRole("button", { name: "Save request decision", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Request decision saved in this demo session." })).toBeVisible();
  await expect(requestCard).toContainText("Approved");

  await expect(requestCard.getByRole("button", { name: "Issue demo quote", exact: true })).toBeVisible();
  await requestCard.getByRole("button", { name: "Issue demo quote", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo quote issued in this session." })).toBeVisible();
  await expect(requestCard).toContainText("The remaining quote facts come from the seeded demo quote fixture");

  await switchRole(page, "en", "customer");
  await page.goto("/en/custom-request/");
  const selectedRevision = page.getByRole("region", { name: "Selected itinerary revision", exact: true });
  await expect(selectedRevision.getByText("Revision", { exact: true }).locator("xpath=..").getByRole("definition")).toHaveText("2");
  await expect(page.getByRole("heading", { name: "Mock quote", exact: true })).toBeVisible();
  await expect(page.getByText("This amount is the administrator-issued demo quote and remains immutable in this local flow.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Accept this mock quote", exact: true }).click();
  await expect(page.getByText("You explicitly accepted the mock quote. Payment has not started.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open Stripe Test/Mock action", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Stripe Test/Mock boundary", exact: true })).toBeVisible();
  await expect(page.getByText("No Stripe network request, card detail, real charge, or webhook was made; this checkout only updates browser demo state.", { exact: true })).toBeVisible();

  await page.locator("header.site-header").getByRole("link", { name: "Sign in", exact: true }).click();
  await enterDemoIdentity(page, "en", "customer");
  const personalizedBooking = page.locator(`article[aria-labelledby="customer-booking-demo-booking-${requestId}"]`);
  await expect(personalizedBooking).toBeVisible();
  await expect(personalizedBooking).toContainText("Confirmed");
  await expect(personalizedBooking).toContainText("Paid");
  await assertHealthyPage(page, diagnostics);
});

test("personalized request runs the complete customer and admin chain in Vietnamese", async ({ page }) => {
  const locale = "vi" as const;
  const diagnostics = installDiagnostics(page);
  const dictionary = getDictionary(locale);
  const home = dictionary.home;
  const formCopy = home.personalizationForm;
  const plannerCopy = dictionary.planner;
  const customCopy = dictionary.customRequest;
  const portalCopy = PORTAL_COPY[locale];

  await signInAs(page, locale, "customer");
  await page.locator("header.site-header").getByRole("link", { name: "LocalLens", exact: true }).click();
  await expect(page.getByRole("heading", { name: home.title, exact: true })).toBeVisible();
  const personalizationForm = page.getByRole("form", { name: formCopy.formLabel, exact: true });
  await personalizationForm.getByLabel(formCopy.durationHoursLabel, { exact: true }).fill("6");
  await personalizationForm.getByLabel(formCopy.startDateLabel, { exact: true }).fill("2026-09-05");
  await personalizationForm.getByLabel(formCopy.budgetLabel, { exact: true }).fill("2000000");
  await personalizationForm.getByLabel(formCopy.partySizeLabel, { exact: true }).fill("2");
  await personalizationForm.getByLabel(formCopy.areaOptions.find((option) => option.value === "demo-hcmc-district-1")!.label, { exact: true }).check();
  await personalizationForm.getByLabel(formCopy.priorities.find((priority) => priority.key === "street_food")!.label, { exact: true }).fill("0");
  await personalizationForm.getByLabel(formCopy.priorities.find((priority) => priority.key === "traditional_market")!.label, { exact: true }).fill("4");
  await personalizationForm.getByRole("button", { name: formCopy.submitLabel, exact: true }).click();
  await expect(page.getByRole("heading", { name: formCopy.preview.heading, exact: true })).toBeVisible();
  await expect(page.getByText(formCopy.previewMessage, { exact: true })).toBeVisible();

  await page.getByRole("link", { name: formCopy.plannerLinkLabel, exact: true }).click();
  await expect(page).toHaveURL(/\/vi\/planner\/?$/);
  await expect(page.getByRole("heading", { name: plannerCopy.heading, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: `${plannerCopy.revisionLabel} 1`, exact: true })).toBeVisible();
  await page.getByLabel(plannerCopy.feedbackLabel, { exact: true }).fill("Giữ điểm chợ và đi chậm hơn.");
  await page.getByRole("button", { name: plannerCopy.refineLabel, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: plannerCopy.revisionCreatedMessage })).toBeVisible();
  await expect(page.getByRole("heading", { name: `${plannerCopy.revisionLabel} 2`, exact: true })).toBeVisible();

  await page.getByRole("link", { name: plannerCopy.requestQuoteLabel, exact: true }).click();
  await expect(page).toHaveURL(/\/vi\/custom-request\/?$/);
  const selectedRevision = page.getByRole("region", { name: customCopy.selectedRevisionHeading, exact: true });
  await expect(selectedRevision.getByText(customCopy.revisionLabel, { exact: true }).locator("xpath=..").getByRole("definition")).toHaveText("2");
  const planId = (await selectedRevision.getByText(customCopy.planIdLabel, { exact: true }).locator("xpath=..").getByRole("definition").textContent())?.trim();
  if (!planId) throw new Error("The confirmed Vietnamese revision has no plan identifier.");
  const requestId = `demo-request-${planId}-2`;
  await page.getByRole("button", { name: customCopy.submitRequestLabel, exact: true }).click();
  await expect(page.getByText(customCopy.adminReviewPendingMessage, { exact: true })).toBeVisible();

  await switchRole(page, locale, "admin");
  await expect(page.getByRole("heading", { name: portalCopy.adminPortal, exact: true })).toBeVisible();
  const personalizedRegion = page.getByRole("region", { name: portalCopy.personalizedHeading, exact: true });
  const requestCard = personalizedRegion.getByRole("listitem").filter({ hasText: requestId });
  await expect(requestCard).toHaveCount(1);
  await requestCard.getByRole("combobox", { name: `${portalCopy.decision}: ${requestId}`, exact: true }).selectOption({ label: portalCopy.approved });
  await requestCard.getByRole("button", { name: portalCopy.saveDecision, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: portalCopy.decisionSaved })).toBeVisible();
  await requestCard.getByRole("button", { name: portalCopy.issueQuote, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: portalCopy.quoteIssued })).toBeVisible();

  await switchRole(page, locale, "customer");
  await page.goto(`/${locale}/custom-request/`);
  await expect(page.getByRole("heading", { name: customCopy.quoteHeading, exact: true })).toBeVisible();
  await page.getByRole("button", { name: customCopy.acceptQuoteLabel, exact: true }).click();
  await expect(page.getByText(customCopy.quoteAcceptedMessage, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: customCopy.openStripeMockLabel, exact: true }).click();
  await expect(page.getByRole("heading", { name: customCopy.stripeMockHeading, exact: true })).toBeVisible();
  await expect(page.getByText(customCopy.noPaymentNetworkDisclosure, { exact: true })).toBeVisible();

  await page.goto(`/${locale}/account/`);
  const personalizedBooking = page.locator(`article[aria-labelledby="customer-booking-demo-booking-${requestId}"]`);
  await expect(personalizedBooking).toBeVisible();
  await expect(personalizedBooking).toContainText(portalCopy.statusLabels.confirmed);
  await expect(personalizedBooking).toContainText(portalCopy.paymentStatusLabels.paid);
  await assertHealthyPage(page, diagnostics);
});

test("direct portal entries deny every mismatched signed-in role", async ({ page }) => {
  const diagnostics = installDiagnostics(page);

  await signInAs(page, "en", "customer");
  await assertAccessDenied(page, "en", "guide", "customer");
  await assertAccessDenied(page, "en", "admin", "customer");

  await switchRole(page, "en", "guide");
  await assertAccessDenied(page, "en", "customer", "guide");
  await assertAccessDenied(page, "en", "admin", "guide");

  await switchRole(page, "en", "admin");
  await assertAccessDenied(page, "en", "customer", "admin");
  await assertAccessDenied(page, "en", "guide", "admin");
  await assertHealthyPage(page, diagnostics);
});
