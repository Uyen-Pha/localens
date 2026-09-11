import type {ReviewedBooking,ReviewedPaymentStatus} from '@/lib/infrastructure/supabase/reviewed-bookings';
export const paymentLabels={vi:{pending:'Chờ thanh toán',processing:'Đang xử lý thanh toán',paid:'Đã thanh toán',failed:'Thanh toán thất bại',reviewing:'Đang rà soát thanh toán',cancelled:'Đã hủy',refunding:'Đang hoàn tiền',refunded:'Đã hoàn tiền'},en:{pending:'Awaiting payment',processing:'Processing payment',paid:'Paid',failed:'Payment failed',reviewing:'Payment under review',cancelled:'Cancelled',refunding:'Refund in progress',refunded:'Refunded'}};
export function paymentStatus(row:ReviewedBooking,now=Date.now()):ReviewedPaymentStatus {
 if(row.payment_status==='processing'||row.payment_status==='reviewing') return row.payment_status;
 if(!row.paid_at&&(row.status==='expired'||row.status==='cancelled'||row.status==='pending_payment'&&Date.parse(row.expires_at)<=now))return 'cancelled';
 return row.payment_status??(row.paid_at?'paid':'pending');
}
