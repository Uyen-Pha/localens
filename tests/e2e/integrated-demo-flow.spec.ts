import { expect, test, type Locator, type Page } from "@playwright/test";

import { PORTAL_COPY } from "@/components/portals/portal-copy";
import { getDictionary } from "@/lib/i18n/dictionaries";

type Locale = "en" | "vi";
type DemoRole = "customer" | "guide" | "admin";

interface FixedTourAcceptanceCopy {
  toursNav: string;
  catalogHeading: string;
  catalogDisclosure: string;
  tourTitle: string;
  guideTourTitle: string;
  detailsSummary: string;
  stopsHeading: string;
  bookAction: string;
  bookingHeading: string;
  partySizeLabel: string;
  bookingDisclosure: string;
  continueCheckout: string;
  checkoutHeading: string;
  holdDuration: string;
  unpaidStatus: string;
  failedAction: string;
  failureHeading: string;
  failureMessage: string;
  retryPayment: string;
  successAction: string;
  successHeading: string;
  paidTestStatus: string;
  referenceLabel: string;
}

const FIXED_TOUR_ACCEPTANCE_COPY: Record<Locale, FixedTourAcceptanceCopy> = {
  en: {
    toursNav: "Tours",
    catalogHeading: "Fixed tours in Ho Chi Minh City",
    catalogDisclosure: "Demo catalog: booking buttons open a local test flow only. No production booking or charge is made.",
    tourTitle: "Markets and Street Food",
    guideTourTitle: "Markets and Street Food",
    detailsSummary: "View tour facts",
    stopsHeading: "Stops",
    bookAction: "Book Markets and Street Food",
    bookingHeading: "Book a fixed tour",
    partySizeLabel: "People in your party",
    bookingDisclosure: "Local demo only: the hold and simulated payment sync to browser demo portals after customer sign-in. This is not a production booking or payment.",
    continueCheckout: "Continue to Test Checkout",
    checkoutHeading: "Test checkout",
    holdDuration: "35-minute demo hold",
    unpaidStatus: "Not paid",
    failedAction: "Simulate failed payment",
    failureHeading: "Demo payment failed",
    failureMessage: "The simulated payment failed. No charge was made; you can retry this booking.",
    retryPayment: "Retry demo payment",
    successAction: "Simulate successful payment",
    successHeading: "Demo payment succeeded",
    paidTestStatus: "Paid in test mode",
    referenceLabel: "Demo booking reference",
  },
  vi: {
    toursNav: "Tour",
    catalogHeading: "Tour cố định tại Thành phố Hồ Chí Minh",
    catalogDisclosure: "Danh mục demo: nút đặt tour chỉ mở luồng thử nghiệm cục bộ. Chưa có đặt tour thực tế hay khoản tiền nào bị trừ.",
    tourTitle: "Chợ địa phương và ẩm thực đường phố",
    guideTourTitle: "Markets and Street Food",
    detailsSummary: "Xem thông tin tour",
    stopsHeading: "Điểm dừng",
    bookAction: "Đặt tour Chợ địa phương và ẩm thực đường phố",
    bookingHeading: "Đặt tour cố định",
    partySizeLabel: "Số người trong nhóm",
    bookingDisclosure: "Chỉ là demo cục bộ: giữ chỗ và thanh toán mô phỏng được đồng bộ sang cổng demo trong trình duyệt sau khi khách hàng đăng nhập. Đây chưa phải đặt tour hay thanh toán production.",
    continueCheckout: "Tiếp tục đến thanh toán thử nghiệm",
    checkoutHeading: "Thanh toán thử nghiệm",
    holdDuration: "Giữ chỗ demo 35 phút",
    unpaidStatus: "Chưa thanh toán",
    failedAction: "Mô phỏng thanh toán thất bại",
    failureHeading: "Thanh toán demo thất bại",
    failureMessage: "Thanh toán mô phỏng thất bại. Không có khoản tiền nào bị trừ; bạn có thể thử lại booking này.",
    retryPayment: "Thử lại thanh toán demo",
    successAction: "Mô phỏng thanh toán thành công",
    successHeading: "Thanh toán demo thành công",
    paidTestStatus: "Đã thanh toán ở chế độ thử nghiệm",
    referenceLabel: "Mã đơn demo",
  },
};

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

