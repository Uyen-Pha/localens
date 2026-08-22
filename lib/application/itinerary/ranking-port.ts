import type {
  ExperienceType,
  Pace,
  PlaceCandidate,
  PriorityWeights,
  Result,
} from "@/lib/domain/itinerary/contracts";
import { domainError } from "@/lib/domain/itinerary/errors";

export interface PublicRankCandidate {
  id: string;
  areaId: string;
  types: ExperienceType[];
  visitDurationMinutes: number;
}

export interface RankRequest {
  candidates: PublicRankCandidate[];
  priorityWeights: PriorityWeights;
  pace: Pace;
}

export interface RankResponse {
  orderedIds: string[];
  rationales: Record<string, string>;
}

export type Ranker = (
  request: RankRequest,
  signal: AbortSignal,
) => Promise<RankResponse>;

export interface ValidatedRankResponse {
  orderedIds: string[];
  rationales: Record<string, string>;
}

const invalidRankResponse = <T>(): Result<T> => ({
  ok: false,
  error: domainError(
    "INVALID_ITINERARY_INPUT",
    "itinerary.ai.invalid",
    ["rankResponse"],
  ),
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length) return false;
  const expectedSet = new Set(expected);
  return keys.every((key) => {
    if (typeof key !== "string" || !expectedSet.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

function isDenseStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  const ownKeys = Reflect.ownKeys(value);
  const allowedKeys = new Set<string>(["length"]);
  for (let index = 0; index < value.length; index += 1) {
    allowedKeys.add(String(index));
  }
  if (
    ownKeys.some((key) => typeof key !== "string" || !allowedKeys.has(key)) ||
    ownKeys.length !== value.length + 1
  ) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return false;
    if (typeof value[index] !== "string") return false;
  }
  return true;
}

function isCodePointSafe(value: string): boolean {
  return Array.from(value).length <= 240;
}

/**
 * Project trusted internal candidates into the deliberately small provider DTO.
 * No names, support records, contact data, account identifiers, or pricing are
 * exposed to an AI adapter.
 */
export function toPublicRankRequest(
  candidates: readonly PlaceCandidate[],
  priorityWeights: PriorityWeights,
  pace: Pace,
): RankRequest {
  return {
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      areaId: candidate.areaId,
      types: [...candidate.types],
      visitDurationMinutes: candidate.visitDurationMinutes,
    })),
    priorityWeights: { ...priorityWeights },
    pace,
  };
}

/**
 * Validate and clone a provider response against the currently filtered IDs.
 * This boundary is intentionally defensive: sparse arrays, proxies/getters,
 * inherited keys, symbols, duplicate/unknown IDs, and rationale mismatches all
 * invalidate the complete response.
 */
export function validateRankResponse(
  value: unknown,
  filteredIds: readonly string[],
): Result<ValidatedRankResponse> {
  try {
    if (!Array.isArray(filteredIds)) return invalidRankResponse();
    const filteredSet = new Set<string>();
    for (const id of filteredIds) {
      if (typeof id !== "string" || filteredSet.has(id)) return invalidRankResponse();
      filteredSet.add(id);
    }
    if (!isPlainObject(value) || !hasExactKeys(value, ["orderedIds", "rationales"])) {
      return invalidRankResponse();
    }

    const orderedIdsValue = value.orderedIds;
    if (!isDenseStringArray(orderedIdsValue) || orderedIdsValue.length === 0) {
      return invalidRankResponse();
    }

    const seen = new Set<string>();
    for (const id of orderedIdsValue) {
      if (!filteredSet.has(id) || seen.has(id)) return invalidRankResponse();
      seen.add(id);
    }

    const rationalesValue = value.rationales;
    if (
      !isPlainObject(rationalesValue) ||
      !hasExactKeys(rationalesValue, orderedIdsValue)
    ) {
      return invalidRankResponse();
    }

    const rationales: Record<string, string> = {};
    for (const id of orderedIdsValue) {
      if (!Object.prototype.hasOwnProperty.call(rationalesValue, id)) {
        return invalidRankResponse();
      }
      const rationale = rationalesValue[id];
      if (typeof rationale !== "string" || !isCodePointSafe(rationale)) {
        return invalidRankResponse();
      }
      Object.defineProperty(rationales, id, {
        value: rationale,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }

    return {
      ok: true,
      value: {
        orderedIds: [...orderedIdsValue],
        rationales,
      },
    };
  } catch {
    return invalidRankResponse();
  }
}
