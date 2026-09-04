import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RuntimeFixedTourAccount } from "@/components/customer/runtime-fixed-tour-account";
import {
  FixedTourRuntimeError,
  type CompleteSimulatedPaymentInput,
  type CompleteSimulatedPaymentResult,
  type FixedTourPaymentStatus,
  type FixedTourRuntimePort,
} from "@/lib/application/fixed-tour/contracts";
import {
  PortalError,
  type BookingCancellation,
  type CancelBookingInput,
  type CancelBookingResult,
} from "@/lib/application/portal/contracts";
import type { CustomerBooking } from "@/lib/domain/data/contracts";
import type { SupabaseBookingCancellationPort } from "@/lib/infrastructure/supabase/booking-cancellation-adapter";

const booking: CustomerBooking = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "pending_payment",
  sourceKind: "departure",
  sourceId: "22222222-2222-4222-8222-222222222222",
  tourVersionId: "33333333-3333-4333-8333-333333333333",
  quoteId: null,
  titleEn: "Runtime Saigon walk",
  titleVi: "Dạo Sài Gòn runtime",
  cancellationPolicy: "Hold only",
  catalogSnapshotId: "44444444-4444-4444-8444-444444444444",
  travelSnapshotId: "55555555-5555-4555-8555-555555555555",
  fxSnapshotId: null,
  fxVndPerUsd: null,
  perPersonVndMinor: "450000",
  totalVndMinor: "900000",
  checkoutCurrency: "vnd",
  checkoutAmountMinor: "900000",
  partySize: 2,
  language: "vi",
  meetingPoint: "Cổng Bến Thành",
  holdExpiresAt: "2099-09-05T02:35:00.000Z",
  createdAt: "2099-09-05T02:00:00.000Z",
};

const paidStatus: FixedTourPaymentStatus = {
  bookingId: booking.id,
  bookingStatus: "confirmed",
  paymentStatus: "paid",
  amountMinor: booking.checkoutAmountMinor,
  currency: booking.checkoutCurrency,
  simulatedAt: "2099-09-05T02:05:00.000Z",
};

const completed: CompleteSimulatedPaymentResult = {
  bookingId: booking.id,
  bookingStatus: "confirmed",
  paymentStatus: "paid",
  simulatedAt: paidStatus.simulatedAt,
  state: "completed",
};

const cancellation: BookingCancellation = {
  id: "77777777-7777-4777-8777-777777777777",
  bookingId: booking.id,
  customerUserId: "88888888-8888-4888-8888-888888888888",
  sourceKind: "departure",
  reasonCode: "trip_plan_changed",
  otherReason: null,
  idempotencyKey: "runtime-cancellation-key",
  cancelledAt: "2099-09-05T02:06:00.000Z",
};

const cancelled: CancelBookingResult = {
  cancellation,
  bookingStatus: "cancelled",
  state: "created",
};

function port({
  bookings = vi.fn(async () => [booking]),
  payments = vi.fn(async () => [] as FixedTourPaymentStatus[]),
  complete = vi.fn(async () => completed),
}: {
  bookings?: FixedTourRuntimePort["listOwnBookings"];
  payments?: FixedTourRuntimePort["listOwnPaymentStatuses"];
  complete?: FixedTourRuntimePort["completeSimulatedPayment"];
} = {}): FixedTourRuntimePort {
  return {
    listPublishedTours: async () => [],
    listAvailability: async () => [],
    beginBooking: async () => { throw new Error("not used"); },
    listOwnBookings: bookings,
    listOwnPaymentStatuses: payments,
    completeSimulatedPayment: complete,
  };
}

