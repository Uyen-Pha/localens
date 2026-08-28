// @vitest-environment node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error The readiness boundary is an executable JavaScript CLI and is covered by focused runtime tests.
import { assessSeedReadiness, SEED_READINESS_CODES } from "@/scripts/generate-supabase-seed.mjs";

const repoRoot = process.cwd();

type JsonRecord = Record<string, unknown>;
type ReadinessResult = { ok: boolean; issues: Array<{ code: string; message: string; details: string[] }> };

function copyFixture(mutator?: (root: string) => void): string {
  const root = mkdtempSync(join(tmpdir(), "localens-task15-readiness-"));
  for (const relative of [
    ["data", "sources"],
    ["data", "approvals"],
  ]) {
    const source = join(repoRoot, ...relative);
    const target = join(root, ...relative);
    mkdirSync(target, { recursive: true });
    for (const file of readdirSync(source)) copyFileSync(join(source, file), join(target, file));
  }
  mkdirSync(join(root, "supabase"), { recursive: true });
  writeFileSync(join(root, "supabase", "seed.sql"), "-- existing sentinel\n", "utf8");
  mutator?.(root);
  return root;
}

function mutateJson(root: string, relative: string, mutator: (value: JsonRecord) => void): void {
  const file = join(root, relative);
  const value = JSON.parse(readFileSync(file, "utf8")) as JsonRecord;
  mutator(value);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fixtureFoodVendor(place: JsonRecord): JsonRecord {
  const sourceUrl = place.sourceUrl as string;
  return {
    slug: String(place.slug) + "-fixture-stall",
    status: "sellable",
    title: { en: "Fixture Stall", vi: "Quầy thử nghiệm" },
    description: { en: "Fixture vendor for readiness tests.", vi: "Quầy thử nghiệm cho kiểm tra readiness." },
    locationNote: "Gate A",
    serviceType: "stall",
    hours: [{ days: "Monday-Sunday", opens: "08:00", closes: "17:00" }],
    support: { vegetarian: "unknown", halal: "unknown", allergens: "unknown" },
    menuItems: [{
      slug: String(place.slug) + "-fixture-dish",
      status: "sellable",
      title: { en: "Fixture Dish", vi: "Món thử nghiệm" },
      description: { en: "Fixture menu item.", vi: "Món thử nghiệm." },
      servingUnit: "portion",
      priceVndMin: 40_000,
      priceVndMax: 50_000,
      availability: "available",
      dietary: { vegetarian: "unknown", halal: "unknown" },
      allergens: [],
      sourceUrl,
      verifiedAt: "2026-08-25",
    }],
    sourceUrl,
    verifiedAt: "2026-08-25",
  };
}

function refreshPlacesHash(root: string): void {
  const places = JSON.parse(readFileSync(join(root, "data/sources/hcmc-places.v1.json"), "utf8")) as JsonRecord;
  const hashes = JSON.parse(readFileSync(join(root, "data/sources/source-hashes.v1.json"), "utf8")) as JsonRecord;
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object") return "{" + Object.keys(value as Record<string, unknown>).sort().map((key) => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key])).join(",") + "}";
    return JSON.stringify(value);
  };
  const sha256 = (value: unknown): string => createHash("sha256").update(canonical(value), "utf8").digest("hex");
  ((hashes.manifests as JsonRecord).places as JsonRecord).sha256 = sha256(places);
  writeFileSync(join(root, "data/sources/source-hashes.v1.json"), JSON.stringify(hashes, null, 2) + "\n", "utf8");
  const approval = JSON.parse(readFileSync(join(root, "data/approvals/hcmc-catalog.v1.json"), "utf8")) as JsonRecord;
  (approval.sourceHashes as JsonRecord).places = ((hashes.manifests as JsonRecord).places as JsonRecord).sha256;
  (approval.sourceHashes as JsonRecord).sourceHashes = sha256(hashes);
  writeFileSync(join(root, "data/approvals/hcmc-catalog.v1.json"), JSON.stringify(approval, null, 2) + "\n", "utf8");
}

