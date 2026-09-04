import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RuntimeBookingManagement } from "@/components/admin/runtime-booking-management";
import type {
  AdminBookingManagementProjection,
  BookingCancellation,
} from "@/lib/application/portal/contracts";

const cancellation: BookingCancellation = {
  id: "77777777-7777-4777-8777-777777777777",
  bookingId: "11111111-1111-4111-8111-111111111111",
  customerUserId: "88888888-8888-4888-8888-888888888888",
  sourceKind: "departure",
  reasonCode: null,
  otherReason: null,
  idempotencyKey: "admin-history-key",
  cancelledAt: "2099-09-05T02:06:00.000Z",
};

const activeBooking: AdminBookingManagementProjection = {
  bookingId: "22222222-2222-4222-8222-222222222222",
  customerUserId: "99999999-9999-4999-8999-999999999999",
  sourceKind: "quote",
  titleEn: "Personalized Saigon day",
  titleVi: "Một ngày Sài Gòn cá nhân hóa",
  bookingStatus: "pending_payment",
  createdAt: "2099-09-05T01:00:00.000Z",
  cancellation: null,
};

const cancelledBooking: AdminBookingManagementProjection = {
  bookingId: cancellation.bookingId,
  customerUserId: cancellation.customerUserId,
  sourceKind: cancellation.sourceKind,
  titleEn: "Runtime Saigon walk",
  titleVi: "Dạo Sài Gòn runtime",
  bookingStatus: "cancelled",
  createdAt: "2099-09-05T02:00:00.000Z",
  cancellation,
};

afterEach(cleanup);

describe("runtime booking management", () => {
  it.each([
    {
      locale: "en" as const,
      heading: "Booking management",
      activeStatus: "Awaiting confirmation",
      cancelledStatus: "Cancelled",
      reason: "No reason provided",
      source: "Fixed departure",
      time: "9:06 AM",
    },
    {
      locale: "vi" as const,
      heading: "Quản lý đơn đặt tour",
      activeStatus: "Chờ xác nhận",
      cancelledStatus: "Đã hủy",
      reason: "Không cung cấp lý do",
      source: "Lịch khởi hành cố định",
      time: "09:06",
    },
  ])("renders every booking and nullable cancellation history without decision controls in $locale", async ({
    locale,
    heading,
    activeStatus,
    cancelledStatus,
    reason,
    source,
    time,
  }) => {
    const listAdminBookings = vi.fn(async () => [activeBooking, cancelledBooking]);
    render(<RuntimeBookingManagement locale={locale} bookingManagement={{ listAdminBookings }} />);

    const region = await screen.findByRole("region", { name: heading });
    const active = within(region).getByRole("article", { name: locale === "vi" ? activeBooking.titleVi : activeBooking.titleEn });
    const cancelled = within(region).getByRole("article", { name: locale === "vi" ? cancelledBooking.titleVi : cancelledBooking.titleEn });
    expect(active).toHaveTextContent(activeBooking.bookingId);
    expect(active).toHaveTextContent(activeStatus);
    expect(active).not.toHaveTextContent(reason);
    expect(cancelled).toHaveTextContent(cancelledStatus);
    expect(cancelled).toHaveTextContent(reason);
    expect(cancelled).toHaveTextContent(source);
    expect(cancelled).toHaveTextContent(time);
    expect(within(region).queryByRole("button")).not.toBeInTheDocument();
    expect(within(region).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(region).queryByRole("combobox")).not.toBeInTheDocument();
    expect(listAdminBookings).toHaveBeenCalledTimes(1);
  });

  it("renders an explicit read-only empty state", async () => {
    render(<RuntimeBookingManagement
      locale="vi"
      bookingManagement={{ listAdminBookings: vi.fn(async () => []) }}
    />);

    expect(await screen.findByRole("region", { name: "Quản lý đơn đặt tour" })).toHaveTextContent(
      "Chưa có đơn đặt tour.",
    );
  });
});
