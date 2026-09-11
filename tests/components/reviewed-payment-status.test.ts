import {it,expect} from 'vitest';
import {paymentStatus,paymentLabels} from '@/components/customer/reviewed-payment-status';
import type {ReviewedBooking} from '@/lib/infrastructure/supabase/reviewed-bookings';
const row={status:'pending_payment',paid_at:null,expires_at:'2026-09-11T00:00:00Z',payment_status:'pending'} as ReviewedBooking;
it('shows payment cancelled after hold expiry',()=>expect(paymentStatus(row,Date.parse(row.expires_at))).toBe('cancelled'));
it('preserves payment reconciliation while expired',()=>expect(paymentStatus({...row,status:'expired',payment_status:'reviewing'})).toBe('reviewing'));
it('shows only the persisted refund stage, never infers completion from elapsed time',()=>{expect(paymentStatus({...row,status:'cancelled',paid_at:'2026-09-10',payment_status:'refunding',refund_due_at:'2020-01-01'})).toBe('refunding');expect(paymentLabels.vi.refunded).toBe('Đã hoàn tiền');});
