import { describe, expect, it, vi } from "vitest";

import type { ItineraryRequest } from "@/lib/domain/itinerary/contracts";
import type { RefinementSignals } from "@/lib/application/planner/refinement-signals";
import {
  invalidateRuntimePendingOperation,
  readRuntimePlanPointer,
  readRuntimePendingOperation,
  removeRuntimePlanPointer,
  removeRuntimePendingOperation,
  RUNTIME_PENDING_OPERATION_KEY,
  RUNTIME_PENDING_OPERATION_TTL_MS,
  RUNTIME_PLAN_POINTER_KEY,
  RUNTIME_PLAN_POINTER_TTL_MS,
  RUNTIME_SESSION_MAX_FUTURE_SKEW_MS,
  saveRuntimePlanPointer,
  saveRuntimePendingOperation,
  type RuntimePendingOperation,
  type RuntimePlanPointer,
} from "@/lib/application/planner/runtime-planner-session";

const NOW = Date.UTC(2026, 8, 5, 1, 0, 0, 0);
const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_OWNER_ID = "10000000-0000-4000-8000-000000000002";
const OPERATION_ID = "10000000-0000-4000-8000-000000000003";
const PLAN_ID = "10000000-0000-4000-8000-000000000004";
const LOCKED_ITEM_A = "10000000-0000-4000-8000-000000000005";
const LOCKED_ITEM_B = "10000000-0000-4000-8000-000000000006";
const LOCKED_STOP_A = "10000000-0000-4000-8000-000000000007";
const LOCKED_STOP_B = "10000000-0000-4000-8000-000000000008";

const FIXED_LOCALENS_AREA_IDS = [
  "demo-hcmc-district-1",
  "demo-hcmc-district-3",
  "demo-hcmc-district-5",
  "demo-hcmc-thu-duc",
] as const;

type FakeStorage = Pick<Storage, "getItem" | "removeItem" | "setItem"> & {
  clear: ReturnType<typeof vi.fn>;
};

type StatefulDataProxy = {
  proxy: Record<string, unknown>;
  descriptorLookups: Map<string, number>;
  directGets: Map<string, number>;
};

type IteratorProxyArray = {
  proxy: unknown[];
  counters: {
    iteratorLookups: number;
    iteratorInvocations: number;
  };
};

function createStorage(initial: Record<string, string> = {}): FakeStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    clear: vi.fn(() => values.clear()),
  };
}

const request: ItineraryRequest = {
  startAt: "2026-09-05T08:00:00+07:00",
  durationMinutes: 240,
  areas: [FIXED_LOCALENS_AREA_IDS[0], FIXED_LOCALENS_AREA_IDS[2]],
  budget: { currency: "VND", amountMinor: 1_500_000 },
  partySize: 2,
  guideLanguage: "vi",
  priorityWeights: {
    street_food: 1,
    history: 4,
    traditional_craft: 2,
    traditional_market: 0,
  },
  pace: "active",
  dietaryRequirements: ["vegetarian"],
  mobilityRequirements: ["step-free"],
  lockedStopIds: [LOCKED_STOP_A],
};

const pointer: RuntimePlanPointer = {
  version: 1,
  ownerUserId: OWNER_ID,
  planId: PLAN_ID,
  savedAt: NOW,
};

const recommendOperation: RuntimePendingOperation = {
  version: 1,
  ownerUserId: OWNER_ID,
  operationId: OPERATION_ID,
  savedAt: NOW,
  kind: "recommend",
  request,
};

const refineOperation: RuntimePendingOperation = {
  version: 1,
  ownerUserId: OWNER_ID,
  operationId: OPERATION_ID,
  savedAt: NOW,
  kind: "refine",
  planId: PLAN_ID,
  baseRevision: 2,
  scope: "partial",
  lockedItemIds: [LOCKED_ITEM_B, LOCKED_ITEM_A],
  signals: {
    pace: "slower",
    food: "more",
    preferTypes: ["history"],
    avoidTypes: [],
  },
};

function accessorArray(): unknown[] {
  const value = [FIXED_LOCALENS_AREA_IDS[0]];
  Object.defineProperty(value, "0", {
    configurable: true,
    enumerable: true,
    get() {
      throw new Error("array getter invoked");
    },
  });
  return value;
}

