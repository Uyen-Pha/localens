import { describe, expect, it } from "vitest";

import {
  normalizeCatalogAreaOptions,
  PERSONALIZATION_AREA_SLUG_PATTERN,
  SYNTHETIC_CENTRAL_AREA_SLUG,
  type PersonalizationAreaOption,
} from "@/lib/application/planner/personalization-areas";

const snapshotId = "11111111-1111-4111-8111-111111111111";
const areaId = "22222222-2222-4222-8222-222222222222";

function input(overrides: Record<string, unknown> = {}) {
  return {
    snapshotId,
    locale: "en" as const,
    areas: [{ snapshot_id: snapshotId, area_id: areaId, slug: SYNTHETIC_CENTRAL_AREA_SLUG }],
    translations: [{ snapshot_id: snapshotId, area_id: areaId, locale: "en", name: "Untrusted catalog name" }],
    ...overrides,
  };
}

describe("personalization catalog area contract", () => {
  it("maps only the current snapshot and pins the synthetic area label", () => {
    expect(normalizeCatalogAreaOptions(input())).toEqual<PersonalizationAreaOption[]>([
      {
        value: SYNTHETIC_CENTRAL_AREA_SLUG,
        slug: SYNTHETIC_CENTRAL_AREA_SLUG,
        areaId,
        snapshotId,
        label: "Synthetic Central HCMC Demo Area",
      },
    ]);
  });

  it("uses the requested locale for ordinary area labels", () => {
    const ordinaryAreaId = "33333333-3333-4333-8333-333333333333";
    const options = normalizeCatalogAreaOptions(input({
      locale: "vi",
      areas: [{ snapshot_id: snapshotId, area_id: ordinaryAreaId, slug: "district-1" }],
      translations: [{ snapshot_id: snapshotId, area_id: ordinaryAreaId, locale: "vi", name: "Quận 1" }],
    }));

    expect(options).toEqual([
      {
        value: "district-1",
        slug: "district-1",
        areaId: ordinaryAreaId,
        snapshotId,
        label: "Quận 1",
      },
    ]);
  });

  it.each([
    ["missing snapshot", { snapshotId: null }],
    ["mixed snapshot area", { areas: [{ snapshot_id: "44444444-4444-4444-8444-444444444444", area_id: areaId, slug: "district-1" }] }],
    ["missing translation", { translations: [] }],
    ["duplicate area", { areas: [
      { snapshot_id: snapshotId, area_id: areaId, slug: SYNTHETIC_CENTRAL_AREA_SLUG },
      { snapshot_id: snapshotId, area_id: areaId, slug: SYNTHETIC_CENTRAL_AREA_SLUG },
    ] }],
    ["extra row field", { areas: [{ snapshot_id: snapshotId, area_id: areaId, slug: SYNTHETIC_CENTRAL_AREA_SLUG, private_note: "secret" }] }],
  ])("fails closed for %s", (_label, overrides) => {
    expect(normalizeCatalogAreaOptions(input(overrides))).toBeNull();
  });

  it("keeps area values bounded to catalog-safe slugs", () => {
    expect(PERSONALIZATION_AREA_SLUG_PATTERN.test("synthetic-central-hcmc")).toBe(true);
    expect(PERSONALIZATION_AREA_SLUG_PATTERN.test("alice@example.com")).toBe(false);
    expect(PERSONALIZATION_AREA_SLUG_PATTERN.test("../private-note")).toBe(false);
  });
});
