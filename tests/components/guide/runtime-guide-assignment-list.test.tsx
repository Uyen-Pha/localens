import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RuntimeGuideAssignmentList } from "@/components/guide/runtime-guide-assignment-list";
import {
  RuntimeGuideAssignmentError,
  type GuideOwnAssignment,
  type RuntimeGuideAssignmentPort,
} from "@/lib/application/guide-assignment/contracts";

const assignment: GuideOwnAssignment = {
  assignmentId: "66666666-6666-4666-8666-666666666666",
  bookingId: "11111111-1111-4111-8111-111111111111",
  tourVersionId: "22222222-2222-4222-8222-222222222222",
  departureId: "33333333-3333-4333-8333-333333333333",
  title: "Chợ đêm runtime",
  startAt: "2099-09-05T11:00:00.000Z",
  endAt: "2099-09-05T14:00:00.000Z",
  meetingPoint: "Runtime Gate",
  partySize: 2,
  language: "en",
  mobilityFlags: ["step-free"],
  dietaryFlags: ["halal"],
  assignmentStatus: "assigned",
};

function port(listOwnAssignments: RuntimeGuideAssignmentPort["listOwnAssignments"] = vi.fn(async () => [assignment])): RuntimeGuideAssignmentPort {
  return {
    listAdminQueue: async () => [],
    listEligibleGuides: async () => [],
    assignGuide: async () => { throw new Error("not used"); },
    listOwnAssignments,
  };
}

afterEach(cleanup);

describe("runtime guide read-only assignments", () => {
  it("announces an explicit loading state", () => {
    const list = vi.fn(() => new Promise<GuideOwnAssignment[]>(() => undefined));
    render(<RuntimeGuideAssignmentList locale="en" assignments={port(list)} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading guide-assignment data");
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
  });

  it.each([
    { locale: "en" as const, heading: "Your assigned tours", readOnly: "read-only" },
    { locale: "vi" as const, heading: "Tour được phân công", readOnly: "chỉ đọc" },
  ])("shows only the sanitized operational fields in $locale", async ({ locale, heading, readOnly }) => {
    render(<RuntimeGuideAssignmentList locale={locale} assignments={port()} />);

    const region = await screen.findByRole("region", { name: heading });
    expect(region).toHaveTextContent(assignment.title);
    expect(region).toHaveTextContent(assignment.meetingPoint);
    expect(region).toHaveTextContent(/step-free|không bậc/i);
    expect(region).toHaveTextContent(/halal/i);
    expect(region).toHaveTextContent(new RegExp(readOnly, "i"));
    expect(within(region).queryByRole("button")).not.toBeInTheDocument();
    expect(region).not.toHaveTextContent(/email|phone|payment|customer/i);
  });

  it("renders an authoritative empty state without lifecycle controls", async () => {
    render(<RuntimeGuideAssignmentList locale="en" assignments={port(vi.fn(async () => []))} />);
    expect(await screen.findByText("You have no active assigned tours.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept|complete/i })).not.toBeInTheDocument();
  });

  it("offers a redacted retry after a projection failure", async () => {
    const list = vi.fn()
      .mockRejectedValueOnce(new Error("owner_user_id raw leak"))
      .mockResolvedValueOnce([assignment]);
    render(<RuntimeGuideAssignmentList locale="en" assignments={port(list)} />);

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(assignment.title)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("owner_user_id raw leak");
  });

  it.each([
    ["FORBIDDEN", /not permitted/i],
    ["INVALID_RESPONSE", /invalid response/i],
  ] as const)("renders a distinct %s projection failure with retry", async (code, message) => {
    const list = vi.fn(async () => { throw new RuntimeGuideAssignmentError(code); });
    render(<RuntimeGuideAssignmentList locale="en" assignments={port(list)} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