function iteratorProxyArray(): IteratorProxyArray {
  const target = [FIXED_LOCALENS_AREA_IDS[0]];
  const counters = {
    iteratorLookups: 0,
    iteratorInvocations: 0,
  };
  const poisonIterator = () => {
    counters.iteratorInvocations += 1;
    throw new Error("custom array iterator invoked");
  };
  return {
    proxy: new Proxy(target, {
      get(object, property, receiver) {
        if (property === Symbol.iterator) {
          counters.iteratorLookups += 1;
          return poisonIterator;
        }
        return Reflect.get(object, property, receiver);
      },
    }),
    counters,
  };
}

function statefulDataProxy(
  target: Record<string, unknown>,
  hostileValues: Record<string, unknown>,
): StatefulDataProxy {
  const descriptorLookups = new Map<string, number>();
  const directGets = new Map<string, number>();
  const proxy = new Proxy(target, {
    get(object, property, receiver) {
      if (typeof property === "string" && Object.prototype.hasOwnProperty.call(hostileValues, property)) {
        const count = (directGets.get(property) ?? 0) + 1;
        directGets.set(property, count);
        return hostileValues[property];
      }
      return Reflect.get(object, property, receiver);
    },
    getOwnPropertyDescriptor(object, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(object, property);
      if (
        descriptor === undefined
        || typeof property !== "string"
        || !Object.prototype.hasOwnProperty.call(hostileValues, property)
        || !("value" in descriptor)
      ) return descriptor;

      const count = (descriptorLookups.get(property) ?? 0) + 1;
      descriptorLookups.set(property, count);
      return count === 1 ? descriptor : { ...descriptor, value: hostileValues[property] };
    },
  });
  return { proxy, descriptorLookups, directGets };
}

function revokedProxyArray(): unknown[] {
  const revocable = Proxy.revocable([FIXED_LOCALENS_AREA_IDS[0]], {});
  revocable.revoke();
  return revocable.proxy;
}

function storeJson(storage: FakeStorage, key: string, value: unknown): void {
  storage.setItem(key, JSON.stringify(value));
}

