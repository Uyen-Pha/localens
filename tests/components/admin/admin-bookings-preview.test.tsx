import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {AdminBookingsPreview} from '@/components/admin/admin-bookings-preview';
import {bookingPreviewPort} from '@/components/dev/admin-bookings-fixture';
import {filterBookings,emptyBookingFilters} from '@/lib/application/admin-bookings-preview';
afterEach(cleanup);
it('combines filters and leaves source bookings unchanged',async()=>{
 const rows=await bookingPreviewPort.list(),before=JSON.stringify(rows);
 const result=filterBookings(rows,{...emptyBookingFilters,query:'le quoc bao',payment:'review',from:'2026-09-13',to:'2026-09-13'});
 expect(result.map(r=>r.id)).toEqual(['LL-OD-003']);expect(JSON.stringify(rows)).toBe(before);
 expect(filterBookings(rows,{...emptyBookingFilters,kind:'personalized',status:'completed'})).toEqual([]);
});
it('shows review transaction and history without mutation controls',async()=>{
 render(<AdminBookingsPreview/>);await screen.findByRole('button',{name:'Xem chi tiết LL-OD-003'});
 fireEvent.click(screen.getByRole('button',{name:'Xem chi tiết LL-OD-003'}));
 await screen.findByText('DEMO-TXN-102');expect(screen.getByText('Lịch sử xử lý')).toBeInTheDocument();
 expect(screen.getByText(/Trạng thái sẽ được cập nhật bởi luồng thanh toán/)).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/Hủy đơn|Hoàn tiền|Xác nhận thanh toán/})).not.toBeInTheDocument();
});
it('shows an empty result and resets filters',async()=>{
 render(<AdminBookingsPreview/>);await screen.findByRole('button',{name:'Xem chi tiết LL-OD-001'});
 fireEvent.change(screen.getByLabelText('Từ khóa'),{target:{value:'khong-co-don-nay'}});
 expect(screen.getByText('Không có đơn đặt tour phù hợp')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Xóa bộ lọc'}));expect(screen.getByRole('button',{name:'Xem chi tiết LL-OD-001'})).toBeInTheDocument();
});
it('reports list failure and supports retry',async()=>{
 const list=vi.fn().mockRejectedValueOnce(Error()).mockResolvedValue(await bookingPreviewPort.list());
 render(<AdminBookingsPreview port={{list,detail:bookingPreviewPort.detail}}/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải danh sách đơn đặt tour');
 fireEvent.click(screen.getByRole('button',{name:'Thử lại'}));await screen.findByRole('button',{name:'Xem chi tiết LL-OD-001'});
});
it('does not leave stale detail visible after detail failure',async()=>{
 render(<AdminBookingsPreview port={{list:bookingPreviewPort.list,detail:vi.fn().mockRejectedValue(Error())}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Xem chi tiết LL-OD-001'}));
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải thông tin đơn đặt tour'));
});
