import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  CUSTOM_REQUEST_SESSION_KEY,
  localDraftFingerprint,
  type CustomRequestDraftInput,
} from "@/lib/application/planner/custom-request-demo";
import { createFoodFixturePlannerState } from "./food-fixture";

const viewports = [
  { name: "desktop", width: 1488, height: 1059 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const bookingTotalViewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
  { name: "narrow", width: 320, height: 568 },
] as const;

const bookingLocales = ["en", "vi"] as const;

const routes = [
  { name: "home-en", path: "/en/", heading: "Your Saigon, planned around you" },
  { name: "home-vi", path: "/vi/", heading: "Sài Gòn của bạn, được thiết kế quanh bạn" },
  { name: "tours-en", path: "/en/tours/", heading: "Fixed tours in Ho Chi Minh City" },
  { name: "planner-en", path: "/en/planner/", heading: "Your personalized route proposal" },
  { name: "custom-request-en", path: "/en/custom-request/", heading: "Request a review and quote" },
  {
    name: "booking-en",
    path: "/en/booking/?departure=demo-departure-markets-and-street-food-2026-09-05&partySize=1",
    heading: "Book a fixed tour",
  },
] as const;

const qaRoot = path.resolve(process.cwd(), "docs/design/qa");
const evidenceRoot = path.resolve(process.cwd(), "test-results/customer-visual");

async function preparePage(page: Page): Promise<string[]> {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      browserErrors.push(`response: ${response.status()} ${response.url()}`);
    }
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  return browserErrors;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/en/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

async function waitForDeterministicPage(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        scroll-behavior: auto !important;
      }
      nextjs-portal {
        display: none !important;
      }
    `,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, async (image) => {
        if (!image.complete) {
          await new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          });
        }
        if (typeof image.decode === "function") {
          try {
            await image.decode();
          } catch {
            // An image error is reported separately by the page diagnostics.
          }
        }
      }),
    );
  });
}

async function assertAccessibilitySmoke(page: Page): Promise<void> {
  const diagnostics = await page.evaluate(() => {
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

    function contrastRatio(foreground: [number, number, number], background: [number, number, number]): number {
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return (light + 0.05) / (dark + 0.05);
    }

    function solidBackground(element: Element): [number, number, number] | null {
      let current: Element | null = element;
      while (current) {
        const style = getComputedStyle(current);
        if (style.backgroundImage !== "none") return null;
        const color = parseColor(style.backgroundColor);
        if (color && color[3] >= 0.99) return [color[0], color[1], color[2]];
        current = current.parentElement;
      }
      return [250, 244, 235];
    }

    function controlText(element: HTMLElement): string {
      if (element instanceof HTMLSelectElement) return element.selectedOptions[0]?.textContent?.trim() ?? "";
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.value.trim() || element.placeholder.trim();
      }
      return element.textContent?.trim() ?? "";
    }

    function isUserVisibleText(element: HTMLElement): boolean {
      return element.closest('[aria-hidden="true"]') === null;
    }

    const contrastFixture = document.createElement("div");
    contrastFixture.innerHTML = `
      <span aria-hidden="true" data-contrast-fixture="hidden">hidden-low-contrast-fixture</span>
      <span data-contrast-fixture="visible">visible-low-contrast-fixture</span>
    `;
    contrastFixture.querySelectorAll<HTMLElement>("span").forEach((fixture) => {
      fixture.style.backgroundColor = "rgb(250, 244, 235)";
      fixture.style.color = "rgb(250, 244, 235)";
      fixture.style.fontSize = "16px";
      fixture.style.position = "fixed";
      fixture.style.inset = "0 auto auto 0";
    });
    document.body.append(contrastFixture);

    const headingLevels = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"), (heading) => Number(heading.tagName.slice(1)));
    const controlsWithoutLabels = Array.from(document.querySelectorAll("input, select, textarea"))
      .filter((control) => {
        const id = control.getAttribute("id");
        return !control.getAttribute("aria-label")
          && !control.getAttribute("aria-labelledby")
          && !control.closest("label")
          && !(id && document.querySelector(`label[for="${CSS.escape(id)}"]`));
      })
      .map((control) => `${control.tagName.toLowerCase()}#${control.id}`);
    const imagesWithoutAlt = Array.from(document.images)
      .filter((image) => !image.hasAttribute("alt"))
      .map((image) => image.currentSrc || image.src);
    const collectedContrastViolations = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p, a, button, label, dt, dd, legend, summary, span, form, input, select, textarea"))
      .flatMap((element) => {
        if (!isUserVisibleText(element)) return [];
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const text = controlText(element);
        const foreground = parseColor(style.color);
        const background = solidBackground(element);
        if (!text || !foreground || !background || rect.width === 0 || rect.height === 0 || foreground[3] < 0.99) return [];
        const fontSize = Number.parseFloat(style.fontSize);
        const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && Number.parseInt(style.fontWeight, 10) >= 700);
        const minimum = isLargeText ? 3 : 4.5;
        const ratio = contrastRatio([foreground[0], foreground[1], foreground[2]], background);
        return ratio < minimum ? [`${element.tagName.toLowerCase()}: ${text.slice(0, 80)} (${ratio.toFixed(2)} < ${minimum})`] : [];
      });
    const contrastFixtureContract = {
      hiddenDecorationExcluded: !collectedContrastViolations.some((violation) => violation.includes("hidden-low-contrast-fixture")),
      visibleTextChecked: collectedContrastViolations.some((violation) => violation.includes("visible-low-contrast-fixture")),
    };
    const contrastViolations = collectedContrastViolations.filter((violation) => !violation.includes("-low-contrast-fixture"));
    contrastFixture.remove();

    const clippedContent = Array.from(document.querySelectorAll<HTMLElement>("a, button, input, select, textarea, h1, h2, h3, p, li, dt, dd, img"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden" || style.display === "none") return false;
        if (element.closest("nextjs-portal")) return false;
        const scrollContainer = element.closest<HTMLElement>("[class*='localNavLinks']");
        if (scrollContainer && ["auto", "scroll"].includes(getComputedStyle(scrollContainer).overflowX)) return false;
        return rect.left < -1 || rect.right > document.documentElement.clientWidth + 1;
      })
      .map((element) => `${element.tagName.toLowerCase()}: ${(element.textContent || element.getAttribute("alt") || "").trim().slice(0, 80)}`);

    return {
      headingLevels,
      controlsWithoutLabels,
      imagesWithoutAlt,
      hasSingleH1: headingLevels.filter((level) => level === 1).length === 1,
      hasValidHeadingOrder: headingLevels.every((level, index) => index === 0 || level - headingLevels[index - 1] <= 1),
      hasLandmarks: Boolean(document.querySelector("main") && document.querySelector("nav") && document.querySelector("footer")),
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      contrastViolations,
      contrastFixtureContract,
      clippedContent,
    };
  });

  expect(diagnostics.hasSingleH1).toBe(true);
  expect(diagnostics.hasValidHeadingOrder).toBe(true);
  expect(diagnostics.hasLandmarks).toBe(true);
  expect(diagnostics.hasHorizontalOverflow).toBe(false);
  expect(diagnostics.controlsWithoutLabels).toEqual([]);
  expect(diagnostics.imagesWithoutAlt).toEqual([]);
  expect(diagnostics.contrastFixtureContract).toEqual({
    hiddenDecorationExcluded: true,
    visibleTextChecked: true,
  });
  expect(diagnostics.contrastViolations).toEqual([]);
  expect(diagnostics.clippedContent).toEqual([]);

  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await expect(page.locator(".skip-link")).toBeVisible();
  const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const focusableCount = await page.evaluate((selector) => {
    const focusableElements = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return !element.closest("nextjs-portal") && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    focusableElements.forEach((element, index) => {
      element.dataset.focusAuditId = String(index);
    });
    return focusableElements.length;
  }, focusableSelector);

  expect(focusableCount).toBeGreaterThan(0);
  const visitedFocusAuditIds = new Set<string>();
  const maximumTabStops = focusableCount * 4;
  for (let tabStop = 0; tabStop < maximumTabStops && visitedFocusAuditIds.size < focusableCount; tabStop += 1) {
    const focusState = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return { valid: false, label: "", tag: "none", auditId: "" };
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
      const label = active.getAttribute("aria-label")
        || labelledByText
        || associatedLabel
        || wrappingLabel
        || controlText
        || active.getAttribute("title")
        || "";
      const background = (() => {
        let current = active.parentElement;
        while (current) {
          const backgroundStyle = getComputedStyle(current);
          if (backgroundStyle.backgroundImage !== "none") return null;
          const color = backgroundStyle.backgroundColor.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)/);
          if (color && Number(color[4] ?? 1) >= 0.99) return [Number(color[1]), Number(color[2]), Number(color[3])] as [number, number, number];
          current = current.parentElement;
        }
        return [250, 244, 235] as [number, number, number];
      })();
      const focusTreatment = style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0
        ? style.outlineColor.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)/)
        : style.boxShadow !== "none" ? style.boxShadow.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)/) : null;
      const outlineExtent = style.outlineStyle !== "none"
        ? Math.max(0, Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset))
        : 0;
      const viewport = {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      };
      const focusContrast = background && focusTreatment
        ? (() => {
            const alpha = Number(focusTreatment[4] ?? 1);
            const foreground = [1, 2, 3].map((index) => Number(focusTreatment[index]) * alpha + background[index - 1] * (1 - alpha)) as [number, number, number];
            const channelLuminance = (color: [number, number, number]) => color.map((channel) => {
              const normalized = channel / 255;
              return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
            }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
            const foregroundLuminance = channelLuminance(foreground);
            const backgroundLuminance = channelLuminance(background);
            return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
          })()
        : 0;
      return {
        valid: rect.width > 0 && rect.height > 0
          && rect.left - outlineExtent >= -1 && rect.right + outlineExtent <= viewport.width + 1
          && rect.top - outlineExtent >= -1 && rect.bottom + outlineExtent <= viewport.height + 1
          && style.visibility !== "hidden" && focusContrast >= 3,
        label: label.trim(),
        tag: active.tagName.toLowerCase(),
        auditId: active.dataset.focusAuditId ?? "",
        focusContrast,
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        focusTreatment: {
          matchesFocus: active.matches(":focus"),
          matchesFocusVisible: active.matches(":focus-visible"),
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          outlineOffset: style.outlineOffset,
          outlineColor: style.outlineColor,
          boxShadow: style.boxShadow,
          outlineExtent,
          viewport,
        },
      };
    });
    const seenBefore = visitedFocusAuditIds.has(focusState.auditId);
    if (!seenBefore) {
      visitedFocusAuditIds.add(focusState.auditId);
      expect(focusState.valid, `focus ${visitedFocusAuditIds.size}/${focusableCount} must be visible, in bounds, and have a 3:1 focus treatment: ${JSON.stringify(focusState)}`).toBe(true);
      expect(focusState.label, `focus ${visitedFocusAuditIds.size}/${focusableCount} (${focusState.tag}) needs an accessible name`).not.toBe("");
    }
    await page.keyboard.press("Tab");
  }
  expect(visitedFocusAuditIds.size, "keyboard traversal must reach every visible focusable element").toBe(focusableCount);
}

