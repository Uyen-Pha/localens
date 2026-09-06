import type { BookingStatus } from "@/lib/domain/data/contracts";
import type { Locale } from "@/lib/i18n/config";

export interface FixedTourRuntimeCopy {
  catalogEyebrow: string;
  catalogHeading: string;
  catalogIntro: string;
  runtimeDisclosure: string;
  loading: string;
  emptyCatalog: string;
  serviceUnavailable: string;
  retry: string;
  duration: string;
  meetingPoint: string;
  cancellationPolicy: string;
  stops: string;
  availability: string;
  seatsRemaining: (count: number) => string;
  soldOut: string;
  bookTour: (title: string) => string;
  bookingHeading: string;
  bookingIntro: string;
  partySize: string;
  partySizeHint: string;
  hold: string;
  holding: string;
  signInRequired: string;
  accessDenied: string;
  invalidDeparture: string;
  invalidPartySize: string;
  idempotencyConflict: string;
  notFound: string;
  pendingPayment: string;
  accountHeading: string;
  emptyBookings: string;
  party: string;
  total: string;
  createdAt: string;
  holdExpiresAt: string;
  bookingStatus: string;
  bookingStatusLabels: Record<BookingStatus, string>;
  paymentHeading: string;
  paymentStatus: string;
  paymentPending: string;
  paymentPaid: string;
  noSimulatedPayment: string;
  simulatedAt: string;
  simulationDisclosure: string;
  completePayment: string;
  completingPayment: string;
  paymentRecorded: string;
  paymentExpired: string;
  paymentConflict: string;
  paymentDenied: string;
  paymentUnavailable: string;
}

