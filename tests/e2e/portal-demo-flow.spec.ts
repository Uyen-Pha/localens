import { expect, test, type Page } from "@playwright/test";

type Locale = "en" | "vi";
type PortalRole = "customer" | "guide" | "admin";

const PORTAL_COPY = {
  en: {
    signInHeading: "Sign in to your demo account",
    customerIdentity: "Continue as Customer",
    guideIdentity: "Continue as Guide",
    adminIdentity: "Continue as Administrator",
    signOut: "Sign out",
    customerPortal: "Your customer portal",
    guidePortal: "Guide portal",
    adminPortal: "Admin portal",
    customerSchedule: "Your schedule",
    cancellationBooking: "History and Memory",
    completedBooking: "Markets and Street Food",
    requestCancellation: "Request cancellation",
    cancellationReason: "Cancellation reason",
    sendCancellation: "Send cancellation request",
    cancellationPending: "Cancellation request pending administrator decision.",
    cancellationDecision: "Decision: demo-booking-cancellation",
    saveRequestDecision: "Save request decision",
    cancellationDecisionSaved: "Cancellation decision saved in this demo session.",
    cancellationApproved: "Cancellation status: Approved",
    readOnlyAssignment: "Guides cannot accept, complete, cancel, or administer tours here.",
    reviewRating: "Rating",
    reviewText: "Review text",
    submitReview: "Submit review",
    reviewAvailable: "Share a review for this completed tour.",
    reviewSubmitted: "Review submitted for this completed tour.",
    reviewExists: "You have already reviewed this completed booking.",
    fullName: "Full name",
    saveProfile: "Save profile",
    profileSaved: "Profile saved in this demo session.",
    resetName: "Reset-check traveler",
    seededName: "Demo Traveler",
    chooseIdentity: "Choose a demo identity",
    openYourPortal: "Open your portal",
    resetDemo: "Reset LocalLens demo",
    resetComplete: "LocalLens demo state was reset. Choose an identity to continue.",
    demoNotice: "Demo-only.",
    accessDeniedMessage: "This route is limited to the signed-in role.",
    customRequestUnavailable: "Customer portal unavailable",
    adminAccessDenied: "Admin portal unavailable",
    directNoBooking: "Your bookings",
    signedInAsCustomer: "You are signed in as a Customer.",
    signedInAsGuide: "You are signed in as a Guide.",
    signedInAsAdmin: "You are signed in as an Administrator.",
  },
  vi: {
    signInHeading: "Đăng nhập tài khoản demo",
    customerIdentity: "Tiếp tục với Khách hàng",
    guideIdentity: "Tiếp tục với Hướng dẫn viên",
    adminIdentity: "Tiếp tục với Quản trị viên",
    signOut: "Đăng xuất",
    customerPortal: "Cổng khách hàng của bạn",
    guidePortal: "Cổng hướng dẫn viên",
    adminPortal: "Cổng quản trị viên",
    customerSchedule: "Lịch của bạn",
    cancellationBooking: "Lịch sử và ký ức",
    completedBooking: "Chợ địa phương và ẩm thực đường phố",
    requestCancellation: "Yêu cầu hủy booking",
    cancellationReason: "Lý do hủy",
    sendCancellation: "Gửi yêu cầu hủy",
    cancellationPending: "Yêu cầu hủy đang chờ quản trị viên quyết định.",
    cancellationDecision: "Quyết định: demo-booking-cancellation",
    saveRequestDecision: "Lưu quyết định yêu cầu",
    cancellationDecisionSaved: "Đã lưu quyết định hủy trong phiên demo này.",
    cancellationApproved: "Trạng thái hủy: Đã duyệt",
    readOnlyAssignment: "Hướng dẫn viên không thể nhận, hoàn thành, hủy hoặc quản trị tour tại đây.",
    reviewRating: "Điểm đánh giá",
    reviewText: "Nội dung đánh giá",
    submitReview: "Gửi đánh giá",
    reviewAvailable: "Chia sẻ đánh giá cho tour đã hoàn thành.",
    reviewSubmitted: "Đã gửi đánh giá cho tour đã hoàn thành.",
    reviewExists: "Bạn đã đánh giá booking đã hoàn thành này.",
    fullName: "Họ và tên",
    saveProfile: "Lưu hồ sơ",
    profileSaved: "Đã lưu hồ sơ trong phiên demo này.",
    resetName: "Hành khách kiểm tra reset",
    seededName: "Demo Traveler",
    chooseIdentity: "Chọn danh tính demo",
    openYourPortal: "Mở cổng của bạn",
    resetDemo: "Đặt lại demo LocalLens",
    resetComplete: "Đã đặt lại trạng thái demo LocalLens. Hãy chọn một danh tính để tiếp tục.",
    demoNotice: "Chỉ là bản demo.",
    accessDeniedMessage: "Trang này chỉ dành cho vai trò đang đăng nhập.",
    customRequestUnavailable: "Cổng khách hàng không khả dụng",
    adminAccessDenied: "Cổng quản trị viên không khả dụng",
    directNoBooking: "Booking của bạn",
    signedInAsCustomer: "Bạn đang đăng nhập với vai trò Khách hàng.",
    signedInAsGuide: "Bạn đang đăng nhập với vai trò Hướng dẫn viên.",
    signedInAsAdmin: "Bạn đang đăng nhập với vai trò Quản trị viên.",
  },
} as const;