async function prepareProtectedCustomerRoute(page: Page, routeName: (typeof routes)[number]["name"]): Promise<void> {
  if (routeName !== "custom-request-en" && routeName !== "booking-en") return;

  await page.goto("/en/sign-in/");
  const customerCard = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Demo Traveler", exact: true }),
  });
  await expect(customerCard).toHaveCount(1);
  await Promise.all([
    page.waitForURL(/\/en\/account\/$/),
    customerCard.getByRole("link", { name: "Continue as Customer", exact: true }).click(),
  ]);

  if (routeName === "booking-en") return;

  const plannerState = createFoodFixturePlannerState("en");
  if (plannerState.preferences === null) throw new Error("visual fixture requires planner preferences");
  const draftInput: CustomRequestDraftInput = {
    planId: plannerState.planId,
    revision: plannerState.current.revision,
    preferences: plannerState.preferences,
    revisionSnapshot: plannerState.current,
  };
  const envelope = {
    version: 1 as const,
    savedAt: Date.now(),
    draft: {
      ...draftInput,
      integrityFingerprint: localDraftFingerprint(draftInput),
    },
  };
  await page.evaluate(({ key, value }) => {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  }, { key: CUSTOM_REQUEST_SESSION_KEY, value: envelope });
}

async function resetCustomerDemoState(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.context().clearCookies();
}

