import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const viewports = [
  { name: "desktop", width: 1488, height: 1059 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const routes = [
  { name: "home-en", path: "/en/", heading: "The city is more than its landmarks" },
  { name: "home-vi", path: "/vi/", heading: "Thành phố không chỉ có những địa danh nổi tiếng" },
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
    // Static preview has no RSC endpoint for Link prefetches; those requests
    // are intentionally aborted below and Chromium reports ERR_FAILED.
    if (
      message.type() === "error"
      && !message.text().includes("ERR_FAILED")
      && !message.text().includes("Failed to load resource: the server responded with a status of 404")
    ) {
      browserErrors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().includes("_rsc=")) {
      browserErrors.push(`response: ${response.status()} ${response.url()}`);
    }
  });
  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.searchParams.has("_rsc")) {
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  return browserErrors;
}

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
      const match = value.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)$/);
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
    const active = document.activeElement;
    const activeStyle = active ? getComputedStyle(active) : null;
    const activeRect = active?.getBoundingClientRect();
    const contrastViolations = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6, p, a, button, label, dt, dd, legend, summary"))
      .flatMap((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const text = element.textContent?.trim();
        const foreground = parseColor(style.color);
        const background = solidBackground(element);
        if (!text || !foreground || !background || rect.width === 0 || rect.height === 0 || foreground[3] < 0.99) return [];
        const fontSize = Number.parseFloat(style.fontSize);
        const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && Number.parseInt(style.fontWeight, 10) >= 700);
        const minimum = isLargeText ? 3 : 4.5;
        const ratio = contrastRatio([foreground[0], foreground[1], foreground[2]], background);
        return ratio < minimum ? [`${element.tagName.toLowerCase()}: ${text.slice(0, 80)} (${ratio.toFixed(2)} < ${minimum})`] : [];
      });

    return {
      headingLevels,
      controlsWithoutLabels,
      imagesWithoutAlt,
      hasSingleH1: headingLevels.filter((level) => level === 1).length === 1,
      hasValidHeadingOrder: headingLevels.every((level, index) => index === 0 || level - headingLevels[index - 1] <= 1),
      hasLandmarks: Boolean(document.querySelector("main") && document.querySelector("nav") && document.querySelector("footer")),
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      contrastViolations,
      focusIsVisible: Boolean(activeRect && activeRect.width > 0 && activeRect.height > 0)
        && activeStyle?.visibility !== "hidden"
        && activeStyle?.display !== "none"
        && (activeStyle?.outlineStyle !== "none" || activeStyle?.boxShadow !== "none"),
    };
  });

  expect(diagnostics.hasSingleH1).toBe(true);
  expect(diagnostics.hasValidHeadingOrder).toBe(true);
  expect(diagnostics.hasLandmarks).toBe(true);
  expect(diagnostics.hasHorizontalOverflow).toBe(false);
  expect(diagnostics.controlsWithoutLabels).toEqual([]);
  expect(diagnostics.imagesWithoutAlt).toEqual([]);
  expect(diagnostics.contrastViolations).toEqual([]);

  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await expect(page.locator(".skip-link")).toBeVisible();
  const focusIsVisible = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    const style = getComputedStyle(active);
    const rect = active.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.outlineStyle !== "none";
  });
  expect(focusIsVisible).toBe(true);
}

async function assertTextZoom(page: Page): Promise<void> {
  const zoomStyle = await page.addStyleTag({ content: "html { font-size: 125% !important; }" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await zoomStyle.evaluate((element) => (element as HTMLElement).remove());
  expect(overflow).toBe(false);
}

async function clearFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

async function assertRouteCtas(page: Page, routeName: (typeof routes)[number]["name"]): Promise<void> {
  if (routeName === "home-en") {
    await expect(page.getByRole("link", { name: /Discover Saigon tours/ })).toHaveAttribute("href", "/en/tours/");
    await expect(page.getByRole("link", { name: /Design a private journey/ })).toHaveAttribute("href", "/en/planner/");
  }
  if (routeName === "home-vi") {
    await expect(page.getByRole("link", { name: /Khám phá tour Sài Gòn/ })).toHaveAttribute("href", "/vi/tours/");
    await expect(page.getByRole("link", { name: /Thiết kế hành trình riêng/ })).toHaveAttribute("href", "/vi/planner/");
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

for (const viewport of viewports) {
  test.describe(`${viewport.name} customer experience`, () => {
    test.use({ viewport });

    test(`covers all customer routes with deterministic full-page evidence`, async ({ page }) => {
      const browserErrors = await preparePage(page);
      await mkdir(evidenceRoot, { recursive: true });

      for (const route of routes) {
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
      }

      expect(browserErrors).toEqual([]);
    });

    test(`captures the ${viewport.name} home viewport`, async ({ page }) => {
      const browserErrors = await preparePage(page);
      await mkdir(qaRoot, { recursive: true });
      await page.goto("/en/", { waitUntil: "domcontentloaded" });
      await waitForDeterministicPage(page);
      await expect(page.getByRole("heading", { level: 1, name: "The city is more than its landmarks" })).toBeVisible();
      await assertRouteCtas(page, "home-en");
      await assertAccessibilitySmoke(page);
      await clearFocus(page);

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