function approveDraft(root: string): void {
  mutateJson(root, "data/approvals/hcmc-catalog.v1.json", (approval) => {
    approval.status = "approved";
    approval.reviewer = { status: "approved", name: "Fixture Reviewer", userId: "fixture-reviewer" };
    approval.reviewedAtUtc = "2026-08-26T01:00:00Z";
    approval.approvedAtUtc = "2026-08-26T01:00:00Z";
    approval.reviewChecklist = {
      officialSourceUrlsChecked: true,
      hoursAndAccessChecked: true,
      pricingChecked: true,
      bilingualCopyChecked: true,
      hashesChecked: true,
      networkFetchAtSeedTime: false,
    };
  });
}

function makeRuntimeReady(root: string): void {
  approveDraft(root);
  mutateJson(root, "data/sources/hcmc-places.v1.json", (places) => {
    places.researchOnly = false;
    for (const place of places.places as JsonRecord[]) {
      place.status = "sellable";
      const sourceId = (place.sourceIds as string[])[0];
      const currentHours = place.hours as JsonRecord;
      const currentSupport = place.support as JsonRecord;
      place.hours = {
        status: "known",
        windows: (currentHours.windows as JsonRecord[]).length > 0
          ? currentHours.windows
          : [{ days: "daily", opens: "08:00", closes: "17:00", sourceId }],
      };
      place.support = {
        language: currentSupport.language,
        accessibility: currentSupport.accessibility,
        dietary: { confidence: "unknown", sourceRef: null, vegetarian: "unknown" },
        mobility: { confidence: "unknown", sourceRef: null, "step-free": "unknown" },
      };
      if ((place.experienceTypes as string[]).some((type) => ["street_food", "traditional_market"].includes(type))) {
        place.foodVendors = [fixtureFoodVendor(place)];
      }
    }
  });
  mutateJson(root, "data/sources/hcmc-tours.v1.json", (tours) => {
    tours.researchOnly = false;
    for (const tour of tours.tours as JsonRecord[]) tour.available = true;
  });
  const places = JSON.parse(readFileSync(join(root, "data/sources/hcmc-places.v1.json"), "utf8")) as JsonRecord;
  const tours = JSON.parse(readFileSync(join(root, "data/sources/hcmc-tours.v1.json"), "utf8")) as JsonRecord;
  const hashes = JSON.parse(readFileSync(join(root, "data/sources/source-hashes.v1.json"), "utf8")) as JsonRecord;
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object") return "{" + Object.keys(value as Record<string, unknown>).sort().map((key) => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key])).join(",") + "}";
    return JSON.stringify(value);
  };
  const sha256 = (value: unknown): string => {
    return createHash("sha256").update(canonical(value), "utf8").digest("hex");
  };
  ((hashes.manifests as JsonRecord).places as JsonRecord).sha256 = sha256(places);
  ((hashes.manifests as JsonRecord).tours as JsonRecord).sha256 = sha256(tours);
  writeFileSync(join(root, "data/sources/source-hashes.v1.json"), JSON.stringify(hashes, null, 2) + "\n", "utf8");
  const approval = JSON.parse(readFileSync(join(root, "data/approvals/hcmc-catalog.v1.json"), "utf8")) as JsonRecord;
  const updatedHashes = JSON.parse(readFileSync(join(root, "data/sources/source-hashes.v1.json"), "utf8")) as JsonRecord;
  (approval.sourceHashes as JsonRecord).places = ((updatedHashes.manifests as JsonRecord).places as JsonRecord).sha256;
  (approval.sourceHashes as JsonRecord).tours = ((updatedHashes.manifests as JsonRecord).tours as JsonRecord).sha256;
  (approval.sourceHashes as JsonRecord).sourceHashes = sha256(updatedHashes);
  writeFileSync(join(root, "data/approvals/hcmc-catalog.v1.json"), JSON.stringify(approval, null, 2) + "\n", "utf8");
}

function codes(result: ReadinessResult): string[] {
  return result.issues.map((issue) => issue.code);
}

