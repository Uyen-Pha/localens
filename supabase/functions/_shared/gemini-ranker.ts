import type {
  RankRequest,
  RankResponse,
  Ranker,
} from "@/lib/application/itinerary/ranking-port";
import type { ExperienceType } from "@/lib/domain/itinerary/contracts";
import type { RefinementRankRequest } from "@/supabase/functions/_shared/refine-itinerary";

export const GEMINI_MODEL = "gemini-3.6-flash" as const;

export const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta" as const;
const LOCAL_TEST_PROVIDER_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "host.docker.internal",
  "host.containers.internal",
]);
const MAX_RESPONSE_BYTES = 65_536;
const MAX_API_KEY_LENGTH = 4096;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const EXPERIENCE_TYPES = new Set<ExperienceType>([
  "history",
  "traditional_craft",
  "traditional_market",
  "street_food",
]);

export interface GeminiRankerConfig {
  readonly apiKey: string;
  readonly model?: typeof GEMINI_MODEL;
  readonly fetchImpl?: typeof fetch;
  readonly endpointBase?: string;
}

export class GeminiProviderResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiProviderResponseError";
  }
}

export function normalizeGeminiEndpointBase(value: string): string {
  if (value === GEMINI_ENDPOINT_BASE) return value;
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 2048
    || value !== value.trim()
    || CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new Error("Invalid Gemini endpoint");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Invalid Gemini endpoint");
  }
  const port = Number(parsed.port);
  if (
    parsed.protocol !== "http:"
    || !LOCAL_TEST_PROVIDER_HOSTS.has(parsed.hostname)
    || parsed.port === ""
    || !Number.isSafeInteger(port)
    || port < 1024
    || port > 65_535
    || parsed.pathname !== "/v1beta"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.search !== ""
    || parsed.hash !== ""
  ) {
    throw new Error("Invalid Gemini endpoint");
  }
  return `${parsed.origin}/v1beta`;
}

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["orderedIds", "rationales", "foodSelections"],
  properties: {
    orderedIds: {
      type: "array",
      minItems: 1,
      items: { type: "string" },
    },
    rationales: {
      type: "object",
      additionalProperties: { type: "string", maxLength: 240 },
    },
    foodSelections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["placeId", "selection"],
        properties: {
          placeId: { type: "string" },
          selection: {
            type: "object",
            additionalProperties: false,
            required: [
              "vendorId",
              "menuItemId",
              "quantity",
              "priceVndMin",
              "priceVndMax",
              "paymentMode",
              "activity",
            ],
            properties: {
              vendorId: { type: "string" },
              menuItemId: { type: "string" },
              quantity: { type: "integer", minimum: 1 },
              priceVndMin: { type: "integer", minimum: 0 },
              priceVndMax: { type: "integer", minimum: 0 },
              paymentMode: { type: "string", enum: ["pay_at_vendor"] },
              activity: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_INSTRUCTION = [
  "Rank the supplied itinerary candidates using only the structured input.",
  "Every ID in the answer must be copied from the matching supplied ID array.",
  "Each rationale must contain at most 240 Unicode code points.",
  "Do not invent prices, schedules, places, vendors, or menu items.",
  "Return JSON only and follow the response schema exactly.",
].join(" ");

type ProviderRankInput = {
  candidates: Array<{
    id: string;
    areaId: string;
    types: ExperienceType[];
    visitDurationMinutes: number;
  }>;
  priorityWeights: Record<ExperienceType, number>;
  pace: RankRequest["pace"];
  allowedVendorIds: string[];
  allowedMenuItemIds: string[];
  refinement?: {
    signals: {
      pace: "keep" | "slower" | "faster";
      food: "keep" | "more" | "remove";
      preferTypes: ExperienceType[];
      avoidTypes: ExperienceType[];
    };
    scope: "partial" | "full";
    lockedPlaceIds: string[];
  };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function copyStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`Invalid Gemini ${field}`);
  }
  return [...value] as string[];
}

function copyExperienceTypes(value: unknown, field: string): ExperienceType[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || !EXPERIENCE_TYPES.has(entry as ExperienceType))
  ) {
    throw new Error(`Invalid Gemini ${field}`);
  }
  return [...value] as ExperienceType[];
}

function refinementInput(request: RankRequest): ProviderRankInput["refinement"] {
  const value = request as Partial<RefinementRankRequest>;
  const hasRefinement = value.signals !== undefined
    || value.scope !== undefined
    || value.lockedPlaceIds !== undefined;
  if (!hasRefinement) return undefined;
  if (!isPlainObject(value.signals)) throw new Error("Invalid Gemini refinement signals");
  const pace = value.signals.pace;
  const food = value.signals.food;
  if (
    pace !== "keep" && pace !== "slower" && pace !== "faster" ||
    food !== "keep" && food !== "more" && food !== "remove" ||
    value.scope !== "partial" && value.scope !== "full" ||
    !Array.isArray(value.signals.preferTypes) ||
    !Array.isArray(value.signals.avoidTypes) ||
    !Array.isArray(value.lockedPlaceIds)
  ) {
    throw new Error("Invalid Gemini refinement context");
  }
  return {
    signals: {
      pace,
      food,
      preferTypes: copyExperienceTypes(value.signals.preferTypes, "preferred experience types"),
      avoidTypes: copyExperienceTypes(value.signals.avoidTypes, "avoided experience types"),
    },
    scope: value.scope,
    lockedPlaceIds: copyStringArray(value.lockedPlaceIds, "locked place IDs"),
  };
}

