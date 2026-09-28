import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,it,expect} from 'vitest';
import {RuntimeBookingManagement} from '@/components/admin/runtime-booking-management';
afterEach(cleanup);
it('filters runtime orders and opens the selected order without inventing payment data',async()=>{
 render(<RuntimeBookingManagement locale="vi" bookingManagement={{listAdminBookings:async()=>[
 {bookingId:'order-a',customerUserId:'customer-a',sourceKind:'departure',titleVi:'Dấu ấn Sài Gòn',titleEn:'Saigon',bookingStatus:'confirmed',createdAt:'2026-09-28T01:00:00Z',cancellation:null},
 {bookingId:'order-b',customerUserId:'customer-b',sourceKind:'quote',titleVi:'Chợ Lớn',titleEn:'Market',bookingStatus:'pending_payment',createdAt:'2026-09-28T02:00:00Z',cancellation:null}
 ]}}/>);
 const table=await screen.findByRole('table');
 fireEvent.change(screen.getByLabelText('Từ khóa'),{target:{value:'order-a'}});
 expect(within(table).queryByText('order-b')).not.toBeInTheDocument();
 fireEvent.click(within(table).getByRole('button',{name:'Xem chi tiết order-a'}));
 expect(screen.getByRole('region',{name:'Chi tiết đơn đang chọn'})).toHaveTextContent('customer-a');
});
