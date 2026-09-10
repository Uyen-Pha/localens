import { afterEach,expect,it,vi } from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import { ReviewedBookingsList } from '@/components/customer/reviewed-bookings';
import type { ReviewedBookings,ReviewedBooking } from '@/lib/infrastructure/supabase/reviewed-bookings';
afterEach(cleanup);
it('shows the saved paid order and refreshes when the window regains focus',async()=>{
 const row:ReviewedBooking={id:'saved-order',departure_id:'d1700000-0000-4000-8000-000000000423',party_size:2,total_vnd:3180000,status:'confirmed',created_at:new Date().toISOString(),expires_at:new Date().toISOString(),paid_at:new Date().toISOString()};
 const list=vi.fn().mockResolvedValue([row]);const onLoaded=vi.fn();
 const service={list} as unknown as ReviewedBookings;
 render(<ReviewedBookingsList locale="vi" service={service} onLoaded={onLoaded}/>);
 await screen.findByText('Đã xác nhận');expect(screen.getByText('Đã thanh toán')).toBeInTheDocument();
 expect(screen.getByText('3.180.000 ₫',{exact:false})).toBeInTheDocument();expect(onLoaded).toHaveBeenCalledWith(1);
 window.dispatchEvent(new Event('focus'));await waitFor(()=>expect(list).toHaveBeenCalledTimes(2));
});