const ROLE_PATH: Record<PortalRole, string> = {
  customer: "account",
  guide: "guide",
  admin: "admin",
};

const IDENTITY_LABEL: Record<Locale, Record<PortalRole, string>> = {
  en: {
    customer: PORTAL_COPY.en.customerIdentity,
    guide: PORTAL_COPY.en.guideIdentity,
    admin: PORTAL_COPY.en.adminIdentity,
  },
  vi: {
    customer: PORTAL_COPY.vi.customerIdentity,
    guide: PORTAL_COPY.vi.guideIdentity,
    admin: PORTAL_COPY.vi.adminIdentity,
  },
};

const IDENTITY_DISPLAY_NAME: Record<PortalRole, string> = {
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

async function assertPortalAccessibility(page: Page): Promise<void> {
  const portalRoot = ":is([data-portal-mode], [data-portal-role])";
  const portalFocusableSelector = `${portalRoot} a[href], ${portalRoot} button:not([disabled]), ${portalRoot} input:not([disabled]):not([type="hidden"]), ${portalRoot} select:not([disabled]), ${portalRoot} textarea:not([disabled]), ${portalRoot} [tabindex]:not([tabindex="-1"])`;
  const audit = await page.evaluate((focusableSelector) => {
    function parseColor(value: string): [number, number, number, number] | null {
      const match = value.match(/rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*([\d.]+))?\s*\)/);
      if (!match) return null;
      return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 1)];
    }
    function luminance([red, green, blue]: [number, number, number]): number {
      return [red, green, blue].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
    }
    function ratio(foreground: [number, number, number], background: [number, number, number]): number {
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return (light + 0.05) / (dark + 0.05);
    }
    function solidBackground(element: Element): [number, number, number] | null {
      let current: Element | null = element;
      while (current) {
        const style = getComputedStyle(current);
        const color = parseColor(style.backgroundColor);
        if (style.backgroundImage !== "none") return null;
        if (color && color[3] >= 0.99) return [color[0], color[1], color[2]];
        current = current.parentElement;
      }
      return [255, 255, 255];
    }

    function visible(element: HTMLElement): boolean {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }

    function controlText(element: HTMLElement): string {
      if (element instanceof HTMLSelectElement) return element.selectedOptions[0]?.textContent?.trim() ?? "";
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.value.trim() || element.placeholder.trim();
      }
      return element.textContent?.trim() ?? "";
    }

    const contrastViolations = Array.from(document.querySelectorAll<HTMLElement>(
      ":is([data-portal-mode], [data-portal-role]) h1, :is([data-portal-mode], [data-portal-role]) h2, :is([data-portal-mode], [data-portal-role]) h3, :is([data-portal-mode], [data-portal-role]) p, :is([data-portal-mode], [data-portal-role]) a, :is([data-portal-mode], [data-portal-role]) button, :is([data-portal-mode], [data-portal-role]) label, :is([data-portal-mode], [data-portal-role]) dt, :is([data-portal-mode], [data-portal-role]) dd, :is([data-portal-mode], [data-portal-role]) legend, :is([data-portal-mode], [data-portal-role]) summary, :is([data-portal-mode], [data-portal-role]) span, :is([data-portal-mode], [data-portal-role]) form, :is([data-portal-mode], [data-portal-role]) input, :is([data-portal-mode], [data-portal-role]) select, :is([data-portal-mode], [data-portal-role]) textarea",
    )).flatMap((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const foreground = parseColor(style.color);
      const background = solidBackground(element);
      const text = controlText(element);
      if (!text || !foreground || !background || foreground[3] < 0.99 || rect.width === 0 || rect.height === 0) return [];
      const fontSize = Number.parseFloat(style.fontSize);
      const isLarge = fontSize >= 24 || (fontSize >= 18.66 && Number.parseInt(style.fontWeight, 10) >= 700);
      const minimum = isLarge ? 3 : 4.5;
      const measured = ratio([foreground[0], foreground[1], foreground[2]], background);
      return measured < minimum ? [`${element.tagName.toLowerCase()}: ${text.slice(0, 60)} (${measured.toFixed(2)})`] : [];
    });

    return {
      contrastViolations,
      focusableCount: Array.from(document.querySelectorAll<HTMLElement>(focusableSelector)).filter(visible).length,
    };
  }, portalFocusableSelector);

  expect(audit.contrastViolations).toEqual([]);
  expect(audit.focusableCount).toBeGreaterThan(0);
  const taggedFocusableCounts = await page.evaluate((portalSelector) => {
    const visible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const portalElements = Array.from(document.querySelectorAll<HTMLElement>(portalSelector)).filter(visible);
    portalElements.forEach((element, index) => {
      element.dataset.portalFocusAuditId = String(index);
    });
    const allFocusableElements = Array.from(document.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter(visible);
    return {
      portalCount: portalElements.length,
      totalCount: allFocusableElements.length,
    };
  }, portalFocusableSelector);
  expect(taggedFocusableCounts.portalCount).toBe(audit.focusableCount);

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  const visitedPortalFocusAuditIds = new Set<string>();
  const maximumTabStops = Math.max(taggedFocusableCounts.totalCount * 2, audit.focusableCount * 4);
  for (let tabStop = 0; tabStop < maximumTabStops && visitedPortalFocusAuditIds.size < audit.focusableCount; tabStop += 1) {
    await page.keyboard.press("Tab");
    const state = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return { valid: false, name: "", tag: "none", auditId: "" };
      const style = getComputedStyle(active);
      const rect = active.getBoundingClientRect();
      const labelledBy = active.getAttribute("aria-labelledby");
      const labelledByText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim()
        : "";
      const associatedLabel = active.id ? document.querySelector(`label[for="${CSS.escape(active.id)}"]`)?.textContent?.trim() ?? "" : "";
      const wrappingLabel = active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement
        ? Array.from(active.labels ?? []).map((label) => label.textContent?.trim() ?? "").join(" ").trim()
        : "";
      const controlText = active instanceof HTMLSelectElement
        ? active.selectedOptions[0]?.textContent?.trim() ?? ""
        : active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
          ? active.value.trim() || active.placeholder.trim()
          : active.textContent?.trim() ?? "";
      const name = active.getAttribute("aria-label")
        || labelledByText
        || associatedLabel
        || wrappingLabel
        || controlText
        || active.getAttribute("title")
        || "";
      let current = active.parentElement;
      let background: [number, number, number] | null = null;
      while (current) {
        const backgroundStyle = getComputedStyle(current);
        if (backgroundStyle.backgroundImage !== "none") break;
        const color = backgroundStyle.backgroundColor.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)/);
        if (color && Number(color[4] ?? 1) >= 0.99) {
          background = [Number(color[1]), Number(color[2]), Number(color[3])];
          break;
        }
        current = current.parentElement;
      }
      if (!background) background = [255, 255, 255];
      const treatment = style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0
        ? style.outlineColor.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)/)
        : style.boxShadow !== "none" ? style.boxShadow.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)/) : null;
      const focusContrast = treatment
        ? (() => {
            const alpha = Number(treatment[4] ?? 1);
            const foreground = [1, 2, 3].map((index) => Number(treatment[index]) * alpha + background[index - 1] * (1 - alpha)) as [number, number, number];
            const luminance = (color: [number, number, number]) => color.map((channel) => {
              const normalized = channel / 255;
              return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
            }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
            const foregroundLuminance = luminance(foreground);
            const backgroundLuminance = luminance(background);
            return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
          })()
        : 0;
      const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      const visibleRatio = rect.width > 0 && rect.height > 0
        ? (visibleWidth * visibleHeight) / (rect.width * rect.height)
        : 0;
      return {
        valid: visibleRatio >= 0.5 && style.visibility !== "hidden" && focusContrast >= 3,
        name: name.trim(),
        tag: active.tagName.toLowerCase(),
        auditId: active.dataset.portalFocusAuditId ?? "",
        focusContrast,
        visibleRatio,
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        visibility: style.visibility,
        outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
        boxShadow: style.boxShadow,
      };
    });
    if (state.auditId === "" || visitedPortalFocusAuditIds.has(state.auditId)) continue;
    expect(state.valid, `portal focus ${visitedPortalFocusAuditIds.size + 1}/${audit.focusableCount} (${state.tag}) must stay visibly on screen and have a 3:1 focus treatment: ${JSON.stringify(state)}`).toBe(true);
    expect(state.name, `portal focus ${visitedPortalFocusAuditIds.size + 1}/${audit.focusableCount} (${state.tag}) needs an accessible name`).not.toBe("");
    visitedPortalFocusAuditIds.add(state.auditId);
  }
  expect(visitedPortalFocusAuditIds.size, "natural keyboard traversal must reach every visible portal control").toBe(audit.focusableCount);
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