describe("Task 15 seed readiness gate", () => {
  it("returns APPROVAL_NOT_READY for the checked-in draft without creating seed.sql", () => {
    const result = assessSeedReadiness({ root: repoRoot });

    expect(result.ok).toBe(false);
    expect(codes(result)[0]).toBe(SEED_READINESS_CODES.APPROVAL_NOT_READY);
    expect(readFileSync(join(repoRoot, "data", "approvals", "hcmc-catalog.v1.json"), "utf8")).toContain('"status": "draft"');
  });

  it("CLI exits nonzero with a structured approval code and never writes seed.sql", () => {
    const root = copyFixture();
    try {
      const result = spawnSync(process.execPath, [
        "scripts/generate-supabase-seed.mjs",
        "--check-readiness",
        "--root",
        root,
      ], { cwd: repoRoot, encoding: "utf8" });

      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain("APPROVAL_NOT_READY");
      expect(result.stdout).toContain('"ok":false');
      expect(result.stderr).not.toContain("seed.sql");
      expect(readFileSync(join(root, "supabase", "seed.sql"), "utf8")).toBe("-- existing sentinel\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("moves past approval and reports catalog and support blockers separately", () => {
    const root = copyFixture(approveDraft);
    try {
      const result = assessSeedReadiness({ root });

      expect(result.ok).toBe(false);
      expect(codes(result)).toContain(SEED_READINESS_CODES.CATALOG_NOT_SELLABLE);
      expect(codes(result)).toContain(SEED_READINESS_CODES.SUPPORT_NOT_RUNTIME_READY);
      expect(codes(result)).toContain(SEED_READINESS_CODES.TOURS_NOT_AVAILABLE);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects approval mutation even when the manifest counts remain unchanged", () => {
    const root = copyFixture((fixtureRoot) => {
      mutateJson(fixtureRoot, "data/approvals/hcmc-catalog.v1.json", (approval) => {
        approval.status = "approved";
        approval.reviewer = { status: "approved", name: "Fixture Reviewer", userId: "fixture-reviewer" };
        approval.reviewedAtUtc = "2026-08-26T01:00:00Z";
        approval.approvedAtUtc = "2026-08-26T01:00:00Z";
        approval.reviewChecklist = {
          officialSourceUrlsChecked: true,
          hoursAndAccessChecked: true,
          pricingChecked: true,
          bilingualCopyChecked: true,
          hashesChecked: true,
          networkFetchAtSeedTime: false,
        };
        (approval.sourceHashes as JsonRecord).places = "0".repeat(64);
      });
    });
    try {
      const result = assessSeedReadiness({ root });

      expect(result.ok).toBe(false);
      expect(codes(result)[0]).toBe(SEED_READINESS_CODES.APPROVAL_NOT_READY);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects an approval timestamp that precedes the review timestamp", () => {
    const root = copyFixture((fixtureRoot) => {
      approveDraft(fixtureRoot);
      mutateJson(fixtureRoot, "data/approvals/hcmc-catalog.v1.json", (approval) => {
        approval.approvedAtUtc = "2026-08-25T01:00:00Z";
      });
    });
    try {
      const result = assessSeedReadiness({ root });

      expect(result.ok).toBe(false);
      expect(codes(result)[0]).toBe(SEED_READINESS_CODES.APPROVAL_NOT_READY);
      expect(result.issues[0]?.details.join(" ")).toMatch(/approvedAtUtc cannot precede reviewedAtUtc/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps stale demo FX safe by rejecting any USD enablement", () => {
    const root = copyFixture((fixtureRoot) => {
      mutateJson(fixtureRoot, "data/sources/hcmc-tours.v1.json", (tours) => {
        (tours.demoFx as JsonRecord).usdEnabled = true;
        (tours.currencyPolicy as JsonRecord).usdEnabled = true;
      });
    });
    try {
      const result = assessSeedReadiness({ root });

      expect(result.ok).toBe(false);
      expect(codes(result)[0]).toBe(SEED_READINESS_CODES.APPROVAL_NOT_READY);
      expect(codes(result)).toContain(SEED_READINESS_CODES.FX_NOT_SAFE);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts a fully approved runtime-ready fixture without writing a seed", () => {
    const root = copyFixture(makeRuntimeReady);
    try {
      const result = assessSeedReadiness({ root });

      expect(result).toEqual(expect.objectContaining({ ok: true, writesSeed: false, counts: { operationalAreas: 4, places: 30, tours: 8 } }));
      expect(readFileSync(join(root, "supabase", "seed.sql"), "utf8")).toBe("-- existing sentinel\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports a named catalog blocker when a sellable food place has no sellable menu item", () => {
    const root = copyFixture(makeRuntimeReady);
    try {
      mutateJson(root, "data/sources/hcmc-places.v1.json", (places) => {
        const place = (places.places as JsonRecord[]).find((candidate) => candidate.slug === "ho-thi-ky-food-street") as JsonRecord;
        const vendor = (place.foodVendors as JsonRecord[])[0];
        const item = (vendor.menuItems as JsonRecord[])[0];
        item.status = "research_only";
        item.availability = "unknown";
      });
      const places = JSON.parse(readFileSync(join(root, "data/sources/hcmc-places.v1.json"), "utf8")) as JsonRecord;
      const hashes = JSON.parse(readFileSync(join(root, "data/sources/source-hashes.v1.json"), "utf8")) as JsonRecord;
      const canonical = (value: unknown): string => {
        if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
        if (value && typeof value === "object") return "{" + Object.keys(value as Record<string, unknown>).sort().map((key) => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key])).join(",") + "}";
        return JSON.stringify(value);
      };
      const sha256 = (value: unknown): string => createHash("sha256").update(canonical(value), "utf8").digest("hex");
      ((hashes.manifests as JsonRecord).places as JsonRecord).sha256 = sha256(places);
      writeFileSync(join(root, "data/sources/source-hashes.v1.json"), JSON.stringify(hashes, null, 2) + "\n", "utf8");
      const approval = JSON.parse(readFileSync(join(root, "data/approvals/hcmc-catalog.v1.json"), "utf8")) as JsonRecord;
      (approval.sourceHashes as JsonRecord).places = ((hashes.manifests as JsonRecord).places as JsonRecord).sha256;
      (approval.sourceHashes as JsonRecord).sourceHashes = sha256(hashes);
      writeFileSync(join(root, "data/approvals/hcmc-catalog.v1.json"), JSON.stringify(approval, null, 2) + "\n", "utf8");

      const result = assessSeedReadiness({ root });

      expect(result.ok).toBe(false);
      expect(codes(result)).toContain(SEED_READINESS_CODES.CATALOG_NOT_SELLABLE);
      expect(result.issues.flatMap((issue: { details: string[] }) => issue.details)).toEqual(expect.arrayContaining([expect.stringMatching(/ho-thi-ky-food-street.*food/i)]));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed for either contradictory availability alias direction", () => {
    const conflicts = [
      { available: true, availability: "unavailable" },
      { available: false, availability: "available" },
    ];
    for (const conflict of conflicts) {
      const root = copyFixture(makeRuntimeReady);
      try {
        mutateJson(root, "data/sources/hcmc-places.v1.json", (places) => {
          const place = (places.places as JsonRecord[]).find((candidate) => candidate.slug === "ho-thi-ky-food-street") as JsonRecord;
          const item = (((place.foodVendors as JsonRecord[])[0]).menuItems as JsonRecord[])[0];
          Object.assign(item, conflict);
        });
        refreshPlacesHash(root);

        const result = assessSeedReadiness({ root });

        expect(result.ok).toBe(false);
        expect(codes(result)).toContain(SEED_READINESS_CODES.CATALOG_NOT_SELLABLE);
        expect(result.issues.flatMap((issue: { details: string[] }) => issue.details)).toEqual(expect.arrayContaining([expect.stringMatching(/ho-thi-ky-food-street.*food/i)]));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it("does not use network APIs or auto-approve the checked-in record", () => {
    const source = readFileSync(join(repoRoot, "scripts", "generate-supabase-seed.mjs"), "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(|node:https|node:http|https\.get/);
    const approval = JSON.parse(readFileSync(join(repoRoot, "data", "approvals", "hcmc-catalog.v1.json"), "utf8")) as JsonRecord;
    expect(approval.status).toBe("draft");
    expect(approval.reviewer).toMatchObject({ status: "pending", name: null, userId: null });
  });

  it("does not claim runtime database proof when readiness is blocked", () => {
    const result = spawnSync(process.execPath, ["scripts/generate-supabase-seed.mjs", "--check-readiness", "--root", repoRoot], { cwd: repoRoot, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("APPROVAL_NOT_READY");
    expect(result.stdout).not.toContain("runtime database verified");
  });
});
