import { describe, expect, it } from "vitest";

import {
  createDemoPlannerAdapter,
  type DemoPlannerState,
} from "@/lib/application/planner/demo-planner";

describe("demo planner adapter", () => {
  it("starts with a typed proposal containing activities, totals, and warnings", () => {
    const state = createDemoPlannerAdapter().createInitial();

    expect(state.planId).toBe("demo-plan-hcmc-cultural-day");
    expect(state.current.revision).toBe(1);
    expect(state.current.items).toHaveLength(3);
    expect(state.current.items.every((item) => item.activity.length > 0)).toBe(true);
    expect(state.current.totals).toEqual({
      durationMinutes: 240,
      costVnd: 255_000,
    });
    expect(state.current.warnings).toContain(
      "Demo proposal only: operating hours and availability still require company confirmation.",
    );
    expect(state.history).toHaveLength(0);
  });

  it("localizes fixture titles, activities, and warnings for Vietnamese visitors", () => {
    const state = createDemoPlannerAdapter().createInitial("vi");

    expect(state.locale).toBe("vi");
    expect(state.current.items[0]?.title).toBe("Chợ Bến Thành");
    expect(state.current.items[0]?.activity).toContain("Khám phá");
    expect(state.current.warnings[0]).toContain("Chỉ là đề xuất demo");
    expect(state.current.items.map((item) => item.title)).not.toContain("War Remnants Museum");
  });

  it("creates a new revision while preserving a locked stop", () => {
    const adapter = createDemoPlannerAdapter();
    const initial = adapter.createInitial();
    const lockedItem = initial.current.items[1]!;

    const result = adapter.refine(initial, {
      baseRevision: 1,
      feedback: "Keep the museum story, add more street food.",
      lockedItemIds: [lockedItem.id],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.current.revision).toBe(2);
    expect(result.state.history).toHaveLength(1);
    expect(result.state.current.feedback).toBe("Keep the museum story, add more street food.");
    expect(result.state.current.items.find((item) => item.id === lockedItem.id)).toMatchObject({
      title: lockedItem.title,
      activity: lockedItem.activity,
      locked: true,
    });
    expect(result.state.current.items.some((item) => item.activity !== initial.current.items.find((candidate) => candidate.id === item.id)?.activity)).toBe(true);
  });

  it("rejects a stale base revision without changing the current state", () => {
    const adapter = createDemoPlannerAdapter();
    const initial = adapter.createInitial();
    const result = adapter.refine(initial, {
      baseRevision: 7,
      feedback: "Change the pace.",
      lockedItemIds: [],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "STALE_REVISION",
        expectedRevision: 1,
      },
    });
    expect(initial.current.revision).toBe(1);
    expect(initial.history).toHaveLength(0);
  });

  it("does not mutate a supplied state when producing a revision", () => {
    const adapter = createDemoPlannerAdapter();
    const initial = adapter.createInitial();
    const snapshot: DemoPlannerState = structuredClone(initial);

    adapter.refine(initial, {
      baseRevision: initial.current.revision,
      feedback: "Make the route gentler.",
      lockedItemIds: [],
    });

    expect(initial).toEqual(snapshot);
  });
});