async function inspectFixedTourCatalog(
  page: Page,
  copy: FixedTourAcceptanceCopy,
): Promise<Locator> {
  await expect(page.getByRole("heading", { name: copy.catalogHeading, exact: true })).toBeVisible();
  await expect(page.getByText(copy.catalogDisclosure, { exact: true })).toBeVisible();
  const tourCard = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: copy.tourTitle, exact: true }),
  });
  await expect(tourCard).toHaveCount(1);
  const tourFacts = tourCard.locator("details");
  await expect(tourFacts).toHaveCount(1);
  await tourCard.getByText(copy.detailsSummary, { exact: true }).click();
  await expect(tourFacts).toHaveAttribute("open", "");
  await expect(tourCard.getByRole("heading", { name: copy.stopsHeading, exact: true })).toBeVisible();
  await expect(tourCard.getByRole("link", { name: copy.bookAction, exact: true })).toBeVisible();
  return tourCard;
}

async function runFixedTourAcceptance(
  page: Page,
  locale: Locale,
  diagnostics: BrowserDiagnostics,
): Promise<void> {
  const copy = FIXED_TOUR_ACCEPTANCE_COPY[locale];
  const portalCopy = PORTAL_COPY[locale];
  const departureId = "demo-departure-markets-and-street-food-2026-09-05";
  const bookingId = `demo-booking-demo-user-customer-${departureId}-1`;

  if (locale === "en") {
    await page.goto("/en/tours/");
    await inspectFixedTourCatalog(page, copy);
  }

  await signInAs(page, locale, "customer");
  await page.locator("header.site-header").getByRole("link", { name: copy.toursNav, exact: true }).click();
  const signedInTourCard = await inspectFixedTourCatalog(page, copy);
  await signedInTourCard.getByRole("link", { name: copy.bookAction, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/booking/?\\?departure=${departureId}&partySize=1$`));
  await expect(page.getByRole("heading", { name: copy.bookingHeading, exact: true })).toBeVisible();
  await expect(page.getByLabel(copy.partySizeLabel, { exact: true })).toHaveValue("1");
  await expect(page.getByText(copy.bookingDisclosure, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: copy.continueCheckout, exact: true }).click();
  await expect(page.getByRole("heading", { name: copy.checkoutHeading, exact: true })).toBeVisible();
  await expect(page.getByText(copy.holdDuration, { exact: true })).toBeVisible();
  await expect(page.getByText(copy.unpaidStatus, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: copy.failedAction, exact: true }).click();
  await expect(page.getByRole("heading", { name: copy.failureHeading, exact: true })).toBeVisible();
  await expect(page.getByText(copy.failureMessage, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: copy.retryPayment, exact: true }).click();
  await page.getByRole("button", { name: copy.successAction, exact: true }).click();
  await expect(page.getByRole("heading", { name: copy.successHeading, exact: true })).toBeVisible();
  await expect(page.getByText(copy.paidTestStatus, { exact: true })).toBeVisible();
  await expect(page.getByText(copy.referenceLabel, { exact: true })).toBeVisible();

  await page.goto(`/${locale}/account/`);
  await expect(page.getByRole("heading", { name: portalCopy.customerHeading, exact: true })).toBeVisible();
  const customerBooking = page.locator(`article[aria-labelledby="customer-booking-${bookingId}"]`);
  await expect(customerBooking).toHaveCount(1);
  await expect(customerBooking).toContainText(copy.tourTitle);
  await expect(customerBooking).toContainText(portalCopy.statusLabels.confirmed);
  await expect(customerBooking).toContainText(portalCopy.paymentStatusLabels.paid);
  await expect(customerBooking.getByText(portalCopy.simulatedPayment, { exact: true })).toBeVisible();

  await switchRole(page, locale, "admin");
  await expect(page.getByRole("heading", { name: portalCopy.adminPortal, exact: true })).toBeVisible();
  const adminBookings = page.getByRole("region", { name: portalCopy.bookingsCancellationsHeading, exact: true });
  const adminBooking = adminBookings.getByRole("listitem").filter({ hasText: bookingId });
  await expect(adminBooking).toHaveCount(1);
  await expect(adminBooking).toContainText(portalCopy.statusLabels.confirmed);
  await expect(adminBooking).toContainText(portalCopy.paymentStatusLabels.paid);

  const assignmentRegion = page.getByRole("region", { name: portalCopy.assignmentsHeading, exact: true });
  const guideSelector = assignmentRegion.getByRole("combobox", {
    name: `${portalCopy.assignGuide}: ${bookingId}`,
    exact: true,
  });
  await expect(guideSelector).toHaveCount(1);
  const fixedAssignment = guideSelector.locator("xpath=ancestor::li");
  await expect(fixedAssignment).toContainText(departureId);
  await expect(fixedAssignment).toContainText(copy.tourTitle);
  await guideSelector.selectOption({ label: "Demo Guide" });
  await fixedAssignment.getByRole("button", { name: portalCopy.assignGuide, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: portalCopy.guideAssignmentSaved })).toBeVisible();

  await switchRole(page, locale, "guide");
  await expect(page.getByRole("heading", { name: portalCopy.guidePortal, exact: true })).toBeVisible();
  const scheduleRegion = page.getByRole("region", { name: portalCopy.scheduleHeading, exact: true });
  const guideAssignment = scheduleRegion.locator(`article[aria-labelledby="guide-assignment-${bookingId}"]`);
  await expect(guideAssignment).toHaveCount(1);
  await expect(guideAssignment).toContainText(departureId);
  await expect(guideAssignment).toContainText(copy.guideTourTitle);
  await expect(guideAssignment).toContainText(portalCopy.assignmentStatusLabels.assigned);
  const tourLanguage = guideAssignment.getByText(portalCopy.tourLanguage, { exact: true }).locator("xpath=..");
  await expect(tourLanguage.getByRole("definition")).toHaveText(
    locale === "vi" ? portalCopy.vietnamese : portalCopy.english,
  );
  await expect(guideAssignment.getByRole("button")).toHaveCount(0);
  await assertHealthyPage(page, diagnostics);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/en/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

test("customer sign-in restores fixed-tour booking intent and rejects an external return-to", async ({ page }) => {
  const diagnostics = installDiagnostics(page);
  const returnTo = "/en/booking/?departure=demo-departure-markets-and-street-food-2026-09-05&partySize=2";

  await page.goto(returnTo);
  await page.getByRole("link", { name: PORTAL_COPY.en.chooseIdentity, exact: true }).click();
  await expect(page).toHaveURL(/\/en\/sign-in\/\?returnTo=/);
  const signInUrl = new URL(page.url());
  expect(signInUrl.pathname).toBe("/en/sign-in/");
  expect(signInUrl.searchParams.get("returnTo")).toBe(returnTo);
  await selectDemoIdentity(page, "Demo Traveler", "Continue as Customer");

  await expect(page).toHaveURL(new RegExp(`${returnTo.replace(/[?]/g, "\\?")}$`));
  await expect(page.getByLabel(FIXED_TOUR_ACCEPTANCE_COPY.en.partySizeLabel, { exact: true })).toHaveValue("2");

  const localOrigin = new URL(page.url()).origin;
  await page.goto("/en/sign-in/?returnTo=https%3A%2F%2Fexample.com");
  await selectDemoIdentity(page, "Demo Traveler", "Continue as Customer");
  await expect(page).toHaveURL(/\/en\/account\/?$/);
  expect(new URL(page.url()).origin).toBe(localOrigin);
  await assertHealthyPage(page, diagnostics);
});

test("fixed tour browse, payment, admin assignment, and guide visibility stay connected", async ({ page }) => {
  const diagnostics = installDiagnostics(page);
  await runFixedTourAcceptance(page, "en", diagnostics);
});

test("fixed tour completes hold, retry, payment, admin assignment, and guide visibility in Vietnamese", async ({ page }) => {
  const diagnostics = installDiagnostics(page);
  await runFixedTourAcceptance(page, "vi", diagnostics);
});

test("personalized route refinement submits for admin quote review and completes simulated checkout", async ({ page }) => {
  const diagnostics = installDiagnostics(page);

  await signInAs(page, "en", "customer");
  await page.locator("header.site-header").getByRole("link", { name: "LocalLens", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your Saigon, planned around you", exact: true })).toBeVisible();
  const personalizationForm = page.getByRole("form", { name: "Personalized route preferences", exact: true });
  await personalizationForm.getByLabel("Hours", { exact: true }).fill("6");
  await expect(personalizationForm.getByLabel("Preferred start date", { exact: true })).not.toHaveValue("");
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
  await expect(personalizationForm.getByLabel(formCopy.startDateLabel, { exact: true })).not.toHaveValue("");
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
  await page.getByRole("button", { name: customCopy.submitRequestLabel, exact: true }).click();
  await expect(page.getByText(customCopy.adminReviewPendingMessage, { exact: true })).toBeVisible();

  await switchRole(page, locale, "admin");
  await expect(page.getByRole("heading", { name: portalCopy.adminPortal, exact: true })).toBeVisible();
  const personalizedRegion = page.getByRole("region", { name: portalCopy.personalizedHeading, exact: true });
  const pendingRequests = personalizedRegion.getByRole("listitem").filter({
    hasText: portalCopy.requestStatusLabels.pending_review,
  });
  await expect(pendingRequests).toHaveCount(2);
  const pendingRequest = pendingRequests.last();
  const requestId = (await pendingRequest.getByRole("heading", { level: 3 }).textContent())?.trim();
  if (!requestId) throw new Error("The submitted Vietnamese request has no visible identifier.");
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
