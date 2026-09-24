import { bookingStatusLabels } from '@/lib/i18n/booking-status';
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
    catalogEyebrow: "Explore with LocalLens",
    catalogHeading: "Fixed tours in Ho Chi Minh City",
    catalogIntro: "Browse published bilingual tours and current departure capacity.",
    runtimeDisclosure: "Experience mode: bookings and payments are for preview only. No real charge is made.",
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
    bookingStatusLabels: bookingStatusLabels.en,
    paymentHeading: "Payment",
    paymentStatus: "Payment status",
    paymentPending: "Pending payment",
    paymentPaid: "Paid",
    noSimulatedPayment: "No simulated payment",
    simulatedAt: "Payment simulated",
    simulationDisclosure: "Simulated payment — no card details are entered and no real charge occurs.",
    completePayment: "Complete simulated payment",
    completingPayment: "Recording simulated payment…",
    paymentRecorded: "The simulated payment was recorded in this browser experience.",
    paymentExpired: "The hold expired; no simulated payment was recorded.",
    paymentConflict: "This payment conflicts with an earlier payment request. Reload and try again.",
    paymentDenied: "This payment operation is not permitted.",
    paymentUnavailable: "The simulated payment could not be completed. Try again.",
  },
  vi: {
    catalogEyebrow: "Khám phá cùng LocalLens",
    catalogHeading: "Tour cố định tại Thành phố Hồ Chí Minh",
    catalogIntro: "Xem các tour song ngữ đã xuất bản và số chỗ hiện tại của từng chuyến.",
    runtimeDisclosure: "Chế độ trải nghiệm: bạn có thể thử đặt chỗ và thanh toán. Không phát sinh đặt chỗ hoặc thu tiền thật.",
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
    accountHeading: "Các đơn đặt tour của bạn",
    emptyBookings: "Bạn chưa có đơn đặt tour nào.",
    party: "Số người",
    total: "Tổng tiền",
    createdAt: "Ngày tạo",
    holdExpiresAt: "Giữ chỗ đến",
    bookingStatus: "Trạng thái đơn",
    bookingStatusLabels: bookingStatusLabels.vi,
    paymentHeading: "Thanh toán",
    paymentStatus: "Trạng thái thanh toán",
    paymentPending: "Chờ thanh toán",
    paymentPaid: "Đã thanh toán",
    noSimulatedPayment: "Không có thanh toán mô phỏng",
    simulatedAt: "Thời điểm mô phỏng thanh toán",
    simulationDisclosure: "Thanh toán mô phỏng — không nhập thông tin thẻ và không phát sinh giao dịch thật.",
    completePayment: "Hoàn tất thanh toán mô phỏng",
    completingPayment: "Đang ghi nhận thanh toán mô phỏng…",
    paymentRecorded: "Đã ghi nhận thanh toán mô phỏng trong trải nghiệm trên trình duyệt này.",
    paymentExpired: "Giữ chỗ đã hết hạn; không có thanh toán mô phỏng nào được ghi nhận.",
    paymentConflict: "Thanh toán này xung đột với một yêu cầu trước đó. Hãy tải lại và thử lại.",
    paymentDenied: "Thao tác thanh toán này không được phép.",
    paymentUnavailable: "Không thể hoàn tất thanh toán mô phỏng. Hãy thử lại.",
  },
};

export function fixedTourRuntimeCopy(locale: Locale): FixedTourRuntimeCopy {
  return copy[locale];
}
