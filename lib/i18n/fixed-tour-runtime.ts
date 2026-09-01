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
}

const copy: Record<Locale, FixedTourRuntimeCopy> = {
  en: {
    catalogEyebrow: "Verified local runtime",
    catalogHeading: "Fixed tours from the live local database",
    catalogIntro: "Browse the published bilingual runtime catalog and current departure capacity.",
    runtimeDisclosure: "Local runtime only. Creating a hold does not complete payment.",
    loading: "Loading live fixed-tour data…",
    emptyCatalog: "No published runtime tours are available.",
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
  },
  vi: {
    catalogEyebrow: "Runtime cục bộ đã kiểm chứng",
    catalogHeading: "Tour cố định từ cơ sở dữ liệu cục bộ",
    catalogIntro: "Xem catalog runtime song ngữ đã xuất bản và số chỗ hiện tại của từng chuyến.",
    runtimeDisclosure: "Chỉ là runtime cục bộ. Giữ chỗ không đồng nghĩa đã thanh toán.",
    loading: "Đang tải dữ liệu tour cố định…",
    emptyCatalog: "Hiện chưa có tour runtime đã xuất bản.",
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
  },
};

export function fixedTourRuntimeCopy(locale: Locale): FixedTourRuntimeCopy {
  return copy[locale];
}
