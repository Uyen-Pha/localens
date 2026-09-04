import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RuntimeBookingManagement } from "@/components/admin/runtime-booking-management";
import type { BookingCancellation } from "@/lib/application/portal/contracts";

const cancellation: BookingCancellation = {
  id: "77777777-7777-4777-8777-777777777777",
  bookingId: "11111111-1111-4111-8111-111111111111",
  customerUserId: "88888888-8888-4888-8888-888888888888",
  sourceKind: "departure",
  reasonCode: "other",
  otherReason: "Tôi cần thay đổi lịch gia đình.",
  idempotencyKey: "admin-history-key",
  cancelledAt: "2099-09-05T02:06:00.000Z",
};

afterEach(cleanup);

describe("runtime booking management", () => {
  it.each([
    {
      locale: "en" as const,
      heading: "Booking management",
      status: "Cancelled",
      reason: "Other reason",
      source: "Fixed departure",
    },
    {
      locale: "vi" as const,
      heading: "Quản lý đơn đặt tour",
      status: "Đã hủy",
      reason: "Lý do khác",
      source: "Lịch khởi hành cố định",
    },
  ])("renders immutable cancellation history without decision controls in $locale", async ({
    locale,
    heading,
    status,
    reason,
    source,
  }) => {
    const listAdminCancellations = vi.fn(async () => [cancellation]);
    render(<RuntimeBookingManagement locale={locale} history={{ listAdminCancellations }} />);

    const region = await screen.findByRole("region", { name: heading });
    expect(region).toHaveTextContent(cancellation.bookingId);
    expect(region).toHaveTextContent(status);
    expect(region).toHaveTextContent(reason);
    expect(region).toHaveTextContent(cancellation.otherReason!);
    expect(region).toHaveTextContent(source);
    expect(within(region).queryByRole("button")).not.toBeInTheDocument();
    expect(within(region).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(region).queryByRole("combobox")).not.toBeInTheDocument();
    expect(listAdminCancellations).toHaveBeenCalledTimes(1);
  });

  it("renders an explicit read-only empty state", async () => {
    render(<RuntimeBookingManagement
      locale="vi"
      history={{ listAdminCancellations: vi.fn(async () => []) }}
    />);

    expect(await screen.findByRole("region", { name: "Quản lý đơn đặt tour" })).toHaveTextContent(
      "Chưa có lịch sử hủy đơn.",
    );
  });
});
