import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RuntimeGuideAssignmentQueue } from "@/components/admin/runtime-guide-assignment-queue";
import {
  RuntimeGuideAssignmentError,
  type AdminGuideAssignmentQueueItem,
  type EligibleGuideCandidate,
  type GuideAssignmentResult,
  type RuntimeGuideAssignmentPort,
} from "@/lib/application/guide-assignment/contracts";

const queueItem: AdminGuideAssignmentQueueItem = {
  bookingId: "11111111-1111-4111-8111-111111111111",
  tourVersionId: "22222222-2222-4222-8222-222222222222",
  departureId: "33333333-3333-4333-8333-333333333333",
  titleEn: "Runtime evening markets",
  titleVi: "Chợ đêm runtime",
  startAt: "2099-09-05T11:00:00.000Z",
  endAt: "2099-09-05T14:00:00.000Z",
  meetingPoint: "Runtime Gate",
  partySize: 2,
  language: "en",
  assignmentId: null,
  guideUserId: null,
  guideDisplayName: null,
  assignmentStatus: null,
};

const guides: EligibleGuideCandidate[] = [
  { guideUserId: "44444444-4444-4444-8444-444444444444", displayName: "Runtime Guide", language: "vi" },
  { guideUserId: "55555555-5555-4555-8555-555555555555", displayName: "Second Guide", language: "en" },
];

const assigned: GuideAssignmentResult = {
  assignmentId: "66666666-6666-4666-8666-666666666666",
  bookingId: queueItem.bookingId,
  guideUserId: guides[0]!.guideUserId,
  status: "assigned",
  outcome: "assigned",
};

