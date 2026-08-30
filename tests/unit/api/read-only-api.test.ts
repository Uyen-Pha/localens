// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  createReadOnlyApi,
  API_MESSAGE_CATALOG,
  API_MESSAGE_KEYS,
  API_ERROR_CODES,
  type ApiError,
} from "@/lib/application/api/read-only-api";
import { demoCatalogRepository } from "@/lib/infrastructure/mock/hcmc-catalog";
import type { InternalDemoCatalogRepository } from "@/lib/infrastructure/mock/hcmc-catalog";
import type { EngineInput, PlaceCandidate } from "@/lib/domain/itinerary/contracts";

const validRequest = {
  startAt: "2026-09-05T01:00:00Z",
  durationMinutes: 360,
  areas: ["demo-hcmc-district-1", "demo-hcmc-district-5"],
  budget: { currency: "VND", amountMinor: 2_000_000 },
  partySize: 2,
  guideLanguage: "en",
  priorityWeights: {
    street_food: 0,
    history: 4,
    traditional_craft: 3,
    traditional_market: 2,
  },
  pace: "balanced",
  dietaryRequirements: [],
  mobilityRequirements: [],
  lockedStopIds: ["demo-hcmc-ben-thanh-market"],
} as const;

function errorOf(result: { ok: boolean; error?: ApiError }): ApiError {
  if (result.ok || result.error === undefined) throw new Error("expected API error");
  return result.error;
}

