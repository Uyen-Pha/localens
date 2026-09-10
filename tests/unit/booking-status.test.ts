import { describe,it,expect } from 'vitest';
import { bookingStatusLabels,paymentStatusLabel } from '@/lib/i18n/booking-status';
describe('independent customer booking and payment statuses',()=>{
 it.each(['payment_processing','payment_failed','payment_review'] as const)('%s remains an unpaid booking',status=>{
   expect(bookingStatusLabels.vi[status]).toBe('Chờ thanh toán');
   expect(paymentStatusLabel('vi',status)).not.toBe('Chờ thanh toán');
 });
 it('does not imply refund or erase a paid payment when cancelled',()=>{
   expect(bookingStatusLabels.vi.cancelled).toBe('Đã hủy');
   expect(paymentStatusLabel('vi','cancelled','paid')).toBe('Đã thanh toán');
 });
 it('keeps review visible and never invents payment success',()=>{
   expect(paymentStatusLabel('en','payment_review','paid')).toBe('Payment under review');
   expect(paymentStatusLabel('vi','completed')).toBe('Chưa có thanh toán');
 });
 it('provides five distinct booking statuses in each language',()=>{
   expect(new Set(Object.values(bookingStatusLabels.vi)).size).toBe(5);
   expect(new Set(Object.values(bookingStatusLabels.en)).size).toBe(5);
 });
});