async function chooseIdentity(page: Page, locale: Locale, role: PortalRole): Promise<void> {
  await selectDemoIdentity(page, IDENTITY_DISPLAY_NAME[role], IDENTITY_LABEL[locale][role]);
  await expect(page).toHaveURL(new RegExp(`/${locale}/${ROLE_PATH[role]}/?$`));
}

async function enterDemoIdentity(page: Page, locale: Locale, role: PortalRole): Promise<void> {
  await expect(page.getByRole("heading", { name: PORTAL_COPY[locale].signInHeading })).toBeVisible();
  await chooseIdentity(page, locale, role);
}

async function switchRole(page: Page, locale: Locale, role: PortalRole): Promise<void> {
  const copy = PORTAL_COPY[locale];
  await page.getByRole("button", { name: copy.signOut, exact: true }).click();
  await enterDemoIdentity(page, locale, role);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/en/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

test("customer cancellation reaches admin approval and only the assigned guide sees the notice", async ({ page }) => {
  const diagnostics = installDiagnostics(page);
  const copy = PORTAL_COPY.en;

  await page.goto("/en/account/");
  await enterDemoIdentity(page, "en", "customer");

  const customerBooking = page.getByRole("article", { name: copy.cancellationBooking });
  await expect(customerBooking).toBeVisible();
  await customerBooking.getByRole("button", { name: copy.requestCancellation, exact: true }).click();
  await customerBooking.getByRole("textbox", { name: copy.cancellationReason, exact: true }).fill("Schedule changed.");
  await customerBooking.getByRole("button", { name: copy.sendCancellation, exact: true }).click();
  await expect(customerBooking.getByRole("status")).toHaveText(copy.cancellationPending);
  await assertPortalAccessibility(page);

  await switchRole(page, "en", "admin");
  const adminCopy = PORTAL_COPY.en;
  await expect(page.getByRole("heading", { name: adminCopy.adminPortal })).toBeVisible();
  await expect(page.getByRole("heading", { name: adminCopy.customerPortal })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: adminCopy.customerSchedule })).toHaveCount(0);

  const bookingRegion = page.getByRole("region", { name: "Bookings and cancellations" });
  const adminBooking = bookingRegion.getByRole("listitem").filter({ hasText: "demo-booking-cancellation" });
  await expect(adminBooking).toContainText("Pending");
  await adminBooking.getByRole("combobox", { name: copy.cancellationDecision, exact: true }).selectOption("approved");
  await adminBooking.getByRole("button", { name: copy.saveRequestDecision, exact: true }).click();
  await expect(page.getByText(copy.cancellationDecisionSaved, { exact: true })).toBeVisible();
  await expect(adminBooking).toContainText("Cancelled");
  await assertPortalAccessibility(page);

  await switchRole(page, "en", "guide");
  await expect(page.getByRole("heading", { name: copy.guidePortal })).toBeVisible();
  await expect(page.getByRole("heading", { name: copy.customerPortal })).toHaveCount(0);
  await expect(page.getByRole("region", { name: copy.customerSchedule }).getByText(copy.readOnlyAssignment)).toBeVisible();
  await expect(page.getByRole("button", { name: /accept|complete|cancel/i })).toHaveCount(0);

  const assignedCancellation = page.getByRole("article", { name: copy.cancellationBooking });
  await expect(assignedCancellation.getByRole("status")).toHaveText(copy.cancellationApproved);
  const completedAssignment = page.getByRole("article", { name: copy.completedBooking });
  await expect(completedAssignment.getByText(/Cancellation status:/i)).toHaveCount(0);
  await assertPortalAccessibility(page);
  await assertHealthyPage(page, diagnostics);
});

