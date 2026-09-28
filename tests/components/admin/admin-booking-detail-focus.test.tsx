import {cleanup,fireEvent,render,screen,within,waitFor} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {AdminBookingsPreview} from '@/components/admin/admin-bookings-preview';
afterEach(cleanup);
it('brings the selected order detail into keyboard focus for every selection',async()=>{
 render(<AdminBookingsPreview/>);
 fireEvent.click(await screen.findByRole('button',{name:'Xem chi tiết LL-OD-001'}));
 const detail=screen.getByRole('region',{name:'Chi tiết đơn đang chọn'});
 await waitFor(()=>expect(detail).toHaveFocus());
 expect(within(detail).getByRole('heading',{name:/Chi tiết đơn đang chọn LL-OD-001/})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Xem chi tiết LL-OD-002'}));
 await waitFor(()=>expect(within(detail).getByRole('heading',{name:/Chi tiết đơn đang chọn LL-OD-002/})).toBeVisible());
 expect(detail).toHaveFocus();
});
