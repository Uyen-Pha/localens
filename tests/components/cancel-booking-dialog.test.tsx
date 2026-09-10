import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {CancelBookingDialog} from '@/components/customer/cancel-booking-dialog';
import type {ReviewedBooking,ReviewedBookings} from '@/lib/infrastructure/supabase/reviewed-bookings';
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});
afterEach(cleanup);
const booking={id:'owned',status:'confirmed'} as ReviewedBooking;
function setup(cancel=vi.fn()) {const onClose=vi.fn(),onCancelled=vi.fn();render(<CancelBookingDialog locale="vi" booking={booking} service={{cancel} as unknown as ReviewedBookings} onClose={onClose} onCancelled={onCancelled}/>);return {cancel,onClose,onCancelled};}
it('does not cancel when opened or when going back',()=>{const x=setup();expect(x.cancel).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Quay lại'}));expect(x.onClose).toHaveBeenCalledOnce();expect(x.cancel).not.toHaveBeenCalled();});
it('cancels only after confirmation and returns the saved booking',async()=>{const saved={...booking,status:'cancelled'};const x=setup(vi.fn().mockResolvedValue(saved));fireEvent.click(screen.getByRole('button',{name:'Hủy đơn'}));await vi.waitFor(()=>expect(x.onCancelled).toHaveBeenCalledWith(saved));expect(x.cancel).toHaveBeenCalledExactlyOnceWith('owned');expect(x.onClose).toHaveBeenCalledOnce();});
it('keeps the dialog open when cancellation fails',async()=>{const x=setup(vi.fn().mockRejectedValue(Error('CANCEL_NOT_ALLOWED')));fireEvent.click(screen.getByRole('button',{name:'Hủy đơn'}));expect(await screen.findByRole('alert')).toHaveTextContent('48 giờ');expect(x.onClose).not.toHaveBeenCalled();expect(x.onCancelled).not.toHaveBeenCalled();});