test("a completed tour accepts one review and then keeps the review state on customer re-entry", async ({ page }) => {
  const diagnostics = installDiagnostics(page);
  const copy = PORTAL_COPY.en;

  await page.goto("/en/account/");
  await enterDemoIdentity(page, "en", "customer");

  const booking = page.getByRole("article", { name: copy.completedBooking });
  await expect(booking).toBeVisible();
  await expect(booking).toContainText("Completed");
  await expect(booking.getByText(copy.reviewAvailable, { exact: true })).toBeVisible();
  await booking.getByRole("combobox", { name: copy.reviewRating, exact: true }).selectOption("5");
  await booking.getByRole("textbox", { name: copy.reviewText, exact: true }).fill("A thoughtful local tour.");
  await booking.getByRole("button", { name: copy.submitReview, exact: true }).click();

  await expect(booking.getByRole("status")).toHaveText(copy.reviewSubmitted);
  await expect(booking.getByRole("button", { name: copy.submitReview, exact: true })).toHaveCount(0);

  await switchRole(page, "en", "customer");
  const reenteredBooking = page.getByRole("article", { name: copy.completedBooking });
  await expect(reenteredBooking.getByText(copy.reviewExists, { exact: true })).toBeVisible();
  await expect(reenteredBooking.getByRole("button", { name: copy.submitReview, exact: true })).toHaveCount(0);
  await assertPortalAccessibility(page);
  await assertHealthyPage(page, diagnostics);
});

