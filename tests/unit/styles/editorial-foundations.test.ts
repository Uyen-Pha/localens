import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const stylesRoot = path.resolve(process.cwd(), "app", "styles");
const editorialStyleFiles = [
  "editorial-base.css",
  "editorial-shell.css",
  "editorial-home.css",
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
      '@import "./editorial-tours.css";',
      '@import "./editorial-journey.css";',
      '@import "./editorial-booking.css";',
    ]);

    await Promise.all(
      [
        "editorial-base.css",
        "editorial-shell.css",
        "editorial-home.css",
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
    expect(fontFamilyDeclarations).toEqual([
      'var(--font-display, Georgia), "Times New Roman", serif',
      'var(--font-body, system-ui), -apple-system, "Segoe UI", sans-serif',
      'var(--font-display, Georgia), "Times New Roman", serif',
    ]);
  });

  it("provides named shadow tokens for repeated editorial elevation", async () => {
    const tokensCss = await readStyle("tokens.css");
    const editorialCss = await readEditorialStyles();

    expect(tokensCss).toContain("--shadow-display: 0 1.5rem 2.5rem rgba(24, 53, 45, 0.12);");
    expect(tokensCss).toContain("--shadow-card-hover: 0 1rem 2rem rgba(24, 53, 45, 0.08);");
    expect(tokensCss).toContain("--shadow-panel: 0 1rem 2.5rem rgba(24, 53, 45, 0.06);");
    expect(editorialCss).not.toContain("box-shadow: 0 1.5rem 2.5rem rgba(24, 53, 45, 0.12);");
    expect(editorialCss).not.toContain("box-shadow: 0 1rem 2rem rgba(24, 53, 45, 0.08);");
    expect(editorialCss).not.toContain("box-shadow: 0 1rem 2.5rem rgba(24, 53, 45, 0.06);");
    expect(editorialCss.match(/box-shadow:\s*var\(--shadow-panel\);/g)).toHaveLength(4);
  });
});