const copy: Record<Locale, FixedTourRuntimeCopy> = {
  en: {
    catalogEyebrow: "Thesis demo",
    catalogHeading: "Fixed tours in Ho Chi Minh City",
    catalogIntro: "Browse published bilingual tours and current departure capacity.",
    runtimeDisclosure: "Thesis demo data. Creating a hold does not complete payment.",
    loading: "Loading fixed-tour data…",
    emptyCatalog: "No published fixed tours are available.",
    serviceUnavailable: "The fixed-tour service is unavailable. Try again.",
    retry: "Try again",
    duration: "Duration",
    meetingPoint: "Meeting point",
    cancellationPolicy: "Cancellation policy",
    stops: "Stops",
    availability: "Availability",
    seatsRemaining: (count) => `${count} seats remaining`,
    soldOut: "Sold out",
    bookTour: (title) => `Book ${title}`,
    bookingHeading: "Hold a fixed-tour departure",
    bookingIntro: "Confirm your group size to create a 35-minute hold. Payment remains pending.",
    partySize: "Party size",
    partySizeHint: "Enter a whole number between 1 and 100.",
    hold: "Create pending-payment hold",
    holding: "Creating hold…",
    signInRequired: "Sign in as a customer before creating a hold.",
    accessDenied: "Only a customer account can create this hold.",
    invalidDeparture: "This departure is invalid or no longer available.",
    invalidPartySize: "Party size must be a whole number between 1 and 100.",
    idempotencyConflict: "This booking attempt conflicts with an earlier request. Return to the catalog and start again.",
    notFound: "This departure is no longer available. Return to the catalog and refresh.",
    pendingPayment: "Pending payment — this is a hold, not a completed payment.",
    accountHeading: "Your fixed-tour holds",
    emptyBookings: "You do not have any fixed-tour holds yet.",
    party: "Party size",
    total: "Total",
    createdAt: "Created",
    holdExpiresAt: "Hold expires",
    bookingStatus: "Booking status",
    bookingStatusLabels: {
      pending_payment: "Awaiting confirmation",
      payment_processing: "Payment processing",
      confirmed: "Confirmed",
      payment_failed: "Payment failed",
      payment_review: "Payment review",
      expired: "Expired",
      cancelled: "Cancelled",
      completed: "Completed",
    },
    paymentHeading: "Payment",
    paymentStatus: "Payment status",
    paymentPending: "Pending payment",
    paymentPaid: "Paid",
    noSimulatedPayment: "No simulated payment",
    simulatedAt: "Payment simulated",
    simulationDisclosure: "Simulated payment — no card details are entered and no real charge occurs.",
    completePayment: "Complete simulated payment",
    completingPayment: "Recording simulated payment…",
    paymentRecorded: "The simulated payment was recorded for this thesis demo.",
    paymentExpired: "The hold expired; no simulated payment was recorded.",
    paymentConflict: "This payment conflicts with an earlier payment request. Reload and try again.",
    paymentDenied: "This payment operation is not permitted.",
    paymentUnavailable: "The simulated payment could not be completed. Try again.",
  },
  vi: {
    catalogEyebrow: "Bản demo đồ án",
    catalogHeading: "Tour cố định tại Thành phố Hồ Chí Minh",
    catalogIntro: "Xem các tour song ngữ đã xuất bản và số chỗ hiện tại của từng chuyến.",
    runtimeDisclosure: "Dữ liệu bản demo đồ án. Giữ chỗ không đồng nghĩa đã thanh toán.",
    loading: "Đang tải dữ liệu tour cố định…",
    emptyCatalog: "Hiện chưa có tour cố định đã xuất bản.",
    serviceUnavailable: "Dịch vụ tour cố định không khả dụng. Hãy thử lại.",
    retry: "Thử lại",
    duration: "Thời lượng",
    meetingPoint: "Điểm gặp",
    cancellationPolicy: "Chính sách hủy",
    stops: "Điểm dừng",
    availability: "Tình trạng chỗ",
    seatsRemaining: (count) => `Còn ${count} chỗ`,
    soldOut: "Hết chỗ",
    bookTour: (title) => `Đặt ${title}`,
    bookingHeading: "Giữ chỗ cho tour cố định",
    bookingIntro: "Xác nhận số người để tạo giữ chỗ 35 phút. Thanh toán vẫn đang chờ.",
    partySize: "Số người",
    partySizeHint: "Nhập số nguyên từ 1 đến 100.",
    hold: "Tạo giữ chỗ chờ thanh toán",
    holding: "Đang tạo giữ chỗ…",
    signInRequired: "Hãy đăng nhập bằng tài khoản khách hàng trước khi giữ chỗ.",
    accessDenied: "Chỉ tài khoản khách hàng mới có thể tạo giữ chỗ này.",
    invalidDeparture: "Chuyến này không hợp lệ hoặc không còn khả dụng.",
    invalidPartySize: "Số người phải là số nguyên từ 1 đến 100.",
    idempotencyConflict: "Lần đặt này xung đột với yêu cầu trước. Hãy quay lại catalog và bắt đầu lại.",
    notFound: "Chuyến này không còn khả dụng. Hãy quay lại catalog và tải lại.",
    pendingPayment: "Đang chờ thanh toán — đây chỉ là giữ chỗ, chưa hoàn tất thanh toán.",
    accountHeading: "Các giữ chỗ tour cố định của bạn",
    emptyBookings: "Bạn chưa có giữ chỗ tour cố định nào.",
    party: "Số người",
    total: "Tổng tiền",
    createdAt: "Ngày tạo",
    holdExpiresAt: "Giữ chỗ đến",
    bookingStatus: "Trạng thái booking",
    bookingStatusLabels: {
      pending_payment: "Chờ xác nhận",
      payment_processing: "Đang xử lý thanh toán",
      confirmed: "Đã xác nhận",
      payment_failed: "Thanh toán thất bại",
      payment_review: "Đang rà soát thanh toán",
      expired: "Đã hết hạn",
      cancelled: "Đã hủy",
      completed: "Đã hoàn thành",
    },
    paymentHeading: "Thanh toán",
    paymentStatus: "Trạng thái thanh toán",
    paymentPending: "Chờ thanh toán",
    paymentPaid: "Đã thanh toán",
    noSimulatedPayment: "Không có thanh toán mô phỏng",
    simulatedAt: "Thời điểm mô phỏng thanh toán",
    simulationDisclosure: "Thanh toán mô phỏng — không nhập thông tin thẻ và không phát sinh giao dịch thật.",
    completePayment: "Hoàn tất thanh toán mô phỏng",
    completingPayment: "Đang ghi nhận thanh toán mô phỏng…",
    paymentRecorded: "Đã ghi nhận thanh toán mô phỏng cho bản demo đồ án này.",
    paymentExpired: "Giữ chỗ đã hết hạn; không có thanh toán mô phỏng nào được ghi nhận.",
    paymentConflict: "Thanh toán này xung đột với một yêu cầu trước đó. Hãy tải lại và thử lại.",
    paymentDenied: "Thao tác thanh toán này không được phép.",
    paymentUnavailable: "Không thể hoàn tất thanh toán mô phỏng. Hãy thử lại.",
  },
};

export function fixedTourRuntimeCopy(locale: Locale): FixedTourRuntimeCopy {
  return copy[locale];
}