describe("runtime plan pointer", () => {
  it("freezes the exact application key and 24-hour TTL", () => {
    expect(RUNTIME_PLAN_POINTER_KEY).toBe("localens.runtime.plan-pointer.v1");
    expect(RUNTIME_PLAN_POINTER_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("round-trips a canonical owner-bound pointer without storing extra fields", () => {
    const storage = createStorage({ "unrelated-key": "keep" });

    expect(saveRuntimePlanPointer(storage, pointer)).toBe(true);
    expect(readRuntimePlanPointer(storage, OWNER_ID, NOW)).toEqual(pointer);
    expect(JSON.parse(storage.getItem(RUNTIME_PLAN_POINTER_KEY) ?? "null")).toEqual(pointer);
    expect(storage.getItem("unrelated-key")).toBe("keep");
  });

  it("canonicalizes valid UUID casing and rejects malformed UUIDs", () => {
    const storage = createStorage();
    const mixedCase = {
      ...pointer,
      ownerUserId: OWNER_ID.toUpperCase(),
      planId: PLAN_ID.toUpperCase(),
    };

  expect(saveRuntimePlanPointer(storage, mixedCase as RuntimePlanPointer)).toBe(true);
    expect(readRuntimePlanPointer(storage, OWNER_ID.toUpperCase(), NOW)).toEqual(pointer);
    expect(saveRuntimePlanPointer(storage, { ...pointer, ownerUserId: "not-a-uuid" })).toBe(false);
    expect(saveRuntimePlanPointer(storage, { ...pointer, planId: "10000000-0000-4000-8000-00000000000G" })).toBe(false);
  });

  it.each([
    ["malformed JSON", "not-json"],
    ["missing field", JSON.stringify({ version: 1, ownerUserId: OWNER_ID, savedAt: NOW })],
    ["extra field", JSON.stringify({ ...pointer, extra: "reject" })],
    ["unsafe timestamp", JSON.stringify({ ...pointer, savedAt: Number.MAX_SAFE_INTEGER + 1 })],
  ])("fails closed for %s and removes only its own key", (_label, raw) => {
    const storage = createStorage({ "unrelated-key": "keep" });
    storage.setItem(RUNTIME_PLAN_POINTER_KEY, raw);

    expect(() => readRuntimePlanPointer(storage, OWNER_ID, NOW)).not.toThrow();
    expect(readRuntimePlanPointer(storage, OWNER_ID, NOW)).toBeNull();
    expect(storage.getItem(RUNTIME_PLAN_POINTER_KEY)).toBeNull();
    expect(storage.getItem("unrelated-key")).toBe("keep");
    expect(storage.clear).not.toHaveBeenCalled();
    expect(storage.removeItem).toHaveBeenCalledWith(RUNTIME_PLAN_POINTER_KEY);
  });

  it("expires exactly at 24 hours, while a just-current pointer remains valid", () => {
    const storage = createStorage();
    storeJson(storage, RUNTIME_PLAN_POINTER_KEY, { ...pointer, savedAt: NOW - RUNTIME_PLAN_POINTER_TTL_MS + 1 });
    expect(readRuntimePlanPointer(storage, OWNER_ID, NOW)).not.toBeNull();

    storeJson(storage, RUNTIME_PLAN_POINTER_KEY, { ...pointer, savedAt: NOW - RUNTIME_PLAN_POINTER_TTL_MS });
    expect(readRuntimePlanPointer(storage, OWNER_ID, NOW)).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(RUNTIME_PLAN_POINTER_KEY);
  });

  it("rejects an unreasonably future pointer and a pointer owned by another user", () => {
    const storage = createStorage({ "unrelated-key": "keep" });
    storeJson(storage, RUNTIME_PLAN_POINTER_KEY, {
      ...pointer,
      savedAt: NOW + RUNTIME_SESSION_MAX_FUTURE_SKEW_MS + 1,
    });
    expect(readRuntimePlanPointer(storage, OWNER_ID, NOW)).toBeNull();

    storeJson(storage, RUNTIME_PLAN_POINTER_KEY, { ...pointer, ownerUserId: OTHER_OWNER_ID, savedAt: NOW });
    expect(readRuntimePlanPointer(storage, OWNER_ID, NOW)).toBeNull();
    expect(storage.getItem(RUNTIME_PLAN_POINTER_KEY)).toBeNull();
    expect(storage.getItem("unrelated-key")).toBe("keep");
  });

  it("fails closed without throwing when pointer storage throws", () => {
    const storage = createStorage();
    storage.setItem = vi.fn(() => {
      throw new Error("blocked write");
    });
    expect(() => saveRuntimePlanPointer(storage, pointer)).not.toThrow();
    expect(saveRuntimePlanPointer(storage, pointer)).toBe(false);

    storage.getItem = vi.fn(() => {
      throw new Error("blocked read");
    });
    expect(() => readRuntimePlanPointer(storage, OWNER_ID, NOW)).not.toThrow();
    expect(readRuntimePlanPointer(storage, OWNER_ID, NOW)).toBeNull();
  });

  it("removes only the pointer key and never calls clear", () => {
    const storage = createStorage({
      [RUNTIME_PLAN_POINTER_KEY]: JSON.stringify(pointer),
      "unrelated-key": "keep",
    });

    expect(removeRuntimePlanPointer(storage)).toBe(true);
    expect(storage.getItem(RUNTIME_PLAN_POINTER_KEY)).toBeNull();
    expect(storage.getItem("unrelated-key")).toBe("keep");
    expect(storage.clear).not.toHaveBeenCalled();
  });
});

describe("runtime pending operation", () => {
  it("freezes the exact session key and an explicit bounded session TTL", () => {
    expect(RUNTIME_PENDING_OPERATION_KEY).toBe("localens.runtime.pending-operation.v1");
    expect(RUNTIME_PENDING_OPERATION_TTL_MS).toBeGreaterThan(0);
    expect(RUNTIME_PENDING_OPERATION_TTL_MS).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    expect(RUNTIME_SESSION_MAX_FUTURE_SKEW_MS).toBeGreaterThan(0);
  });

  it("round-trips a recommend operation using only the strict ItineraryRequest allowlist", () => {
    const storage = createStorage({ "unrelated-key": "keep" });

    expect(saveRuntimePendingOperation(storage, recommendOperation)).toBe(true);
    expect(readRuntimePendingOperation(storage, OWNER_ID, NOW)).toEqual(recommendOperation);

    const serialized = storage.getItem(RUNTIME_PENDING_OPERATION_KEY) ?? "";
    expect(JSON.parse(serialized)).toEqual(recommendOperation);
    expect(serialized).not.toContain("specialNeeds");
    expect(storage.getItem("unrelated-key")).toBe("keep");
  });

  it("accepts the fixed LocalLens area IDs but rejects arbitrary PII and token identifiers", () => {
    const storage = createStorage();
    expect(saveRuntimePendingOperation(storage, {
      ...recommendOperation,
      request: { ...request, areas: [...FIXED_LOCALENS_AREA_IDS] },
    })).toBe(true);

    for (const invalidRequest of [
      { ...request, areas: ["alice@example.com"] },
      { ...request, lockedStopIds: ["bearer-token"] },
    ]) {
      const invalidStorage = createStorage();
      expect(saveRuntimePendingOperation(invalidStorage, {
        ...recommendOperation,
        request: invalidRequest,
      } as RuntimePendingOperation)).toBe(false);
      expect(invalidStorage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
    }

    const invalidRefineStorage = createStorage();
    expect(saveRuntimePendingOperation(invalidRefineStorage, {
      ...refineOperation,
      lockedItemIds: ["access-token"],
    } as RuntimePendingOperation)).toBe(false);
    expect(invalidRefineStorage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
  });

  it("accepts a bounded published catalog slug for runtime handoff persistence", () => {
    const storage = createStorage();
    expect(saveRuntimePendingOperation(storage, {
      ...recommendOperation,
      request: { ...request, areas: ["synthetic-central-hcmc"] },
    })).toBe(true);
  });

  it.each([
    ["areas", { areas: [FIXED_LOCALENS_AREA_IDS[2], FIXED_LOCALENS_AREA_IDS[2]] }],
    ["dietary requirements", { dietaryRequirements: ["vegetarian", "vegetarian"] }],
    ["mobility requirements", { mobilityRequirements: ["step-free", "step-free"] }],
    ["locked stop IDs", { lockedStopIds: [LOCKED_STOP_A, LOCKED_STOP_A] }],
  ] as const)("rejects duplicate recommend %s instead of deduplicating", (_label, change) => {
    const storage = createStorage();
    expect(saveRuntimePendingOperation(storage, {
      ...recommendOperation,
      request: { ...request, ...change } as unknown as ItineraryRequest,
    })).toBe(false);
    expect(storage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
  });

  it("preserves caller order for strict request arrays", () => {
    const storage = createStorage();
    const orderedRequest = {
      ...request,
      areas: [FIXED_LOCALENS_AREA_IDS[2], FIXED_LOCALENS_AREA_IDS[0]],
      dietaryRequirements: ["vegetarian", "halal"],
      lockedStopIds: [LOCKED_STOP_B, LOCKED_STOP_A],
    };

    expect(saveRuntimePendingOperation(storage, {
      ...recommendOperation,
      request: orderedRequest,
    })).toBe(true);
    expect(readRuntimePendingOperation(storage, OWNER_ID, NOW)).toMatchObject({
      request: orderedRequest,
    });
  });

  it("rejects special-needs, contact, credential, token, and unknown fields before persistence", () => {
    const storage = createStorage();
    const requestWithPii = {
      ...request,
      specialNeeds: "Private medical note alice@example.com",
      email: "alice@example.com",
    };
    const operationWithPii = {
      ...recommendOperation,
      request: requestWithPii,
      accessToken: "secret-token",
    };

    expect(saveRuntimePendingOperation(storage, operationWithPii as RuntimePendingOperation)).toBe(false);
    expect(storage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
    expect(storage.getItem(RUNTIME_PENDING_OPERATION_KEY) ?? "").not.toMatch(/Private medical|alice@example|secret-token/);
  });

  it.each([
    ["unknown request field", { ...request, unexpected: true }],
    ["unknown budget field", { ...request, budget: { ...request.budget, cardToken: "secret" } }],
    ["unknown priority field", { ...request, priorityWeights: { ...request.priorityWeights, raw: 1 } }],
    ["unknown dietary ID", { ...request, dietaryRequirements: ["private-medical-note"] }],
    ["unknown mobility ID", { ...request, mobilityRequirements: ["wheelchair-user-email@example.com"] }],
  ])("rejects a recommend %s", (_label, invalidRequest) => {
    const storage = createStorage();
    expect(saveRuntimePendingOperation(storage, {
      ...recommendOperation,
      request: invalidRequest,
    } as RuntimePendingOperation)).toBe(false);
    expect(storage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
  });

  it("uses the shared refinement signal shape and preserves canonical UUID order", () => {
    const storage = createStorage();
    const signals: RefinementSignals = {
      pace: "slower",
      food: "more",
      preferTypes: ["history"],
      avoidTypes: [],
    };
    const mixedCase = {
      ...refineOperation,
      ownerUserId: OWNER_ID.toUpperCase(),
      operationId: OPERATION_ID.toUpperCase(),
      planId: PLAN_ID.toUpperCase(),
      lockedItemIds: [LOCKED_ITEM_B.toUpperCase(), LOCKED_ITEM_A],
      signals,
    };

    expect(saveRuntimePendingOperation(storage, mixedCase as RuntimePendingOperation)).toBe(true);
    expect(readRuntimePendingOperation(storage, OWNER_ID, NOW)).toEqual({
      ...refineOperation,
      lockedItemIds: [LOCKED_ITEM_B, LOCKED_ITEM_A],
      signals,
    });
    expect(JSON.stringify(readRuntimePendingOperation(storage, OWNER_ID, NOW))).not.toMatch(
      /feedback|specialNeeds|email|phone|credential|token/i,
    );
  });

  it("rejects duplicate refine lock IDs instead of deduplicating them", () => {
    const storage = createStorage();
    expect(saveRuntimePendingOperation(storage, {
      ...refineOperation,
      lockedItemIds: [LOCKED_ITEM_B, LOCKED_ITEM_A, LOCKED_ITEM_B],
    })).toBe(false);
    expect(storage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
  });

  it("uses one request descriptor snapshot and ignores a hostile startAt replacement", () => {
    const storage = createStorage();
    const hostileStartAt = "Private medical note alice@example.com";
    const hostileRequest = statefulDataProxy(
      { ...request } as unknown as Record<string, unknown>,
      { startAt: hostileStartAt },
    );

    let result: boolean | undefined;
    expect(() => {
      result = saveRuntimePendingOperation(storage, {
        ...recommendOperation,
        request: hostileRequest.proxy as unknown as ItineraryRequest,
      });
    }).not.toThrow();
    expect(result).toBe(true);
    const serialized = storage.getItem(RUNTIME_PENDING_OPERATION_KEY) ?? "";
    expect(JSON.parse(serialized)).toMatchObject({ request: { startAt: request.startAt } });
    expect(serialized).not.toMatch(
      /Private medical|alice@example\.com/,
    );
    expect(hostileRequest.descriptorLookups.get("startAt")).toBe(1);
    expect(Object.getOwnPropertyDescriptor(hostileRequest.proxy, "startAt")?.value).toBe(hostileStartAt);
    expect(hostileRequest.descriptorLookups.get("startAt")).toBe(2);
    expect(hostileRequest.proxy.startAt).toBe(hostileStartAt);
    expect(hostileRequest.directGets.get("startAt")).toBe(1);
  });

  it("uses one priority descriptor snapshot and ignores a hostile token replacement", () => {
    const storage = createStorage();
    const hostileStreetFood = "bearer-token";
    const hostilePriorityWeights = statefulDataProxy(
      { ...request.priorityWeights } as unknown as Record<string, unknown>,
      { street_food: hostileStreetFood },
    );

    let result: boolean | undefined;
    expect(() => {
      result = saveRuntimePendingOperation(storage, {
        ...recommendOperation,
        request: {
          ...request,
          priorityWeights: hostilePriorityWeights.proxy as unknown as ItineraryRequest["priorityWeights"],
        },
      });
    }).not.toThrow();
    expect(result).toBe(true);
    const serialized = storage.getItem(RUNTIME_PENDING_OPERATION_KEY) ?? "";
    expect(JSON.parse(serialized)).toMatchObject({
      request: { priorityWeights: request.priorityWeights },
    });
    expect(serialized).not.toContain(hostileStreetFood);
    expect(hostilePriorityWeights.descriptorLookups.get("street_food")).toBe(1);
    expect(Object.getOwnPropertyDescriptor(hostilePriorityWeights.proxy, "street_food")?.value).toBe(hostileStreetFood);
    expect(hostilePriorityWeights.descriptorLookups.get("street_food")).toBe(2);
    expect(hostilePriorityWeights.proxy.street_food).toBe(hostileStreetFood);
    expect(hostilePriorityWeights.directGets.get("street_food")).toBe(1);
  });

  it.each([
    ["accessor", accessorArray],
    ["revoked proxy", revokedProxyArray],
  ] as const)("fails closed without throwing for a hostile %s array", (_label, makeArray) => {
    const operations: RuntimePendingOperation[] = [
      {
        ...recommendOperation,
        request: { ...request, areas: makeArray() },
      } as RuntimePendingOperation,
      {
        ...recommendOperation,
        request: { ...request, lockedStopIds: makeArray() },
      } as RuntimePendingOperation,
      {
        ...refineOperation,
        lockedItemIds: makeArray(),
      } as RuntimePendingOperation,
    ];

    for (const operation of operations) {
      const storage = createStorage();
      let result: boolean | undefined;
      expect(() => {
        result = saveRuntimePendingOperation(storage, operation);
      }).not.toThrow();
      expect(result).toBe(false);
      expect(storage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
    }
  });

  it("fails closed without throwing when an array proxy exposes a poison iterator", () => {
    const storage = createStorage();
    const normalStorage = createStorage();
    expect(saveRuntimePendingOperation(normalStorage, recommendOperation)).toBe(true);

    const iteratorArray = iteratorProxyArray();
    let result: boolean | undefined;
    expect(() => {
      result = saveRuntimePendingOperation(storage, {
        ...recommendOperation,
        request: { ...request, areas: iteratorArray.proxy },
      } as RuntimePendingOperation);
    }).not.toThrow();
    expect(result).toBe(false);
    expect(storage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
    expect(iteratorArray.counters.iteratorLookups).toBe(1);
    expect(iteratorArray.counters.iteratorInvocations).toBe(0);
  });

  it("fails closed without throwing when read storage returns a revoked proxy", () => {
    const storage = createStorage();
    const revoked = Proxy.revocable([FIXED_LOCALENS_AREA_IDS[0]], {});
    revoked.revoke();
    storage.getItem = vi.fn(() => revoked.proxy as unknown as string);

    expect(() => readRuntimePendingOperation(storage, OWNER_ID, NOW)).not.toThrow();
    expect(readRuntimePendingOperation(storage, OWNER_ID, NOW)).toBeNull();
  });

  it("rejects extra refine fields, raw feedback, malformed UUIDs, and prototype tricks", () => {
    const storage = createStorage();
    const protoTrick = { ...refineOperation } as Record<string, unknown>;
    Object.defineProperty(protoTrick, "__proto__", {
      configurable: true,
      enumerable: true,
      value: { polluted: true },
      writable: true,
    });
    const invalidValues: unknown[] = [
      { ...refineOperation, feedback: "raw note" },
      { ...refineOperation, email: "alice@example.com" },
      { ...refineOperation, signals: { ...refineOperation.signals, raw: "raw note" } },
      { ...refineOperation, planId: "not-a-uuid" },
      { ...refineOperation, lockedItemIds: [""] },
      JSON.parse(JSON.stringify(protoTrick)),
    ];

    for (const value of invalidValues) {
      expect(saveRuntimePendingOperation(storage, value as RuntimePendingOperation)).toBe(false);
    }

    const inherited = Object.create({ operationId: OPERATION_ID }) as Record<string, unknown>;
    Object.assign(inherited, {
      version: 1,
      ownerUserId: OWNER_ID,
      savedAt: NOW,
      kind: "refine",
      planId: PLAN_ID,
      baseRevision: 1,
      scope: "partial",
      lockedItemIds: [],
      signals: { pace: "keep", food: "keep", preferTypes: [], avoidTypes: [] },
    });
    expect(saveRuntimePendingOperation(storage, inherited as RuntimePendingOperation)).toBe(false);
    expect(storage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
  });

  it("round-trips plain reconstructed data rather than exposing parsed prototypes", () => {
    const storage = createStorage();
    storeJson(storage, RUNTIME_PENDING_OPERATION_KEY, refineOperation);

    const restored = readRuntimePendingOperation(storage, OWNER_ID, NOW);
    expect(restored).not.toBeNull();
    expect(Object.getPrototypeOf(restored)).toBe(Object.prototype);
    if (restored?.kind === "refine") {
      expect(Object.getPrototypeOf(restored.signals)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(restored.lockedItemIds)).toBe(Array.prototype);
    }
  });

  it("expires at the bounded session TTL, rejects future-skew violations, and cleans up", () => {
    const storage = createStorage({ "unrelated-key": "keep" });
    storeJson(storage, RUNTIME_PENDING_OPERATION_KEY, {
      ...recommendOperation,
      savedAt: NOW - RUNTIME_PENDING_OPERATION_TTL_MS,
    });
    expect(readRuntimePendingOperation(storage, OWNER_ID, NOW)).toBeNull();
    expect(storage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();

    storeJson(storage, RUNTIME_PENDING_OPERATION_KEY, {
      ...recommendOperation,
      savedAt: NOW + RUNTIME_SESSION_MAX_FUTURE_SKEW_MS + 1,
    });
    expect(readRuntimePendingOperation(storage, OWNER_ID, NOW)).toBeNull();
    expect(storage.getItem("unrelated-key")).toBe("keep");
    expect(storage.clear).not.toHaveBeenCalled();
  });

  it("does not expose another owner's pending operation and removes only its key", () => {
    const storage = createStorage({ "unrelated-key": "keep" });
    storeJson(storage, RUNTIME_PENDING_OPERATION_KEY, {
      ...recommendOperation,
      ownerUserId: OTHER_OWNER_ID,
    });

    expect(readRuntimePendingOperation(storage, OWNER_ID, NOW)).toBeNull();
    expect(storage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
    expect(storage.getItem("unrelated-key")).toBe("keep");
    expect(storage.clear).not.toHaveBeenCalled();
  });

  it("fails closed without a render-blocking throw when pending storage throws", () => {
    const storage = createStorage();
    storage.setItem = vi.fn(() => {
      throw new Error("blocked write");
    });
    expect(() => saveRuntimePendingOperation(storage, recommendOperation)).not.toThrow();
    expect(saveRuntimePendingOperation(storage, recommendOperation)).toBe(false);

    storage.getItem = vi.fn(() => {
      throw new Error("blocked read");
    });
    expect(() => readRuntimePendingOperation(storage, OWNER_ID, NOW)).not.toThrow();
    expect(readRuntimePendingOperation(storage, OWNER_ID, NOW)).toBeNull();

    storage.removeItem = vi.fn(() => {
      throw new Error("blocked remove");
    });
    expect(() => removeRuntimePendingOperation(storage)).not.toThrow();
    expect(removeRuntimePendingOperation(storage)).toBe(false);
  });

  it("removes only the pending key and never calls clear", () => {
    const storage = createStorage({
      [RUNTIME_PENDING_OPERATION_KEY]: JSON.stringify(recommendOperation),
      "unrelated-key": "keep",
    });

    expect(removeRuntimePendingOperation(storage)).toBe(true);
    expect(storage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
    expect(storage.getItem("unrelated-key")).toBe("keep");
    expect(storage.clear).not.toHaveBeenCalled();
  });

  it("overwrites a terminal operation before removal so a remove failure cannot restore its UUID", () => {
    let stored: string | null = JSON.stringify(recommendOperation);
    let failRemoval = true;
    const storage = {
      getItem: vi.fn(() => stored),
      setItem: vi.fn((_key: string, value: string) => {
        stored = value;
      }),
      removeItem: vi.fn(() => {
        if (failRemoval) {
          failRemoval = false;
          throw new Error("one-time remove failure");
        }
        stored = null;
      }),
    };

    expect(invalidateRuntimePendingOperation(storage)).toBe(true);
    expect(stored).not.toContain(OPERATION_ID);
    expect(readRuntimePendingOperation(storage, OWNER_ID, NOW)).toBeNull();
    expect(stored).toBeNull();
  });
});
