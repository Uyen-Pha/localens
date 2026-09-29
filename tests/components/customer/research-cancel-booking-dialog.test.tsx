import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {ResearchCancelBookingDialog} from '@/components/customer/research-cancel-booking-dialog';
import type {ResearchBooking} from '@/lib/infrastructure/supabase/research-request-adapter';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const booking:ResearchBooking={id:'booking',quote_id:'quote',status:'pending_payment',payment_status:'pending',party_size:1,expires_at:'2099-10-01',amount:1000000,currency:'VND'};
function setup(){
 const props={booking,vi:true,now:Date.now(),cancelBooking:vi.fn(),reloadBooking:vi.fn(),onBooking:vi.fn(),onBlockedChange:vi.fn()};
 render(<ResearchCancelBookingDialog {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'Hủy đơn'}));
 return props;
}
it('recovers a committed cancellation after a lost response by reading the server',async()=>{
 const p=setup();
 p.cancelBooking.mockRejectedValue(Error('network'));
 p.reloadBooking.mockResolvedValue({...booking,status:'cancelled'});
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận hủy'}));
 await waitFor(()=>expect(p.onBooking).toHaveBeenCalledWith({...booking,status:'cancelled'}));
 expect(screen.queryByRole('alert')).not.toBeInTheDocument();
 expect(p.onBlockedChange).toHaveBeenLastCalledWith(false);
});
it('keeps payment blocked when readback fails and retains the key on retry',async()=>{
 const p=setup();
 p.cancelBooking.mockResolvedValue({...booking,status:'cancelled'});
 p.reloadBooking.mockRejectedValue(Error('offline'));
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận hủy'}));
 await screen.findByRole('alert');
 expect(p.onBooking).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Quay lại'}));
 expect(p.onBlockedChange).toHaveBeenLastCalledWith(true);
 fireEvent.click(screen.getByRole('button',{name:'Hủy đơn'}));
 p.reloadBooking.mockResolvedValue({...booking,status:'cancelled'});
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận hủy'}));
 await waitFor(()=>expect(p.onBooking).toHaveBeenCalled());
 expect(p.cancelBooking.mock.calls[0]).toEqual(p.cancelBooking.mock.calls[1]);
});
it('does not accept readback for a different booking',async()=>{
 const p=setup();
 p.cancelBooking.mockResolvedValue({...booking,status:'cancelled'});
 p.reloadBooking.mockResolvedValue({...booking,id:'other',status:'cancelled'});
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận hủy'}));
 await screen.findByRole('alert');
 expect(p.onBooking).not.toHaveBeenCalled();
});
it('keeps Back available if eligibility expires while the confirmation is open',()=>{
 const onBlockedChange=vi.fn();
 const props={booking,vi:true,now:Date.parse('2099-09-30'),cancelBooking:vi.fn(),reloadBooking:vi.fn(),onBooking:vi.fn(),onBlockedChange};
 const view=render(<ResearchCancelBookingDialog {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'Hủy đơn'}));
 view.rerender(<ResearchCancelBookingDialog {...props} now={Date.parse('2099-10-01')}/>);
 fireEvent.click(screen.getByRole('button',{name:'Quay lại'}));
 expect(onBlockedChange).toHaveBeenLastCalledWith(false);
 expect(props.cancelBooking).not.toHaveBeenCalled();
});

it('does not send cancellation when the parent becomes busy while the dialog is open',()=>{
 const props={booking,vi:true,now:Date.now(),cancelBooking:vi.fn(),reloadBooking:vi.fn(),onBooking:vi.fn(),onBlockedChange:vi.fn()};
 const view=render(<ResearchCancelBookingDialog {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'Hủy đơn'}));
 view.rerender(<ResearchCancelBookingDialog {...props} disabled/>);
 expect(screen.getByRole('button',{name:'Xác nhận hủy'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận hủy'}));
 expect(props.cancelBooking).not.toHaveBeenCalled();
});

it('rechecks the clock on confirmation even before the next parent timer tick',()=>{
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse('2099-09-30T23:59:59Z'));
 const p=setup();
 clock.mockReturnValue(Date.parse('2099-10-01T00:00:00Z'));
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận hủy'}));
 expect(p.cancelBooking).not.toHaveBeenCalled();
 expect(screen.getByRole('alert')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Quay lại'})).toBeEnabled();
});

it('can recover an uncertain cancellation with the same key after expiry',async()=>{
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse('2099-09-30T23:59:59Z'));
 const p=setup();
 p.cancelBooking.mockRejectedValue(Error('offline'));
 p.reloadBooking.mockRejectedValue(Error('offline'));
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận hủy'}));
 await screen.findByRole('alert');
 const originalArgs=p.cancelBooking.mock.calls[0];
 clock.mockReturnValue(Date.parse('2099-10-01T00:00:01Z'));
 p.reloadBooking.mockResolvedValue({...booking,status:'cancelled'});
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận hủy'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
 expect(p.cancelBooking).toHaveBeenLastCalledWith(...originalArgs);
 expect(p.onBooking).toHaveBeenCalledWith({...booking,status:'cancelled'});
 expect(p.onBlockedChange).toHaveBeenLastCalledWith(false);
});