function cancellationPort({
  own = vi.fn(async () => [] as BookingCancellation[]),
  admin = vi.fn(async () => [] as BookingCancellation[]),
  cancel = vi.fn(async () => cancelled),
}: {
  own?: SupabaseBookingCancellationPort["listOwnCancellations"];
  admin?: SupabaseBookingCancellationPort["listAdminCancellations"];
  cancel?: SupabaseBookingCancellationPort["cancelBooking"];
} = {}): SupabaseBookingCancellationPort {
  return { listOwnCancellations: own, listAdminCancellations: admin, cancelBooking: cancel };
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("runtime fixed-tour account", () => {
  it("opens the Vietnamese immediate-cancellation dialog without mutating", async () => {
    const cancel = vi.fn(async () => cancelled);
    render(<RuntimeFixedTourAccount locale="vi" fixedTour={port()} bookingCancellations={cancellationPort({ cancel })} />);

    expect(await screen.findByText("Chờ xác nhận", { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hủy đơn" }));
    expect(screen.getByRole("dialog", { name: "Hủy đơn đặt tour?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quay lại" })).toHaveFocus();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("validates, trims, and clears the conditional other reason", async () => {
    const cancel = vi.fn(async () => cancelled);
    render(<RuntimeFixedTourAccount locale="vi" fixedTour={port()} bookingCancellations={cancellationPort({ cancel })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Hủy đơn" }));
    const reason = screen.getByRole("combobox", { name: "Lý do hủy (không bắt buộc)" });
    fireEvent.change(reason, { target: { value: "other" } });
    const other = screen.getByRole("textbox", { name: "Mô tả lý do khác *" });
    fireEvent.change(other, { target: { value: "  ab  " } });
    expect(screen.getByRole("button", { name: "Xác nhận hủy" })).toBeDisabled();

    fireEvent.change(other, { target: { value: "  Đổi kế hoạch riêng  " } });
    fireEvent.change(reason, { target: { value: "price_unsuitable" } });
    expect(screen.queryByRole("textbox", { name: "Mô tả lý do khác *" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận hủy" }));

    await waitFor(() => expect(cancel).toHaveBeenCalledWith(expect.objectContaining({
      reasonCode: "price_unsuitable",
      otherReason: null,
    })));
  });

  it("traps focus, makes the background inert, and restores the trigger on Escape", async () => {
    const { container } = render(
      <RuntimeFixedTourAccount locale="vi" fixedTour={port()} bookingCancellations={cancellationPort()} />,
    );

    const trigger = await screen.findByRole("button", { name: "Hủy đơn" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    const confirm = screen.getByRole("button", { name: "Xác nhận hủy" });
    expect(container).toHaveAttribute("inert");

    confirm.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    const closeButton = screen.getByRole("button", { name: "Đóng" });
    expect(closeButton).toHaveFocus();
    expect(closeButton.querySelector("svg")).toBeInTheDocument();
    expect(closeButton).not.toHaveTextContent("Đóng");
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(container).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
  });

  it("reuses one idempotency key when a retry succeeds", async () => {
    const cancel = vi.fn()
      .mockRejectedValueOnce(new PortalError("STORAGE_UNAVAILABLE", "secret"))
      .mockResolvedValueOnce(cancelled);
    render(<RuntimeFixedTourAccount locale="en" fixedTour={port()} bookingCancellations={cancellationPort({ cancel })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be completed");
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(2));
    expect(cancel.mock.calls[0]?.[0].idempotencyKey).toBe(cancel.mock.calls[1]?.[0].idempotencyKey);
  });

  it("keeps the dialog and idempotency key when cancellation succeeds but authoritative reload fails", async () => {
    const bookings = vi.fn()
      .mockResolvedValueOnce([booking])
      .mockRejectedValueOnce(new Error("temporary booking reload failure"))
      .mockResolvedValueOnce([{ ...booking, status: "cancelled" as const }]);
    const own = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([cancellation]);
    const cancel = vi.fn()
      .mockResolvedValueOnce(cancelled)
      .mockResolvedValueOnce({ ...cancelled, state: "replayed" as const });
    render(<RuntimeFixedTourAccount
      locale="en"
      fixedTour={port({ bookings })}
      bookingCancellations={cancellationPort({ own, cancel })}
    />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    const dialog = await screen.findByRole("dialog", { name: "Cancel tour booking?" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("latest booking status could not be loaded");
    expect(screen.queryByText(/booking cancelled\. the latest authoritative status/i)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }));

    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(2));
    expect(cancel.mock.calls[0]?.[0].idempotencyKey).toBe(cancel.mock.calls[1]?.[0].idempotencyKey);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect((await screen.findAllByText("Cancelled", { exact: true })).length).toBeGreaterThan(0);
  });

  it("keeps the dialog and idempotency key when a stale response cannot reload authority", async () => {
    const bookings = vi.fn()
      .mockResolvedValueOnce([booking])
      .mockRejectedValueOnce(new Error("temporary stale reload failure"))
      .mockResolvedValueOnce([{ ...booking, status: "confirmed" as const }]);
    const cancel = vi.fn<(input: CancelBookingInput) => Promise<CancelBookingResult>>(async () => {
      throw new PortalError("CONFLICT", "stale cancellation detail");
    });
    render(<RuntimeFixedTourAccount
      locale="en"
      fixedTour={port({ bookings })}
      bookingCancellations={cancellationPort({ cancel })}
    />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    const dialog = await screen.findByRole("dialog", { name: "Cancel tour booking?" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("latest booking status could not be loaded");
    expect(within(dialog).queryByText(/latest status has been reloaded/i)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }));

    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(2));
    expect(cancel.mock.calls[0]?.[0].idempotencyKey).toBe(cancel.mock.calls[1]?.[0].idempotencyKey);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Cancel booking" })).not.toBeInTheDocument();
  });

  it("submits nullable reasons and reloads authoritative bookings and history", async () => {
    const bookings = vi.fn()
      .mockResolvedValueOnce([booking])
      .mockResolvedValueOnce([{ ...booking, status: "cancelled" as const }]);
    const payments = vi.fn(async () => [] as FixedTourPaymentStatus[]);
    const own = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([cancellation]);
    const cancel = vi.fn<(input: CancelBookingInput) => Promise<CancelBookingResult>>(async () => cancelled);
    render(<RuntimeFixedTourAccount
      locale="en"
      fixedTour={port({ bookings, payments })}
      bookingCancellations={cancellationPort({ own, cancel })}
    />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(cancel).toHaveBeenCalledWith({
      bookingId: booking.id,
      reasonCode: null,
      otherReason: null,
      idempotencyKey: expect.any(String),
    });
    expect((await screen.findAllByText("Cancelled", { exact: true })).length).toBeGreaterThan(0);
    expect(screen.getByText("Trip plan or participation time changed", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Booking cancelled");
    expect(screen.getByRole("status")).toHaveFocus();
    expect(bookings).toHaveBeenCalledTimes(2);
    expect(payments).toHaveBeenCalledTimes(2);
    expect(own).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Cancel booking" })).not.toBeInTheDocument();
  });

  it("blocks duplicate confirmation while cancellation is pending", async () => {
    const pending = new Promise<CancelBookingResult>(() => undefined);
    const cancel = vi.fn(() => pending);
    render(<RuntimeFixedTourAccount locale="en" fixedTour={port()} bookingCancellations={cancellationPort({ cancel })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }));
    const confirm = screen.getByRole("button", { name: "Confirm cancellation" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
  });

  it.each([
    ["CONFLICT", /can no longer be cancelled/i],
    ["INVALID_INPUT", /check the cancellation reason/i],
    ["FORBIDDEN", /not permitted/i],
  ] as const)("shows a stable browser-safe %s cancellation error", async (code, message) => {
    const cancel = vi.fn(async () => { throw new PortalError(code, "secret P0001"); });
    const bookings = vi.fn()
      .mockResolvedValueOnce([booking])
      .mockResolvedValueOnce(code === "CONFLICT" ? [{ ...booking, status: "confirmed" as const }] : [booking]);
    render(<RuntimeFixedTourAccount
      locale="en"
      fixedTour={port({ bookings })}
      bookingCancellations={cancellationPort({ cancel })}
    />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(document.body).not.toHaveTextContent("P0001");
    if (code === "CONFLICT") {
      await waitFor(() => expect(screen.queryByRole("button", { name: "Cancel booking" })).not.toBeInTheDocument());
    }
  });

  it.each([
    "payment_processing",
    "confirmed",
    "payment_failed",
    "payment_review",
    "expired",
    "cancelled",
    "completed",
  ] as const)("never offers cancellation outside pending_payment: %s", async (status) => {
    render(<RuntimeFixedTourAccount locale="en" fixedTour={port({
      bookings: vi.fn(async () => [{ ...booking, status }]),
    })} bookingCancellations={cancellationPort()} />);

    await screen.findByRole("heading", { name: booking.titleEn });
    expect(screen.queryByRole("button", { name: "Cancel booking" })).not.toBeInTheDocument();
  });

  it("renders immutable cancellation history and never duplicates the action", async () => {
    render(<RuntimeFixedTourAccount
      locale="en"
      fixedTour={port({ bookings: vi.fn(async () => [{ ...booking, status: "cancelled" as const }]) })}
      bookingCancellations={cancellationPort({ own: vi.fn(async () => [cancellation]) })}
    />);

    expect((await screen.findAllByText("Cancelled", { exact: true })).length).toBeGreaterThan(0);
    expect(screen.getByText("Trip plan or participation time changed", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).not.toBeInTheDocument();
  });

  it.each([
    {
      locale: "en" as const,
      title: booking.titleEn,
      paymentHeading: "Payment",
      pending: "Pending payment",
      action: "Complete simulated payment",
      disclosure: "Simulated payment — no card details are entered and no real charge occurs.",
    },
    {
      locale: "vi" as const,
      title: booking.titleVi,
      paymentHeading: "Thanh toán",
      pending: "Chờ thanh toán",
      action: "Hoàn tất thanh toán mô phỏng",
      disclosure: "Thanh toán mô phỏng — không nhập thông tin thẻ và không phát sinh giao dịch thật.",
    },
  ])("separates booking and payment status with explicit $locale disclosure", async ({
    locale,
    title,
    paymentHeading,
    pending,
    action,
    disclosure,
  }) => {
    render(<RuntimeFixedTourAccount locale={locale} fixedTour={port()} bookingCancellations={cancellationPort()} />);

    const article = await screen.findByRole("article", { name: title });
    expect(article).toHaveTextContent(pending);
    expect(screen.getByRole("heading", { name: paymentHeading })).toBeInTheDocument();
    const disclosureNote = screen.getByRole("note");
    const paymentAction = screen.getByRole("button", { name: action });
    expect(disclosureNote).toHaveTextContent(disclosure);
    expect(disclosureNote.compareDocumentPosition(paymentAction) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(article.querySelector("input, textarea, select")).toBeNull();
    expect(paymentAction).toBeEnabled();
  });

  it("completes with only booking identity and idempotency, then reloads authoritative data", async () => {
    const bookings = vi.fn()
      .mockResolvedValueOnce([booking])
      .mockResolvedValueOnce([{ ...booking, status: "confirmed" }]);
    const payments = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([paidStatus]);
    const complete = vi.fn<
      (input: CompleteSimulatedPaymentInput) => Promise<CompleteSimulatedPaymentResult>
    >(async () => completed);
    render(<RuntimeFixedTourAccount locale="en" fixedTour={port({ bookings, payments, complete })} bookingCancellations={cancellationPort()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Complete simulated payment" }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    const input = complete.mock.calls[0]?.[0];
    expect(Object.keys(input ?? {}).sort()).toEqual(["bookingId", "idempotencyKey"]);
    expect(input).toMatchObject({ bookingId: booking.id, idempotencyKey: expect.any(String) });

    expect(await screen.findByText("Confirmed", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Paid", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Payment simulated", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Simulated payment — no card details are entered and no real charge occurs.",
    );
    expect(screen.queryByRole("button", { name: "Complete simulated payment" })).not.toBeInTheDocument();
    expect(bookings).toHaveBeenCalledTimes(2);
    expect(payments).toHaveBeenCalledTimes(2);
  });

  it("announces the authoritative Vietnamese paid result after reloading", async () => {
    const bookings = vi.fn()
      .mockResolvedValueOnce([booking])
      .mockResolvedValueOnce([{ ...booking, status: "confirmed" }]);
    const payments = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([paidStatus]);
    render(<RuntimeFixedTourAccount locale="vi" fixedTour={port({ bookings, payments })} bookingCancellations={cancellationPort()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Hoàn tất thanh toán mô phỏng" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(
      "Máy chủ cục bộ đã ghi nhận thanh toán mô phỏng.",
    ));
    expect(screen.getByText("Đã xác nhận", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Đã thanh toán", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Thanh toán mô phỏng — không nhập thông tin thẻ và không phát sinh giao dịch thật.",
    );
    expect(screen.queryByRole("button", { name: "Hoàn tất thanh toán mô phỏng" })).not.toBeInTheDocument();
  });

  it("reloads an authoritative expired result without showing payment success or another action", async () => {
    const bookings = vi.fn()
      .mockResolvedValueOnce([booking])
      .mockResolvedValueOnce([{ ...booking, status: "expired" }]);
    const expiredStatus: FixedTourPaymentStatus = {
      ...paidStatus,
      bookingStatus: "expired",
      paymentStatus: null,
    };
    const payments = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([expiredStatus]);
    const complete = vi.fn(async () => ({
      ...completed,
      bookingStatus: "expired" as const,
      paymentStatus: null,
      state: "expired" as const,
    }));
    render(<RuntimeFixedTourAccount locale="en" fixedTour={port({ bookings, payments, complete })} bookingCancellations={cancellationPort()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Complete simulated payment" }));
    expect(await screen.findByText("Expired", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("No simulated payment", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Paid", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete simulated payment" })).not.toBeInTheDocument();
  });

  it("announces the authoritative Vietnamese expired result without claiming payment", async () => {
    const bookings = vi.fn()
      .mockResolvedValueOnce([booking])
      .mockResolvedValueOnce([{ ...booking, status: "expired" }]);
    const expiredStatus: FixedTourPaymentStatus = {
      ...paidStatus,
      bookingStatus: "expired",
      paymentStatus: null,
    };
    const payments = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([expiredStatus]);
    const complete = vi.fn(async () => ({
      ...completed,
      bookingStatus: "expired" as const,
      paymentStatus: null,
      state: "expired" as const,
    }));
    render(<RuntimeFixedTourAccount locale="vi" fixedTour={port({ bookings, payments, complete })} bookingCancellations={cancellationPort()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Hoàn tất thanh toán mô phỏng" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(
      "Giữ chỗ đã hết hạn; không có thanh toán mô phỏng nào được ghi nhận.",
    ));
    expect(screen.getByText("Đã hết hạn", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Không có thanh toán mô phỏng", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Đã thanh toán", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hoàn tất thanh toán mô phỏng" })).not.toBeInTheDocument();
  });

  it("disables every payment action while one authoritative mutation is pending", async () => {
    const second = { ...booking, id: "66666666-6666-4666-8666-666666666666", titleEn: "Second runtime tour" };
    const pending = new Promise<CompleteSimulatedPaymentResult>(() => undefined);
    const complete = vi.fn(() => pending);
    render(<RuntimeFixedTourAccount locale="en" fixedTour={port({
      bookings: vi.fn(async () => [booking, second]),
      complete,
    })} bookingCancellations={cancellationPort()} />);

    const actions = await screen.findAllByRole("button", { name: "Complete simulated payment" });
    fireEvent.click(actions[0]!);
    expect(await screen.findByRole("status")).toHaveTextContent("Recording simulated payment");
    expect(actions[0]).toBeDisabled();
    expect(actions[1]).toBeDisabled();
  });

  it.each([
    ["IDEMPOTENCY_CONFLICT", /conflicts with an earlier payment request/i],
    ["FORBIDDEN", /not permitted/i],
    ["SERVICE_UNAVAILABLE", /could not be completed/i],
  ] as const)("shows a stable browser-safe %s payment error", async (code, message) => {
    const complete = vi.fn(async () => { throw new FixedTourRuntimeError(code); });
    render(<RuntimeFixedTourAccount locale="en" fixedTour={port({ complete })} bookingCancellations={cancellationPort()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Complete simulated payment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Complete simulated payment" })).toBeEnabled();
    expect(document.body).not.toHaveTextContent("P0001");
  });

  it.each([
    ["IDEMPOTENCY_CONFLICT", /xung đột với một yêu cầu trước đó/i],
    ["FORBIDDEN", /không được phép/i],
  ] as const)("shows the Vietnamese browser-safe %s payment error", async (code, message) => {
    const complete = vi.fn(async () => { throw new FixedTourRuntimeError(code); });
    render(<RuntimeFixedTourAccount locale="vi" fixedTour={port({ complete })} bookingCancellations={cancellationPort()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Hoàn tất thanh toán mô phỏng" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Hoàn tất thanh toán mô phỏng" })).toBeEnabled();
  });

  it.each([
    "payment_processing",
    "confirmed",
    "payment_failed",
    "payment_review",
    "expired",
    "cancelled",
    "completed",
  ] as const)("never offers payment for terminal/non-pending booking state %s", async (status) => {
    render(<RuntimeFixedTourAccount locale="en" fixedTour={port({
      bookings: vi.fn(async () => [{ ...booking, status }]),
      payments: vi.fn(async () => status === "confirmed" ? [paidStatus] : []),
    })} bookingCancellations={cancellationPort()} />);

    await screen.findByRole("heading", { name: booking.titleEn });
    expect(screen.queryByRole("button", { name: "Complete simulated payment" })).not.toBeInTheDocument();
  });

  it.each([
    "payment_processing",
    "confirmed",
    "payment_failed",
    "payment_review",
    "expired",
    "cancelled",
    "completed",
  ] as const)("never offers Vietnamese payment for terminal/non-pending booking state %s", async (status) => {
    render(<RuntimeFixedTourAccount locale="vi" fixedTour={port({
      bookings: vi.fn(async () => [{ ...booking, status }]),
      payments: vi.fn(async () => status === "confirmed" ? [paidStatus] : []),
    })} bookingCancellations={cancellationPort()} />);

    await screen.findByRole("heading", { name: booking.titleVi });
    expect(screen.queryByRole("button", { name: "Hoàn tất thanh toán mô phỏng" })).not.toBeInTheDocument();
  });
});
