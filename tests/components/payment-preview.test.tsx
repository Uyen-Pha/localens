import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { PaymentPreview } from '@/components/dev/payment-preview';
const mocks=vi.hoisted(()=>({get:vi.fn(),checkout:vi.fn(),replace:vi.fn()}));
vi.mock('next/navigation',()=>{const router={replace:mocks.replace};return {useRouter:()=>router};});
vi.mock('@/components/portals/portal-session',()=>({loadPortalSurfaceComposition:async()=>({mode:'supabase',initialized:Promise.resolve(),session:{getSession:async()=>({userId:'customer'})},reviewedBookings:mocks})}));
const row={id:'saved-order',departure_id:'d1700000-0000-4000-8000-000000000423',party_size:2,total_vnd:3180000,status:'pending_payment',expires_at:new Date(Date.now()+900000).toISOString(),paid_at:null};
afterEach(cleanup);
beforeEach(()=>{vi.clearAllMocks();window.history.replaceState({},'', '/vi/payment-preview/?booking=saved-order');mocks.get.mockResolvedValue(row);});
it('shows success only after the payment has been saved and links to bookings',async()=>{
 mocks.checkout.mockResolvedValue({...row,status:'confirmed',paid_at:new Date().toISOString()});
 render(<PaymentPreview locale="vi"/>);
 const button=await screen.findByRole('button',{name:/Xác nhận thanh toán/});await waitFor(()=>expect(button).toBeEnabled());
 fireEvent.submit(button.closest("form")!);
 await screen.findByRole('heading',{name:'Thanh toán mô phỏng thành công'});
 expect(mocks.checkout).toHaveBeenCalledWith('saved-order',expect.objectContaining({outcome:'success'}));
 expect(screen.getByRole('link',{name:'Xem đơn đặt tour'})).toHaveAttribute('href','/vi/bookings');
});
it('restores a paid order after a reload without a second payment',async()=>{
 mocks.get.mockResolvedValue({...row,status:'confirmed',paid_at:new Date().toISOString()});
 render(<PaymentPreview locale="vi"/>);
 await screen.findByRole('heading',{name:'Thanh toán mô phỏng thành công'});expect(mocks.checkout).not.toHaveBeenCalled();
});
it('does not claim success on save failure',async()=>{
 mocks.checkout.mockRejectedValue(new Error('network'));
 render(<PaymentPreview locale="vi"/>);
 const button=await screen.findByRole('button',{name:/Xác nhận thanh toán/});await waitFor(()=>expect(button).toBeEnabled());fireEvent.submit(button.closest("form")!);
 await screen.findByRole('alert');expect(screen.queryByRole('heading',{name:'Thanh toán mô phỏng thành công'})).toBeNull();
});
it('blocks payment on an expired order',async()=>{
 mocks.get.mockResolvedValue({...row,expires_at:new Date(Date.now()-1000).toISOString()});render(<PaymentPreview locale="vi"/>);
 await screen.findByText('Đã hết hạn giữ chỗ');expect(screen.getByRole('button',{name:/Xác nhận thanh toán/})).toBeDisabled();
});

it('keeps the form and allows another test card after a decline',async()=>{mocks.checkout.mockResolvedValue({...row,payment_status:'failed'});render(<PaymentPreview locale="vi"/>);const button=await screen.findByRole('button',{name:/Xác nhận thanh toán/});fireEvent.change(screen.getByLabelText('Chọn thẻ thử'),{target:{value:'declined'}});fireEvent.submit(button.closest('form')!);await screen.findByRole('alert');expect(button).toBeEnabled();expect(mocks.checkout).toHaveBeenCalledWith('saved-order',expect.objectContaining({outcome:'declined'}));});
it('recovers a committed payment after its response was lost',async()=>{mocks.checkout.mockImplementation(async()=>{mocks.get.mockResolvedValue({...row,status:'confirmed',paid_at:new Date().toISOString()});throw new Error('network');});render(<PaymentPreview locale="vi"/>);const button=await screen.findByRole('button',{name:/Xác nhận thanh toán/});fireEvent.submit(button.closest('form')!);await screen.findByRole('heading',{name:'Thanh toán mô phỏng thành công'});expect(mocks.checkout).toHaveBeenCalledTimes(1);});
