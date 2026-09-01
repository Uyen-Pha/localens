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
    customRequestUnavailable: "Customer portal unavailable",
    adminAccessDenied: "Admin portal unavailable",
    accessDeniedMessage: "This route is limited to the signed-in role.",
    chooseIdentity: "Choose a demo identity",
    directNoBooking: "Your bookings",
    demoNotice: "Demo-only.",
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
    customRequestUnavailable: "Cổng khách hàng không khả dụng",
    adminAccessDenied: "Cổng quản trị viên không khả dụng",
    accessDeniedMessage: "Tuyến này chỉ dành cho vai trò đang đăng nhập.",
    chooseIdentity: "Chọn danh tính demo",
    directNoBooking: "Booking của bạn",
    demoNotice: "Chỉ là bản demo.",
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

interface BrowserDiagnostics {
  consoleErrors: string[];
  pageErrors: string[];
  failedResponses: string[];
}

async function softNavigate(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState(null, "", nextPath);
  }, path);
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(page).toHaveURL(new RegExp(`${escapedPath}$`));
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
  const portalFocusableSelector = '[data-portal-mode] a[href], [data-portal-mode] button:not([disabled]), [data-portal-mode] input:not([disabled]):not([type="hidden"]), [data-portal-mode] select:not([disabled]), [data-portal-mode] textarea:not([disabled]), [data-portal-mode] [tabindex]:not([tabindex="-1"])';
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
      "[data-portal-mode] h1, [data-portal-mode] h2, [data-portal-mode] h3, [data-portal-mode] p, [data-portal-mode] a, [data-portal-mode] button, [data-portal-mode] label, [data-portal-mode] dt, [data-portal-mode] dd, [data-portal-mode] legend, [data-portal-mode] summary, [data-portal-mode] span, [data-portal-mode] form, [data-portal-mode] input, [data-portal-mode] select, [data-portal-mode] textarea",
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
  await page.evaluate((focusableSelector) => {
    const first = Array.from(document.querySelectorAll<HTMLElement>(focusableSelector)).find((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    first?.focus();
  }, portalFocusableSelector);
  for (let index = 0; index < audit.focusableCount; index += 1) {
    if (index > 0) await page.keyboard.press("Tab");
    const state = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return { valid: false, name: "", tag: "none" };
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
            const foreground = [1, 2, 3].map((index) => Number(treatment[index])) as [number, number, number];
            const luminance = (color: [number, number, number]) => color.map((channel) => {
              const normalized = channel / 255;
              return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
            }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
            const foregroundLuminance = luminance(foreground);
            const backgroundLuminance = luminance(background);
            return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
          })()
        : 0;
      return {
        valid: rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.right <= window.innerWidth + 1
          && rect.top >= -1 && rect.bottom <= window.innerHeight + 1
          && style.visibility !== "hidden" && focusContrast >= 3,
        name: name.trim(),
        tag: active.tagName.toLowerCase(),
        focusContrast,
      };
    });
    expect(state.valid, `portal focus ${index + 1}/${audit.focusableCount} (${state.tag}) must be visible, in bounds, and have a 3:1 focus treatment`).toBe(true);
    expect(state.name, `portal focus ${index + 1}/${audit.focusableCount} (${state.tag}) needs an accessible name`).not.toBe("");
  }
}

async function chooseIdentity(page: Page, locale: Locale, role: PortalRole): Promise<void> {
  await page.getByRole("link", { name: IDENTITY_LABEL[locale][role], exact: true }).click();
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
  await expect(page.getByText(copy.readOnlyAssignment)).toBeVisible();
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

test("bilingual direct entries fail closed and a browser reset restores the seeded customer fixture", async ({ page }) => {
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

  await softNavigate(page, "/vi/admin/");
  await expect(page.getByRole("heading", { name: vi.adminAccessDenied })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(vi.accessDeniedMessage);
  await expect(page.getByRole("heading", { name: vi.adminPortal })).toHaveCount(0);
  await softNavigate(page, "/vi/account/");
  await expect(page.getByRole("heading", { name: vi.customerPortal })).toBeVisible();

  await page.getByLabel(vi.fullName, { exact: true }).fill(vi.resetName);
  await page.getByRole("button", { name: vi.saveProfile, exact: true }).click();
  await expect(page.getByText(vi.profileSaved, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: vi.signOut, exact: true }).click();
  await expect(page.getByRole("heading", { name: vi.signInHeading })).toBeVisible();
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await enterDemoIdentity(page, "vi", "customer");
  await expect(page.getByLabel(vi.fullName, { exact: true })).toHaveValue(vi.seededName);
  await expect(page.getByText(vi.resetName, { exact: true })).toHaveCount(0);

  await softNavigate(page, "/vi/custom-request/");
  await expect(page.getByRole("heading", { name: vi.customRequestUnavailable })).toBeVisible();
  await expect(page.getByRole("link", { name: vi.chooseIdentity, exact: true })).toHaveAttribute("href", "/vi/sign-in/");
  await expect(page.getByText(vi.directNoBooking, { exact: true })).toHaveCount(0);
  await assertPortalAccessibility(page);
  await assertHealthyPage(page, diagnostics);
});
