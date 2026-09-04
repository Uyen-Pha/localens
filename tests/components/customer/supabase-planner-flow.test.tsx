import { createRequire } from "node:module";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { getDictionary } from "@/lib/i18n/dictionaries";

const customerSession = {
  userId: "10000000-0000-4000-8000-000000000001",
  role: "customer" as const,
};

const request: PersonalizationRequest = {
  startAt: "2026-09-06T09:00:00+07:00",
  durationMinutes: 240,
  areas: ["district-1"],
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
    rationales: { "place-1": "Strong match for the requested history focus." },
    items: [{
      placeId: "place-1",
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
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
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
    const recommend = vi.fn(() => pending.promise);
    const port = plannerPort({ recommend });

    renderPlanner(port);

    const button = await screen.findByRole("button", { name: "Generate itinerary" });
    expect(recommend).not.toHaveBeenCalled();
    fireEvent.click(button);
    fireEvent.click(button);

    expect(recommend).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Generating itinerary…" })).toBeDisabled();

    pending.resolve({ ok: true, value: proposal() });
    expect(await screen.findByRole("heading", { name: "Revision 1" })).toBeVisible();
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
    const recommend = vi.fn(async () => ({
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
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("retries a network failure only after the customer asks and reuses the same safe request", async () => {
    saveValidHandoff();
    const recommend = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: runtimeError("SERVICE_UNAVAILABLE", true) })
      .mockResolvedValueOnce({ ok: true, value: proposal() });
    const port = plannerPort({ recommend });

    renderPlanner(port);
    fireEvent.click(await screen.findByRole("button", { name: "Generate itinerary" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("network connection");
    expect(recommend).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Revision 1" })).toBeVisible();
    expect(recommend).toHaveBeenCalledTimes(2);
    expect(recommend.mock.calls[1]).toEqual(recommend.mock.calls[0]);
    expect(recommend.mock.calls[0]?.[0]).not.toHaveProperty("specialNeeds");
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
      target: { value: "Keep the museum and shorten the route." },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Refinement scope" }), {
      target: { value: "partial" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create revised proposal" }));

    await waitFor(() => expect(refine).toHaveBeenCalledTimes(1));
    expect(refine).toHaveBeenCalledWith({
      planId: "20000000-0000-4000-8000-000000000001",
      baseRevision: 1,
      delta: { feedback: "Keep the museum and shorten the route.", scope: "partial" },
      lockedItemIds: ["place-1"],
    }, "en");
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
      target: { value: "Keep the route compact." },
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
      target: { value: "Keep the route compact." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create revised proposal" }));
    fireEvent.click(await screen.findByRole("button", { name: "Refresh latest proposal" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("network connection");
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

  it("blocks a duplicate refinement while its first mutation is pending", async () => {
    saveValidHandoff();
    const pending = deferred<Awaited<ReturnType<RuntimePlannerPort["refine"]>>>();
    const refine = vi.fn(() => pending.promise);
    renderPlanner(plannerPort({ refine }));
    await generate();

    fireEvent.change(screen.getByRole("textbox", { name: "What should we adjust?" }), {
      target: { value: "Keep the route compact." },
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
