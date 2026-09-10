import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { PaymentPreview } from '@/components/dev/payment-preview';
const mocks=vi.hoisted(()=>({get:vi.fn(),pay:vi.fn(),replace:vi.fn()}));
vi.mock('next/navigation',()=>{const router={replace:mocks.replace};return {useRouter:()=>router};});
vi.mock('@/components/portals/portal-session',()=>({loadPortalSurfaceComposition:async()=>({mode:'supabase',initialized:Promise.resolve(),session:{getSession:async()=>({userId:'customer'})},reviewedBookings:mocks})}));
const row={id:'saved-order',departure_id:'d1700000-0000-4000-8000-000000000423',party_size:2,total_vnd:3180000,status:'pending_payment',expires_at:new Date(Date.now()+900000).toISOString(),paid_at:null};
afterEach(cleanup);
beforeEach(()=>{vi.clearAllMocks();window.history.replaceState({},'', '/vi/payment-preview/?booking=saved-order');mocks.get.mockResolvedValue(row);});
it('shows success only after the payment has been saved and links to bookings',async()=>{
 mocks.pay.mockResolvedValue({...row,status:'confirmed',paid_at:new Date().toISOString()});
 render(<PaymentPreview locale="vi"/>);
 const button=await screen.findByRole('button',{name:/Thanh toán mô phỏng/});await waitFor(()=>expect(button).toBeEnabled());
 fireEvent.click(button);
 await screen.findByRole('heading',{name:'Thanh toán mô phỏng thành công'});
 expect(mocks.pay).toHaveBeenCalledWith('saved-order');
 expect(screen.getByRole('link',{name:'Xem đơn đặt tour'})).toHaveAttribute('href','/vi/bookings');
});
it('restores a paid order after a reload without a second payment',async()=>{
 mocks.get.mockResolvedValue({...row,status:'confirmed',paid_at:new Date().toISOString()});
 render(<PaymentPreview locale="vi"/>);
 await screen.findByRole('heading',{name:'Thanh toán mô phỏng thành công'});expect(mocks.pay).not.toHaveBeenCalled();
});
it('does not claim success on save failure',async()=>{
 mocks.pay.mockRejectedValue(new Error('network'));
 render(<PaymentPreview locale="vi"/>);
 const button=await screen.findByRole('button',{name:/Thanh toán mô phỏng/});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);
 await screen.findByRole('alert');expect(screen.queryByRole('heading',{name:'Thanh toán mô phỏng thành công'})).toBeNull();
});
it('blocks payment on an expired order',async()=>{
 mocks.get.mockResolvedValue({...row,expires_at:new Date(Date.now()-1000).toISOString()});render(<PaymentPreview locale="vi"/>);
 await screen.findByText('Đã hết hạn giữ chỗ');expect(screen.getByRole('button',{name:/Thanh toán mô phỏng/})).toBeDisabled();
});