function port({
  queue = vi.fn(async () => [queueItem]),
  candidates = vi.fn(async () => guides),
  assign = vi.fn(async () => assigned),
}: {
  queue?: RuntimeGuideAssignmentPort["listAdminQueue"];
  candidates?: RuntimeGuideAssignmentPort["listEligibleGuides"];
  assign?: RuntimeGuideAssignmentPort["assignGuide"];
} = {}): RuntimeGuideAssignmentPort {
  return {
    listAdminQueue: queue,
    listEligibleGuides: candidates,
    assignGuide: assign,
    listOwnAssignments: async () => [],
  };
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("runtime administrator guide assignment queue", () => {
  it("announces an explicit loading state", () => {
    const queue = vi.fn(() => new Promise<AdminGuideAssignmentQueueItem[]>(() => undefined));
    render(<RuntimeGuideAssignmentQueue locale="en" assignments={port({ queue })} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading guide-assignment data");
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
  });

  it.each([
    { locale: "en" as const, heading: "Guide assignments", title: queueItem.titleEn, action: "Assign guide" },
    { locale: "vi" as const, heading: "Phân công hướng dẫn viên", title: queueItem.titleVi, action: "Phân công" },
  ])("renders the authoritative fixed-departure queue in $locale", async ({ locale, heading, title, action }) => {
    render(<RuntimeGuideAssignmentQueue locale={locale} assignments={port()} />);

    const region = await screen.findByRole("region", { name: heading });
    expect(region).toHaveTextContent(title);
    expect(region).toHaveTextContent("Runtime Gate");
    expect(within(region).getByRole("combobox", { name: new RegExp(title, "i") })).toHaveValue(guides[0]!.guideUserId);
    expect(within(region).getByRole("button", { name: action })).toBeEnabled();
    expect(region).toHaveTextContent(/confirmed fixed departures|booking tour cố định đã xác nhận/i);
  });

  it("sends an exact idempotent payload, reloads authority, and focuses the live result", async () => {
    const queue = vi.fn()
      .mockResolvedValueOnce([queueItem])
      .mockResolvedValueOnce([{ ...queueItem, ...{
        assignmentId: assigned.assignmentId,
        guideUserId: assigned.guideUserId,
        guideDisplayName: guides[0]!.displayName,
        assignmentStatus: "assigned" as const,
      } }]);
    const assign = vi.fn<RuntimeGuideAssignmentPort["assignGuide"]>(async () => assigned);
    render(<RuntimeGuideAssignmentQueue locale="en" assignments={port({ queue, assign })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Assign guide" }));

    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    const input = assign.mock.calls[0]?.[0];
    expect(Object.keys(input ?? {}).sort()).toEqual(["bookingId", "guideUserId", "idempotencyKey"]);
    expect(input).toMatchObject({
      bookingId: queueItem.bookingId,
      guideUserId: guides[0]!.guideUserId,
      idempotencyKey: expect.any(String),
    });
    expect(queue).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(guides[0]!.displayName, { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Assignment saved from authoritative data");
    expect(screen.getByRole("status")).toHaveFocus();
  });

  it("rotates acknowledged idempotency keys for a legitimate A to B to A reassignment", async () => {
    const assignedTo = (guideIndex: number, assignmentId: string): AdminGuideAssignmentQueueItem => ({
      ...queueItem,
      assignmentId,
      guideUserId: guides[guideIndex]!.guideUserId,
      guideDisplayName: guides[guideIndex]!.displayName,
      assignmentStatus: "assigned",
    });
    const queue = vi.fn()
      .mockResolvedValueOnce([queueItem])
      .mockResolvedValueOnce([assignedTo(0, assigned.assignmentId)])
      .mockResolvedValueOnce([assignedTo(1, "77777777-7777-4777-8777-777777777777")])
      .mockResolvedValueOnce([assignedTo(0, "88888888-8888-4888-8888-888888888888")]);
    let assignCall = 0;
    const assign = vi.fn<RuntimeGuideAssignmentPort["assignGuide"]>(async (input) => {
      assignCall += 1;
      return {
        ...assigned,
        guideUserId: input.guideUserId,
        outcome: input.guideUserId === guides[0]!.guideUserId && assignCall === 1
          ? "assigned"
          : "reassigned",
      };
    });
    render(<RuntimeGuideAssignmentQueue locale="en" assignments={port({ queue, assign })} />);

    const action = await screen.findByRole("button", { name: "Assign guide" });
    const select = screen.getByRole("combobox", { name: queueItem.titleEn });
    fireEvent.click(action);
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(queue).toHaveBeenCalledTimes(2));
    fireEvent.change(select, { target: { value: guides[1]!.guideUserId } });
    fireEvent.click(action);
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(queue).toHaveBeenCalledTimes(3));
    fireEvent.change(select, { target: { value: guides[0]!.guideUserId } });
    fireEvent.click(action);
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(queue).toHaveBeenCalledTimes(4));

    expect(assign.mock.calls[0]?.[0].idempotencyKey).not.toBe(assign.mock.calls[2]?.[0].idempotencyKey);
    expect(await screen.findByText(guides[0]!.displayName, { exact: true })).toBeInTheDocument();
  });

  it("submits the select value from the form even before React state catches up", async () => {
    const assign = vi.fn<RuntimeGuideAssignmentPort["assignGuide"]>(async (input) => ({
      ...assigned,
      guideUserId: input.guideUserId,
    }));
    render(<RuntimeGuideAssignmentQueue locale="en" assignments={port({ assign })} />);

    const select = await screen.findByRole("combobox", { name: queueItem.titleEn });
    const form = select.closest("form");
    expect(form).not.toBeNull();
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    expect(valueSetter).toBeTypeOf("function");
    valueSetter!.call(select, guides[1]!.guideUserId);
    fireEvent.submit(form!);

    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(assign.mock.calls[0]?.[0].guideUserId).toBe(guides[1]!.guideUserId);
  });

  it("disables every assignment control while one mutation is pending", async () => {
    const assign = vi.fn(() => new Promise<GuideAssignmentResult>(() => undefined));
    render(<RuntimeGuideAssignmentQueue locale="en" assignments={port({ assign })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Assign guide" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Saving guide assignment");
    expect(screen.getByRole("button", { name: "Assign guide" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: new RegExp(queueItem.titleEn, "i") })).toBeDisabled();
  });

  it.each([
    ["IDEMPOTENCY_CONFLICT", /earlier assignment/i],
    ["SCHEDULE_CONFLICT", /overlapping tour/i],
    ["FORBIDDEN", /not permitted/i],
  ] as const)("shows a browser-safe %s error", async (code, message) => {
    const assign = vi.fn(async () => { throw new RuntimeGuideAssignmentError(code); });
    render(<RuntimeGuideAssignmentQueue locale="en" assignments={port({ assign })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Assign guide" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(document.body).not.toHaveTextContent("P0001");
  });

  it("offers a retry when either authoritative projection fails", async () => {
    const queue = vi.fn()
      .mockRejectedValueOnce(new Error("raw database detail"))
      .mockResolvedValueOnce([]);
    render(<RuntimeGuideAssignmentQueue locale="en" assignments={port({ queue })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(queue).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No confirmed fixed-departure bookings are ready for assignment.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("raw database detail");
  });

  it.each([
    ["FORBIDDEN", /not permitted/i],
    ["INVALID_RESPONSE", /invalid response/i],
  ] as const)("renders a distinct %s projection failure with retry", async (code, message) => {
    const queue = vi.fn(async () => { throw new RuntimeGuideAssignmentError(code); });
    render(<RuntimeGuideAssignmentQueue locale="en" assignments={port({ queue })} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
