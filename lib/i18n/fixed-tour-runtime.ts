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
  cancellationHeading: string;
  cancellationWorkflowLabel: string;
  cancellationDisclosure: string;
  requestCancellation: string;
  cancellationReason: string;
  cancellationReasonHint: string;
  sendCancellation: string;
  closeCancellation: string;
  sendingCancellation: string;
  cancellationSent: string;
  cancellationStatus: string;
  cancellationStatusLabels: Record<"pending" | "approved" | "rejected", string>;
  cancellationDecisionNote: string;
  cancellationConflict: string;
  cancellationIdempotencyConflict: string;
  cancellationDenied: string;
  cancellationUnavailable: string;
  adminCancellationHeading: string;
  emptyCancellationQueue: string;
  customer: string;
  reason: string;
  decisionNote: string;
  approveCancellation: string;
  rejectCancellation: string;
  savingCancellationDecision: string;
  cancellationDecisionSaved: string;
  cancellationDecisionConflict: string;
  cancellationDecisionIdempotencyConflict: string;
  cancellationDecisionDenied: string;
  cancellationDecisionUnavailable: string;
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
    simulationDisclosure: "Thesis simulation only. No card details are requested and no real charge occurs.",
    completePayment: "Complete simulated payment",
    completingPayment: "Recording simulated payment…",
    paymentRecorded: "The local server recorded the simulated payment.",
    paymentExpired: "The hold expired; no simulated payment was recorded.",
    paymentConflict: "This payment conflicts with an earlier payment request. Reload and try again.",
    paymentDenied: "This payment operation is not permitted.",
    paymentUnavailable: "The simulated payment could not be completed. Try again.",
    cancellationHeading: "Cancellation",
    cancellationWorkflowLabel: "Cancellation workflow",
    cancellationDisclosure: "This sends a request only. An administrator reviews and decides it; your booking is not cancelled now.",
    requestCancellation: "Request cancellation",
    cancellationReason: "Cancellation reason",
    cancellationReasonHint: "Explain why you are requesting cancellation (maximum 1,000 characters).",
    sendCancellation: "Send cancellation request",
    closeCancellation: "Keep booking",
    sendingCancellation: "Sending cancellation request…",
    cancellationSent: "Cancellation request sent for administrator review.",
    cancellationStatus: "Cancellation status",
    cancellationStatusLabels: {
      pending: "Pending administrator decision",
      approved: "Approved by administrator",
      rejected: "Rejected by administrator",
    },
    cancellationDecisionNote: "Administrator note",
    cancellationConflict: "The booking state changed, so this cancellation request cannot continue. Reload and review the booking.",
    cancellationIdempotencyConflict: "This conflicts with an earlier cancellation request. Reload and try again.",
    cancellationDenied: "This cancellation operation is not permitted.",
    cancellationUnavailable: "The cancellation request could not be completed. Try again.",
    adminCancellationHeading: "Cancellation requests",
    emptyCancellationQueue: "There are no cancellation requests.",
    customer: "Customer",
    reason: "Reason",
    decisionNote: "Decision note",
    approveCancellation: "Approve cancellation",
    rejectCancellation: "Reject cancellation",
    savingCancellationDecision: "Saving cancellation decision…",
    cancellationDecisionSaved: "Cancellation decision saved from authoritative data.",
    cancellationDecisionConflict: "The cancellation or booking state changed. Reload and review the request.",
    cancellationDecisionIdempotencyConflict: "This conflicts with an earlier decision. Reload and try again.",
    cancellationDecisionDenied: "This cancellation decision is not permitted.",
    cancellationDecisionUnavailable: "The cancellation decision could not be completed. Try again.",
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
    simulationDisclosure: "Chỉ mô phỏng trong phạm vi luận văn. Không yêu cầu thông tin thẻ và không phát sinh giao dịch thật.",
    completePayment: "Hoàn tất thanh toán mô phỏng",
    completingPayment: "Đang ghi nhận thanh toán mô phỏng…",
    paymentRecorded: "Máy chủ cục bộ đã ghi nhận thanh toán mô phỏng.",
    paymentExpired: "Giữ chỗ đã hết hạn; không có thanh toán mô phỏng nào được ghi nhận.",
    paymentConflict: "Thanh toán này xung đột với một yêu cầu trước đó. Hãy tải lại và thử lại.",
    paymentDenied: "Thao tác thanh toán này không được phép.",
    paymentUnavailable: "Không thể hoàn tất thanh toán mô phỏng. Hãy thử lại.",
    cancellationHeading: "Hủy booking",
    cancellationWorkflowLabel: "Quy trình hủy",
    cancellationDisclosure: "Thao tác này chỉ gửi yêu cầu. Quản trị viên xem xét và quyết định; booking chưa bị hủy ngay.",
    requestCancellation: "Yêu cầu hủy booking",
    cancellationReason: "Lý do hủy",
    cancellationReasonHint: "Nêu lý do yêu cầu hủy (tối đa 1.000 ký tự).",
    sendCancellation: "Gửi yêu cầu hủy",
    closeCancellation: "Giữ booking",
    sendingCancellation: "Đang gửi yêu cầu hủy…",
    cancellationSent: "Đã gửi yêu cầu hủy để quản trị viên xem xét.",
    cancellationStatus: "Trạng thái yêu cầu hủy",
    cancellationStatusLabels: {
      pending: "Chờ quản trị viên quyết định",
      approved: "Quản trị viên đã duyệt",
      rejected: "Quản trị viên đã từ chối",
    },
    cancellationDecisionNote: "Ghi chú của quản trị viên",
    cancellationConflict: "Trạng thái booking đã thay đổi nên không thể tiếp tục yêu cầu hủy. Hãy tải lại và kiểm tra booking.",
    cancellationIdempotencyConflict: "Yêu cầu này xung đột với một yêu cầu hủy trước đó. Hãy tải lại và thử lại.",
    cancellationDenied: "Thao tác hủy này không được phép.",
    cancellationUnavailable: "Không thể hoàn tất yêu cầu hủy. Hãy thử lại.",
    adminCancellationHeading: "Yêu cầu hủy booking",
    emptyCancellationQueue: "Không có yêu cầu hủy booking nào.",
    customer: "Khách hàng",
    reason: "Lý do",
    decisionNote: "Ghi chú quyết định",
    approveCancellation: "Duyệt yêu cầu hủy",
    rejectCancellation: "Từ chối yêu cầu hủy",
    savingCancellationDecision: "Đang lưu quyết định hủy…",
    cancellationDecisionSaved: "Đã lưu quyết định hủy và tải lại dữ liệu mới nhất.",
    cancellationDecisionConflict: "Trạng thái yêu cầu hủy hoặc booking đã thay đổi. Hãy tải lại và kiểm tra.",
    cancellationDecisionIdempotencyConflict: "Quyết định này xung đột với một quyết định trước đó. Hãy tải lại và thử lại.",
    cancellationDecisionDenied: "Quyết định hủy này không được phép.",
    cancellationDecisionUnavailable: "Không thể hoàn tất quyết định hủy. Hãy thử lại.",
  },
};

export function fixedTourRuntimeCopy(locale: Locale): FixedTourRuntimeCopy {
  return copy[locale];
}
