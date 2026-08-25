import type {
  EngineInput,
  ExperienceType,
  Locale,
  PlaceCandidate,
} from "@/lib/domain/itinerary/contracts";

export const DEMO_ENVIRONMENT = "demo" as const;
export const DEMO_CITY = "Ho Chi Minh City" as const;
export const DEMO_CATALOG_SNAPSHOT_ID = "demo-hcmc-catalog-v1" as const;
export const DEMO_TRAVEL_SNAPSHOT_ID = "demo-hcmc-travel-v1" as const;
export const DEMO_FX_SNAPSHOT_ID = "demo-hcmc-fx-v1" as const;
export const DEMO_AS_OF_UTC = "2026-09-05T01:00:00Z" as const;

type Weekday = PlaceCandidate["openingHours"][number]["weekday"];

const ALL_DAY_HOURS = Array.from({ length: 7 }, (_, weekday) => ({
  weekday: weekday as Weekday,
  opensAt: "06:00",
  closesAt: "22:00",
}));

function place(
  id: string,
  areaId: string,
  type: ExperienceType,
  priceVndPerPerson: number,
  visitDurationMinutes: number,
  guideLanguages: Locale[] = ["en", "vi"],
): PlaceCandidate {
  return {
    id,
    areaId,
    types: [type],
    priceVndPerPerson,
    visitDurationMinutes,
    guideLanguages,
    dietarySupport: { halal: "unknown", vegetarian: "supported" },
    mobilitySupport: { "step-free": "supported" },
    openingHours: ALL_DAY_HOURS.map((window) => ({ ...window })),
    openingExceptions: [],
  };
}

export const DEMO_PLACES = Object.freeze([
  place("demo-hcmc-ben-thanh-market", "demo-hcmc-district-1", "traditional_market", 80_000, 60),
  place("demo-hcmc-street-food", "demo-hcmc-district-1", "street_food", 150_000, 60),
  place("demo-hcmc-war-remnants", "demo-hcmc-district-3", "history", 120_000, 75),
  place("demo-hcmc-binh-tay-market", "demo-hcmc-district-5", "traditional_market", 70_000, 60),
  place("demo-hcmc-cho-lon-craft", "demo-hcmc-district-5", "traditional_craft", 100_000, 90),
  place("demo-hcmc-thu-duc-craft", "demo-hcmc-thu-duc", "traditional_craft", 110_000, 90),
]);

const placeIds = DEMO_PLACES.map((candidate) => candidate.id);
const DEMO_TRAVEL_EDGES = Object.freeze(
  placeIds.flatMap((fromPlaceId, fromIndex) =>
    placeIds
      .filter((toPlaceId) => toPlaceId !== fromPlaceId)
      .map((toPlaceId, toIndex) => ({
        fromPlaceId,
        toPlaceId,
        mode: fromIndex % 2 === 0 ? ("walk" as const) : ("taxi" as const),
        minutes: 8 + ((fromIndex + toIndex) % 4) * 4,
        groupCostVnd: fromIndex % 2 === 0 ? 0 : 20_000,
        verifiedAt: "2026-09-04T18:00:00+07:00",
      })),
  ),
);

export const DEMO_ENGINE_INPUT: EngineInput = {
  request: {
    startAt: DEMO_AS_OF_UTC,
    durationMinutes: 360,
    areas: ["demo-hcmc-district-1"],
    budget: { currency: "VND", amountMinor: 1_000_000 },
    partySize: 1,
    guideLanguage: "en",
    priorityWeights: {
      street_food: 1,
      history: 1,
      traditional_craft: 1,
      traditional_market: 1,
    },
    pace: "balanced",
    dietaryRequirements: [],
    mobilityRequirements: [],
    lockedStopIds: [],
  },
  catalog: {
    id: DEMO_CATALOG_SNAPSHOT_ID,
    places: [...DEMO_PLACES],
  },
  travel: {
    id: DEMO_TRAVEL_SNAPSHOT_ID,
    edges: [...DEMO_TRAVEL_EDGES],
  },
  fx: {
    id: DEMO_FX_SNAPSHOT_ID,
    vndPerUsd: "25000.00000000",
    observedAtUtc: DEMO_AS_OF_UTC,
  },
  asOfUtc: DEMO_AS_OF_UTC,
};

