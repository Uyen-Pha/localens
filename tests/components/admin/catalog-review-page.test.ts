// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("admin catalog review page wiring", () => {
  it("delegates queue loading and review writes to the authenticated live client boundary", () => {
    const source = readFileSync(join(process.cwd(), "app/[locale]/admin/catalog/page.tsx"), "utf8");

    expect(source).toContain("CatalogReviewLiveQueue");
    expect(source).not.toContain("rows={[]}");
    expect(source).not.toContain('viewerRole="unknown"');
    expect(source).not.toContain("onReview=");
  });
});
