import {
  createReadOnlyApi,
  type ReadOnlyApi,
} from "@/lib/application/api/read-only-api";
import {
  createDemoPlannerAdapter,
  type DemoPlannerState,
} from "@/lib/application/planner/demo-planner";
import type { PersonalizationRequest } from "@/lib/application/planner/personalization-session";
import type {
  ExperienceType,
  Locale,
  PlaceCandidate,
  TravelEdge,
} from "@/lib/domain/itinerary/contracts";
import type {
  FoodMenuItemCandidate,
  FoodVendorCandidate,
} from "@/lib/domain/food/contracts";
import {
  DEMO_AS_OF_UTC,
  DEMO_CITY,
  DEMO_ENVIRONMENT,
  demoCatalogRepository,
  type InternalDemoCatalogRepository,
} from "@/lib/infrastructure/mock/hcmc-catalog";

/**
 * Synthetic, test-scoped food facts. They are deliberately kept under
 * tests/e2e and are never part of the production catalog or seed data.
 */
export const FOOD_FIXTURE = Object.freeze({
  approvedMarketPlaceId: "e2e-food-approved-market",
  researchMarketPlaceId: "e2e-food-research-market",
  museumPlaceId: "e2e-food-museum",
  approvedAreaId: "e2e-food-district-1",
  researchAreaId: "e2e-food-district-5",
  museumAreaId: "e2e-food-district-3",
  vendorId: "e2e-food-vendor-aunt-ba",
  menuItemId: "e2e-food-menu-grilled-pork-banh-mi",
  vendor: Object.freeze({
    en: "Aunt Ba's Banh Mi Stall",
    vi: "Quầy Bánh Mì Dì Ba",
  }),
  menu: Object.freeze({
    en: "Grilled pork banh mi",
    vi: "Bánh mì thịt nướng",
  }),
  unitPrice: Object.freeze({ min: 45_000, max: 60_000 }),
  groupQuantity: 3,
  groupFoodCost: Object.freeze({ min: 135_000, max: 180_000 }),
  marketAdmission: 0,
  museumAdmission: 120_000,
});

const SYNTHETIC_COPY = Object.freeze({
  approvedMarket: Object.freeze({ en: "E2E Riverside Market", vi: "Chợ Bờ Sông E2E" }),
  researchMarket: Object.freeze({ en: "E2E Research Market", vi: "Chợ Nghiên cứu E2E" }),
  museum: Object.freeze({ en: "E2E History Museum", vi: "Bảo tàng Lịch sử E2E" }),
});

const ALL_DAY_HOURS: PlaceCandidate["openingHours"] = Array.from(
  { length: 7 },
  (_, weekday) => ({
    weekday: weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    opensAt: "06:00",
    closesAt: "22:00",
  }),
);

function foodMenuItem(status: FoodMenuItemCandidate["status"]): FoodMenuItemCandidate {
  return {
    id: FOOD_FIXTURE.menuItemId,
    vendorId: FOOD_FIXTURE.vendorId,
    slug: "grilled-pork-banh-mi",
    title: { ...FOOD_FIXTURE.menu },
    description: {
      en: "Synthetic menu item used only by the food acceptance snapshot.",
      vi: "Món giả lập chỉ dùng trong snapshot nghiệm thu đồ ăn.",
    },
    servingUnit: "portion",
    priceVndMin: FOOD_FIXTURE.unitPrice.min,
    priceVndMax: FOOD_FIXTURE.unitPrice.max,
    portionDescription: "One sandwich portion",
    dietarySupport: { halal: "unknown", vegetarian: "unsupported" },
    allergens: ["peanut"],
    available: status === "sellable",
    status,
    verifiedAt: "2026-08-31T00:00:00+07:00",
  };
}

function foodVendor(status: FoodVendorCandidate["status"]): FoodVendorCandidate {
  return {
    id: FOOD_FIXTURE.vendorId,
    placeId: FOOD_FIXTURE.approvedMarketPlaceId,
    slug: "aunt-ba-banh-mi-stall",
    title: { ...FOOD_FIXTURE.vendor },
    description: {
      en: "Synthetic vendor used only by the food acceptance snapshot.",
      vi: "Nhà bán hàng giả lập chỉ dùng trong snapshot nghiệm thu đồ ăn.",
    },
    locationNote: "North lane, blue awning",
    serviceType: "stall",
    capacityNote: "Small counter; ask before moving a wheelchair through the lane.",
    dietarySupport: { halal: "unknown", vegetarian: "unsupported" },
    mobilitySupport: { "step-free": "unknown" },
    openingHours: ALL_DAY_HOURS.map((window) => ({ ...window })),
    openingExceptions: [],
    status,
    menuItems: [foodMenuItem(status)],
  };
}

