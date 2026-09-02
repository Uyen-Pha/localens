import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RuntimeFixedTourAccount } from "@/components/customer/runtime-fixed-tour-account";
import {
  FixedTourRuntimeError,
  type CompleteSimulatedPaymentInput,
  type CompleteSimulatedPaymentResult,
  type FixedTourPaymentStatus,
  type FixedTourRuntimePort,
} from "@/lib/application/fixed-tour/contracts";
import type { CustomerBooking } from "@/lib/domain/data/contracts";

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

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("runtime fixed-tour account", () => {
  it.each([
    {
      locale: "en" as const,
      title: booking.titleEn,
      paymentHeading: "Payment",
      pending: "Pending payment",
      action: "Complete simulated payment",
      disclosure: /no card details.*no real charge/i,
    },
    {
      locale: "vi" as const,
      title: booking.titleVi,
      paymentHeading: "Thanh toán",
      pending: "Chờ thanh toán",
      action: "Hoàn tất thanh toán mô phỏng",
      disclosure: /không yêu cầu thông tin thẻ.*không phát sinh giao dịch thật/i,
    },
  ])("separates booking and payment status with explicit $locale disclosure", async ({
    locale,
    title,
    paymentHeading,
    pending,
    action,
    disclosure,
  }) => {
    render(<RuntimeFixedTourAccount locale={locale} fixedTour={port()} />);

    const article = await screen.findByRole("article", { name: title });
    expect(article).toHaveTextContent(pending);
    expect(screen.getByRole("heading", { name: paymentHeading })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(disclosure);
    expect(screen.getByRole("button", { name: action })).toBeEnabled();
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
    render(<RuntimeFixedTourAccount locale="en" fixedTour={port({ bookings, payments, complete })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Complete simulated payment" }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    const input = complete.mock.calls[0]?.[0];
    expect(Object.keys(input ?? {}).sort()).toEqual(["bookingId", "idempotencyKey"]);
    expect(input).toMatchObject({ bookingId: booking.id, idempotencyKey: expect.any(String) });

    expect(await screen.findByText("Confirmed", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Paid", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Payment simulated", { exact: true })).toBeInTheDocument();
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
    render(<RuntimeFixedTourAccount locale="vi" fixedTour={port({ bookings, payments })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Hoàn tất thanh toán mô phỏng" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(
      "Máy chủ cục bộ đã ghi nhận thanh toán mô phỏng.",
    ));
    expect(screen.getByText("Đã xác nhận", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Đã thanh toán", { exact: true })).toBeInTheDocument();
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
    render(<RuntimeFixedTourAccount locale="en" fixedTour={port({ bookings, payments, complete })} />);

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
    render(<RuntimeFixedTourAccount locale="vi" fixedTour={port({ bookings, payments, complete })} />);

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
    })} />);

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
    render(<RuntimeFixedTourAccount locale="en" fixedTour={port({ complete })} />);

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
    render(<RuntimeFixedTourAccount locale="vi" fixedTour={port({ complete })} />);

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
    })} />);

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
    })} />);

    await screen.findByRole("heading", { name: booking.titleVi });
    expect(screen.queryByRole("button", { name: "Hoàn tất thanh toán mô phỏng" })).not.toBeInTheDocument();
  });
});
