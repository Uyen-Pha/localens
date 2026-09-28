import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {ResearchQuoteCheckout} from '@/components/customer/research-quote-checkout';
import type {ResearchBooking,ResearchDemoPort,ResearchDemoRequest,ResearchDemoQuote} from '@/lib/infrastructure/supabase/research-demo-adapter';
import {requestId,revisionId,researchInput,researchReady} from '../../fixtures/research-recovery';
afterEach(()=>{cleanup();vi.useRealTimers();});
const quote:ResearchDemoQuote={id:revisionId,title:'Quote',amount:1000000,currency:'VND',conditions:'Demo',status:'checkout_pending',createdAt:'2026-09-28',expiresAt:'2099-10-01T00:00:00Z'};
const request:ResearchDemoRequest={id:requestId,ownerId:requestId,revisionId,status:'approved',request:researchInput,plan:researchReady.plan,createdAt:'2026-09-28',notes:null,quotes:[quote],history:[]};
const booking:ResearchBooking={id:requestId,quote_id:revisionId,status:'pending_payment',payment_status:'pending',party_size:2,expires_at:quote.expiresAt,amount:quote.amount,currency:'VND'};
function setup(saved:ResearchBooking=booking,loadError=false){
 const port:ResearchDemoPort={submit:vi.fn(),listCustomer:vi.fn(),listAdmin:vi.fn(),decide:vi.fn(),createQuote:vi.fn(),booking:loadError?vi.fn().mockRejectedValue(Error('offline')):vi.fn().mockResolvedValue(saved),checkout:vi.fn(),cancelBooking:vi.fn().mockResolvedValue({...saved,status:'cancelled'})};
 render(<ResearchQuoteCheckout port={port} request={request} quote={quote} vi initialStage="pay"/>);
 return port;
}
it('back sends nothing, confirmation locks repeated clicks and reloads cancelled without payment',async()=>{
 const p=setup();
 fireEvent.click(await screen.findByRole('button',{name:'Hủy đơn'}));
 fireEvent.click(screen.getByRole('button',{name:'Quay lại'}));
 expect(p.cancelBooking).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Hủy đơn'}));
 let resolve!:(value:ResearchBooking)=>void;
 vi.mocked(p.cancelBooking).mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const confirm=screen.getByRole('button',{name:'Xác nhận hủy'});
 fireEvent.click(confirm);fireEvent.click(confirm);
 expect(p.cancelBooking).toHaveBeenCalledTimes(1);
 expect(confirm).toBeDisabled();
 vi.mocked(p.booking!).mockResolvedValue({...booking,status:'cancelled'});
 resolve({...booking,status:'cancelled'});
 expect(await screen.findByText('Đã hủy đơn đặt tour')).toBeInTheDocument();
 expect(p.booking).toHaveBeenLastCalledWith(revisionId,false);
 expect(screen.queryByRole('button',{name:'Thanh toán'})).not.toBeInTheDocument();
});
it('preserves contact, travelers and payment scenario through Cancel then Back and blocks payment',async()=>{
 const p=setup();
 const name=await screen.findByLabelText('Họ và tên');
 fireEvent.change(name,{target:{value:'Current contact'}});
 fireEvent.change(screen.getByLabelText('Số điện thoại'),{target:{value:'+84912345678'}});
 fireEvent.change(screen.getByLabelText('Họ và tên hành khách 1'),{target:{value:'First traveler'}});
 fireEvent.change(screen.getByLabelText('Họ và tên hành khách 2'),{target:{value:'Second traveler'}});
 fireEvent.change(screen.getByLabelText('Chọn thẻ thử'),{target:{value:'declined'}});
 fireEvent.click(screen.getByRole('button',{name:'Hủy đơn'}));
 expect(screen.queryByRole('button',{name:'Xác nhận thanh toán'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Quay lại'}));
 expect(screen.getByLabelText('Họ và tên')).toHaveValue('Current contact');
 expect(screen.getByLabelText('Số điện thoại')).toHaveValue('+84912345678');
 expect(screen.getByLabelText('Họ và tên hành khách 1')).toHaveValue('First traveler');
 expect(screen.getByLabelText('Họ và tên hành khách 2')).toHaveValue('Second traveler');
 expect(screen.getByLabelText('Chọn thẻ thử')).toHaveValue('declined');
 const form=screen.getByLabelText('Họ và tên').closest('form')!;
 fireEvent.click(screen.getByRole('button',{name:'Hủy đơn'}));
 expect(form.querySelector('input')).toBeDisabled();
 expect(form.querySelector('button[type="submit"]')).toBeDisabled();
 fireEvent.submit(form);
 expect(p.checkout).not.toHaveBeenCalled();
 expect(p.cancelBooking).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Quay lại'}));
 expect(screen.getByRole('button',{name:'Xác nhận thanh toán'})).toBeEnabled();
});
it('network failure retains key across back/reopen and retries; failed reload never invents success',async()=>{
 const p=setup();
 fireEvent.click(await screen.findByRole('button',{name:'Hủy đơn'}));
 vi.mocked(p.cancelBooking).mockRejectedValueOnce(Error('offline'));
 vi.mocked(p.booking!).mockRejectedValueOnce(Error('offline'));
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận hủy'}));
 await screen.findByRole('alert');
 expect(screen.queryByText('Đã hủy đơn đặt tour')).not.toBeInTheDocument();
 const key=vi.mocked(p.cancelBooking).mock.calls[0][1];
 fireEvent.click(screen.getByRole('button',{name:'Quay lại'}));
 fireEvent.click(screen.getByRole('button',{name:'Hủy đơn'}));
 vi.mocked(p.booking!).mockResolvedValue({...booking,status:'cancelled'});
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận hủy'}));
 await screen.findByText('Đã hủy đơn đặt tour');
 expect(p.cancelBooking).toHaveBeenLastCalledWith(requestId,key);
});
it('missing RPC reports unavailable with no false cancelled state',async()=>{
 const p=setup();
 fireEvent.click(await screen.findByRole('button',{name:'Hủy đơn'}));
 vi.mocked(p.cancelBooking).mockRejectedValue(Error('CANCELLATION_UNAVAILABLE'));
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận hủy'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('chưa sẵn sàng');
 expect(screen.queryByText('Đã hủy đơn đặt tour')).not.toBeInTheDocument();
});
it.each([
 ['confirmed','paid','2099-10-01T00:00:00Z',undefined,false],
 ['confirmed','paid','2020-01-01T00:00:00Z','2026-10-01T00:00:00Z',true],
 ['confirmed','paid','2099-10-01T00:00:00Z','2026-09-30T23:59:59Z',false],
 ['confirmed','paid','2099-10-01T00:00:00Z','invalid',false],
 ['pending_payment','pending','2026-09-29T00:00:01Z',undefined,true],
 ['pending_payment','failed','2026-09-29T00:00:01Z',undefined,true],
 ['pending_payment','pending','2026-09-29T00:00:00Z',null,false],
 ['pending_payment','pending','2026-09-28T23:59:59Z',undefined,false],
 ['pending_payment','pending','invalid',undefined,false],
 ['pending_payment','paid','2099-10-01T00:00:00Z',undefined,false],
 ['confirmed','pending','2099-10-01T00:00:00Z','2099-10-01T00:00:00Z',false],
 ['expired','pending','2099-10-01T00:00:00Z',undefined,false],
] as const)('eligibility %s %s expiry=%s trip=%s => %s',async(status,payment_status,expires_at,trip_start_at,allowed)=>{
 vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-09-29T00:00:00Z'));
 setup({...booking,status,payment_status,expires_at,trip_start_at});
 await waitFor(()=>expect(screen.queryByText('Đang kiểm tra đơn đặt tour…')).not.toBeInTheDocument());
 expect(!!screen.queryByRole('button',{name:'Hủy đơn'})).toBe(allowed);
 vi.restoreAllMocks();
});
it('an already cancelled server booking never offers payment',async()=>{
 setup({...booking,status:'cancelled'});
 await screen.findByText('Đã hủy đơn đặt tour');
 expect(screen.queryByText('Thông tin hành khách')).not.toBeInTheDocument();
});
it('does not offer payment when the initial server read fails and cancellation status is unknown',async()=>{
 setup(booking,true);
 await screen.findAllByRole('alert');
 expect(screen.queryByRole('button',{name:'Xác nhận thanh toán'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Xác nhận đặt tour'})).not.toBeInTheDocument();
});
it('retains the cancellation key when readback changes pending to confirmed after payment wins',async()=>{
 const p=setup();
 fireEvent.click(await screen.findByRole('button',{name:'Hủy đơn'}));
 vi.mocked(p.cancelBooking).mockRejectedValueOnce(Error('network'));
 vi.mocked(p.booking!).mockResolvedValue({...booking,status:'confirmed',payment_status:'paid',trip_start_at:'2099-10-01T00:00:00Z'});
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận hủy'}));
 await screen.findByText('Đã xác nhận đơn đặt tour');
 const key=vi.mocked(p.cancelBooking).mock.calls[0][1];
 if(screen.queryByRole('button',{name:'Quay lại'}))fireEvent.click(screen.getByRole('button',{name:'Quay lại'}));
 fireEvent.click(screen.getByRole('button',{name:'Hủy đơn'}));
 vi.mocked(p.booking!).mockResolvedValue({...booking,status:'cancelled',payment_status:'paid'});
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận hủy'}));
 await screen.findByText('Đã hủy đơn đặt tour');
 expect(p.cancelBooking).toHaveBeenLastCalledWith(requestId,key);
});
