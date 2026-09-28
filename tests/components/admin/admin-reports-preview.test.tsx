import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {AdminReportsPreview} from '@/components/admin/admin-reports-preview';
import {reportsPreviewPort} from '@/components/dev/admin-reports-fixture';
import {summarizeReports} from '@/lib/application/admin-reports-preview';
afterEach(cleanup);
it('aggregates eligible orders separately from all orders and payments',async()=>{
 const data=await reportsPreviewPort.load(),before=JSON.stringify(data);const r=summarizeReports(data,{from:'2026-08-01',to:'2026-10-31',kind:''});
 expect(r.bookings).toHaveLength(10);expect(r.validCount).toBe(5);expect(r.personalizedCount).toBe(2);expect(r.cancelled).toBe(1);expect(r.top.reduce((n,v)=>n+v[1],0)).toBe(5);expect(r.payments.reduce((n,p)=>n+p.count,0)).toBe(10);expect(r.quoted).toBe(2);expect(r.converted).toBe(2);expect(r.conversion).toBe(25);expect(JSON.stringify(data)).toBe(before);
});
it('counts converted requests once and excludes cancelled linked bookings',async()=>{
 const data=await reportsPreviewPort.load();data.requests.forEach(request=>{delete request.bookingId;request.quoted=false;});data.bookings[0].kind='personalized';data.requests[0].bookingId=data.bookings[0].id;data.requests[1].bookingId=data.bookings[4].id;
 const r=summarizeReports(data,{from:'',to:'',kind:''});expect(r.converted).toBe(1);expect(r.conversion).toBe(12.5);
});
it('handles inclusive date filters and fixed-tour request scope',async()=>{
 const data=await reportsPreviewPort.load();const r=summarizeReports(data,{from:'2026-09-15',to:'2026-09-15',kind:'fixed'});expect(r.bookings).toHaveLength(1);expect(r.requests).toEqual([]);
});
it('fills every month in the selected period with zero rows when there are no bookings',async()=>{
 const data=await reportsPreviewPort.load();const r=summarizeReports(data,{from:'2026-04-01',to:'2026-09-30',kind:''});
 expect(r.months.map((month)=>month.month)).toEqual(['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09']);
 expect(r.months.slice(0,4).every((month)=>month.count===0&&month.value===0&&month.cancelled===0)).toBe(true);
 expect(r.months.slice(-2).map((month)=>month.count)).toEqual([4,6]);
});
it('shows no data and clears filters',async()=>{
 render(<AdminReportsPreview/>);await screen.findByText('Tour được đặt nhiều nhất');fireEvent.change(screen.getByLabelText('Từ ngày'),{target:{value:'2027-01-01'}});fireEvent.change(screen.getByLabelText('Đến ngày'),{target:{value:'2027-02-01'}});expect(screen.getByText('Không có dữ liệu phù hợp')).toBeInTheDocument();fireEvent.click(screen.getByText('Xem tất cả dữ liệu'));expect(screen.getByText('Tour được đặt nhiều nhất')).toBeInTheDocument();
});
it('shows report load error and retries',async()=>{
 const load=vi.fn().mockRejectedValueOnce(Error()).mockResolvedValue(await reportsPreviewPort.load());render(<AdminReportsPreview port={{load}}/>);expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải dữ liệu báo cáo');fireEvent.click(screen.getByText('Thử lại'));await screen.findByText('Tour được đặt nhiều nhất');
});
