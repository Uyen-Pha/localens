// @vitest-environment node

import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

// @ts-expect-error The source checker is an executable JavaScript boundary and is covered by its focused runtime tests.
import { canonicalSha256, checkCatalogBundle, sanitizeOfficialUrl } from "@/scripts/source-approval.mjs";

const repoRoot = process.cwd();
type JsonRecord = Record<string, unknown>;

function records(value: unknown): JsonRecord[] { return value as JsonRecord[]; }
function placeBySlug(manifest: JsonRecord, slug: string): JsonRecord {
  return records(manifest.places).find((place) => place.slug === slug) as JsonRecord;
}

function fixture(mutator?: (root: string) => void): string {
  const root = mkdtempSync(join(tmpdir(), "localens-task14-fixture-"));
  for (const directory of ["sources", "approvals"]) {
    const sourceDirectory = join(repoRoot, "data", directory);
    const targetDirectory = join(root, "data", directory);
    mkdirSync(targetDirectory, { recursive: true });
    for (const file of readdirSync(sourceDirectory)) copyFileSync(join(sourceDirectory, file), join(targetDirectory, file));
  }
  mutator?.(root);
  return root;
}

function mutateJson(root: string, relativePath: string, mutator: (value: JsonRecord) => void): void {
  const file = join(root, relativePath);
  const value = JSON.parse(readFileSync(file, "utf8")) as JsonRecord;
  mutator(value);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function expectInvalid(root: string, pattern: RegExp): void {
  const result = checkCatalogBundle({ root });
  expect(result.ok).toBe(false);
  expect(result.errors.join("\n")).toMatch(pattern);
}

describe("Task 14 sourced catalog approval gate", () => {
  it("accepts the checked-in draft only when all counts and cross-manifest references are valid", () => {
    const result = checkCatalogBundle({ root: repoRoot });

    expect(result.ok, result.errors.join("\n")).toBe(true);
    expect(result.counts).toEqual({ operationalAreas: 4, places: 30, tours: 8 });
  });

  it("rejects a place source URL containing credentials, tracking, or an unapproved host", () => {
    const root = mkdtempSync(join(tmpdir(), "localens-task14-url-"));
    try {
      for (const directory of ["sources", "approvals"]) {
        mkdirSync(join(root, "data", directory), { recursive: true });
        for (const file of readdirSync(join(repoRoot, "data", directory))) copyFileSync(join(repoRoot, "data", directory, file), join(root, "data", directory, file));
      }
      const file = join(root, "data", "sources", "hcmc-places.v1.json");
      const manifest = JSON.parse(readFileSync(file, "utf8")) as { places: Array<{ sourceUrl: string }> };
      manifest.places[0].sourceUrl = "https://user:pass@evil.example/venue?email=guest%40example.com&utm_source=demo";
      writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      const result = checkCatalogBundle({ root });

      expect(result.ok).toBe(false);
      expect(result.errors.join("\n")).toMatch(/source URL|host|credential|tracking/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects approval drift and never treats a draft as approved", () => {
    const root = mkdtempSync(join(tmpdir(), "localens-task14-approval-"));
    try {
      for (const directory of ["sources", "approvals"]) {
        mkdirSync(join(root, "data", directory), { recursive: true });
        for (const file of readdirSync(join(repoRoot, "data", directory))) copyFileSync(join(repoRoot, "data", directory, file), join(root, "data", directory, file));
      }
      const file = join(root, "data", "approvals", "hcmc-catalog.v1.json");
      const approval = JSON.parse(readFileSync(file, "utf8")) as { status: string; counts: { places: number } };
      approval.status = "approved";
      approval.counts.places = 29;
      writeFileSync(file, `${JSON.stringify(approval, null, 2)}\n`, "utf8");

      const result = checkCatalogBundle({ root });

      expect(result.ok).toBe(false);
      expect(result.errors.join("\n")).toMatch(/approval|count|draft|review/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a tour whose stop is outside the 30-place manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "localens-task14-stop-"));
    try {
      for (const directory of ["sources", "approvals"]) {
        mkdirSync(join(root, "data", directory), { recursive: true });
        for (const file of readdirSync(join(repoRoot, "data", directory))) copyFileSync(join(repoRoot, "data", directory, file), join(root, "data", directory, file));
      }
      const file = join(root, "data", "sources", "hcmc-tours.v1.json");
      const manifest = JSON.parse(readFileSync(file, "utf8")) as { tours: Array<{ stops: string[] }> };
      manifest.tours[0].stops[0] = "not-in-catalog";
      writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      const result = checkCatalogBundle({ root });

      expect(result.ok).toBe(false);
      expect(result.errors.join("\n")).toMatch(/stop|place|manifest/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("hashes object keys recursively while preserving semantic array order", () => {
    expect(canonicalSha256({ b: 2, a: { d: 4, c: 3 } })).toBe(canonicalSha256({ a: { c: 3, d: 4 }, b: 2 }));
    expect(canonicalSha256({ places: ["first", "second"] })).not.toBe(canonicalSha256({ places: ["second", "first"] }));
    expect(canonicalSha256(JSON.parse(JSON.stringify({ a: 1, b: [2, 3] })))).toBe(canonicalSha256({ b: [2, 3], a: 1 }));
  });

  it("invalidates approval when a factual field changes even if counts stay constant", () => {
    const root = fixture((fixtureRoot) => mutateJson(fixtureRoot, "data/sources/hcmc-places.v1.json", (manifest) => { const places = records(manifest.places); (places[0].title as JsonRecord).en = "Changed fact"; }));
    try { expectInvalid(root, /source hash|approval source hash/i); } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("invalidates source hash/count drift and duplicate or reordered semantic records", () => {
    for (const mutation of [
      (root: string) => mutateJson(root, "data/sources/source-hashes.v1.json", (hashes) => { ((hashes.manifests as JsonRecord).places as JsonRecord).recordCount = 29; }),
      (root: string) => mutateJson(root, "data/sources/hcmc-places.v1.json", (manifest) => { const places = records(manifest.places); places[1].slug = places[0].slug; }),
      (root: string) => mutateJson(root, "data/sources/hcmc-places.v1.json", (manifest) => { records(manifest.places).reverse(); }),
      (root: string) => mutateJson(root, "data/sources/hcmc-places.v1.json", (manifest) => { const sources = records(manifest.sources); sources[1].sourceId = sources[0].sourceId; }),
    ]) {
      const root = fixture(mutation);
      try { expectInvalid(root, /hash|duplicate|source registry/i); } finally { rmSync(root, { recursive: true, force: true }); }
    }
  });

  it("fails closed for unsafe URL variants", () => {
    for (const value of [
      "http://visithcmc.net/page",
      "https://visithcmc.net:443/page",
      "https://visithcmc.net/page#fragment",
      "https://127.0.0.1/page",
      "https://xn--visithcmc-9za.net/page",
      "https://visithcmc.net/page?email=guest%40example.com",
      "https://visithcmc.net/page?utm_source=demo",
    ]) expect(sanitizeOfficialUrl(value).ok, value).toBe(false);
  });

  it("requires registered source references, provenance and checked dates", () => {
    const mutations = [
      (manifest: JsonRecord) => { (records(manifest.places)[0].officialAddress as JsonRecord).sourceRef = "missing-source"; },
      (manifest: JsonRecord) => { records(manifest.places)[0].priceProvenance = "official"; },
      (manifest: JsonRecord) => { records(manifest.sources)[0].retrievedAtUtc = "2025-01-01"; },
    ];
    for (const mutation of mutations) {
      const root = fixture((fixtureRoot) => mutateJson(fixtureRoot, "data/sources/hcmc-places.v1.json", mutation));
      try { expectInvalid(root, /source|provenance|2026-08-25|registered/i); } finally { rmSync(root, { recursive: true, force: true }); }
    }
  });

  it("preserves explicit unknown invariants and structured support evidence", () => {
    const root = fixture((fixtureRoot) => mutateJson(fixtureRoot, "data/sources/hcmc-places.v1.json", (manifest) => {
      (records(manifest.places)[0].coordinates as JsonRecord).latitude = 10.77;
      ((records(manifest.places)[0].support as JsonRecord).mobility as JsonRecord).confidence = "certain";
    }));
    try { expectInvalid(root, /coordinates|confidence/i); } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("keeps unknown fact references empty and evidence-only declarations embedded", () => {
    const mutations = [
      (manifest: JsonRecord) => { (placeBySlug(manifest, "ton-duc-thang-museum").factSourceRefs as JsonRecord).hours = ["city-tourism"]; },
      (manifest: JsonRecord) => { (placeBySlug(manifest, "ton-duc-thang-museum").factSourceRefs as JsonRecord).admission = ["city-tourism"]; },
      (manifest: JsonRecord) => { (placeBySlug(manifest, "central-post-office").evidenceOnlyFields as string[]).push("officialHoursText"); },
    ];
    for (const mutation of mutations) {
      const root = fixture((fixtureRoot) => mutateJson(fixtureRoot, "data/sources/hcmc-places.v1.json", mutation));
      try { expectInvalid(root, /unknown|factSourceRefs|evidenceOnlyFields|embedded field/i); } finally { rmSync(root, { recursive: true, force: true }); }
    }
  });

  it("does not attach source refs to unknown structured address or support facts", () => {
    const mutations = [
      (manifest: JsonRecord) => { (placeBySlug(manifest, "southern-womens-museum").officialAddress as JsonRecord).sourceRef = "hcmc-museum"; },
      (manifest: JsonRecord) => { ((placeBySlug(manifest, "southern-womens-museum").support as JsonRecord).language as JsonRecord).sourceRef = "hcmc-museum"; },
    ];
    for (const mutation of mutations) {
      const root = fixture((fixtureRoot) => mutateJson(fixtureRoot, "data/sources/hcmc-places.v1.json", mutation));
      try { expectInvalid(root, /unknown sourceRef|support|officialAddress/i); } finally { rmSync(root, { recursive: true, force: true }); }
    }
  });

  it("requires exact registered sources for mapped venue candidates and admission scope caveats", () => {
    const sourceMutation = (manifest: JsonRecord) => {
      const place = records(manifest.places).find((candidate) => candidate.slug === "ho-thi-ky-food-street") as JsonRecord;
      place.sourceIds = ["city-tourism"];
      place.sourceUrl = "https://visithcmc.net/en/page/ke-hoach-chuyen-di";
      (place.factSourceRefs as JsonRecord).identity = ["city-tourism"];
    };
    const sourceRoot = fixture((fixtureRoot) => mutateJson(fixtureRoot, "data/sources/hcmc-places.v1.json", sourceMutation));
    try { expectInvalid(sourceRoot, /exact source|generic candidate/i); } finally { rmSync(sourceRoot, { recursive: true, force: true }); }

    const urlRoot = fixture((fixtureRoot) => mutateJson(fixtureRoot, "data/sources/hcmc-places.v1.json", (manifest) => {
      const place = records(manifest.places).find((candidate) => candidate.slug === "ho-thi-ky-food-street") as JsonRecord;
      place.sourceUrl = "https://visithcmc.net/en/page/ke-hoach-chuyen-di";
    }));
    try { expectInvalid(urlRoot, /exact registered URL|sourceUrl/i); } finally { rmSync(urlRoot, { recursive: true, force: true }); }

    const caveatRoot = fixture((fixtureRoot) => mutateJson(fixtureRoot, "data/sources/hcmc-places.v1.json", (manifest) => {
      const place = records(manifest.places).find((candidate) => candidate.slug === "war-remnants-museum") as JsonRecord;
      delete (place.officialAdmission as JsonRecord).scopeCaveat;
    }));
    try { expectInvalid(caveatRoot, /scopeCaveat|admission/i); } finally { rmSync(caveatRoot, { recursive: true, force: true }); }
  });

  it("requires every tour sourceUrl to match one of its declared sourceIds", () => {
    const root = fixture((fixtureRoot) => mutateJson(fixtureRoot, "data/sources/hcmc-tours.v1.json", (manifest) => {
      const tour = records(manifest.tours)[0] as JsonRecord;
      tour.sourceUrl = "https://dinhdoclap.gov.vn/en/visiting-hours/";
    }));
    try { expectInvalid(root, /sourceUrl must match one of its sourceIds/i); } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("ties tour availability to research-only stops and keeps stale FX USD-disabled", () => {
    const root = fixture((fixtureRoot) => {
      mutateJson(fixtureRoot, "data/sources/hcmc-tours.v1.json", (manifest) => { records(manifest.tours)[0].available = true; (manifest.demoFx as JsonRecord).usdEnabled = true; });
    });
    try { expectInvalid(root, /available|FX|USD/i); } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("rejects an approved or incomplete approval record", () => {
    const mutations = [
      (approval: JsonRecord) => { approval.status = "approved"; },
      (approval: JsonRecord) => { approval.reviewer = null; },
      (approval: JsonRecord) => { approval.reviewedAtUtc = "2026-08-25"; },
      (approval: JsonRecord) => { approval.fixedUuidNamespace = "00000000-0000-0000-0000-000000000000"; },
      (approval: JsonRecord) => { (approval.sourceHashes as JsonRecord).places = "deadbeef"; },
    ];
    for (const mutation of mutations) {
      const root = fixture((fixtureRoot) => mutateJson(fixtureRoot, "data/approvals/hcmc-catalog.v1.json", mutation));
      try { expectInvalid(root, /approval|review|namespace|hash/i); } finally { rmSync(root, { recursive: true, force: true }); }
    }
  });

  it("approved mode requires the complete human review checklist and no seed-time network fetch", () => {
    const root = fixture((fixtureRoot) => mutateJson(fixtureRoot, "data/approvals/hcmc-catalog.v1.json", (approval) => {
      approval.status = "approved";
      approval.reviewer = { status: "approved", name: "Fixture Reviewer", userId: "fixture-reviewer" };
      approval.reviewedAtUtc = "2026-08-26T01:00:00Z";
      approval.approvedAtUtc = "2026-08-26T01:00:00Z";
      approval.reviewChecklist = {
        officialSourceUrlsChecked: false,
        hoursAndAccessChecked: false,
        pricingChecked: false,
        bilingualCopyChecked: false,
        hashesChecked: true,
        networkFetchAtSeedTime: false,
      };
    }));
    try {
      expect(checkCatalogBundle({ root, approvalMode: "approved" }).ok).toBe(false);
      mutateJson(root, "data/approvals/hcmc-catalog.v1.json", (approval) => {
        (approval.reviewChecklist as JsonRecord).officialSourceUrlsChecked = true;
        (approval.reviewChecklist as JsonRecord).hoursAndAccessChecked = true;
        (approval.reviewChecklist as JsonRecord).pricingChecked = true;
        (approval.reviewChecklist as JsonRecord).bilingualCopyChecked = true;
        (approval.reviewChecklist as JsonRecord).hashesChecked = true;
        (approval.reviewChecklist as JsonRecord).networkFetchAtSeedTime = false;
      });
      expect(checkCatalogBundle({ root, approvalMode: "approved" }).ok).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("never performs network fetches while checking checked-in manifests", () => {
    const source = readFileSync(join(repoRoot, "scripts", "source-approval.mjs"), "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(|node:https|node:http|https\.get/);
  });
});