function toProviderInput(request: RankRequest): ProviderRankInput {
  if (!Array.isArray(request.candidates) || request.candidates.length === 0) {
    throw new Error("Gemini candidate list cannot be empty");
  }
  const candidates = request.candidates.map((candidate) => {
    if (
      !isPlainObject(candidate) ||
      typeof candidate.id !== "string" ||
      typeof candidate.areaId !== "string" ||
      typeof candidate.visitDurationMinutes !== "number" ||
      !Number.isSafeInteger(candidate.visitDurationMinutes)
    ) {
      throw new Error("Invalid Gemini candidate");
    }
    return {
      id: candidate.id,
      areaId: candidate.areaId,
      types: copyExperienceTypes(candidate.types, "candidate types"),
      visitDurationMinutes: candidate.visitDurationMinutes,
    };
  });
  if (!isPlainObject(request.priorityWeights)) throw new Error("Invalid Gemini priority weights");
  const providerInput: ProviderRankInput = {
    candidates,
    priorityWeights: {
      history: request.priorityWeights.history,
      traditional_craft: request.priorityWeights.traditional_craft,
      traditional_market: request.priorityWeights.traditional_market,
      street_food: request.priorityWeights.street_food,
    },
    pace: request.pace,
    allowedVendorIds: copyStringArray(request.allowedVendorIds, "allowed vendor IDs"),
    allowedMenuItemIds: copyStringArray(request.allowedMenuItemIds, "allowed menu item IDs"),
  };
  const refinement = refinementInput(request);
  if (refinement !== undefined) providerInput.refinement = refinement;
  return providerInput;
}

function extractModelJson(envelope: unknown): unknown {
  if (!isPlainObject(envelope) || !Array.isArray(envelope.candidates) || envelope.candidates.length !== 1) {
    throw new GeminiProviderResponseError("Invalid Gemini response envelope");
  }
  const candidate = envelope.candidates[0];
  if (!isPlainObject(candidate) || !isPlainObject(candidate.content)) {
    throw new GeminiProviderResponseError("Invalid Gemini response candidate");
  }
  const parts = candidate.content.parts;
  if (!Array.isArray(parts) || parts.length !== 1 || !isPlainObject(parts[0]) || typeof parts[0].text !== "string") {
    throw new GeminiProviderResponseError("Invalid Gemini response parts");
  }
  try {
    return JSON.parse(parts[0].text);
  } catch {
    throw new GeminiProviderResponseError("Invalid Gemini response JSON");
  }
}

function validateConfig(config: GeminiRankerConfig): {
  apiKey: string;
  endpointBase: string;
  fetchImpl: typeof fetch;
} {
  if (
    typeof config?.apiKey !== "string" ||
    config.apiKey.length === 0 ||
    config.apiKey.length > MAX_API_KEY_LENGTH ||
    CONTROL_CHARACTER_PATTERN.test(config.apiKey)
  ) {
    throw new Error("Invalid Gemini API key");
  }
  if (config.model !== undefined && config.model !== GEMINI_MODEL) {
    throw new Error("Invalid Gemini model");
  }
  const endpointBase = normalizeGeminiEndpointBase(config.endpointBase ?? GEMINI_ENDPOINT_BASE);
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("Invalid Gemini fetch implementation");
  return {
    apiKey: config.apiKey,
    endpointBase,
    fetchImpl,
  };
}

export function createGeminiRanker(config: GeminiRankerConfig): Ranker {
  const validated = validateConfig(config);
  const url = `${validated.endpointBase}/models/${GEMINI_MODEL}:generateContent`;

  return async (request: RankRequest, signal: AbortSignal): Promise<RankResponse> => {
    const input = toProviderInput(request);
    const response = await validated.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": validated.apiKey,
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: `${SYSTEM_INSTRUCTION}\nINPUT_JSON:${JSON.stringify(input)}` }],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
          responseJsonSchema: RESPONSE_JSON_SCHEMA,
        },
      }),
      signal,
    });
    if (!response.ok) throw new GeminiProviderResponseError("Gemini request failed");

    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new GeminiProviderResponseError("Gemini response exceeded size limit");
    }
    let envelope: unknown;
    try {
      envelope = JSON.parse(text);
    } catch {
      throw new GeminiProviderResponseError("Invalid Gemini response envelope");
    }
    return extractModelJson(envelope) as RankResponse;
  };
}
