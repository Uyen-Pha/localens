import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeGuidePortal } from '@/components/guide/runtime-guide-portal';
import type { GuidePersonalProfile, GuideProfilePort } from '@/lib/application/portal/guide-profile';
import type { RuntimeGuideAssignmentPort } from '@/lib/application/guide-assignment/contracts';

const profile: GuidePersonalProfile = {displayName:'Guide One',email:'guide@test.invalid',phone:'+84912345678',contactAddress:'TP. Hồ Chí Minh',bio:'a'.repeat(100),language:'vi',operatingArea:'Quận 1',joinedAt:'2026-09-01T00:00:00Z'};
const session = {userId:'guide',displayName:'Guide One',email:'guide@test.invalid',role:'guide' as const,locale:'vi' as const};
const assignments: RuntimeGuideAssignmentPort = {listOwnAssignments:async()=>[],listAdminQueue:async()=>[],listEligibleGuides:async()=>[],assignGuide:async()=>{throw Error('unused');}};
function setup(save = vi.fn(async()=>profile)) {
  const port: GuideProfilePort = {load:async()=>profile,save};
  render(<RuntimeGuidePortal locale="vi" session={session} profilePort={port} assignments={assignments}/>);
  fireEvent.click(screen.getByRole('button',{name:/^Thông tin cá nhân/}));
  return save;
}
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});
afterEach(cleanup);
describe('guide personal profile',()=>{
  it('warns on a reload only while dirty',async()=>{
    setup();
    fireEvent.click(await screen.findByRole('button',{name:'Chỉnh sửa Địa chỉ liên hệ'}));
    fireEvent.change(screen.getByLabelText('Địa chỉ liên hệ'),{target:{value:'Chưa lưu'}});
    const event = new Event('beforeunload',{cancelable:true});
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button',{name:'Hủy'}));
    const clean = new Event('beforeunload',{cancelable:true});
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });
  it('keeps company fields read-only and only edits the selected field',async()=>{
    setup();
    fireEvent.click(await screen.findByRole('button',{name:'Chỉnh sửa Số điện thoại'}));
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('button',{name:'Chỉnh sửa Họ và tên'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Chỉnh sửa Email'})).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Số điện thoại'),{target:{value:'+84999888777'}});
    fireEvent.click(screen.getByRole('button',{name:'Hủy'}));
    expect(screen.getByText('+84912345678')).toBeInTheDocument();
  });
  it('validates biography before saving',async()=>{
    const save=setup();
    fireEvent.click(await screen.findByRole('button',{name:'Chỉnh sửa Tiểu sử ngắn'}));
    fireEvent.change(screen.getByLabelText('Tiểu sử ngắn'),{target:{value:'short'}});
    fireEvent.click(screen.getByRole('button',{name:'Lưu'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('100 đến 1.000');
    expect(save).not.toHaveBeenCalled();
  });
  it('preserves input on duplicate or connection failure',async()=>{
    setup(vi.fn().mockRejectedValue(new Error('duplicate')));
    fireEvent.click(await screen.findByRole('button',{name:'Chỉnh sửa Số điện thoại'}));
    fireEvent.change(screen.getByLabelText('Số điện thoại'),{target:{value:'+84999888777'}});
    fireEvent.click(screen.getByRole('button',{name:'Lưu'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('đã được sử dụng');
    expect(screen.getByLabelText('Số điện thoại')).toHaveValue('+84999888777');
  });
  it('saves only one field and shows returned data',async()=>{
    const save=setup(vi.fn(async()=>({...profile,contactAddress:'Địa chỉ mới'})));
    fireEvent.click(await screen.findByRole('button',{name:'Chỉnh sửa Địa chỉ liên hệ'}));
    fireEvent.change(screen.getByLabelText('Địa chỉ liên hệ'),{target:{value:'Địa chỉ mới'}});
    fireEvent.click(screen.getByRole('button',{name:'Lưu'}));
    await waitFor(()=>expect(save).toHaveBeenCalledWith('contactAddress','Địa chỉ mới'));
    expect(await screen.findByText('Địa chỉ mới')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  it('warns before switching sections with dirty input',async()=>{
    setup();
    fireEvent.click(await screen.findByRole('button',{name:'Chỉnh sửa Địa chỉ liên hệ'}));
    fireEvent.change(screen.getByLabelText('Địa chỉ liên hệ'),{target:{value:'Chưa lưu'}});
    fireEvent.click(screen.getByRole('button',{name:/^Phân công tour/}));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Ở lại'}));
    expect(screen.getByLabelText('Địa chỉ liên hệ')).toHaveValue('Chưa lưu');
  });
});

describe('guide schedule',()=>{
  it('filters by Vietnam dates and selects the corresponding details',async()=>{
    vi.useFakeTimers({toFake:['Date']});
    vi.setSystemTime(new Date('2026-09-12T01:00:00Z'));
    const make = (id:string,startAt:string) => ({assignmentId:id,bookingId:id,tourVersionId:id,departureId:id,title:`Tour ${id}`,startAt,endAt:null,meetingPoint:`Điểm ${id}`,partySize:2,language:'vi' as const,mobilityFlags:[],dietaryFlags:[],assignmentStatus:'assigned' as const});
    try {
      render(<RuntimeGuidePortal locale="vi" session={session} assignments={{...assignments,listOwnAssignments:async()=>[make('A','2026-09-12T02:00:00Z'),make('B','2026-09-12T18:00:00Z')]}}/>);
      await screen.findAllByText('Tour A');
      fireEvent.click(screen.getByRole('button',{name:'Hôm nay'}));
      expect(screen.getByRole('button',{name:/Tour B/})).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button',{name:/Tour B/}));
      await waitFor(()=>expect(screen.getAllByText('Tour B')).toHaveLength(2));
    } finally { vi.useRealTimers(); }
  });
  it('keeps failed loads separate from an empty schedule',async()=>{
    render(<RuntimeGuidePortal locale="vi" session={session} assignments={{...assignments,listOwnAssignments:async()=>{throw Error('private');}}}/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải lịch phân công');
    expect(screen.queryByText(/Bạn chưa có tour/)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('private');
  });
});