async function assertTextZoom(page: Page): Promise<void> {
  const zoomStyle = await page.addStyleTag({ content: "html { font-size: 125% !important; }" });
  const diagnostics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    clippedContent: Array.from(document.querySelectorAll<HTMLElement>("a, button, input, select, textarea, h1, h2, h3, p, li, img"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return !element.closest("nextjs-portal") && rect.width > 0 && rect.height > 0
          && style.visibility !== "hidden" && style.display !== "none"
          && (rect.left < -1 || rect.right > window.innerWidth + 1);
      })
      .map((element) => `${element.tagName.toLowerCase()}: ${(element.textContent || element.getAttribute("alt") || "").trim().slice(0, 80)}`),
  }));
  await zoomStyle.evaluate((element) => (element as HTMLElement).remove());
  expect(diagnostics.overflow).toBe(false);
  expect(diagnostics.clippedContent).toEqual([]);
}

async function clearFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
}

async function assertDesktopHomeComposition(page: Page): Promise<void> {
  const composition = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>(".customer-hero__actions .button"));
    const categoryHeadings = Array.from(document.querySelectorAll<HTMLElement>(".experience-card h3"));
    const categoryRules = Array.from(document.querySelectorAll<HTMLElement>(".experience-card .editorial-rule"));
    const withinViewport = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    };

    return {
      ctaTopPositions: buttons.map((button) => Math.round(button.getBoundingClientRect().top)),
      categoryHeadingVisibility: categoryHeadings.map(withinViewport),
      categoryRuleVisibility: categoryRules.map(withinViewport),
    };
  });

  expect.soft(composition.ctaTopPositions).toHaveLength(2);
  expect.soft(composition.ctaTopPositions[0]).toBe(composition.ctaTopPositions[1]);
  expect.soft(composition.categoryHeadingVisibility).toEqual([true, true, true, true]);
  expect.soft(composition.categoryRuleVisibility).toEqual([true, true, true, true]);
}

