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
 fireEvent.change(screen.getByRole('textbox',{name:'Tìm đơn đặt tour'}),{target:{value:'khong-co-tour'}});expect(screen.getByText('Không có đơn phù hợp')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Xóa bộ lọc'}));fireEvent.click(screen.getByRole('button',{name:'Đã hết hạn (0)'}));expect(screen.getByText('Không có đơn phù hợp')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Tất cả (1)'}));expect(screen.getByRole('link',{name:'Xem chi tiết'})).toHaveAttribute('href','/vi/booking-details?booking=saved-order');window.dispatchEvent(new Event('focus'));await waitFor(()=>expect(list.mock.calls.length).toBeGreaterThanOrEqual(2));
});

it('paginates fixed-tour bookings and resets to the first page after sorting',async()=>{
 const rows:ReviewedBooking[]=Array.from({length:6},(_,index)=>({id:`saved-order-${index+1}`,departure_id:'d1700000-0000-4000-8000-000000000423',party_size:2,total_vnd:3180000,status:'confirmed',created_at:new Date(Date.UTC(2026,0,index+1,12)).toISOString(),expires_at:new Date(Date.UTC(2026,0,index+1,12)).toISOString(),paid_at:new Date(Date.UTC(2026,0,index+1,12)).toISOString()}));
 const list=vi.fn().mockResolvedValue(rows);const onLoaded=vi.fn();
 render(<ReviewedBookingsList locale="vi" service={{list} as unknown as ReviewedBookings} onLoaded={onLoaded}/>);
 await screen.findByText('saved-order-6');
 expect(screen.getByRole('heading',{name:'Tour cố định đã đặt'})).toBeInTheDocument();
 expect(screen.getByText('Trang 1 / 2')).toBeInTheDocument();
 expect(screen.queryByText('saved-order-1')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Sau'}));
 await waitFor(()=>expect(screen.getByText('Trang 2 / 2')).toBeInTheDocument());
 expect(screen.getByText('saved-order-1')).toBeInTheDocument();
 fireEvent.change(screen.getByRole('combobox',{name:'Sắp xếp đơn'}),{target:{value:'oldest'}});
 await waitFor(()=>expect(screen.getByText('Trang 1 / 2')).toBeInTheDocument());
 expect(screen.getByText('saved-order-1')).toBeInTheDocument();
 expect(screen.queryByText('saved-order-6')).not.toBeInTheDocument();
});