function researchFoodVendor(): FoodVendorCandidate {
  return {
    ...foodVendor("research_only"),
    id: "e2e-food-research-vendor",
    placeId: FOOD_FIXTURE.researchMarketPlaceId,
    slug: "research-only-banh-mi-stall",
    title: {
      en: "Research-only Banh Mi Stall",
      vi: "Quầy bánh mì chỉ để nghiên cứu",
    },
    menuItems: [{
      ...foodMenuItem("research_only"),
      id: "e2e-food-research-menu",
      vendorId: "e2e-food-research-vendor",
      slug: "research-only-banh-mi",
    }],
  };
}

function place(
  id: string,
  areaId: string,
  type: ExperienceType,
  priceVndPerPerson: number,
  visitDurationMinutes: number,
  foodVendors: readonly FoodVendorCandidate[] = [],
): PlaceCandidate {
  return {
    id,
    areaId,
    types: [type],
    priceVndPerPerson,
    visitDurationMinutes,
    guideLanguages: ["en", "vi"],
    dietarySupport: { halal: "unknown", vegetarian: "supported" },
    mobilitySupport: { "step-free": "supported" },
    openingHours: ALL_DAY_HOURS.map((window) => ({ ...window })),
    openingExceptions: [],
    foodVendors: foodVendors.map((vendor) => ({
      ...vendor,
      openingHours: vendor.openingHours.map((window) => ({ ...window })),
      openingExceptions: vendor.openingExceptions.map((exception) => ({
        ...exception,
        windows: exception.windows.map((window) => ({ ...window })),
      })),
      menuItems: vendor.menuItems.map((item) => ({ ...item })),
    })),
  };
}

function createFixturePlaces(): PlaceCandidate[] {
  return [
    place(
      FOOD_FIXTURE.approvedMarketPlaceId,
      FOOD_FIXTURE.approvedAreaId,
      "traditional_market",
      FOOD_FIXTURE.marketAdmission,
      60,
      [foodVendor("sellable")],
    ),
    place(
      FOOD_FIXTURE.researchMarketPlaceId,
      FOOD_FIXTURE.researchAreaId,
      "traditional_market",
      FOOD_FIXTURE.marketAdmission,
      60,
      [researchFoodVendor()],
    ),
    place(
      FOOD_FIXTURE.museumPlaceId,
      FOOD_FIXTURE.museumAreaId,
      "history",
      FOOD_FIXTURE.museumAdmission,
      75,
    ),
  ];
}

const TRAVEL_EDGES: readonly TravelEdge[] = [
  {
    fromPlaceId: FOOD_FIXTURE.approvedMarketPlaceId,
    toPlaceId: FOOD_FIXTURE.museumPlaceId,
    mode: "walk",
    minutes: 10,
    groupCostVnd: 0,
    verifiedAt: "2026-08-31T00:00:00+07:00",
  },
  {
    fromPlaceId: FOOD_FIXTURE.museumPlaceId,
    toPlaceId: FOOD_FIXTURE.approvedMarketPlaceId,
    mode: "walk",
    minutes: 10,
    groupCostVnd: 0,
    verifiedAt: "2026-08-31T00:00:00+07:00",
  },
];

const PLACE_TITLES: Readonly<Record<string, Readonly<Record<Locale, string>>>> = {
  [FOOD_FIXTURE.approvedMarketPlaceId]: SYNTHETIC_COPY.approvedMarket,
  [FOOD_FIXTURE.researchMarketPlaceId]: SYNTHETIC_COPY.researchMarket,
  [FOOD_FIXTURE.museumPlaceId]: SYNTHETIC_COPY.museum,
};

function cloneRequest(request: Parameters<InternalDemoCatalogRepository["getEngineInput"]>[0]): ReturnType<InternalDemoCatalogRepository["getEngineInput"]>["request"] {
  return {
    ...request,
    areas: [...request.areas],
    budget: { ...request.budget },
    priorityWeights: { ...request.priorityWeights },
    dietaryRequirements: [...request.dietaryRequirements],
    mobilityRequirements: [...request.mobilityRequirements],
    lockedStopIds: [...request.lockedStopIds],
  };
}

