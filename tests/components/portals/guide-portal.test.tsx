import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GuidePortal } from "@/components/portals/guide-portal";
import { createPortalComposition, type DemoPortalComposition } from "@/lib/application/portal/composition";
import type { GuideAssignedTour } from "@/lib/application/portal/contracts";
import { portalCopy } from "@/components/portals/portal-copy";
import { createMemorySessionStorage } from "@/lib/infrastructure/demo/portal-repository";

const compositions: DemoPortalComposition[] = [];

async function createGuide(): Promise<{ composition: DemoPortalComposition; assignment: GuideAssignedTour }> {
  const composition = createPortalComposition({
    mode: "demo",
    storage: createMemorySessionStorage(),
    now: () => "2026-08-31T12:00:00.000Z",
  });
  await composition.initialized;
  await composition.session.selectDemoIdentity("demo-user-guide");
  const assignment = (await composition.guide.assignments.listAssignedTours())[0];
  if (assignment === undefined) throw new Error("Expected the seeded guide assignment.");
  compositions.push(composition);
  return { composition, assignment };
}

afterEach(async () => {
  cleanup();
  await Promise.all(compositions.map((composition) => composition.session.signOut()));
  compositions.length = 0;
});

describe("GuidePortal assigned-tour presentation", () => {
  it("shows catalog duration as an estimate and keeps an unknown actual range explicit", async () => {
    const { composition, assignment } = await createGuide();
    expect(assignment.catalogDurationMinutes).toBe(180);

    render(
      <GuidePortal
        locale="vi"
        composition={composition}
        session={(await composition.session.getSession())!}
        onSignOut={() => undefined}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Chi tiết tour được phân công" })).toBeInTheDocument();
    expect(screen.getAllByText("3 giờ").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Chưa xác định").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Step-free route requested.").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("button", { name: /nhận|hoàn thành|hủy/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/thanh toán|payment/i)).not.toBeInTheDocument();
  });

  it.each([
    ["valid", "2026-08-30T12:00:00+07:00", false],
    ["reversed", "2026-08-30T08:00:00+07:00", true],
    ["overnight", "2026-08-31T01:00:00+07:00", true],
    ["invalid", "not-a-timestamp", true],
  ])("handles %s actual endAt without changing catalog estimate", async (_label, endAt, unavailable) => {
    const { composition, assignment } = await createGuide();
    vi.spyOn(composition.guide.assignments, "listAssignedTours").mockResolvedValue([{
      ...assignment,
      endAt,
    }]);

    render(
      <GuidePortal
        locale="en"
        composition={composition}
        session={(await composition.session.getSession())!}
        onSignOut={() => undefined}
      />,
    );

    expect(await screen.findByRole("heading", { name: portalCopy("en").assignedToursHeading })).toBeInTheDocument();
    expect(screen.getAllByText("3 hours").length).toBeGreaterThanOrEqual(2);
    if (unavailable) expect(screen.getAllByText("Not specified").length).toBeGreaterThanOrEqual(2);
    else expect(screen.getAllByText(/9:00.*12:00/).length).toBeGreaterThanOrEqual(2);
  });

  it("shows not specified when the catalog has no duration", async () => {
    const { composition, assignment } = await createGuide();
    const withoutDuration = { ...assignment };
    delete withoutDuration.catalogDurationMinutes;
    vi.spyOn(composition.guide.assignments, "listAssignedTours").mockResolvedValue([withoutDuration]);

    render(
      <GuidePortal
        locale="en"
        composition={composition}
        session={(await composition.session.getSession())!}
        onSignOut={() => undefined}
      />,
    );

    expect((await screen.findAllByText("Estimated duration")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Not specified").length).toBeGreaterThanOrEqual(3);
  });
});
