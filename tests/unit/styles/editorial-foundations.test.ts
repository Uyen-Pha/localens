import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const stylesRoot = path.resolve(process.cwd(), "app", "styles");
const globalsPath = path.resolve(process.cwd(), "app", "globals.css");
const portalStylesPath = path.resolve(process.cwd(), "components", "portals", "portal.module.css");
const editorialStyleFiles = [
  "editorial-base.css",
  "editorial-shell.css",
  "editorial-home.css",
  "editorial-home-green.css",
  "editorial-tours.css",
  "editorial-journey.css",
  "editorial-booking.css",
] as const;

async function readStyle(name: string) {
  return readFile(path.join(stylesRoot, name), "utf8");
}

async function readEditorialStyles() {
  return Promise.all(editorialStyleFiles.map((name) => readStyle(name))).then((styles) => styles.join("\n"));
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

function hexToRgb(value: string): [number, number, number] {
  const hex = value.replace("#", "");
  return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

function relativeLuminance(value: string) {
  return hexToRgb(value)
    .map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    })
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("editorial style foundations", () => {
  it("partitions customer editorial styles through the route-owned imports", async () => {
    const aggregator = await readStyle("customer-editorial.css");
    const importLines = aggregator
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    expect(importLines).toEqual([
      '@import "./editorial-base.css";',
      '@import "./editorial-shell.css";',
      '@import "./editorial-home.css";',
      '@import "./editorial-home-green.css";',
      '@import "./editorial-tours.css";',
      '@import "./editorial-journey.css";',
      '@import "./editorial-booking.css";',
    ]);

    await Promise.all(
      [
        "editorial-base.css",
        "editorial-shell.css",
        "editorial-home.css",
        "editorial-home-green.css",
        "editorial-tours.css",
        "editorial-journey.css",
        "editorial-booking.css",
      ].map(async (name) => {
        await readStyle(name);
      }),
    );
  });

  it("guards each owned stylesheet with a complete-content SHA-256 checksum", async () => {
    const checksumLine = /^\/\* editorial-css-sha256: ([0-9a-f]{64}) \*\/\n/;

    for (const name of editorialStyleFiles) {
      const normalizedStyle = normalizeLineEndings(await readStyle(name));
      const match = normalizedStyle.match(checksumLine);

      expect(match, `${name} must begin with its checksum comment`).not.toBeNull();
      if (!match) continue;

      const checksum = match[1];
      expect(checksum).toMatch(/^[0-9a-f]{64}$/);
      const contentWithoutChecksum = normalizedStyle.slice(match[0].length);
      const computedChecksum = createHash("sha256").update(contentWithoutChecksum, "utf8").digest("hex");

      expect(computedChecksum).toBe(checksum);
    }
  });

  it("defines the shared customer color aliases on the tours route root", async () => {
    const toursCss = normalizeLineEndings(await readStyle("editorial-tours.css"));
    const rootRuleStart = toursCss.indexOf(".customer-tours-page {");
    const rootRuleEnd = toursCss.indexOf("}", rootRuleStart);
    const rootRule = rootRuleStart >= 0 ? toursCss.slice(rootRuleStart, rootRuleEnd + 1) : "";

    expect(rootRule).toContain("--customer-ink: var(--color-ink);");
    expect(rootRule).toContain("--customer-ink-soft: var(--color-muted);");
    expect(rootRule).toContain("--customer-paper: var(--color-surface);");
    expect(rootRule).toContain("--customer-line: var(--color-rule);");
    expect(rootRule).toContain("--customer-orange: var(--color-vermilion);");
  });

  it("uses the configured display family for the stamp treatment", async () => {
    const editorialCss = await readEditorialStyles();
    const stampRuleStart = editorialCss.indexOf(".hero-stamp strong {");
    const stampRuleEnd = editorialCss.indexOf("}", stampRuleStart);
    const stampRule = editorialCss.slice(stampRuleStart, stampRuleEnd + 1);
    const fontFamilyDeclarations = [...editorialCss.matchAll(/font-family:\s*([^;]+);/g)].map(
      ([, declaration]) => declaration,
    );

    expect(stampRule).toContain('font-family: var(--font-display, Georgia), "Times New Roman", serif;');
    expect(stampRule).toContain("font-weight: 600;");
    expect(fontFamilyDeclarations).toContain(
      'var(--font-body, system-ui), -apple-system, "Segoe UI", sans-serif',
    );
    expect(fontFamilyDeclarations).toContain(
      'var(--font-display, Georgia), "Times New Roman", serif',
    );
  });

  it("provides named shadow tokens for repeated editorial elevation", async () => {
    const tokensCss = await readStyle("tokens.css");
    const editorialCss = await readEditorialStyles();

    expect(tokensCss).toContain("--shadow-display: 0 20px 45px rgba(9, 61, 50, 0.15);");
    expect(tokensCss).toContain("--shadow-card-hover: 0 16px 32px rgba(9, 61, 50, 0.11);");
    expect(tokensCss).toContain("--shadow-panel: 0 12px 28px rgba(9, 61, 50, 0.08);");
    expect(editorialCss).not.toContain("box-shadow: 0 20px 45px rgba(9, 61, 50, 0.15);");
    expect(editorialCss).not.toContain("box-shadow: 0 16px 32px rgba(9, 61, 50, 0.11);");
    expect(editorialCss).not.toContain("box-shadow: 0 12px 28px rgba(9, 61, 50, 0.08);");
    expect(editorialCss.match(/box-shadow:\s*var\(--shadow-panel\);/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("keeps portal accent text at normal-text contrast on white and coral-soft surfaces", async () => {
    const portalCss = normalizeLineEndings(await readFile(portalStylesPath, "utf8"));
    const accent = portalCss.match(/--portal-coral-text:\s*(#[0-9a-f]{6});/i)?.[1];
    const softSurface = portalCss.match(/--portal-coral-soft:\s*(#[0-9a-f]{6});/i)?.[1];

    expect(accent, "portal text needs a dedicated accessible accent token").toBeDefined();
    expect(softSurface).toBeDefined();
    if (!accent || !softSurface) return;

    expect(contrastRatio(accent, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(accent, softSurface)).toBeGreaterThanOrEqual(4.5);
    expect(portalCss).toContain("outline: 3px solid var(--portal-coral-text);");
    expect(portalCss).not.toMatch(/outline:\s*3px solid rgba\([^)]*,\s*0\.5\)/);
  });

  it("uses the opaque shared green focus ring for customer form controls", async () => {
    const baseCss = normalizeLineEndings(await readStyle("editorial-base.css"));
    const tokensCss = normalizeLineEndings(await readStyle("tokens.css"));
    const focusRingColor = tokensCss.match(/--focus-ring:\s*3px solid (#[0-9a-f]{6});/i)?.[1];

    expect(focusRingColor, "the shared focus ring needs an opaque color token").toBeDefined();
    expect(baseCss).toContain("outline: var(--focus-ring);");
    expect(baseCss).not.toMatch(/outline:\s*3px solid rgba\(19,\s*109,\s*90,\s*0\.28\)/);
    if (!focusRingColor) return;
    expect(contrastRatio(focusRingColor, "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("keeps keyboard-focused controls and their outline clear of viewport edges", async () => {
    const globalsCss = normalizeLineEndings(await readFile(globalsPath, "utf8"));

    expect(globalsCss).toMatch(
      /:where\(a\[href\], button, input, select, textarea, \[tabindex\]:not\(\[tabindex="-1"\]\)\)\s*\{[^}]*scroll-margin-block:\s*calc\(var\(--space-2\) \+ 4px\);/,
    );
  });

  it("reflows the route stops on mobile without hiding copy or masking page overflow", async () => {
    const homeCss = normalizeLineEndings(await readStyle("editorial-home-green.css"));
    const rootRule = homeCss.match(/\.customer-home\.customer-home--green\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const mobileBlock = homeCss.match(/@media \(max-width: 720px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(rootRule).not.toMatch(/overflow:\s*(hidden|clip)/);
    expect(mobileBlock).toMatch(/\.customer-home--green \.customer-hero__stops\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
    expect(mobileBlock).not.toMatch(/\.customer-home--green \.customer-hero__stops li > p:last-child\s*\{[^}]*display:\s*none;/);
  });
});