export function createFoodFixtureRepository(): InternalDemoCatalogRepository {
  const places = createFixturePlaces();
  const areaIds: readonly string[] = [
    FOOD_FIXTURE.approvedAreaId,
    FOOD_FIXTURE.researchAreaId,
    FOOD_FIXTURE.museumAreaId,
  ];
  const placeIds = new Set(places.map((candidate) => candidate.id));
  return {
    environment: DEMO_ENVIRONMENT,
    city: DEMO_CITY,
    listTours: () => [],
    getEngineInput(request) {
      const base = demoCatalogRepository.getEngineInput(request);
      return {
        ...base,
        request: cloneRequest(request),
        catalog: {
          id: "e2e-food-catalog-v1",
          places: places.map((candidate) => ({
            ...candidate,
            types: [...candidate.types],
            guideLanguages: [...candidate.guideLanguages],
            openingHours: candidate.openingHours.map((window) => ({ ...window })),
            openingExceptions: candidate.openingExceptions.map((exception) => ({
              ...exception,
              windows: exception.windows.map((window) => ({ ...window })),
            })),
            foodVendors: candidate.foodVendors.map((vendor) => ({
              ...vendor,
              openingHours: vendor.openingHours.map((window) => ({ ...window })),
              openingExceptions: vendor.openingExceptions.map((exception) => ({
                ...exception,
                windows: exception.windows.map((window) => ({ ...window })),
              })),
              menuItems: vendor.menuItems.map((item) => ({ ...item })),
            })),
          })),
        },
        travel: {
          id: "e2e-food-travel-v1",
          edges: TRAVEL_EDGES.map((edge) => ({ ...edge })),
        },
        asOfUtc: DEMO_AS_OF_UTC,
      };
    },
    listAreaIds: () => areaIds,
    hasArea: (areaId) => areaIds.includes(areaId),
    hasPlace: (placeId) => placeIds.has(placeId),
    getPlaceTitle: (placeId, locale) => PLACE_TITLES[placeId]?.[locale],
  };
}

function requestFor(
  locale: Locale,
  areas: readonly string[],
  priorityWeights: PersonalizationRequest["priorityWeights"],
  options: Readonly<{ partySize?: number; durationMinutes?: number }> = {},
): PersonalizationRequest {
  return {
    startAt: "2026-09-05T09:00:00+07:00",
    durationMinutes: options.durationMinutes ?? 180,
    areas: [...areas],
    budget: { currency: "VND", amountMinor: 1_000_000 },
    partySize: options.partySize ?? FOOD_FIXTURE.groupQuantity,
    guideLanguage: locale,
    priorityWeights,
    pace: "relaxed",
    dietaryRequirements: [],
    mobilityRequirements: [],
    lockedStopIds: [],
    specialNeeds: "",
  };
}

function foodPriority(history = 0): PersonalizationRequest["priorityWeights"] {
  return {
    street_food: 5,
    history: history as 0 | 1 | 2 | 3 | 4 | 5,
    traditional_craft: 0,
    traditional_market: 5,
  };
}

export function createFoodFixturePlannerState(
  locale: Locale,
  scenario: "approved" | "research-only" | "museum" | "mixed" = "approved",
): DemoPlannerState {
  const request = scenario === "research-only"
    ? requestFor(locale, [FOOD_FIXTURE.researchAreaId], foodPriority())
    : scenario === "museum"
      ? requestFor(
          locale,
          [FOOD_FIXTURE.museumAreaId],
          { street_food: 0, history: 5, traditional_craft: 0, traditional_market: 0 },
          { partySize: 1 },
        )
      : scenario === "mixed"
        ? requestFor(
            locale,
            [FOOD_FIXTURE.approvedAreaId, FOOD_FIXTURE.museumAreaId],
            foodPriority(4),
            { durationMinutes: 300 },
          )
        : requestFor(locale, [FOOD_FIXTURE.approvedAreaId], foodPriority());
  const api: ReadOnlyApi = createReadOnlyApi({ repository: createFoodFixtureRepository() });
  return createDemoPlannerAdapter({ readOnlyApi: api }).createInitial(locale, request);
}
