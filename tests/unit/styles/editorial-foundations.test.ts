import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const stylesRoot = path.resolve(process.cwd(), "app", "styles");

async function readStyle(name: string) {
  return readFile(path.join(stylesRoot, name), "utf8");
}

describe("editorial style foundations", () => {
  it("uses the configured display family for the stamp treatment", async () => {
    const customerCss = await readStyle("customer-editorial.css");
    const stampRuleStart = customerCss.indexOf(".hero-stamp strong {");
    const stampRuleEnd = customerCss.indexOf("}", stampRuleStart);
    const stampRule = customerCss.slice(stampRuleStart, stampRuleEnd + 1);
    const fontFamilyDeclarations = [...customerCss.matchAll(/font-family:\s*([^;]+);/g)].map(
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
    const customerCss = await readStyle("customer-editorial.css");

    expect(tokensCss).toContain("--shadow-display: 0 1.5rem 2.5rem rgba(24, 53, 45, 0.12);");
    expect(tokensCss).toContain("--shadow-card-hover: 0 1rem 2rem rgba(24, 53, 45, 0.08);");
    expect(tokensCss).toContain("--shadow-panel: 0 1rem 2.5rem rgba(24, 53, 45, 0.06);");
    expect(customerCss).not.toContain("box-shadow: 0 1.5rem 2.5rem rgba(24, 53, 45, 0.12);");
    expect(customerCss).not.toContain("box-shadow: 0 1rem 2rem rgba(24, 53, 45, 0.08);");
    expect(customerCss).not.toContain("box-shadow: 0 1rem 2.5rem rgba(24, 53, 45, 0.06);");
    expect(customerCss.match(/box-shadow:\s*var\(--shadow-panel\);/g)).toHaveLength(4);
  });
});
