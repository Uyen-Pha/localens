import type { BookingStatus, PaymentStatus } from '@/lib/domain/data/contracts';
import type { Locale } from './config';

// Presentation only: retain internal transaction locks and transition checks.
export const bookingStatusLabels = {
  vi: {pending_payment:'Chờ thanh toán',payment_processing:'Chờ thanh toán',payment_failed:'Chờ thanh toán',payment_review:'Chờ thanh toán',confirmed:'Đã xác nhận',completed:'Đã hoàn thành',cancelled:'Đã hủy',expired:'Đã hết hạn'},
  en: {pending_payment:'Awaiting payment',payment_processing:'Awaiting payment',payment_failed:'Awaiting payment',payment_review:'Awaiting payment',confirmed:'Confirmed',completed:'Completed',cancelled:'Cancelled',expired:'Expired'},
} satisfies Record<Locale, Record<BookingStatus,string>>;
export function paymentStatusLabel(locale: Locale, booking: BookingStatus, payment?: PaymentStatus | null): string {
  const status = booking === 'payment_review' ? 'review' : payment === 'paid' ? 'paid' : booking === 'payment_processing' ? 'processing' : booking === 'payment_failed' ? 'failed' : payment ?? (booking === 'pending_payment' ? 'pending' : 'none');
  return {
    vi:{pending:'Chờ thanh toán',processing:'Đang xử lý thanh toán',paid:'Đã thanh toán',failed:'Thanh toán thất bại',review:'Đang rà soát thanh toán',none:'Chưa có thanh toán'},
    en:{pending:'Awaiting payment',processing:'Payment processing',paid:'Paid',failed:'Payment failed',review:'Payment under review',none:'No payment recorded'},
  }[locale][status];
}
