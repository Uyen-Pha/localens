import type { CancellationReasonCode } from "@/lib/application/portal/contracts";
import type { Locale } from "@/lib/i18n/config";

export const CANCELLATION_REASON_OPTIONS: ReadonlyArray<{
  code: CancellationReasonCode;
  label: Readonly<Record<Locale, string>>;
}> = Object.freeze([
  { code: "trip_plan_changed", label: { en: "Trip plan or participation time changed", vi: "Kế hoạch hoặc thời gian tham gia thay đổi" } },
  { code: "wrong_tour_or_departure", label: { en: "Wrong tour or departure date", vi: "Chọn nhầm tour hoặc ngày khởi hành" } },
  { code: "booking_details_change", label: { en: "Guest count or booking details need changing", vi: "Cần thay đổi số khách hoặc thông tin đặt tour" } },
  { code: "tour_details_unsuitable", label: { en: "Itinerary, pickup point, or language is unsuitable", vi: "Lịch trình, điểm đón hoặc ngôn ngữ không phù hợp" } },
  { code: "price_unsuitable", label: { en: "Price is unsuitable", vi: "Chi phí không phù hợp" } },
  { code: "payment_unavailable", label: { en: "Unable to complete payment", vi: "Không thể hoàn tất thanh toán" } },
  { code: "other", label: { en: "Other reason", vi: "Lý do khác" } },
]);

const COPY = {
  en: {
    title: "Cancel tour booking?",
    description: "The booking will be cancelled immediately and cannot be undone.",
    pendingStatus: "Awaiting confirmation",
    statusPrefix: "Status",
    reasonLabel: "Cancellation reason (optional)",
    reasonPlaceholder: "Choose a reason",
    otherLabel: "Describe the other reason *",
    otherHint: "Enter 3–500 characters.",
    close: "Close",
    back: "Go back",
    confirm: "Confirm cancellation",
    confirming: "Cancelling…",
    trigger: "Cancel booking",
    success: "Booking cancelled. The latest authoritative status is shown below.",
    invalidOther: "Enter 3–500 characters for the other reason.",
    conflict: "This booking can no longer be cancelled. The latest status has been reloaded.",
    denied: "This cancellation operation is not permitted.",
    invalid: "Check the cancellation reason and try again.",
    unavailable: "The cancellation could not be completed. Try again.",
    cancelledAt: "Cancelled at",
    reason: "Reason",
    noReason: "No reason provided",
    bookingManagement: "Booking management",
    bookingManagementIntro: "Booking status and immutable cancellation history are read-only.",
    emptyHistory: "No cancellation history is available.",
    bookingId: "Booking ID",
    customerId: "Customer ID",
    source: "Booking source",
    sourceDeparture: "Fixed departure",
    sourceQuote: "Personalized quote",
    cancelledStatus: "Cancelled",
  },
  vi: {
    title: "Hủy đơn đặt tour?",
    description: "Đơn sẽ được hủy ngay và không thể hoàn tác.",
    pendingStatus: "Chờ xác nhận",
    statusPrefix: "Trạng thái",
    reasonLabel: "Lý do hủy (không bắt buộc)",
    reasonPlaceholder: "Chọn lý do",
    otherLabel: "Mô tả lý do khác *",
    otherHint: "Nhập từ 3–500 ký tự.",
    close: "Đóng",
    back: "Quay lại",
    confirm: "Xác nhận hủy",
    confirming: "Đang hủy…",
    trigger: "Hủy đơn",
    success: "Đã hủy đơn. Trạng thái chính thức mới nhất được hiển thị bên dưới.",
    invalidOther: "Hãy nhập từ 3–500 ký tự cho lý do khác.",
    conflict: "Đơn này không còn đủ điều kiện hủy. Trạng thái mới nhất đã được tải lại.",
    denied: "Bạn không được phép thực hiện thao tác hủy này.",
    invalid: "Hãy kiểm tra lý do hủy và thử lại.",
    unavailable: "Không thể hoàn tất việc hủy đơn. Hãy thử lại.",
    cancelledAt: "Thời điểm hủy",
    reason: "Lý do",
    noReason: "Không cung cấp lý do",
    bookingManagement: "Quản lý đơn đặt tour",
    bookingManagementIntro: "Trạng thái đơn và lịch sử hủy bất biến chỉ được phép xem.",
    emptyHistory: "Chưa có lịch sử hủy đơn.",
    bookingId: "Mã đơn",
    customerId: "Mã khách hàng",
    source: "Nguồn đơn",
    sourceDeparture: "Lịch khởi hành cố định",
    sourceQuote: "Báo giá cá nhân hóa",
    cancelledStatus: "Đã hủy",
  },
} as const;

export function bookingCancellationCopy(locale: Locale) {
  return COPY[locale];
}
export function cancellationReasonLabel(code: CancellationReasonCode | null, locale: Locale): string {
  if (code === null) return COPY[locale].noReason;
  return CANCELLATION_REASON_OPTIONS.find((option) => option.code === code)?.label[locale] ?? COPY[locale].noReason;
}
