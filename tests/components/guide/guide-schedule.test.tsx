import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GuideSchedule } from '@/components/guide/guide-schedule';
import type { GuideOwnAssignment } from '@/lib/application/guide-assignment/contracts';

const item = (id:string, startAt:string, tourStatus = 'upcoming') => ({assignmentId:id,bookingId:id,tourVersionId:id,departureId:id,title:`Tour ${id}`,startAt,endAt:null,meetingPoint:`Điểm ${id}`,partySize:2,language:'vi',mobilityFlags:[],dietaryFlags:[],assignmentStatus:'assigned',tourStatus,itinerary:[{title:'Điểm tham quan chính thức'}]}) as GuideOwnAssignment;
afterEach(()=>{cleanup();vi.useRealTimers();});
function setup(items:GuideOwnAssignment[], detail?: (id:string)=>Promise<GuideOwnAssignment>) {
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-09-12T01:00:00Z'));
  return render(<GuideSchedule locale="vi" items={items} loading={false} error={false} onRetry={()=>{}} getDetail={detail}/>);
}
describe('UC-GUI02 month calendar',()=>{
  it('selects exact month/year, preserves status, counts monthly results and recovers from empty',()=>{
    setup([item('A','2026-09-13T01:00:00Z'),item('B','2026-08-20T01:00:00Z','completed')]);
    expect(screen.getByRole('button',{name:/Sắp tới 1/})).toHaveAttribute('aria-pressed','true');
    fireEvent.click(screen.getByRole('button',{name:/Đã hoàn thành 0/}));
    expect(screen.getByText('Không có tour phù hợp với trạng thái và thời gian đã chọn')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Chọn tháng và năm'}));
    fireEvent.change(screen.getByLabelText('Tháng'),{target:{value:'8'}});
    fireEvent.change(screen.getByLabelText('Năm'),{target:{value:'2026'}});
    fireEvent.click(screen.getByRole('button',{name:'Xem lịch'}));
    expect(screen.getByRole('button',{name:/Đã hoàn thành 1/})).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{name:/Tour B/})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Tour A/})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Hôm nay'}));
    expect(screen.getByRole('button',{name:'Chọn tháng và năm'})).toHaveTextContent('Tháng 9, 2026');
  });
  it('uses Vietnam month boundaries and clears detail when navigating',async()=>{
    setup([item('A','2026-08-31T18:00:00Z'),item('B','2026-08-31T16:00:00Z')]);
    fireEvent.click(screen.getByRole('button',{name:/Tour A/}));
    expect(await screen.findByText('Điểm tham quan chính thức')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Tháng trước'}));
    expect(screen.queryByText('Điểm tham quan chính thức')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Tour B/})).toBeInTheDocument();
  });
  it('keeps calendar on detail failure and supports retry',async()=>{
    const detail=vi.fn().mockRejectedValueOnce(Error('private')).mockResolvedValue(item('A','2026-09-13T01:00:00Z'));
    setup([item('A','2026-09-13T01:00:00Z')],detail);
    fireEvent.click(screen.getByRole('button',{name:/Tour A/}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải thông tin tour. Vui lòng thử lại sau');
    expect(document.body).not.toHaveTextContent('private');
    fireEvent.click(screen.getByRole('button',{name:'Thử lại chi tiết'}));
    expect(await screen.findByText('Điểm tham quan chính thức')).toBeInTheDocument();
  });
  it('ignores late detail responses after changing month',async()=>{
    let resolve!:(value:GuideOwnAssignment)=>void;
    const detail=vi.fn(()=>new Promise<GuideOwnAssignment>(done=>{resolve=done;}));
    setup([item('A','2026-09-13T01:00:00Z')],detail);
    fireEvent.click(screen.getByRole('button',{name:/Tour A/}));
    fireEvent.click(screen.getByRole('button',{name:'Tháng sau'}));
    resolve(item('A','2026-09-13T01:00:00Z'));
    await waitFor(()=>expect(screen.queryByText('Điểm tham quan chính thức')).not.toBeInTheDocument());
  });
});
