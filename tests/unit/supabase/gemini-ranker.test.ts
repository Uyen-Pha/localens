// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type { RankRequest, RankResponse } from "@/lib/application/itinerary/ranking-port";
import type { RefinementRankRequest } from "@/supabase/functions/_shared/refine-itinerary";
import {
  GEMINI_MODEL,
  createGeminiRanker,
  type GeminiRankerConfig,
} from "@/supabase/functions/_shared/gemini-ranker";

const validRankRequest: RankRequest = {
  candidates: [
    {
      id: "place-history",
      areaId: "district-1",
      types: ["history"],
      visitDurationMinutes: 60,
    },
    {
      id: "place-market",
      areaId: "district-5",
      types: ["traditional_market", "street_food"],
      visitDurationMinutes: 75,
    },
  ],
  priorityWeights: {
    history: 5,
    traditional_craft: 2,
    traditional_market: 3,
    street_food: 4,
  },
  pace: "balanced",
  allowedVendorIds: ["vendor-market"],
  allowedMenuItemIds: ["menu-market-noodles"],
};

const validRankResponse: RankResponse = {
  orderedIds: ["place-history", "place-market"],
  rationales: {
    "place-history": "Matches the strongest history preference.",
    "place-market": "Adds the requested market experience.",
  },
  foodSelections: [],
};

function geminiEnvelope(value: unknown): unknown {
  return {
    candidates: [{
      content: {
        role: "model",
        parts: [{ text: JSON.stringify(value) }],
      },
      finishReason: "STOP",
      index: 0,
    }],
  };
}

function responseFetch(body: unknown, status = 200) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input;
    void init;
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

function rankerConfig(fetchImpl: typeof fetch): GeminiRankerConfig {
  return {
    apiKey: "test-api-key",
    fetchImpl,
  };
}

describe("Gemini itinerary ranker", () => {
  it("calls the pinned model with JSON schema and only allowlisted request fields", async () => {
    const fetchImpl = responseFetch(geminiEnvelope(validRankResponse));
    const rank = createGeminiRanker(rankerConfig(fetchImpl));
    const forgedRequest = {
      ...validRankRequest,
      specialNeeds: "wheelchair user named Private Person",
      feedback: "raw private refinement text",
      email: "private@example.com",
    } as RankRequest;

    await expect(rank(forgedRequest, new AbortController().signal)).resolves.toEqual(validRankResponse);

    expect(GEMINI_MODEL).toBe("gemini-3.6-flash");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/json",
      "x-goog-api-key": "test-api-key",
    });
    const serialized = String(init?.body);
    expect(serialized).not.toContain("test-api-key");
    expect(serialized).not.toContain("specialNeeds");
    expect(serialized).not.toContain("raw private refinement text");
    expect(serialized).not.toContain("private@example.com");

    const body = JSON.parse(serialized) as {
      generationConfig: {
        temperature: number;
        maxOutputTokens: number;
        responseMimeType: string;
        responseJsonSchema: {
          properties: {
            foodSelections: {
              items: {
                properties: {
                  selection: {
                    properties: { paymentMode: { enum: string[] } };
                  };
                };
              };
            };
          } & Record<string, unknown>;
        };
      };
    };
    expect(body.generationConfig).toMatchObject({
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    });
    expect(Object.keys(body.generationConfig.responseJsonSchema.properties).sort()).toEqual([
      "foodSelections",
      "orderedIds",
      "rationales",
    ]);
    expect(
      body.generationConfig.responseJsonSchema.properties.foodSelections
        .items.properties.selection.properties.paymentMode.enum,
    ).toEqual(["pay_at_vendor"]);
  });

  it("sends only structured refinement signals and never the persisted raw feedback", async () => {
    const fetchImpl = responseFetch(geminiEnvelope(validRankResponse));
    const rank = createGeminiRanker(rankerConfig(fetchImpl));
    const refinementRequest = {
      ...validRankRequest,
      signals: {
        pace: "slower",
        food: "remove",
        preferTypes: ["history"],
        avoidTypes: [],
      },
      scope: "partial",
      lockedPlaceIds: ["place-history"],
      feedback: "PRIVATE RAW FEEDBACK",
    } as RefinementRankRequest & { feedback: string };

    await rank(refinementRequest, new AbortController().signal);

    const serialized = String(fetchImpl.mock.calls[0]?.[1]?.body);
    const body = JSON.parse(serialized) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const prompt = body.contents[0]?.parts[0]?.text ?? "";
    expect(prompt).toContain('"signals":{"pace":"slower","food":"remove"');
    expect(prompt).toContain('"lockedPlaceIds":["place-history"]');
    expect(prompt).not.toContain("PRIVATE RAW FEEDBACK");
    expect(prompt).not.toContain('"feedback"');
  });

  it.each([401, 429, 500])("rejects provider HTTP %s without returning provider content", async (status) => {
    const fetchImpl = responseFetch({ error: { message: "provider-private-detail" } }, status);
    const rank = createGeminiRanker(rankerConfig(fetchImpl));

    await expect(rank(validRankRequest, new AbortController().signal)).rejects.toThrow("Gemini request failed");
  });

  it("rejects an empty candidate set before any provider request", async () => {
    const fetchImpl = responseFetch(geminiEnvelope(validRankResponse));
    const rank = createGeminiRanker(rankerConfig(fetchImpl));

    await expect(rank(
      { ...validRankRequest, candidates: [] },
      new AbortController().signal,
    )).rejects.toThrow("candidate");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["missing candidates", {}],
    ["missing parts", { candidates: [{ content: {} }] }],
    [
      "multiple text parts",
      { candidates: [{ content: { parts: [{ text: "{}" }, { text: "{}" }] } }] },
    ],
  ])("rejects a malformed Gemini envelope: %s", async (_label, envelope) => {
    const rank = createGeminiRanker(rankerConfig(responseFetch(envelope)));

    await expect(rank(validRankRequest, new AbortController().signal)).rejects.toThrow("Gemini response");
  });

  it("rejects a provider response larger than 64 KiB", async () => {
    const oversized = geminiEnvelope({
      ...validRankResponse,
      rationales: { "place-history": "x".repeat(70_000) },
    });
    const rank = createGeminiRanker(rankerConfig(responseFetch(oversized)));

    await expect(rank(validRankRequest, new AbortController().signal)).rejects.toThrow("Gemini response");
  });

  it("rejects invalid JSON in the model text part", async () => {
    const rank = createGeminiRanker(rankerConfig(responseFetch({
      candidates: [{ content: { parts: [{ text: "not-json" }] } }],
    })));

    await expect(rank(validRankRequest, new AbortController().signal)).rejects.toThrow("Gemini response");
  });

  it("propagates an aborted provider fetch for deterministic fallback upstream", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    });
    const rank = createGeminiRanker(rankerConfig(fetchImpl as typeof fetch));

    await expect(rank(validRankRequest, AbortSignal.abort())).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects aliases instead of allowing the configured model to drift", () => {
    expect(() => createGeminiRanker({
      apiKey: "test-api-key",
      model: "gemini-flash-latest",
      fetchImpl: responseFetch(geminiEnvelope(validRankResponse)),
    } as unknown as GeminiRankerConfig)).toThrow("model");
  });
});