describe("read-only API application boundary", () => {
  it("localizes selected-food activity and support facts without exposing canonical keys or statuses", () => {
    const menuItem = {
      id: "menu-banh-mi",
      vendorId: "vendor-street-food",
      slug: "banh-mi",
      title: { en: "Banh mi", vi: "Bánh mì" },
      description: { en: "Demo", vi: "Demo" },
      servingUnit: "portion" as const,
      priceVndMin: 30_000,
      priceVndMax: 40_000,
      portionDescription: "One portion",
      dietarySupport: { vegetarian: "supported" as const, kosher: "unknown" as const },
      allergens: ["peanut", "sesame"],
      available: true,
      status: "sellable" as const,
      verifiedAt: "2026-08-30",
    };
    const vendor = {
      id: "vendor-street-food",
      placeId: "demo-hcmc-street-food",
      slug: "street-food-stall",
      title: { en: "Aunt Ba's stall", vi: "Quầy cô Ba" },
      description: { en: "Demo", vi: "Demo" },
      locationNote: "Aisle 4",
      serviceType: "stall" as const,
      capacityNote: "Small group",
      dietarySupport: { vegetarian: "supported" as const },
      mobilitySupport: { "step-free": "unknown" as const, ramp: "unsupported" as const },
      openingHours: Array.from({ length: 7 }, (_, weekday) => ({ weekday: weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6, opensAt: "06:00", closesAt: "22:00" })),
      openingExceptions: [],
      status: "sellable" as const,
      menuItems: [menuItem],
    };
    const baseInput = demoCatalogRepository.getEngineInput({
      ...validRequest,
      priorityWeights: { ...validRequest.priorityWeights, street_food: 5 },
      lockedStopIds: [],
    });
    const catalog: EngineInput["catalog"] = {
      ...baseInput.catalog,
      places: baseInput.catalog.places.map((place): PlaceCandidate => place.id === "demo-hcmc-street-food"
        ? { ...place, foodVendors: [vendor] }
        : place),
    };
    const repository: InternalDemoCatalogRepository = {
      environment: demoCatalogRepository.environment,
      city: demoCatalogRepository.city,
      listTours: (locale) => demoCatalogRepository.listTours(locale),
      listAreaIds: () => demoCatalogRepository.listAreaIds(),
      hasArea: (areaId) => demoCatalogRepository.hasArea(areaId),
      hasPlace: (placeId) => demoCatalogRepository.hasPlace(placeId),
      getPlaceTitle: (placeId, locale) => demoCatalogRepository.getPlaceTitle(placeId, locale),
      getEngineInput: (request) => ({
        ...baseInput,
        request: {
          ...request,
          areas: [...request.areas],
          budget: { ...request.budget },
          priorityWeights: { ...request.priorityWeights },
          dietaryRequirements: [...request.dietaryRequirements],
          mobilityRequirements: [...request.mobilityRequirements],
          lockedStopIds: [...request.lockedStopIds],
        },
        catalog,
      }),
    };

    const viResult = createReadOnlyApi({ repository }).previewItinerary({
      ...validRequest,
      priorityWeights: { ...validRequest.priorityWeights, street_food: 5 },
      lockedStopIds: [],
      guideLanguage: "vi",
    });
    const enResult = createReadOnlyApi({ repository }).previewItinerary({
      ...validRequest,
      priorityWeights: { ...validRequest.priorityWeights, street_food: 5 },
      lockedStopIds: [],
      guideLanguage: "en",
    });

    expect(viResult.ok).toBe(true);
    expect(enResult.ok).toBe(true);
    if (!viResult.ok || !enResult.ok) return;
    const viFood = viResult.value.items.find((item) => item.foodSelection !== null)?.foodSelection;
    const enFood = enResult.value.items.find((item) => item.foodSelection !== null)?.foodSelection;
    expect(viFood).not.toBeNull();
    expect(enFood).not.toBeNull();
    if (viFood === null || enFood === null || viFood === undefined || enFood === undefined) return;
    expect(viFood.activity).toBe("Thưởng thức và trao đổi về món đã chọn.");
    expect(viFood.dietaryAllergenCaveat).toContain("Ăn chay: được hỗ trợ");
    expect(viFood.dietaryAllergenCaveat).toContain("Hỗ trợ ăn uống khác (Kosher): chưa xác minh");
    expect(viFood.dietaryAllergenCaveat).toContain("Đậu phộng");
    expect(viFood.dietaryAllergenCaveat).toContain("Dị ứng khác (Sesame)");
    expect(viFood.accessibilityVendorWarning).toContain("Lối đi không bậc: chưa xác minh");
    expect(viFood.accessibilityVendorWarning).toContain("Hỗ trợ tiếp cận khác (Ramp): không hỗ trợ");
    expect(viFood.dietaryAllergenCaveat).not.toContain("vegetarian:supported");
    expect(viFood.dietaryAllergenCaveat).not.toContain("kosher:unknown");
    expect(viFood.accessibilityVendorWarning).not.toContain("step-free:unknown");
    expect(viFood.accessibilityVendorWarning).not.toContain("ramp:unsupported");
    expect(enFood.activity).toBe("Taste and discuss the selected dish");
    expect(enFood.dietaryAllergenCaveat).toContain("Other dietary support (Kosher): not verified");
    expect(enFood.dietaryAllergenCaveat).toContain("Other allergen (Sesame)");
    expect(enFood.accessibilityVendorWarning).toContain("Other accessibility support (Ramp): not supported");
    expect(enFood.vendorTitle).toBe("Aunt Ba's stall");
    expect(enFood.menuTitle).toBe("Banh mi");
    expect(enFood.priceVndMin).toBe(30_000);
    expect(enFood.priceVndMax).toBe(40_000);
    expect(enFood.quantity).toBe(2);
    expect(enFood.paymentMode).toBe("pay_at_vendor");
  });
  it("returns a localized fixed-tour catalog from the internal demo HCMC repository", () => {
    const result = createReadOnlyApi().listTours("en");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.environment).toBe("demo");
    expect(result.value.city).toBe("Ho Chi Minh City");
    expect(result.value.dataScope).toBe("partial_demo_sample");
    expect(result.value.catalogStatus).toBe("pending_approved_task15_seed");
    expect(result.value.sourceStatus).toBe("demo_placeholder");
    expect(result.value.samplePlaceCount).toBe(6);
    expect(result.value.sampleTourCount).toBe(4);
    expect(result.value.locale).toBe("en");
    expect(result.value.tours).toHaveLength(4);
    expect(new Set(result.value.tours.flatMap((tour) => tour.experienceTypes))).toEqual(
      new Set(["street_food", "history", "traditional_craft", "traditional_market"]),
    );
    expect(result.value.tours.every((tour) => !Object.hasOwn(tour, "catalog"))).toBe(true);
    expect(result.value.tours.every((tour) => tour.areaIds.length > 0)).toBe(true);
    expect(result.value.tours.find((tour) => tour.slug === "demo-city-life-mix")?.experienceTypes).toEqual([
      "history",
      "street_food",
      "traditional_craft",
    ]);
  });

  it("localizes Vietnamese fixed-tour detail facts while preserving source URLs and license IDs", () => {
    const result = createReadOnlyApi().listTours("vi");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const firstTour = result.value.tours[0];
    expect(firstTour).toMatchObject({
      title: "Chợ địa phương và ẩm thực đường phố",
      inclusions: ["hướng dẫn viên địa phương", "các điểm nếm thử"],
      exclusions: ["đưa đón khách sạn"],
      cancellationPolicy: "Tour demo: thay đổi được miễn phí trước khi xác nhận.",
      attribution: "Nhóm biên tập demo LocalLens",
      license: "CC BY 4.0",
      sourceUrl: "https://example.invalid/locallens/demo-sources/markets-and-street-food",
    });
    expect(firstTour?.stops.map((stop) => stop.title)).toEqual([
      "Chợ Bến Thành",
      "Ẩm thực đường phố Sài Gòn",
    ]);
  });

  it("filters tours deterministically with strict, canonical filter fields", () => {
    const api = createReadOnlyApi();
    const filtered = api.listTours("en", {
      keyword: "  CHO LON  ",
      areaIds: ["demo-hcmc-district-5", "demo-hcmc-district-5"],
      experienceTypes: ["traditional_market", "traditional_market"],
    });

    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;
    expect(filtered.value.tours.map((tour) => tour.slug)).toEqual(["demo-cho-lon-craft"]);
  });

  it("accepts known catalog areas even when no fixed tour uses them", () => {
    const result = createReadOnlyApi().listTours("en", { areaIds: ["demo-hcmc-thu-duc"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tours).toEqual([]);
  });

  it("returns exact allowlisted keys and defensive copies", () => {
    const api = createReadOnlyApi();
    const catalog = api.listTours("en");
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;
    expect(Object.keys(catalog.value).sort()).toEqual([
      "catalogStatus", "city", "dataScope", "environment", "locale", "samplePlaceCount", "sampleTourCount", "sourceStatus", "tours",
    ].sort());
    expect(Object.keys(catalog.value.tours[0] ?? {}).sort()).toEqual([
      "areaIds", "attribution", "cancellationPolicy", "durationMinutes", "experienceTypes",
      "exclusions", "id", "inclusions", "license", "locale", "meetingPoint", "priceVndMinor",
      "slug", "sourceUrl", "stops", "summary", "title", "verifiedAt", "versionId",
    ].sort());
    const originalTitle = catalog.value.tours[0]?.title;
    if (catalog.value.tours[0] !== undefined) catalog.value.tours[0].title = "caller mutation";
    const reread = api.listTours("en");
    expect(reread.ok && reread.value.tours[0]?.title).toBe(originalTitle);
    const repositoryTours = demoCatalogRepository.listTours("en");
    expect(Object.isFrozen(repositoryTours)).toBe(true);
    expect(Object.isFrozen(repositoryTours[0])).toBe(true);
    expect(Object.isFrozen(repositoryTours[0]?.stops)).toBe(true);
  });

  it("keeps demo tour membership, canonical positions, money, duration, opening and travel facts coherent", () => {
    const catalog = createReadOnlyApi().listTours("en");
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;
    const engineInput = demoCatalogRepository.getEngineInput(validRequest);
    expect(engineInput.catalog.places).toHaveLength(6);
    const placeById = new Map(engineInput.catalog.places.map((place) => [place.id, place]));
    const allPlaceIds = new Set(placeById.keys());
    const edgeKeys = new Set<string>();

    for (const place of engineInput.catalog.places) {
      expect(place.openingHours).toHaveLength(7);
      expect(place.openingHours.every((window) => window.opensAt < window.closesAt)).toBe(true);
    }
    for (const edge of engineInput.travel.edges) {
      expect(allPlaceIds.has(edge.fromPlaceId)).toBe(true);
      expect(allPlaceIds.has(edge.toPlaceId)).toBe(true);
      expect(edge.fromPlaceId).not.toBe(edge.toPlaceId);
      edgeKeys.add(`${edge.fromPlaceId}:${edge.toPlaceId}`);
    }
    expect(edgeKeys.size).toBe(engineInput.travel.edges.length);
    for (const tour of catalog.value.tours) {
      expect(tour.durationMinutes).toBeGreaterThan(0);
      expect(tour.priceVndMinor).toMatch(/^(?:0|[1-9]\d*)$/);
      expect(tour.sourceUrl).toContain("/demo-sources/");
      expect(tour.stops.map((stop) => stop.position)).toEqual(tour.stops.map((_, index) => index + 1));
      expect(tour.stops.every((stop) => allPlaceIds.has(stop.placeId))).toBe(true);
      expect(tour.areaIds).toEqual([...tour.areaIds].sort());
      expect(tour.experienceTypes).toEqual([...tour.experienceTypes].sort());
      expect(tour.experienceTypes).toEqual([...new Set(tour.stops.flatMap((stop) => placeById.get(stop.placeId)?.types ?? []))].sort());
    }
  });

  it("rejects unknown filter keys, areas, and experience types", () => {
    const api = createReadOnlyApi();
    const unknownField = errorOf(api.listTours("en", { keyword: "market", city: "HCMC" }));
    const unknownArea = errorOf(api.listTours("en", { areaIds: ["outside-db"] }));
    const unknownType = errorOf(api.listTours("en", { experienceTypes: ["museum"] }));

    expect(unknownField).toMatchObject({ code: "UNKNOWN_FIELD", messageKey: "api.filter.unknown_field" });
    expect(unknownArea).toMatchObject({ code: "UNKNOWN_AREA_ID", messageKey: "api.filter.area.unknown" });
    expect(unknownType).toMatchObject({ code: "UNKNOWN_EXPERIENCE_TYPE", messageKey: "api.filter.experience_type.unknown" });
  });

  it("rejects sparse or augmented filter arrays", () => {
    const sparse: string[] = [];
    sparse.length = 1;
    const augmented = ["demo-hcmc-district-1"] as string[] & { extra?: string };
    augmented.extra = "unexpected";

    expect(errorOf(createReadOnlyApi().listTours("en", { areaIds: sparse }))).toMatchObject({
      code: "INVALID_FILTER",
      messageKey: "api.filter.area.invalid",
    });
    expect(errorOf(createReadOnlyApi().listTours("en", { areaIds: augmented }))).toMatchObject({
      code: "INVALID_FILTER",
      messageKey: "api.filter.area.invalid",
    });
  });

  it("rejects an unsupported locale instead of falling back silently", () => {
    const result = createReadOnlyApi().listTours("fr");
    const error = errorOf(result);

    expect(error).toMatchObject({
      code: "INVALID_REQUEST",
      messageKey: "api.locale.invalid",
      retryable: false,
    });
    expect(error.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("generates unique v4 correlation IDs when UUID APIs are unavailable", () => {
    const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: undefined, getRandomValues: undefined },
    });

    try {
      const api = createReadOnlyApi({ correlationIdFactory: () => "not-a-uuid" });
      const first = errorOf(api.listTours("fr")).correlationId;
      const second = errorOf(api.listTours("fr")).correlationId;

      expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(second).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(second).not.toBe(first);
    } finally {
      if (originalCrypto === undefined) {
        Reflect.deleteProperty(globalThis, "crypto");
      } else {
        Object.defineProperty(globalThis, "crypto", originalCrypto);
      }
    }
  });

  it("builds a deterministic preview and returns only the allowlisted result DTO", () => {
    const result = createReadOnlyApi().previewItinerary(validRequest);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.environment).toBe("demo");
    expect(result.value.city).toBe("Ho Chi Minh City");
    expect(result.value.rankingSource).toBe("deterministic");
    expect(result.value.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        placeId: "demo-hcmc-ben-thanh-market",
        visitDurationMinutes: expect.any(Number),
        startAt: expect.stringMatching(/\+07:00$/),
        endAt: expect.stringMatching(/\+07:00$/),
      }),
    ]));
    expect(Object.keys(result.value).sort()).toEqual([
      "budgetVnd", "city", "environment", "items", "normalizedStartAt", "rankingSource", "snapshotIds", "totals",
    ].sort());
    expect(Object.keys(result.value.items[0] ?? {}).sort()).toEqual([
      "endAt", "placeCostVnd", "placeId", "placeTitle", "score", "startAt", "travelCostVndBefore",
      "travelMinutesBefore", "transitionBufferMinutesBefore", "visitDurationMinutes",
      "foodSelection", "foodCostMinVnd", "foodCostMaxVnd", "payAtVendorMinVnd", "payAtVendorMaxVnd",
      "customerPayableVnd",
    ].sort());
    expect(result.value).not.toHaveProperty("catalog");
    expect(result.value).not.toHaveProperty("travel");
    expect(result.value).not.toHaveProperty("fx");
    expect(result.value).not.toHaveProperty("rationales");
  });

  it("rejects extra request fields at the server boundary", () => {
    const result = createReadOnlyApi().previewItinerary({ ...validRequest, externalPlace: "https://maps.example/1" });
    const error = errorOf(result);

    expect(error).toMatchObject({
      code: "UNKNOWN_FIELD",
      messageKey: "api.request.unknown_field",
      retryable: false,
      fieldErrors: { externalPlace: "api.request.unknown_field" },
    });
  });

  it("rejects extra nested fields instead of silently stripping them", () => {
    const result = createReadOnlyApi().previewItinerary({
      ...validRequest,
      budget: { ...validRequest.budget, paymentToken: "secret" },
    });
    const error = errorOf(result);

    expect(error).toMatchObject({
      code: "UNKNOWN_FIELD",
      messageKey: "api.request.unknown_field",
      fieldErrors: { "budget.paymentToken": "api.request.unknown_field" },
    });
  });

  it("rejects unknown or external locked place IDs before invoking the engine", () => {
    const result = createReadOnlyApi().previewItinerary({
      ...validRequest,
      lockedStopIds: ["https://maps.example/place/1"],
    });
    const error = errorOf(result);

    expect(error).toMatchObject({
      code: "UNKNOWN_PLACE_ID",
      messageKey: "api.place.unknown",
      retryable: false,
      fieldErrors: { lockedStopIds: "api.place.unknown" },
    });
  });

  it("rejects arbitrary dietary and mobility IDs before the engine", () => {
    const dietary = createReadOnlyApi().previewItinerary({ ...validRequest, dietaryRequirements: ["vegan"], mobilityRequirements: [] });
    const mobility = createReadOnlyApi().previewItinerary({ ...validRequest, dietaryRequirements: [], mobilityRequirements: ["wheelchair-ramp"] });

    expect(errorOf(dietary)).toMatchObject({
      code: "UNKNOWN_REQUIREMENT_ID",
      messageKey: "api.requirement.unknown",
      fieldErrors: { dietaryRequirements: "api.requirement.unknown" },
    });
    expect(errorOf(mobility)).toMatchObject({
      code: "UNKNOWN_REQUIREMENT_ID",
      messageKey: "api.requirement.unknown",
      fieldErrors: { mobilityRequirements: "api.requirement.unknown" },
    });
  });

  it("keeps language, pace, and priority weights inside the strict request contract", () => {
    const language = createReadOnlyApi().previewItinerary({ ...validRequest, guideLanguage: "fr" });
    const pace = createReadOnlyApi().previewItinerary({ ...validRequest, pace: "fast" });
    const weights = createReadOnlyApi().previewItinerary({
      ...validRequest,
      priorityWeights: { ...validRequest.priorityWeights, history: 6 },
    });

    expect(errorOf(language)).toMatchObject({ code: "INVALID_REQUEST", fieldErrors: { guideLanguage: "api.request.invalid" } });
    expect(errorOf(pace)).toMatchObject({ code: "INVALID_REQUEST", fieldErrors: { pace: "api.request.invalid" } });
    expect(errorOf(weights)).toMatchObject({ code: "INVALID_REQUEST", fieldErrors: { "priorityWeights.history": "api.request.invalid" } });
  });

  it("keeps all emitted error codes and message keys within the typed backend catalog", () => {
    const errors = [
      errorOf(createReadOnlyApi().listTours("fr")),
      errorOf(createReadOnlyApi().listTours("en", { areaIds: ["outside-db"] })),
      errorOf(createReadOnlyApi().previewItinerary({ ...validRequest, dietaryRequirements: ["free text"] })),
    ];
    const allowedCodes = new Set(API_ERROR_CODES);
    const allowedMessageKeys = new Set(Object.values(API_MESSAGE_KEYS));

    expect(Object.keys(API_MESSAGE_CATALOG.en).sort()).toEqual([...allowedMessageKeys].sort());
    expect(Object.keys(API_MESSAGE_CATALOG.vi).sort()).toEqual([...allowedMessageKeys].sort());
    expect(errors.every((error) => allowedCodes.has(error.code))).toBe(true);
    expect(errors.every((error) => allowedMessageKeys.has(error.messageKey))).toBe(true);
  });

  it("rejects unsafe money and time values with safe field errors", () => {
    const money = createReadOnlyApi().previewItinerary({
      ...validRequest,
      budget: { currency: "VND", amountMinor: Number.MAX_SAFE_INTEGER + 1 },
    });
    const time = createReadOnlyApi().previewItinerary({
      ...validRequest,
      startAt: "2026-09-05T01:00:00",
    });

    expect(errorOf(money)).toMatchObject({
      code: "UNSAFE_MONEY",
      messageKey: "api.money.unsafe",
      fieldErrors: { "budget.amountMinor": "api.money.unsafe" },
    });
    expect(errorOf(time)).toMatchObject({
      code: "UNSAFE_TIME",
      messageKey: "api.time.unsafe",
      fieldErrors: { startAt: "api.time.unsafe" },
    });
  });
});