export interface DemoTourRecord {
  id: string;
  versionId: string;
  slug: string;
  locale: Locale;
  title: string;
  summary: string;
  meetingPoint: string;
  durationMinutes: number;
  priceVndMinor: string;
  inclusions: string[];
  exclusions: string[];
  cancellationPolicy: string;
  sourceUrl: string;
  verifiedAt: string;
  attribution: string;
  license: string;
  experienceTypes: ExperienceType[];
  stops: Array<{ position: number; placeId: string; placeSlug: string; title: string }>;
}

type TourCopy = Omit<DemoTourRecord, "locale" | "id" | "versionId" | "stops"> & {
  key: string;
  stopIds: string[];
  stopTitles: string[];
};

const TOUR_COPIES: TourCopy[] = [
  {
    key: "markets-and-street-food",
    slug: "demo-markets-and-street-food",
    title: "Markets and Street Food",
    summary: "A relaxed introduction to local markets and everyday flavors.",
    meetingPoint: "Ben Thanh Market north gate",
    durationMinutes: 180,
    priceVndMinor: "480000",
    inclusions: ["local guide", "tasting stops"],
    exclusions: ["hotel transfer"],
    cancellationPolicy: "Demo booking: changes are free before confirmation.",
    sourceUrl: "https://example.com/locallens/demo-markets-and-street-food",
    verifiedAt: "2026-08-24",
    attribution: "LocalLens demo editorial team",
    license: "CC BY 4.0",
    experienceTypes: ["traditional_market", "street_food"],
    stopIds: ["demo-hcmc-ben-thanh-market", "demo-hcmc-street-food"],
    stopTitles: ["Ben Thanh Market", "Saigon Street Food"],
  },
  {
    key: "history-and-memory",
    slug: "demo-history-and-memory",
    title: "History and Memory",
    summary: "A compact walk through stories that shaped modern Ho Chi Minh City.",
    meetingPoint: "War Remnants Museum entrance",
    durationMinutes: 180,
    priceVndMinor: "420000",
    inclusions: ["local guide", "walking route"],
    exclusions: ["museum ticket"],
    cancellationPolicy: "Demo booking: changes are free before confirmation.",
    sourceUrl: "https://example.com/locallens/demo-history-and-memory",
    verifiedAt: "2026-08-24",
    attribution: "LocalLens demo editorial team",
    license: "CC BY 4.0",
    experienceTypes: ["history"],
    stopIds: ["demo-hcmc-war-remnants", "demo-hcmc-ben-thanh-market"],
    stopTitles: ["War Remnants Museum area", "Ben Thanh Market"],
  },
  {
    key: "cho-lon-craft",
    slug: "demo-cho-lon-craft",
    title: "Cho Lon Craft Traditions",
    summary: "Explore craft stories and market life in the city's historic quarter.",
    meetingPoint: "Binh Tay Market east gate",
    durationMinutes: 210,
    priceVndMinor: "520000",
    inclusions: ["local guide", "craft demonstration"],
    exclusions: ["souvenirs"],
    cancellationPolicy: "Demo booking: changes are free before confirmation.",
    sourceUrl: "https://example.com/locallens/demo-cho-lon-craft",
    verifiedAt: "2026-08-24",
    attribution: "LocalLens demo editorial team",
    license: "CC BY 4.0",
    experienceTypes: ["traditional_craft", "traditional_market"],
    stopIds: ["demo-hcmc-binh-tay-market", "demo-hcmc-cho-lon-craft"],
    stopTitles: ["Binh Tay Market", "Cho Lon Craft Workshop"],
  },
  {
    key: "city-life-mix",
    slug: "demo-city-life-mix",
    title: "City Life, From Market to Craft",
    summary: "A broad demo route combining food, history, markets, and craft.",
    meetingPoint: "Central District 1 meeting point",
    durationMinutes: 300,
    priceVndMinor: "680000",
    inclusions: ["local guide", "tasting stop", "craft demonstration"],
    exclusions: ["private transport"],
    cancellationPolicy: "Demo booking: changes are free before confirmation.",
    sourceUrl: "https://example.com/locallens/demo-city-life-mix",
    verifiedAt: "2026-08-24",
    attribution: "LocalLens demo editorial team",
    license: "CC BY 4.0",
    experienceTypes: ["street_food", "history", "traditional_craft", "traditional_market"],
    stopIds: ["demo-hcmc-street-food", "demo-hcmc-war-remnants", "demo-hcmc-cho-lon-craft"],
    stopTitles: ["Saigon Street Food", "War Remnants Museum area", "Cho Lon Craft Workshop"],
  },
];

