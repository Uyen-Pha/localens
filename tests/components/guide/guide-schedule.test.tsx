import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
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
  it('reconciles a departure crossed between render and the initial passive effect',()=>{
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T01:00:00.999Z'));
    const items=[item('A','2026-09-12T01:00:01Z')];
    function Parent() {
      useLayoutEffect(()=>{
        expect(screen.getByRole('button',{name:'Sắp tới 1'})).toBeInTheDocument();
        vi.setSystemTime(new Date('2026-09-12T01:00:01.001Z'));
      },[]);
      return <GuideSchedule locale="vi" items={items} loading={false} error={false} onRetry={()=>{}}/>;
    }
    render(<Parent/>);
    expect(screen.getByRole('button',{name:'Sắp tới 0'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Đã khởi hành 1'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Tour A/})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Đã hoàn thành 0'})).toBeInTheDocument();
    expect(items[0].assignmentStatus).toBe('assigned');
  });
  it('updates at each departure boundary without interaction or completing assignments',()=>{
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T01:00:00Z'));
    const items=[item('A','2026-09-12T01:00:01Z'),item('B','2026-09-12T01:00:02Z'),item('C','2026-09-12T01:00:01Z','cancelled'),item('D','2026-09-12T01:00:01Z','completed')];
    const onRetry=vi.fn();
    const {unmount}=render(<GuideSchedule locale="vi" items={items} loading={false} error={false} onRetry={onRetry}/>);
    act(()=>vi.advanceTimersByTime(999));
    expect(screen.getByRole('button',{name:'Sắp tới 2'})).toBeInTheDocument();
    act(()=>vi.advanceTimersByTime(1));
    expect(screen.getByRole('button',{name:'Sắp tới 1'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Đã khởi hành 1'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Tour A/})).not.toBeInTheDocument();
    act(()=>vi.advanceTimersByTime(1000));
    expect(screen.getByRole('button',{name:'Đã khởi hành 2'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Đã hoàn thành 1'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Đã hủy 1'})).toBeInTheDocument();
    expect(items[0].assignmentStatus).toBe('assigned');
    expect(items[0].tourStatus).toBe('upcoming');
    expect(onRetry).not.toHaveBeenCalled();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['focus','visibilitychange'])('refreshes on %s after a suspended clock and rearms the next departure',(event)=>{
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T01:00:00Z'));
    const {unmount}=render(<GuideSchedule locale="vi" items={[item('A','2026-09-12T01:00:01Z'),item('B','2026-09-12T01:00:03Z')]} loading={false} error={false} onRetry={()=>{}}/>);
    vi.setSystemTime(new Date('2026-09-12T01:00:02Z'));
    fireEvent(event==='focus'?window:document,new Event(event));
    expect(screen.getByRole('button',{name:'Đã khởi hành 1'})).toBeInTheDocument();
    act(()=>vi.advanceTimersByTime(1000));
    expect(screen.getByRole('button',{name:'Đã khởi hành 2'})).toBeInTheDocument();
    unmount();
    fireEvent(event==='focus'?window:document,new Event(event));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('separates already-started assignments from upcoming without asserting completion',()=>{
    setup([item('past','2026-09-11T01:00:00Z'),item('future','2026-09-13T01:00:00Z')]);
    expect(screen.getByRole('button',{name:/Sắp tới 1/})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Đã khởi hành 1/}));
    expect(screen.getByRole('button',{name:/Tour past/})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Tour future/})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Đã hoàn thành 0/})).toBeInTheDocument();
  });
  it('switches to a readable list while preserving selected status and detail',async()=>{
    setup([item('A','2026-09-13T01:00:00Z','cancelled')]);
    fireEvent.click(screen.getByRole('button',{name:/Đã hủy 1/}));
    fireEvent.click(screen.getByRole('button',{name:'Danh sách'}));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Tour A/}));
    expect(await screen.findByText('Tour đã hủy. Thông tin được giữ lại để tra cứu lịch sử.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Lịch'}));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Tour A/})).toHaveAttribute('aria-pressed','true');
    expect(screen.getByText('Điểm tham quan chính thức')).toBeInTheDocument();
  });
  it('refreshes explicitly and prevents duplicate refreshes while loading',()=>{
    const onRetry=vi.fn();
    const props={locale:'vi' as const,items:[],error:false,onRetry};
    const {rerender}=render(<GuideSchedule {...props} loading={false}/>);
    fireEvent.click(screen.getByRole('button',{name:'Làm mới'}));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<GuideSchedule {...props} loading/>);
    expect(screen.getByRole('button',{name:'Làm mới'})).toBeDisabled();
  });
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
    fireEvent.click(screen.getByRole('button',{name:/Đã khởi hành 1/}));
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
