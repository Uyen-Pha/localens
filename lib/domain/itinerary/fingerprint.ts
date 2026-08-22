import type {
  EngineInput,
  ExperienceType,
  ItineraryItem,
  ItineraryResult,
  ItineraryTotals,
} from "@/lib/domain/itinerary/contracts";

const EXPERIENCE_TYPES: readonly ExperienceType[] = [
  "street_food",
  "history",
  "traditional_craft",
  "traditional_market",
];

type CanonicalObject = { [key: string]: CanonicalValue };
type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | bigint
  | readonly CanonicalValue[]
  | CanonicalObject;

function compareLexicographically(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sortedStrings(values: readonly string[]): string[] {
  return [...values].sort(compareLexicographically);
}

function decimalString(value: number | bigint | string): string {
  if (typeof value === "bigint") return value.toString(10);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError("money values must be non-negative safe integers");
    }
    return String(value);
  }
  if (!/^\d+$/.test(value)) {
    throw new TypeError("money values must be decimal integers");
  }
  return BigInt(value).toString(10);
}

function canonicalJson(value: CanonicalValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical numbers must be finite");
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new TypeError("canonical number is not serializable");
    return encoded;
  }
  if (typeof value === "bigint") return JSON.stringify(value.toString(10));
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const object = value as CanonicalObject;
  const keys = Object.keys(object).sort(compareLexicographically);
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

function projectItem(item: ItineraryItem): CanonicalObject {
  return {
    placeId: item.placeId,
    startAt: item.startAt,
    endAt: item.endAt,
    visitDurationMinutes: item.visitDurationMinutes,
    travelMinutesBefore: item.travelMinutesBefore,
    transitionBufferMinutesBefore: item.transitionBufferMinutesBefore,
    travelCostVndBefore: decimalString(item.travelCostVndBefore),
    placeCostVnd: decimalString(item.placeCostVnd),
    score: item.score,
  };
}

function projectTotals(totals: ItineraryTotals): CanonicalObject {
  return {
    durationMinutes: totals.durationMinutes,
    visitMinutes: totals.visitMinutes,
    travelMinutes: totals.travelMinutes,
    transitionBufferMinutes: totals.transitionBufferMinutes,
    groupCostVnd: decimalString(totals.groupCostVnd),
    score: totals.score,
  };
}

function projectItinerary(input: EngineInput, result: ItineraryResult): CanonicalObject {
  const priorityWeights: CanonicalObject = {};
  for (const experienceType of EXPERIENCE_TYPES) {
    priorityWeights[experienceType] = input.request.priorityWeights[experienceType];
  }

  return {
    version: 1,
    request: {
      normalizedStartAt: result.normalizedStartAt,
      durationMinutes: input.request.durationMinutes,
      areas: sortedStrings(input.request.areas),
      budget: {
        currency: input.request.budget.currency,
        amountMinor: input.request.budget.amountMinor,
      },
      budgetVnd: decimalString(result.budgetVnd),
      partySize: input.request.partySize,
      guideLanguage: input.request.guideLanguage,
      priorityWeights,
      pace: input.request.pace,
      dietaryRequirements: sortedStrings(input.request.dietaryRequirements),
      mobilityRequirements: sortedStrings(input.request.mobilityRequirements),
      lockedStopIds: [...input.request.lockedStopIds],
    },
    snapshotIds: {
      catalog: result.snapshotIds.catalog,
      travel: result.snapshotIds.travel,
      fx: result.snapshotIds.fx,
    },
    rankingSource: result.rankingSource,
    items: result.items.map(projectItem),
    totals: projectTotals(result.totals),
  };
}

export function canonicalizeItinerary(
  input: EngineInput,
  result: ItineraryResult,
): string {
  return canonicalJson(projectItinerary(input, result));
}

export async function fingerprintItinerary(
  input: EngineInput,
  result: ItineraryResult,
  sha256: (bytes: Uint8Array) => Promise<Uint8Array>,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeItinerary(input, result));
  const digest = await sha256(bytes);
  if (!(digest instanceof Uint8Array) || digest.length !== 32) {
    throw new TypeError("SHA-256 digest must contain exactly 32 bytes");
  }
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
