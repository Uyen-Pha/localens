import { afterEach,expect,it,vi } from 'vitest';
import {cleanup,render,screen,waitFor,fireEvent} from '@testing-library/react';
import { ReviewedBookingsList } from '@/components/customer/reviewed-bookings';
import type { ReviewedBookings,ReviewedBooking } from '@/lib/infrastructure/supabase/reviewed-bookings';
afterEach(cleanup);
it('shows the saved paid order and refreshes when the window regains focus',async()=>{
 const row:ReviewedBooking={id:'saved-order',departure_id:'d1700000-0000-4000-8000-000000000423',party_size:2,total_vnd:3180000,status:'confirmed',created_at:new Date().toISOString(),expires_at:new Date().toISOString(),paid_at:new Date().toISOString()};
 const list=vi.fn().mockResolvedValue([row]);const onLoaded=vi.fn();
 const service={list} as unknown as ReviewedBookings;
 render(<ReviewedBookingsList locale="vi" service={service} onLoaded={onLoaded}/>);
 await screen.findByText('Đã thanh toán');expect(screen.getByText('Đã thanh toán')).toBeInTheDocument();
 expect(screen.getByText('3.180.000 ₫',{exact:false})).toBeInTheDocument();expect(onLoaded).toHaveBeenCalledWith(1);
 fireEvent.change(screen.getByRole('textbox',{name:'Tìm đơn đặt tour'}),{target:{value:'khong-co-tour'}});expect(screen.getByText('Không có đơn phù hợp')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Xóa bộ lọc'}));fireEvent.click(screen.getByRole('button',{name:'Đã hết hạn (0)'}));expect(screen.getByText('Không có đơn phù hợp')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Tất cả (1)'}));fireEvent.click(screen.getByRole('button',{name:'Xem chi tiết'}));expect(screen.getByText('Thông tin đơn đặt tour')).toBeInTheDocument();window.dispatchEvent(new Event('focus'));await waitFor(()=>expect(list).toHaveBeenCalledTimes(2));
});