async function assertRouteCtas(page: Page, routeName: (typeof routes)[number]["name"]): Promise<void> {
  if (routeName === "home-en") {
    await expect(page.getByRole("link", { name: /Plan my Saigon day/ })).toHaveAttribute("href", "/en/planner/");
    await expect(page.getByRole("link", { name: /Browse ready-made tours/ })).toHaveAttribute("href", "/en/tours/");
  }
  if (routeName === "home-vi") {
    await expect(page.getByRole("link", { name: /Lên kế hoạch ngày ở Sài Gòn/ })).toHaveAttribute("href", "/vi/planner/");
    await expect(page.getByRole("link", { name: /Xem các tour có sẵn/ })).toHaveAttribute("href", "/vi/tours/");
  }
  if (routeName === "tours-en") {
    const bookingHref = await page.getByRole("link", { name: /^Book / }).first().getAttribute("href");
    expect(bookingHref?.startsWith("/en/booking/?")).toBe(true);
  }
  if (routeName === "planner-en") {
    await expect(page.getByRole("link", { name: "Back to LocalLens home" })).toHaveAttribute("href", "/en/");
  }
  if (routeName === "custom-request-en") {
    await expect(page.getByRole("link", { name: "Back to planner" })).toHaveAttribute("href", "/en/planner/");
  }
  if (routeName === "booking-en") {
    await expect(page.getByRole("link", { name: "Back to fixed tours" })).toHaveAttribute("href", "/en/tours/");
  }
}

