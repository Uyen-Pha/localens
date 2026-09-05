import { createRequire } from "node:module";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SupabasePlannerFlow } from "@/components/customer/supabase-planner-flow";
import {
  PERSONALIZATION_SESSION_KEY,
  savePersonalizationRequest,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import type {
  RuntimePlannerError,
  RuntimePlannerPort,
  RuntimePlannerProposal,
} from "@/lib/application/planner/runtime-planner";
import {
  RUNTIME_PENDING_OPERATION_KEY,
  RUNTIME_PLAN_POINTER_KEY,
  saveRuntimePendingOperation,
  saveRuntimePlanPointer,
} from "@/lib/application/planner/runtime-planner-session";
import { getDictionary } from "@/lib/i18n/dictionaries";

const customerSession = {
  userId: "10000000-0000-4000-8000-000000000001",
  role: "customer" as const,
};

const request: PersonalizationRequest = {
  startAt: "2026-09-06T09:00:00+07:00",
  durationMinutes: 240,
  areas: ["demo-hcmc-district-1"],
  budget: { currency: "VND", amountMinor: 1_500_000 },
  partySize: 2,
  guideLanguage: "en",
  priorityWeights: {
    street_food: 2,
    history: 5,
    traditional_craft: 1,
    traditional_market: 3,
  },
  pace: "relaxed",
  dietaryRequirements: [],
  mobilityRequirements: [],
  lockedStopIds: [],
  specialNeeds: "Keep this private note in the browser only.",
};

function proposal(overrides: Partial<RuntimePlannerProposal> = {}): RuntimePlannerProposal {
  return {
    planId: "20000000-0000-4000-8000-000000000001",
    revision: 1,
    source: "ai",
    degraded: false,
    normalizedStartAt: "2026-09-06T09:00:00+07:00",
    rationales: { "30000000-0000-4000-8000-000000000001": "Strong match for the requested history focus." },
    items: [{
      placeId: "30000000-0000-4000-8000-000000000001",
      title: "History Museum",
      summary: "A focused introduction to the city's history.",
      startAt: "2026-09-06T09:00:00+07:00",
      endAt: "2026-09-06T10:30:00+07:00",
      visitDurationMinutes: 80,
      travelMinutesBefore: 10,
      transitionBufferMinutesBefore: 10,
      admissionCostVnd: 30_000,
      travelCostVnd: 20_000,
      food: null,
      customerPayableVnd: 50_000,
      score: 0.92,
      rationale: "Selected for its strong historical relevance.",
    }],
    totals: {
      durationMinutes: 100,
      visitMinutes: 80,
      travelMinutes: 10,
      transitionBufferMinutes: 10,
      admissionCostVnd: 30_000,
      foodCostMinVnd: 0,
      foodCostMaxVnd: 0,
      travelCostVnd: 20_000,
      guideCostVnd: 0,
      payAtVendorMinVnd: 0,
      payAtVendorMaxVnd: 0,
      customerPayableVnd: 50_000,
      groupCostMinVnd: 50_000,
      groupCostMaxVnd: 50_000,
      groupCostVnd: 50_000,
      score: 0.92,
    },
    budgetVnd: 1_500_000,
    snapshotIds: {
      catalog: "30000000-0000-4000-8000-000000000001",
      travel: "30000000-0000-4000-8000-000000000002",
      fx: null,
    },
    ...overrides,
  };
}

function runtimeError(
  code: RuntimePlannerError["code"],
  retryable: boolean,
): RuntimePlannerError {
  return {
    code,
    messageKey: `planner.${code.toLowerCase()}`,
    retryable,
    correlationId: "40000000-0000-4000-8000-000000000001",
  };
}

function plannerPort(overrides: Partial<RuntimePlannerPort> = {}): RuntimePlannerPort {
  return {
    getSession: vi.fn(async () => customerSession),
    recommend: vi.fn(async () => ({ ok: true as const, value: proposal() })),
    refine: vi.fn(async () => ({ ok: true as const, value: proposal({ revision: 2 }) })),
    getPlan: vi.fn(async () => ({ ok: true as const, value: proposal({ revision: 2 }) })),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function saveValidHandoff() {
  expect(savePersonalizationRequest(request)).toBe(true);
}

function renderPlanner(port = plannerPort(), locale: "en" | "vi" = "en") {
  return render(
    <SupabasePlannerFlow
      locale={locale}
      copy={getDictionary(locale).planner}
      planner={port}
    />,
  );
}

async function generate() {
  fireEvent.click(await screen.findByRole("button", { name: "Generate itinerary" }));
  await screen.findByRole("heading", { name: "Revision 1" });
}

async function axeViolations(container: HTMLElement) {
  const localRequire = createRequire(import.meta.url);
  const axeRequire = createRequire(localRequire.resolve("@axe-core/playwright"));
  const axe = axeRequire("axe-core") as {
    run(
      context: HTMLElement,
      options: { rules: { "color-contrast": { enabled: false } } },
    ): Promise<{ violations: Array<{ id: string }> }>;
  };
  return (await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SupabasePlannerFlow", () => {
  it("preserves the planner return path for signed-out customers without consuming AI", async () => {
    saveValidHandoff();
    const port = plannerPort({ getSession: vi.fn(async () => null) });

    renderPlanner(port);

    expect(await screen.findByRole("link", { name: "Sign in to generate itinerary" })).toHaveAttribute(
      "href",
      "/en/sign-in?returnTo=%2Fen%2Fplanner%2F",
    );
    expect(port.recommend).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Generate itinerary" })).not.toBeInTheDocument();
  });

  it.each([
    ["missing", null],
    ["invalid", "not-json"],
    ["expired", JSON.stringify({ version: 1, savedAt: 1, request })],
  ])("recovers from a %s handoff without making an AI call", async (_state, stored) => {
    if (stored !== null) window.sessionStorage.setItem(PERSONALIZATION_SESSION_KEY, stored);
    const port = plannerPort();

    renderPlanner(port);

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("link", { name: "Return to personalization form" })).toHaveAttribute(
      "href",
      "/en#personalize",
    );
    expect(port.recommend).not.toHaveBeenCalled();
  });

  it("requires one explicit generate action and blocks duplicate submissions while pending", async () => {
    saveValidHandoff();
    const pending = deferred<Awaited<ReturnType<RuntimePlannerPort["recommend"]>>>();
    const recommend = vi.fn<RuntimePlannerPort["recommend"]>(() => pending.promise);
    const port = plannerPort({ recommend });

    renderPlanner(port);

    const button = await screen.findByRole("button", { name: "Generate itinerary" });
    expect(recommend).not.toHaveBeenCalled();
    fireEvent.click(button);
    fireEvent.click(button);

    expect(recommend).toHaveBeenCalledTimes(1);
    expect(recommend.mock.calls[0]?.[2]).toEqual({
      operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(window.sessionStorage.getItem(RUNTIME_PENDING_OPERATION_KEY)).not.toContain(
      request.specialNeeds,
    );
    expect(screen.getByRole("button", { name: "Generating itinerary…" })).toBeDisabled();

    pending.resolve({ ok: true, value: proposal() });
    expect(await screen.findByRole("heading", { name: "Revision 1" })).toBeVisible();
    expect(window.sessionStorage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
    expect(window.localStorage.getItem(RUNTIME_PLAN_POINTER_KEY)).toContain(proposal().planId);
  });

  it("does not invoke AI when the pending operation UUID cannot be persisted", async () => {
    saveValidHandoff();
    const recommend = vi.fn<RuntimePlannerPort["recommend"]>(async () => ({
      ok: true as const,
      value: proposal(),
    }));
    const operationId = "50000000-0000-4000-8000-000000000001";
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(operationId);
    const originalSetItem = Storage.prototype.setItem;
    let blockPendingStorage = true;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function setItem(this: Storage, key, value) {
      if (blockPendingStorage && this === window.sessionStorage && key === RUNTIME_PENDING_OPERATION_KEY) {
        throw new Error("storage blocked");
      }
      return originalSetItem.call(this, key, value);
    });
    renderPlanner(plannerPort({ recommend }));

    fireEvent.click(await screen.findByRole("button", { name: "Generate itinerary" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("cannot save a safe retry key");
    expect(recommend).not.toHaveBeenCalled();
    blockPendingStorage = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Revision 1" })).toBeVisible();
    expect(recommend).toHaveBeenCalledTimes(1);
    expect(recommend.mock.calls[0]?.[2]).toEqual({ operationId });
    expect(randomUuid).toHaveBeenCalledOnce();
  });

  it("keeps a successful proposal visible when its reload pointer cannot be persisted", async () => {
    saveValidHandoff();
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function setItem(this: Storage, key, value) {
      if (this === window.localStorage && key === RUNTIME_PLAN_POINTER_KEY) {
        throw new Error("storage blocked");
      }
      return originalSetItem.call(this, key, value);
    });
    renderPlanner();

    fireEvent.click(await screen.findByRole("button", { name: "Generate itinerary" }));

    expect(await screen.findByRole("heading", { name: "Revision 1" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("cannot save it for reload");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(window.sessionStorage.getItem(RUNTIME_PENDING_OPERATION_KEY)).not.toBeNull();
  });

  it("recovers the completed operation after remount when the first plan pointer write failed", async () => {
    saveValidHandoff();
    const originalSetItem = Storage.prototype.setItem;
    let blockPointerStorage = true;
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function setItem(this: Storage, key, value) {
      if (blockPointerStorage && this === window.localStorage && key === RUNTIME_PLAN_POINTER_KEY) {
        throw new Error("storage blocked");
      }
      return originalSetItem.call(this, key, value);
    });
    const firstRecommend = vi.fn<RuntimePlannerPort["recommend"]>(async () => ({
      ok: true as const,
      value: proposal(),
    }));
    const first = plannerPort({ recommend: firstRecommend });
    const firstView = renderPlanner(first);
    fireEvent.click(await screen.findByRole("button", { name: "Generate itinerary" }));
    expect(await screen.findByRole("heading", { name: "Revision 1" })).toBeVisible();
    const firstOperation = firstRecommend.mock.calls[0]?.[2];
    firstView.unmount();

    blockPointerStorage = false;
    const recoveredRecommend = vi.fn<RuntimePlannerPort["recommend"]>(async () => ({
      ok: true as const,
      value: proposal(),
    }));
    renderPlanner(plannerPort({ recommend: recoveredRecommend }));
    expect(await screen.findByRole("alert")).toHaveTextContent("still being checked");
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    expect(await screen.findByRole("heading", { name: "Revision 1" })).toBeVisible();
    expect(recoveredRecommend.mock.calls[0]?.[2]).toEqual(firstOperation);
    expect(window.sessionStorage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
    expect(window.localStorage.getItem(RUNTIME_PLAN_POINTER_KEY)).not.toBeNull();
    setItemSpy.mockRestore();
  });

  it("clears the previous owner and ignores a late failed mutation after an account change", async () => {
    saveValidHandoff();
    const pending = deferred<Awaited<ReturnType<RuntimePlannerPort["recommend"]>>>();
    const recommend = vi.fn<RuntimePlannerPort["recommend"]>(() => pending.promise);
    let notifySessionChange: ((userId: string | null) => void) | undefined;
    const unsubscribe = vi.fn();
    const getSession = vi.fn()
      .mockResolvedValueOnce(customerSession)
      .mockResolvedValueOnce({
        userId: "10000000-0000-4000-8000-000000000002",
        role: "customer" as const,
      });
    const subscribeSession = vi.fn((listener: (userId: string | null) => void) => {
      notifySessionChange = listener;
      return unsubscribe;
    });
    renderPlanner(plannerPort({ getSession, recommend, subscribeSession }));
    fireEvent.click(await screen.findByRole("button", { name: "Generate itinerary" }));
    await waitFor(() => expect(recommend).toHaveBeenCalledTimes(1));

    await act(async () => notifySessionChange?.("10000000-0000-4000-8000-000000000002"));
    pending.reject(new Error("old response lost"));

    expect(await screen.findByRole("button", { name: "Generate itinerary" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Revision 1" })).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
    expect(window.localStorage.getItem(RUNTIME_PLAN_POINTER_KEY)).toBeNull();
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("keeps the current proposal and operation when Supabase repeats SIGNED_IN for the same account", async () => {
    saveValidHandoff();
    const pending = deferred<Awaited<ReturnType<RuntimePlannerPort["recommend"]>>>();
    const recommend = vi.fn<RuntimePlannerPort["recommend"]>(() => pending.promise);
    let notifySessionChange: ((userId: string | null) => void) | undefined;
    const getSession = vi.fn(async () => customerSession);
    const subscribeSession = vi.fn((listener: (userId: string | null) => void) => {
      notifySessionChange = listener;
      return vi.fn();
    });
    renderPlanner(plannerPort({ getSession, recommend, subscribeSession }));
    fireEvent.click(await screen.findByRole("button", { name: "Generate itinerary" }));
    await waitFor(() => expect(recommend).toHaveBeenCalledTimes(1));
    const persisted = window.sessionStorage.getItem(RUNTIME_PENDING_OPERATION_KEY);

    await act(async () => notifySessionChange?.(customerSession.userId));
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBe(persisted);

    pending.resolve({ ok: true, value: proposal() });
    expect(await screen.findByRole("heading", { name: "Revision 1" })).toBeVisible();
  });

  it("restores the persisted proposal after reload without making another AI call", async () => {
    saveValidHandoff();
    const initial = plannerPort();
    const { unmount } = renderPlanner(initial);

    await generate();
    unmount();

    const getPlan = vi.fn(async () => ({
      ok: true as const,
      value: proposal({ revision: 2 }),
    }));
    const restored = plannerPort({ getPlan });
    renderPlanner(restored);

    expect(await screen.findByRole("heading", { name: "Revision 2" })).toBeVisible();
    expect(getPlan).toHaveBeenCalledWith(proposal().planId, "en");
    expect(restored.recommend).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["expired", JSON.stringify({ version: 1, savedAt: 1, request })],
  ])("restores a persisted plan when the personalization handoff is %s", async (_state, stored) => {
    saveValidHandoff();
    const initial = renderPlanner();
    await generate();
    initial.unmount();
    window.sessionStorage.clear();
    if (stored !== null) window.sessionStorage.setItem(PERSONALIZATION_SESSION_KEY, stored);
    const getPlan = vi.fn(async () => ({
      ok: true as const,
      value: proposal({ revision: 2 }),
    }));

    renderPlanner(plannerPort({ getPlan }));

    expect(await screen.findByRole("heading", { name: "Revision 2" })).toBeVisible();
    expect(getPlan).toHaveBeenCalledWith(proposal().planId, "en");
    expect(screen.queryByRole("link", { name: "Return to personalization form" })).not.toBeInTheDocument();
  });

  it("retries a transient restore failure with the persisted plan ID and no proposal", async () => {
    expect(saveRuntimePlanPointer(window.localStorage, {
      version: 1,
      ownerUserId: customerSession.userId,
      planId: proposal().planId,
      savedAt: Date.now(),
    })).toBe(true);
    const getPlan = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: runtimeError("SERVICE_UNAVAILABLE", true) })
      .mockResolvedValueOnce({ ok: true, value: proposal({ revision: 2 }) });
    renderPlanner(plannerPort({ getPlan }));

    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(screen.queryByRole("heading", { name: /Revision/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Revision 2" })).toBeVisible();
    expect(getPlan).toHaveBeenCalledTimes(2);
    expect(getPlan).toHaveBeenNthCalledWith(2, proposal().planId, "en");
  });

  it("clears a missing plan pointer and its pending refinement before returning to fresh generation", async () => {
    saveValidHandoff();
    expect(saveRuntimePlanPointer(window.localStorage, {
      version: 1,
      ownerUserId: customerSession.userId,
      planId: proposal().planId,
      savedAt: Date.now(),
    })).toBe(true);
    expect(saveRuntimePendingOperation(window.sessionStorage, {
      version: 1,
      ownerUserId: customerSession.userId,
      operationId: "50000000-0000-4000-8000-000000000001",
      savedAt: Date.now(),
      kind: "refine",
      planId: proposal().planId,
      baseRevision: 1,
      scope: "partial",
      lockedItemIds: [],
      signals: { pace: "slower", food: "keep", preferTypes: [], avoidTypes: [] },
    })).toBe(true);
    const getPlan = vi.fn(async () => ({
      ok: false as const,
      error: runtimeError("PLAN_NOT_FOUND", false),
    }));

    renderPlanner(plannerPort({ getPlan }));

    expect(await screen.findByRole("button", { name: "Generate itinerary" })).toBeEnabled();
    expect(window.localStorage.getItem(RUNTIME_PLAN_POINTER_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check again" })).not.toBeInTheDocument();
  });

  it("announces an AI proposal and renders plain-text rationales in a semantic timeline", async () => {
    saveValidHandoff();
    renderPlanner();

    await generate();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Gemini assisted with ranking; LocalLens validated the timing and cost.",
    );
    expect(screen.getByText("Selected for its strong historical relevance.")).toBeVisible();
    expect(screen.getByText("Strong match for the requested history focus.")).toBeVisible();
    const timeline = screen.getByRole("list", { name: "Itinerary timeline" });
    expect(timeline.tagName).toBe("OL");
    expect(timeline.querySelector("article")).not.toBeNull();
    expect(timeline.querySelector("dl")).not.toBeNull();
  });

  it("shows a text-labelled deterministic fallback instead of relying on color", async () => {
    saveValidHandoff();
    const port = plannerPort({
      recommend: vi.fn(async () => ({
        ok: true as const,
        value: proposal({ source: "deterministic", degraded: true, messageKey: "itinerary.ai_unavailable" }),
      })),
    });

    renderPlanner(port);
    await generate();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Safe deterministic fallback ready.",
    );
    expect(screen.getByRole("note", { name: "Fallback status" })).toHaveTextContent(
      "AI is temporarily unavailable; LocalLens used the safe deterministic fallback.",
    );
    expect(screen.queryByText(
      "Gemini assisted with ranking; LocalLens validated the timing and cost.",
    )).not.toBeInTheDocument();
  });

  it("uses the exact Vietnamese AI and deterministic-fallback disclosures", async () => {
    saveValidHandoff();
    const recommend = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: proposal() })
      .mockResolvedValueOnce({
        ok: true,
        value: proposal({ source: "deterministic", degraded: true, messageKey: "itinerary.ai_unavailable" }),
      });

    const { unmount } = renderPlanner(plannerPort({ recommend }), "vi");
    fireEvent.click(await screen.findByRole("button", { name: "Tạo lịch trình" }));
    await screen.findByRole("heading", { name: "Phiên bản 1" });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Gemini đã hỗ trợ xếp hạng; thời gian và chi phí do LocalLens kiểm tra.",
    );

    unmount();
    window.sessionStorage.clear();
    window.localStorage.clear();
    saveValidHandoff();
    renderPlanner(plannerPort({ recommend }), "vi");
    fireEvent.click(await screen.findByRole("button", { name: "Tạo lịch trình" }));
    await screen.findByRole("heading", { name: "Phiên bản 1" });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Phương án dự phòng xác định an toàn đã sẵn sàng.",
    );
    expect(screen.getByRole("note", { name: "Trạng thái dự phòng" })).toHaveTextContent(
      "AI tạm không khả dụng; LocalLens đã dùng phương án xác định an toàn.",
    );
    expect(screen.queryByText(
      "Gemini đã hỗ trợ xếp hạng; thời gian và chi phí do LocalLens kiểm tra.",
    )).not.toBeInTheDocument();
  });

  it("describes the ready planner without the obsolete cannot-generate claim", async () => {
    saveValidHandoff();
    renderPlanner();

    expect(await screen.findByRole("button", { name: "Generate itinerary" })).toBeEnabled();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Authenticated thesis-demo planner — generate and save an itinerary only after you choose the action.",
    );
    expect(screen.queryByText(/does not generate or save an itinerary yet/i)).not.toBeInTheDocument();
  });

  it("gives quota guidance without automatically retrying", async () => {
    saveValidHandoff();
    const recommend = vi.fn<RuntimePlannerPort["recommend"]>(async () => ({
      ok: false as const,
      error: runtimeError("QUOTA_EXCEEDED", true),
    }));
    const port = plannerPort({ recommend });

    renderPlanner(port);
    fireEvent.click(await screen.findByRole("button", { name: "Generate itinerary" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "The thesis-demo AI limit has been reached today. LocalLens will not retry automatically; try again after the quota resets.",
    );
    expect(alert).not.toHaveTextContent(/fallback proposal/i);
    await Promise.resolve();
    expect(recommend).toHaveBeenCalledTimes(1);
    const firstOperationId = recommend.mock.calls[0]?.[2].operationId;
    fireEvent.click(screen.getByRole("button", { name: "Try a new request" }));
    await waitFor(() => expect(recommend).toHaveBeenCalledTimes(2));
    expect(recommend.mock.calls[1]?.[2].operationId).not.toBe(firstOperationId);
  });

  it("never restores a terminal operation UUID when its first pending removal fails", async () => {
    saveValidHandoff();
    const originalRemoveItem = Storage.prototype.removeItem;
    let failTerminalRemoval = true;
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function removeItem(this: Storage, key) {
      if (failTerminalRemoval && this === window.sessionStorage && key === RUNTIME_PENDING_OPERATION_KEY) {
        failTerminalRemoval = false;
        throw new Error("one-time remove failure");
      }
      return originalRemoveItem.call(this, key);
    });
    const terminalRecommend = vi.fn<RuntimePlannerPort["recommend"]>(async () => ({
      ok: false as const,
      error: {
        ...runtimeError("QUOTA_EXCEEDED", true),
        operationState: "rejected" as const,
      },
    }));
    const firstView = renderPlanner(plannerPort({ recommend: terminalRecommend }));
    fireEvent.click(await screen.findByRole("button", { name: "Generate itinerary" }));
    await screen.findByRole("button", { name: "Try a new request" });
    const terminalOperationId = terminalRecommend.mock.calls[0]?.[2].operationId;
    firstView.unmount();

    const nextRecommend = vi.fn<RuntimePlannerPort["recommend"]>(async () => ({
      ok: true as const,
      value: proposal(),
    }));
    renderPlanner(plannerPort({ recommend: nextRecommend }));
    expect(await screen.findByRole("button", { name: "Generate itinerary" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Check again" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate itinerary" }));

    expect(await screen.findByRole("heading", { name: "Revision 1" })).toBeVisible();
    expect(nextRecommend.mock.calls[0]?.[2].operationId).not.toBe(terminalOperationId);
  });

  it("retries a network failure only after the customer asks and reuses the same safe request", async () => {
    saveValidHandoff();
    const recommend = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: runtimeError("SERVICE_UNAVAILABLE", true) })
      .mockResolvedValueOnce({ ok: true, value: proposal() });
    const port = plannerPort({ recommend });

    renderPlanner(port);
    fireEvent.click(await screen.findByRole("button", { name: "Generate itinerary" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(recommend).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Revision 1" })).toBeVisible();
    expect(recommend).toHaveBeenCalledTimes(2);
    expect(recommend.mock.calls[1]).toEqual(recommend.mock.calls[0]);
    expect(recommend.mock.calls[0]?.[0]).not.toHaveProperty("specialNeeds");
  });

  it("restores an unresolved recommendation after remount and checks it with the same operation UUID", async () => {
    saveValidHandoff();
    const lostResponse = deferred<Awaited<ReturnType<RuntimePlannerPort["recommend"]>>>();
    const firstRecommend = vi.fn(() => lostResponse.promise);
    const firstView = renderPlanner(plannerPort({ recommend: firstRecommend }));

    fireEvent.click(await screen.findByRole("button", { name: "Generate itinerary" }));
    await waitFor(() => expect(firstRecommend).toHaveBeenCalledTimes(1));
    const originalCall = firstRecommend.mock.calls[0];
    firstView.unmount();

    const recoveredRecommend = vi.fn(async () => ({ ok: true as const, value: proposal() }));
    renderPlanner(plannerPort({ recommend: recoveredRecommend }));

    expect(await screen.findByRole("alert")).toHaveTextContent("still being checked");
    expect(recoveredRecommend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    expect(await screen.findByRole("heading", { name: "Revision 1" })).toBeVisible();
    expect(recoveredRecommend.mock.calls[0]).toEqual(originalCall);
    expect(window.sessionStorage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
  });

  it("persists and sends only canonical refinement signals, never the raw feedback", async () => {
    saveValidHandoff();
    const pending = deferred<Awaited<ReturnType<RuntimePlannerPort["refine"]>>>();
    const refine = vi.fn<RuntimePlannerPort["refine"]>(() => pending.promise);
    renderPlanner(plannerPort({ refine }));
    await generate();

    const rawFeedback = "Email me at private@example.com and make this slower";
    fireEvent.change(screen.getByRole("textbox", { name: "What should we adjust?" }), {
      target: { value: rawFeedback },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create revised proposal" }));

    await waitFor(() => expect(refine).toHaveBeenCalledTimes(1));
    expect(refine.mock.calls[0]?.[0]).toMatchObject({ delta: { feedback: "slower" } });
    expect(window.sessionStorage.getItem(RUNTIME_PENDING_OPERATION_KEY)).not.toContain(rawFeedback);
    expect(window.sessionStorage.getItem(RUNTIME_PENDING_OPERATION_KEY)).not.toContain("private@example.com");
    pending.resolve({ ok: true, value: proposal({ revision: 2 }) });
    expect(await screen.findByRole("heading", { name: "Revision 2" })).toBeVisible();
  });

  it("rejects unsupported refinement text before creating an operation", async () => {
    saveValidHandoff();
    const refine = vi.fn();
    renderPlanner(plannerPort({ refine }));
    await generate();

    fireEvent.change(screen.getByRole("textbox", { name: "What should we adjust?" }), {
      target: { value: "Call me tomorrow" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create revised proposal" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Use a supported adjustment: slower or faster pace, more or no food, or prefer history, craft, or markets.",
    );
    expect(refine).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(RUNTIME_PENDING_OPERATION_KEY)).toBeNull();
  });

  it.each([
    ["en" as const, "Explore fixed tours"],
    ["vi" as const, "Khám phá tour cố định"],
  ])("links a ready %s proposal to the existing localized fixed-tour catalog", async (locale, label) => {
    saveValidHandoff();
    renderPlanner(plannerPort(), locale);

    fireEvent.click(await screen.findByRole("button", {
      name: locale === "vi" ? "Tạo lịch trình" : "Generate itinerary",
    }));
    await screen.findByRole("heading", { name: locale === "vi" ? "Phiên bản 1" : "Revision 1" });

    expect(screen.getByRole("link", { name: label }).getAttribute("href"))
      .toMatch(new RegExp(`^/${locale}/tours/?$`));
  });

  it("uses native pressed buttons for locks and submits the selected scope and locked IDs", async () => {
    saveValidHandoff();
    const refine = vi.fn(async () => ({ ok: true as const, value: proposal({ revision: 2 }) }));
    const port = plannerPort({ refine });
    renderPlanner(port);
    await generate();

    const lock = await screen.findByRole("button", { name: "Lock stop: History Museum" });
    expect(lock.tagName).toBe("BUTTON");
    expect(lock).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(lock);
    expect(screen.getByRole("button", { name: "Unlock stop: History Museum" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.change(screen.getByRole("textbox", { name: "What should we adjust?" }), {
      target: { value: "Please make the route slower and keep the museum." },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Refinement scope" }), {
      target: { value: "partial" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create revised proposal" }));

    await waitFor(() => expect(refine).toHaveBeenCalledTimes(1));
    expect(refine).toHaveBeenCalledWith(
      {
        planId: "20000000-0000-4000-8000-000000000001",
        baseRevision: 1,
        delta: { feedback: "slower", scope: "partial" },
        lockedItemIds: ["30000000-0000-4000-8000-000000000001"],
      },
      "en",
      { operationId: expect.stringMatching(/^[0-9a-f-]{36}$/) },
    );
  });

  it("refreshes a stale revision before allowing the customer to submit again", async () => {
    saveValidHandoff();
    const refine = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: runtimeError("STALE_REVISION", true) })
      .mockResolvedValueOnce({ ok: true, value: proposal({ revision: 3 }) });
    const getPlan = vi.fn(async () => ({ ok: true as const, value: proposal({ revision: 2 }) }));
    const port = plannerPort({ refine, getPlan });
    renderPlanner(port);
    await generate();

    fireEvent.change(screen.getByRole("textbox", { name: "What should we adjust?" }), {
      target: { value: "Please make it slower." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create revised proposal" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere");
    expect(refine).toHaveBeenCalledTimes(1);
    expect(getPlan).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh latest proposal" }));
    expect(await screen.findByRole("heading", { name: "Revision 2" })).toBeVisible();
    expect(getPlan).toHaveBeenCalledTimes(1);
    expect(getPlan).toHaveBeenCalledWith("20000000-0000-4000-8000-000000000001", "en");

    fireEvent.click(screen.getByRole("button", { name: "Create revised proposal" }));
    await waitFor(() => expect(refine).toHaveBeenCalledTimes(2));
    expect(refine.mock.calls[1]?.[0]).toMatchObject({ baseRevision: 2 });
  });

  it("keeps stale controls blocked while a failed readback is retried", async () => {
    saveValidHandoff();
    const refine = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: runtimeError("STALE_REVISION", true) })
      .mockResolvedValueOnce({ ok: true, value: proposal({ revision: 3 }) });
    const getPlan = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: runtimeError("SERVICE_UNAVAILABLE", true) })
      .mockResolvedValueOnce({ ok: true, value: proposal({ revision: 2 }) });
    renderPlanner(plannerPort({ refine, getPlan }));
    await generate();

    fireEvent.change(screen.getByRole("textbox", { name: "What should we adjust?" }), {
      target: { value: "Please make it slower." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create revised proposal" }));
    fireEvent.click(await screen.findByRole("button", { name: "Refresh latest proposal" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    const lock = screen.getByRole("button", { name: "Lock stop: History Museum" });
    const refineButton = screen.getByRole("button", { name: "Create revised proposal" });
    const refineForm = refineButton.closest("form");
    expect(lock).toBeDisabled();
    expect(refineButton).toBeDisabled();
    expect(refineForm).not.toBeNull();

    fireEvent.click(lock);
    fireEvent.submit(refineForm!);
    expect(lock).toHaveAttribute("aria-pressed", "false");
    expect(refine).toHaveBeenCalledTimes(1);
    expect(getPlan).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Revision 2" })).toBeVisible();
    expect(getPlan).toHaveBeenCalledTimes(2);
    expect(refine).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Lock stop: History Museum" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Create revised proposal" })).toBeEnabled();
  });

  it("shows storage recovery guidance when a refreshed plan pointer cannot be saved", async () => {
    saveValidHandoff();
    const originalSetItem = Storage.prototype.setItem;
    let blockPointerStorage = false;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function setItem(this: Storage, key, value) {
      if (blockPointerStorage && this === window.localStorage && key === RUNTIME_PLAN_POINTER_KEY) {
        throw new Error("storage blocked");
      }
      return originalSetItem.call(this, key, value);
    });
    const refine = vi.fn(async () => ({
      ok: false as const,
      error: runtimeError("STALE_REVISION", true),
    }));
    const getPlan = vi.fn(async () => ({
      ok: true as const,
      value: proposal({ revision: 2 }),
    }));
    renderPlanner(plannerPort({ refine, getPlan }));
    await generate();
    fireEvent.change(screen.getByRole("textbox", { name: "What should we adjust?" }), {
      target: { value: "Please make it slower." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create revised proposal" }));
    blockPointerStorage = true;
    fireEvent.click(await screen.findByRole("button", { name: "Refresh latest proposal" }));

    expect(await screen.findByRole("heading", { name: "Revision 2" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("cannot save it for reload");
  });

  it("blocks a duplicate refinement while its first mutation is pending", async () => {
    saveValidHandoff();
    const pending = deferred<Awaited<ReturnType<RuntimePlannerPort["refine"]>>>();
    const refine = vi.fn(() => pending.promise);
    renderPlanner(plannerPort({ refine }));
    await generate();

    fireEvent.change(screen.getByRole("textbox", { name: "What should we adjust?" }), {
      target: { value: "Please make it slower." },
    });
    const button = screen.getByRole("button", { name: "Create revised proposal" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(refine).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Creating revised proposal…" })).toBeDisabled();
    pending.resolve({ ok: true, value: proposal({ revision: 2 }) });
    expect(await screen.findByRole("heading", { name: "Revision 2" })).toBeVisible();
  });

  it("has no axe violations in the authenticated ready state", async () => {
    saveValidHandoff();
    const { container } = renderPlanner();
    await generate();
    await screen.findByRole("heading", { name: "Revision 1" });

    expect(await axeViolations(container)).toEqual([]);
  });
});