test("Vietnamese direct entries deny the wrong role and protect the customer request route", async ({ page }) => {
  const diagnostics = installDiagnostics(page);
  const copy = PORTAL_COPY.vi;

  await page.goto("/vi/account/");
  await enterDemoIdentity(page, "vi", "customer");
  await page.goto("/vi/admin/");
  await expect(page.getByRole("heading", { name: copy.adminAccessDenied, exact: true })).toBeVisible();
  await expect(page.getByText(copy.accessDeniedMessage, { exact: true })).toBeVisible();
  await expect(page.getByText(copy.signedInAsCustomer, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: copy.adminPortal, exact: true })).toHaveCount(0);

  await switchRole(page, "vi", "guide");
  await page.goto("/vi/custom-request/");
  await expect(page.getByRole("heading", { name: copy.customRequestUnavailable, exact: true })).toBeVisible();
  await expect(page.getByText(copy.accessDeniedMessage, { exact: true })).toBeVisible();
  await expect(page.getByText(copy.signedInAsGuide, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: copy.openYourPortal, exact: true })).toHaveAttribute("href", "/vi/guide/");
  await expect(page.getByRole("heading", { name: copy.customerPortal, exact: true })).toHaveCount(0);
  await expect(page.getByText(copy.directNoBooking, { exact: true })).toHaveCount(0);

  await page.goto("/vi/guide/");
  await expect(page.getByRole("heading", { name: copy.guidePortal, exact: true })).toBeVisible();
  await assertPortalAccessibility(page);

  await switchRole(page, "vi", "admin");
  await page.evaluate(() => {
    window.sessionStorage.removeItem("localens.custom-request.v1");
    window.sessionStorage.setItem("localens.personalization.v1", JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      request: {
        startAt: "2026-09-05T10:30:00+07:00",
        durationMinutes: 360,
        areas: ["demo-hcmc-district-1"],
        budget: { currency: "VND", amountMinor: 2_000_000 },
        partySize: 2,
        guideLanguage: "vi",
        priorityWeights: { street_food: 0, history: 0, traditional_craft: 0, traditional_market: 4 },
        pace: "active",
        dietaryRequirements: [],
        mobilityRequirements: [],
        lockedStopIds: [],
        specialNeeds: "",
      },
    }));
  });
  await page.goto("/vi/planner/");
  await expect(page.getByText(copy.signedInAsAdmin, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Yêu cầu báo giá cho phiên bản này", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: copy.openYourPortal, exact: true })).toHaveAttribute("href", /\/vi\/admin\/?$/);
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("localens.custom-request.v1"))).toBeNull();

  await page.goto("/vi/custom-request/");
  await expect(page.getByRole("heading", { name: copy.customRequestUnavailable, exact: true })).toBeVisible();
  await expect(page.getByText(copy.signedInAsAdmin, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: copy.openYourPortal, exact: true })).toHaveAttribute("href", /\/vi\/admin\/?$/);
  await expect(page.getByRole("button", { name: /gửi yêu cầu|chấp nhận báo giá|stripe/i })).toHaveCount(0);

  await page.goto("/vi/booking/?departure=demo-departure-markets-and-street-food-2026-09-05&partySize=1");
  await expect(page.getByRole("heading", { name: copy.customRequestUnavailable, exact: true })).toBeVisible();
  await expect(page.getByText(copy.signedInAsAdmin, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /tiếp tục|thanh toán|mô phỏng/i })).toHaveCount(0);
  await assertHealthyPage(page, diagnostics);
});