for (const viewport of bookingTotalViewports) {
  test.describe(`${viewport.name} booking total`, () => {
    test.use({ viewport });

    for (const locale of bookingLocales) {
      test(`keeps the ${locale.toUpperCase()} booking total readable`, async ({ page }) => {
        const browserErrors = await preparePage(page);
        const bookingTotalEvidenceRoot = path.join(evidenceRoot, "booking-total", "final");
        await mkdir(bookingTotalEvidenceRoot, { recursive: true });
        await prepareProtectedCustomerRoute(page, "booking-en");

        const bookingPath = `/${locale}/booking/?departure=demo-departure-markets-and-street-food-2026-09-05&partySize=1`;
        const response = await page.goto(bookingPath, { waitUntil: "domcontentloaded" });
        expect(response?.status(), `${bookingPath} response`).toBe(200);
        await waitForDeterministicPage(page);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);

        const totalRow = page.locator(".booking-flow__price-summary div").filter({
          has: page.locator("dt").filter({ hasText: /total|tổng/i }),
        });
        await expect(totalRow).toHaveCount(1);
        const totalPrice = totalRow.locator("dd");
        await expect(totalPrice).toHaveText(locale === "vi" ? /VND\s480\.000/ : /VND\s480,000/);

        await clearFocus(page);
        await page.screenshot({
          path: path.join(bookingTotalEvidenceRoot, `${locale}-${viewport.width}x${viewport.height}.png`),
          fullPage: true,
        });

        const metrics = await totalPrice.evaluate((element) => ({
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          whiteSpace: getComputedStyle(element).whiteSpace,
          overflowWrap: getComputedStyle(element).overflowWrap,
        }));
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
        expect(metrics.whiteSpace).toBe("nowrap");
        expect(metrics.overflowWrap).toBe("normal");

        const pageMetrics = await page.evaluate(() => {
          document.documentElement.style.scrollbarGutter = "stable";
          return {
            bodyMinWidth: getComputedStyle(document.body).minWidth,
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          };
        });
        expect(pageMetrics.bodyMinWidth).toBe("0px");
        expect(pageMetrics.scrollWidth).toBeLessThanOrEqual(pageMetrics.clientWidth);
        await assertAccessibilitySmoke(page);
        expect(browserErrors).toEqual([]);
      });
    }
  });
}

for (const viewport of viewports) {
  test.describe(`${viewport.name} customer experience`, () => {
    test.use({ viewport });

    test(`covers all customer routes with deterministic full-page evidence`, async ({ page }) => {
      const browserErrors = await preparePage(page);
      await mkdir(evidenceRoot, { recursive: true });

      for (const route of routes) {
        await prepareProtectedCustomerRoute(page, route.name);
        const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
        expect(response?.status(), `${route.path} response`).toBe(200);
        await waitForDeterministicPage(page);
        await expect(page).toHaveURL(new RegExp(`${route.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
        await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
        await assertRouteCtas(page, route.name);
        await assertAccessibilitySmoke(page);
        await clearFocus(page);
        await page.screenshot({
          path: path.join(evidenceRoot, `${viewport.name}-${route.name}.png`),
          fullPage: true,
        });
        await assertTextZoom(page);
        await resetCustomerDemoState(page);
      }

      expect(browserErrors).toEqual([]);
    });

    test(`captures the ${viewport.name} home viewport`, async ({ page }) => {
      const browserErrors = await preparePage(page);
      await mkdir(qaRoot, { recursive: true });
      await page.goto("/en/", { waitUntil: "domcontentloaded" });
      await waitForDeterministicPage(page);
      await expect(page.getByRole("heading", { level: 1, name: "Your Saigon, planned around you" })).toBeVisible();
      await assertRouteCtas(page, "home-en");
      await assertAccessibilitySmoke(page);
      await clearFocus(page);
      if (viewport.name === "desktop") {
        await assertDesktopHomeComposition(page);
      }

      const outputName = viewport.name === "desktop"
        ? "home-desktop-implementation.png"
        : `home-${viewport.name}.png`;
      await page.screenshot({ path: path.join(qaRoot, outputName), fullPage: false });
      await page.screenshot({ path: path.join(evidenceRoot, `${viewport.name}-home-full-page.png`), fullPage: true });
      await assertTextZoom(page);
      expect(browserErrors).toEqual([]);
    });
  });
}
