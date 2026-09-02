import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RuntimeCancellationQueue } from "@/components/admin/runtime-cancellation-queue";
import {
  FixedTourRuntimeError,
  type FixedTourCancellationDecisionInput,
  type FixedTourCancellationDecisionResult,
  type FixedTourCancellationQueueItem,
  type FixedTourRuntimePort,
} from "@/lib/application/fixed-tour/contracts";

const queueItem: FixedTourCancellationQueueItem = {
  requestId: "77777777-7777-4777-8777-777777777777",
  bookingId: "11111111-1111-4111-8111-111111111111",
  bookingStatus: "pending_payment",
  customerDisplayName: "Runtime Traveler",
  titleEn: "Runtime Saigon walk",
  titleVi: "Dạo Sài Gòn runtime",
  status: "pending",
  reason: "My schedule changed.",
  requestedAt: "2099-09-05T02:06:00.000Z",
  decisionNote: null,
  decidedAt: null,
};

const approved: FixedTourCancellationDecisionResult = {
  requestId: queueItem.requestId,
  bookingId: queueItem.bookingId,
  requestStatus: "approved",
  bookingStatus: "cancelled",
  decisionNote: "Approved after review.",
  decidedAt: "2099-09-05T02:10:00.000Z",
  state: "approved",
};

function port({
  queue = vi.fn(async () => [queueItem]),
  decide = vi.fn(async () => approved),
}: {
  queue?: FixedTourRuntimePort["listCancellationQueue"];
  decide?: FixedTourRuntimePort["decideCancellation"];
} = {}): FixedTourRuntimePort {
  return {
    listPublishedTours: async () => [],
    listAvailability: async () => [],
    beginBooking: async () => { throw new Error("not used"); },
    listOwnBookings: async () => [],
    listOwnPaymentStatuses: async () => [],
    completeSimulatedPayment: async () => { throw new Error("not used"); },
    listOwnCancellationRequests: async () => [],
    requestCancellation: async () => { throw new Error("not used"); },
    listCancellationQueue: queue,
    decideCancellation: decide,
  };
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("runtime administrator cancellation queue", () => {
  it.each([
    {
      locale: "en" as const,
      heading: "Cancellation requests",
      title: queueItem.titleEn,
      reason: "Reason",
      pending: "Pending administrator decision",
      approve: "Approve cancellation",
      reject: "Reject cancellation",
    },
    {
      locale: "vi" as const,
      heading: "Yêu cầu hủy booking",
      title: queueItem.titleVi,
      reason: "Lý do",
      pending: "Chờ quản trị viên quyết định",
      approve: "Duyệt yêu cầu hủy",
      reject: "Từ chối yêu cầu hủy",
    },
  ])("renders the owner-safe queue and actions in $locale", async ({
    locale,
    heading,
    title,
    reason,
    pending,
    approve,
    reject,
  }) => {
    render(<RuntimeCancellationQueue locale={locale} fixedTour={port()} />);

    const region = await screen.findByRole("region", { name: heading });
    expect(region).toHaveTextContent(title);
    expect(region).toHaveTextContent(queueItem.customerDisplayName);
    expect(region).toHaveTextContent(`${reason}${queueItem.reason}`);
    expect(region).toHaveTextContent(pending);
    expect(within(region).getByRole("button", { name: approve })).toBeEnabled();
    expect(within(region).getByRole("button", { name: reject })).toBeEnabled();
  });

  it.each(["approved", "rejected"] as const)(
    "sends the exact %s decision payload and reloads before announcing success",
    async (decision) => {
      const decidedItem: FixedTourCancellationQueueItem = {
        ...queueItem,
        status: decision,
        bookingStatus: decision === "approved" ? "cancelled" : "pending_payment",
        decisionNote: "Reviewed.",
        decidedAt: "2099-09-05T02:10:00.000Z",
      };
      const queue = vi.fn()
        .mockResolvedValueOnce([queueItem])
        .mockResolvedValueOnce([decidedItem]);
      const decide = vi.fn<
        (input: FixedTourCancellationDecisionInput) => Promise<FixedTourCancellationDecisionResult>
      >(async () => ({
        ...approved,
        requestStatus: decision,
        bookingStatus: decision === "approved" ? "cancelled" : "pending_payment",
        state: decision,
      }));
      render(<RuntimeCancellationQueue locale="en" fixedTour={port({ queue, decide })} />);

      fireEvent.change(await screen.findByRole("textbox", { name: "Decision note" }), {
        target: { value: "  Reviewed.  " },
      });
      fireEvent.click(screen.getByRole("button", {
        name: decision === "approved" ? "Approve cancellation" : "Reject cancellation",
      }));

      await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
      const input = decide.mock.calls[0]?.[0];
      expect(Object.keys(input ?? {}).sort()).toEqual(["decision", "idempotencyKey", "note", "requestId"]);
      expect(input).toMatchObject({
        requestId: queueItem.requestId,
        decision,
        note: "Reviewed.",
        idempotencyKey: expect.any(String),
      });
      expect(await screen.findByText(
        decision === "approved" ? "Approved by administrator" : "Rejected by administrator",
        { exact: true },
      )).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Cancellation decision saved from authoritative data.");
      expect(screen.getByRole("status")).toHaveFocus();
      expect(queue).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("button", { name: "Approve cancellation" })).not.toBeInTheDocument();
    },
  );

  it("sends a nullable note and disables all queue decisions while one is pending", async () => {
    const second = {
      ...queueItem,
      requestId: "88888888-8888-4888-8888-888888888888",
      bookingId: "99999999-9999-4999-8999-999999999999",
      titleEn: "Second cancellation",
    };
    const pending = new Promise<FixedTourCancellationDecisionResult>(() => undefined);
    const decide = vi.fn(() => pending);
    render(<RuntimeCancellationQueue locale="en" fixedTour={port({
      queue: vi.fn(async () => [queueItem, second]),
      decide,
    })} />);

    const approveButtons = await screen.findAllByRole("button", { name: "Approve cancellation" });
    fireEvent.click(approveButtons[0]!);

    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ note: null }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saving cancellation decision");
    for (const button of screen.getAllByRole("button", { name: /cancellation$/i })) {
      expect(button).toBeDisabled();
    }
  });

  it.each([
    ["CONFLICT", /state changed/i],
    ["IDEMPOTENCY_CONFLICT", /conflicts with an earlier decision/i],
    ["FORBIDDEN", /not permitted/i],
  ] as const)("shows a stable browser-safe %s decision error", async (code, message) => {
    const decide = vi.fn(async () => { throw new FixedTourRuntimeError(code); });
    render(<RuntimeCancellationQueue locale="en" fixedTour={port({ decide })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Approve cancellation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(document.body).not.toHaveTextContent("P0001");
  });

  it("renders historical decisions without decision controls", async () => {
    render(<RuntimeCancellationQueue locale="en" fixedTour={port({
      queue: vi.fn(async () => [{
        ...queueItem,
        status: "approved" as const,
        bookingStatus: "cancelled" as const,
        decisionNote: "Approved.",
        decidedAt: "2099-09-05T02:10:00.000Z",
      }]),
    })} />);

    expect(await screen.findByText("Approved by administrator", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve cancellation" })).not.toBeInTheDocument();
    expect(screen.getByText("Approved.", { exact: true })).toBeInTheDocument();
  });
});