const TOUR_TRANSLATIONS: Record<Locale, Record<string, Pick<DemoTourRecord, "title" | "summary" | "meetingPoint">>> = {
  en: {},
  vi: {
    "markets-and-street-food": {
      title: "Chợ địa phương và ẩm thực đường phố",
      summary: "Làm quen với những khu chợ và hương vị đời thường của thành phố.",
      meetingPoint: "Cổng phía bắc chợ Bến Thành",
    },
    "history-and-memory": {
      title: "Lịch sử và ký ức",
      summary: "Một hành trình ngắn qua những câu chuyện làm nên Thành phố Hồ Chí Minh.",
      meetingPoint: "Cổng Bảo tàng Chứng tích Chiến tranh",
    },
    "cho-lon-craft": {
      title: "Nghề thủ công Chợ Lớn",
      summary: "Khám phá câu chuyện nghề và nhịp sống chợ ở khu phố lịch sử.",
      meetingPoint: "Cổng phía đông chợ Bình Tây",
    },
    "city-life-mix": {
      title: "Nhịp sống thành phố: từ chợ đến nghề thủ công",
      summary: "Tuyến trải nghiệm demo kết hợp ẩm thực, lịch sử, chợ và nghề thủ công.",
      meetingPoint: "Điểm hẹn trung tâm Quận 1",
    },
  },
};

function createTour(copy: TourCopy, locale: Locale): DemoTourRecord {
  const translation = TOUR_TRANSLATIONS[locale][copy.key];
  const title = translation?.title ?? copy.title;
  const summary = translation?.summary ?? copy.summary;
  const meetingPoint = translation?.meetingPoint ?? copy.meetingPoint;
  return {
    ...copy,
    id: `demo-tour-${copy.key}-${locale}`,
    versionId: `demo-tour-version-${copy.key}-${locale}`,
    locale,
    title,
    summary,
    meetingPoint,
    stops: copy.stopIds.map((placeId, index) => ({
      position: index + 1,
      placeId,
      placeSlug: placeId.replace(/^demo-hcmc-/, ""),
      title: copy.stopTitles[index] ?? placeId,
    })),
  };
}

export const DEMO_TOURS = Object.freeze(
  (["en", "vi"] as const).flatMap((locale) => TOUR_COPIES.map((copy) => createTour(copy, locale))),
);

export interface InternalDemoCatalogRepository {
  readonly environment: typeof DEMO_ENVIRONMENT;
  readonly city: typeof DEMO_CITY;
  listTours(locale: Locale): readonly DemoTourRecord[];
  getEngineInput(request: EngineInput["request"]): EngineInput;
  hasArea(areaId: string): boolean;
  hasPlace(placeId: string): boolean;
  getPlaceTitle(placeId: string, locale: Locale): string | undefined;
}

class HcmcDemoCatalogRepository implements InternalDemoCatalogRepository {
  readonly environment = DEMO_ENVIRONMENT;
  readonly city = DEMO_CITY;

  listTours(locale: Locale): readonly DemoTourRecord[] {
    return DEMO_TOURS.filter((tour) => tour.locale === locale);
  }

  getEngineInput(request: EngineInput["request"]): EngineInput {
    return { ...DEMO_ENGINE_INPUT, request };
  }

  hasArea(areaId: string): boolean {
    return new Set(DEMO_PLACES.map((candidate) => candidate.areaId)).has(areaId);
  }

  hasPlace(placeId: string): boolean {
    return placeIds.includes(placeId);
  }

  getPlaceTitle(placeId: string, locale: Locale): string | undefined {
    const tour = DEMO_TOURS.find((candidate) => candidate.locale === locale && candidate.stops.some((stop) => stop.placeId === placeId));
    return tour?.stops.find((stop) => stop.placeId === placeId)?.title;
  }
}

export const demoCatalogRepository: InternalDemoCatalogRepository = new HcmcDemoCatalogRepository();
