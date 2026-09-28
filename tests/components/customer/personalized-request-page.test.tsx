import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PersonalizedRequestPage} from '@/components/customer/personalized-request-page';
import {requestId,revisionId,researchInput,researchReady} from '../../fixtures/research-recovery';
const mocks=vi.hoisted(()=>({list:vi.fn(),booking:vi.fn(),checkout:vi.fn(),replace:vi.fn()}));
vi.mock('next/navigation',()=>{const router={replace:mocks.replace};return {useRouter:()=>router,useSearchParams:()=>new URLSearchParams(window.location.search)};});
vi.mock('@/components/portals/portal-session',()=>({loadPortalSurfaceComposition:async()=>({mode:'supabase',initialized:Promise.resolve(),session:{getSession:async()=>({role:'customer'})},researchRequests:{listCustomer:mocks.list,booking:mocks.booking,checkout:mocks.checkout}})}));
const quote={id:revisionId,title:'Báo giá riêng',amount:1000000,currency:'VND',conditions:'Bao gồm hướng dẫn viên',status:'checkout_pending',createdAt:'2026-09-28T00:00:00Z',expiresAt:'2099-10-09T00:00:00Z'};
const booking={id:requestId,quote_id:revisionId,status:'pending_payment',payment_status:'pending',party_size:2,expires_at:quote.expiresAt,amount:quote.amount,currency:quote.currency};
beforeEach(()=>{vi.clearAllMocks();history.replaceState({},'',`/vi/personalized-payment/?request=${requestId}&quote=${revisionId}`);mocks.list.mockResolvedValue([{id:requestId,status:'approved',request:researchInput,plan:researchReady.plan,quotes:[quote],history:[]}]);mocks.booking.mockResolvedValue(booking);});
afterEach(cleanup);
it('loads the matching quote without creating a booking and renders traveler payment fields',async()=>{
 render(<PersonalizedRequestPage locale="vi" payment/>);
 expect(await screen.findByText('Thông tin hành khách')).toBeInTheDocument();
 expect(mocks.booking).toHaveBeenCalledWith(revisionId,false);
 expect(screen.getAllByLabelText('Họ và tên')).toHaveLength(2);
 expect(screen.getByText(/không áp dụng giữ chỗ 15 phút/i)).toBeInTheDocument();
 expect(mocks.checkout).not.toHaveBeenCalled();
});
it('fails closed when booking status cannot be loaded',async()=>{
 mocks.booking.mockRejectedValue(Error('offline'));
 render(<PersonalizedRequestPage locale="vi" payment/>);
 expect(await screen.findByRole('alert')).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Xác nhận thanh toán mô phỏng'})).not.toBeInTheDocument();
});
it('does not offer payment again for a confirmed booking',async()=>{
 mocks.booking.mockResolvedValue({...booking,status:'confirmed',payment_status:'paid'});
 render(<PersonalizedRequestPage locale="vi" payment/>);
 expect(await screen.findByText('Đã xác nhận đơn đặt tour')).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Xác nhận thanh toán mô phỏng'})).not.toBeInTheDocument();
});
it('creates a booking only after explicit confirmation, then shows the payment form',async()=>{
 mocks.booking.mockResolvedValueOnce(null).mockResolvedValueOnce(booking);
 render(<PersonalizedRequestPage locale="vi" payment/>);
 fireEvent.click(await screen.findByRole('button',{name:'Xác nhận đặt tour'}));
 await waitFor(()=>expect(mocks.booking).toHaveBeenLastCalledWith(revisionId,true));
 expect(await screen.findByText('Thông tin hành khách')).toBeInTheDocument();
});
it('keeps expired bookings read-only',async()=>{
 mocks.booking.mockResolvedValue({...booking,status:'expired'});
 render(<PersonalizedRequestPage locale="vi" payment/>);
 expect(await screen.findByText(/không còn đủ điều kiện thanh toán/)).toBeInTheDocument();
 expect(screen.queryByText('Thông tin hành khách')).not.toBeInTheDocument();
});
it('sends complete travelers only after the second confirmation and shows confirmed status',async()=>{
 mocks.checkout.mockResolvedValue({...booking,status:'confirmed',payment_status:'paid'});
 const {container}=render(<PersonalizedRequestPage locale="vi" payment/>);
 await screen.findByText('Thông tin hành khách');
 for(let i=0;i<2;i++){
  fireEvent.change(screen.getAllByLabelText('Họ và tên')[i],{target:{value:`Khách ${i+1}`}});
  fireEvent.change(screen.getAllByLabelText('Số điện thoại')[i],{target:{value:'+84912345678'}});
  fireEvent.change(screen.getAllByLabelText('Email')[i],{target:{value:`guest${i}@example.test`}});
 }
 fireEvent.submit(container.querySelector('form')!);
 expect(mocks.checkout).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận thanh toán mô phỏng'}));
 expect(await screen.findByText('Đã xác nhận đơn đặt tour')).toBeInTheDocument();
 expect(mocks.checkout).toHaveBeenCalledExactlyOnceWith(revisionId,{outcome:'success',travelers:[{name:'Khách 1',phone:'+84912345678',country:'VN',email:'guest0@example.test'},{name:'Khách 2',phone:'+84912345678',country:'VN',email:'guest1@example.test'}]});
});
it('shows the itinerary and quote links on the separate detail page',async()=>{
 history.replaceState({},'',`/vi/personalized-request/?request=${requestId}`);
 render(<PersonalizedRequestPage locale="vi"/>);
 expect(await screen.findByText('Hành trình đã gửi')).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'Thanh toán'})).toHaveAttribute('href',`/vi/personalized-payment?request=${requestId}&quote=${revisionId}`);
 expect(mocks.booking).not.toHaveBeenCalled();
});
it('preserves entered travelers when returning from review to edit',async()=>{
 const {container}=render(<PersonalizedRequestPage locale="vi" payment/>);
 await screen.findByText('Thông tin hành khách');
 fireEvent.change(screen.getAllByLabelText('Họ và tên')[0],{target:{value:'Saved traveler'}});
 fireEvent.submit(container.querySelector('form')!);
 fireEvent.click(screen.getByRole('button',{name:'Sửa thông tin'}));
 expect(screen.getAllByLabelText('Họ và tên')[0]).toHaveValue('Saved traveler');
});
it('invalidates the old booking when only the request query changes',async()=>{
 const view=render(<PersonalizedRequestPage locale="vi" payment/>);
 await screen.findByText('Thông tin hành khách');
 history.replaceState({},'',`/vi/personalized-payment/?request=unknown&quote=${revisionId}`);
 view.rerender(<PersonalizedRequestPage locale="vi" payment/>);
 expect(await screen.findByRole('alert')).toBeInTheDocument();
 expect(screen.queryByText('Thông tin hành khách')).not.toBeInTheDocument();
});