test("bilingual portal entry and a browser reset restore the seeded customer fixture", async ({ page }) => {
  const diagnostics = installDiagnostics(page);
  const en = PORTAL_COPY.en;
  const vi = PORTAL_COPY.vi;

  await page.goto("/en/account/");
  await expect(page.getByRole("heading", { name: en.signInHeading })).toBeVisible();
  await expect(page.getByRole("heading", { name: en.customerPortal })).toHaveCount(0);
  await expect(page.getByText(en.demoNotice, { exact: true })).toBeVisible();

  await page.goto("/vi/account/");
  await expect(page.getByRole("heading", { name: vi.signInHeading })).toBeVisible();
  await expect(page.getByRole("heading", { name: vi.customerPortal })).toHaveCount(0);
  await chooseIdentity(page, "vi", "customer");
  await expect(page.getByRole("heading", { name: vi.customerPortal })).toBeVisible();

  await page.getByLabel(vi.fullName, { exact: true }).fill(vi.resetName);
  await page.getByRole("button", { name: vi.saveProfile, exact: true }).click();
  await expect(page.getByText(vi.profileSaved, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: vi.signOut, exact: true }).click();
  await expect(page.getByRole("heading", { name: vi.signInHeading })).toBeVisible();
  await page.evaluate(() => {
    window.sessionStorage.setItem("other-app", "keep");
    window.localStorage.setItem("other-app", "keep");
    window.localStorage.setItem("locallens.demo.booking.v1:reset-check", "remove");
  });
  await page.getByRole("button", { name: vi.resetDemo, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(vi.resetComplete);
  await expect(page.getByRole("heading", { name: vi.signInHeading })).toBeFocused();
  await expect.poll(() => page.evaluate(() => ({
    sessionOther: window.sessionStorage.getItem("other-app"),
    localOther: window.localStorage.getItem("other-app"),
    ownedBooking: window.localStorage.getItem("locallens.demo.booking.v1:reset-check"),
  }))).toEqual({ sessionOther: "keep", localOther: "keep", ownedBooking: null });
  await enterDemoIdentity(page, "vi", "customer");
  await expect(page.getByLabel(vi.fullName, { exact: true })).toHaveValue(vi.seededName);
  await expect(page.getByText(vi.resetName, { exact: true })).toHaveCount(0);
  await assertPortalAccessibility(page);
  await assertHealthyPage(page, diagnostics);
});
