import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResearchPlannerFlow } from '@/components/customer/research-planner-flow';
import { savePersonalizationRequest, readPersonalizationState } from '@/lib/application/planner/personalization-session';
import { researchInput, researchReady, revisionId, nextRevisionId, requestId } from '../../fixtures/research-recovery';

beforeEach(() => { window.sessionStorage.clear(); savePersonalizationRequest(researchInput); });
afterEach(()=>{cleanup();vi.restoreAllMocks();});

it('rechecks the 72-hour lead time when confirming after time has elapsed', async () => {
  vi.spyOn(Date,'now').mockReturnValue(Date.parse(researchInput.startAt)-72*60*60*1000-60000);
  savePersonalizationRequest(researchInput);
  const submit=vi.fn(async()=>requestId);
  render(<ResearchPlannerFlow locale="vi" planner={async()=>researchReady} requests={{cancelBooking:vi.fn(),submit}} actorRole="customer" actorId="customer-a"/>);
  fireEvent.click(await screen.findByRole('checkbox',{name:'Tôi đồng ý với lịch trình này.'}));
  vi.mocked(Date.now).mockReturnValue(Date.parse(researchInput.startAt)-72*60*60*1000+1);
  fireEvent.click(screen.getByRole('button',{name:'Xác nhận & Gửi yêu cầu'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('72');
  expect(submit).not.toHaveBeenCalled();
});

it('requires agreement, submits the current revision once, and shows pending review only on success', async () => {
  const planner = vi.fn(async () => researchReady);
  const submit = vi.fn(async () => requestId);
  render(<ResearchPlannerFlow locale="vi" planner={planner} requests={{ cancelBooking:vi.fn(),submit }} actorRole="customer" actorId="customer-a" />);
  const send = await screen.findByRole('button', { name: 'Xác nhận & Gửi yêu cầu' });
  expect(send).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đồng ý với lịch trình này.' }));
  fireEvent.click(send); fireEvent.click(send);
  await screen.findByText('Trạng thái: Chờ duyệt');
  expect(submit).toHaveBeenCalledExactlyOnceWith(revisionId);
});

it('deduplicates initial generation under StrictMode and resumes on return', async () => {
  const planner = Object.assign(vi.fn(async () => researchReady), { resume: vi.fn(async () => researchReady) });
  const first = render(<StrictMode><ResearchPlannerFlow locale="vi" planner={planner} actorRole="customer" actorId="customer-a" /></StrictMode>);
  await screen.findByText('Điểm tham quan A');
  expect(planner).toHaveBeenCalledTimes(1);
  first.unmount();
  render(<ResearchPlannerFlow locale="vi" planner={planner} actorRole="customer" actorId="customer-a" />);
  await waitFor(() => expect(planner.resume).toHaveBeenCalledExactlyOnceWith(revisionId));
  expect(planner).toHaveBeenCalledTimes(1);
});

it('does not generate for non-customer accounts', async () => {
  const planner = vi.fn(async () => researchReady);
  render(<ResearchPlannerFlow locale="vi" planner={planner} actorRole="guide" actorId="guide-a" />);
  await screen.findByText(/Chỉ tài khoản khách hàng/);
  expect(planner).not.toHaveBeenCalled();
});

it('retains the itinerary after submission fails and allows retry', async () => {
  const submit = vi.fn().mockRejectedValueOnce(new Error('REQUEST_SUBMIT_FAILED')).mockResolvedValue(requestId);
  render(<ResearchPlannerFlow locale="vi" planner={async () => researchReady} requests={{ cancelBooking:vi.fn(),submit }} actorRole="customer" actorId="customer-a" />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Tôi đồng ý với lịch trình này.' }));
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận & Gửi yêu cầu' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('Trạng thái: Chờ duyệt')).not.toBeInTheDocument();
  expect(screen.getByText('Điểm tham quan A')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận & Gửi yêu cầu' }));
  await screen.findByText('Trạng thái: Chờ duyệt');
});

it('requires agreement again after a saved adjustment and submits the new revision', async () => {
  const next = { ...researchReady, revisionId: nextRevisionId, revisionNumber: 2 };
  const planner = Object.assign(vi.fn(async () => researchReady), {
    suggest: vi.fn(async () => ({ status: 'suggestions' as const, suggestions: [{ id: 'cheaper-1', label: 'Phương án tiết kiệm', stopIds: ['LL-R01'], plan: researchReady.plan, delta: { costVnd: 0, travelMinutes: 0, durationMinutes: 0 }, pace: 'relaxed' as const }] })),
    refine: vi.fn(async () => next),
  });
  const submit = vi.fn(async () => requestId);
  render(<ResearchPlannerFlow locale="vi" planner={planner} requests={{ cancelBooking:vi.fn(),submit }} actorRole="customer" actorId="customer-a" />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Tôi đồng ý với lịch trình này.' }));
  fireEvent.click(screen.getByRole('button', { name: 'Điều chỉnh lịch trình' }));
  fireEvent.click(screen.getByRole('button', { name: 'Tiết kiệm hơn' }));
  fireEvent.click(await screen.findByRole('radio'));
  fireEvent.click(screen.getByRole('button', { name: 'Áp dụng thay đổi' }));
  await screen.findByText('Phiên bản 2');
  expect(screen.getByRole('button', { name: 'Xác nhận & Gửi yêu cầu' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đồng ý với lịch trình này.' }));
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận & Gửi yêu cầu' }));
  await waitFor(() => expect(submit).toHaveBeenCalledExactlyOnceWith(nextRevisionId));
});

it('loads advanced place options and preserves the saved itinerary when an edit is rejected', async () => {
  const edit = vi.fn(async () => ({status:'invalid' as const,reasons:['duration']}));
  const options = vi.fn(async () => ({request:researchInput,options:[{id:'LL-R01',name:'Điểm tham quan A',durationMinutes:40}],revisionNumber:1}));
  const planner = Object.assign(vi.fn(async () => researchReady),{options,edit});
  render(<ResearchPlannerFlow locale="vi" planner={planner} actorRole="customer" actorId="customer-a" />);
  fireEvent.click(await screen.findByRole('button',{name:'Điều chỉnh lịch trình'}));
  fireEvent.click(screen.getByRole('button',{name:'Chỉnh nâng cao'}));
  fireEvent.click(await screen.findByRole('button',{name:'Kiểm tra & Lưu phiên bản mới'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Thời lượng chưa đủ');
  expect(edit).toHaveBeenCalledWith(expect.objectContaining({revisionId,stopIds:['LL-R01'],startAt:'2027-10-10T09:00:00+07:00'}));
  expect(screen.getByText('Phiên bản 1')).toBeInTheDocument();
});

it('does not reuse another customer revision cache', async () => {
  const planner = Object.assign(vi.fn(async()=>researchReady),{resume:vi.fn(async()=>researchReady)});
  const a=render(<ResearchPlannerFlow locale="vi" planner={planner} actorRole="customer" actorId="customer-a" />);
  await screen.findByText('Điểm tham quan A'); a.unmount();
  render(<ResearchPlannerFlow locale="vi" planner={planner} actorRole="customer" actorId="customer-b" />);
  await screen.findByText('Điểm tham quan A');
  expect(planner).toHaveBeenCalledTimes(2);
  expect(planner.resume).not.toHaveBeenCalled();
});

it('does not regenerate when resuming an already submitted itinerary', async () => {
  const planner=Object.assign(vi.fn(async()=>researchReady),{resume:vi.fn(async()=>({...researchReady,submittedRequestId:requestId}))});
  const a=render(<ResearchPlannerFlow locale="vi" planner={planner} actorRole="customer" actorId="customer-a" />);
  await screen.findByText('Điểm tham quan A'); a.unmount();
  render(<ResearchPlannerFlow locale="vi" planner={planner} actorRole="customer" actorId="customer-a" requests={{cancelBooking:vi.fn(),submit:vi.fn()}} />);
  await screen.findByText('Yêu cầu đã được gửi');
  expect(screen.queryByText('Trạng thái: Chờ duyệt')).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Xác nhận & Gửi yêu cầu'})).not.toBeInTheDocument();
  expect(planner).toHaveBeenCalledTimes(1);
});

it('does not attach a late edit result to a newly prepared request',async()=>{
  let resolve!: (value:typeof researchReady)=>void;
  const planner=Object.assign(vi.fn(async()=>researchReady),{
    options:async()=>({request:researchInput,options:[{id:'LL-R01',name:'Điểm A',durationMinutes:40}]}),
    edit:()=>new Promise<typeof researchReady>(r=>{resolve=r;}),
  });
  const old=render(<ResearchPlannerFlow locale="vi" planner={planner} actorRole="customer" actorId="customer-a"/>);
  fireEvent.click(await screen.findByRole('button',{name:'Điều chỉnh lịch trình'}));
  fireEvent.click(screen.getByRole('button',{name:'Chỉnh nâng cao'}));
  fireEvent.click(await screen.findByRole('button',{name:'Kiểm tra & Lưu phiên bản mới'}));
  old.unmount(); savePersonalizationRequest({...researchInput,partySize:3});
  const saved=readPersonalizationState(); if(saved.status!=='ok')throw Error('fixture');
  await act(async()=>resolve({...researchReady,revisionId:nextRevisionId,revisionNumber:2}));
  expect(window.sessionStorage.getItem(`localens.research.revision.customer-a.${saved.handoffId}`)).toBeNull();
});

it('reloads a conflicting revision and requires agreement again before resubmitting',async()=>{
  const planner=Object.assign(vi.fn(async()=>researchReady),{resume:vi.fn(async()=>({...researchReady,revisionId:nextRevisionId,revisionNumber:2}))});
  const submit=vi.fn().mockRejectedValueOnce(Error('REVISION_CONFLICT')).mockResolvedValue(requestId);
  render(<ResearchPlannerFlow locale="vi" planner={planner} requests={{cancelBooking:vi.fn(),submit}} actorRole="customer" actorId="customer-a"/>);
  fireEvent.click(await screen.findByRole('checkbox',{name:'Tôi đồng ý với lịch trình này.'}));
  fireEvent.click(screen.getByRole('button',{name:'Xác nhận & Gửi yêu cầu'}));
  await screen.findByText('Phiên bản 2');
  expect(screen.getByRole('button',{name:'Xác nhận & Gửi yêu cầu'})).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox',{name:'Tôi đồng ý với lịch trình này.'}));
  fireEvent.click(screen.getByRole('button',{name:'Xác nhận & Gửi yêu cầu'}));
  await waitFor(()=>expect(submit).toHaveBeenLastCalledWith(nextRevisionId));
});

it('accepts existing 90 minute duration in advanced editing',async()=>{
  const planner=Object.assign(vi.fn(async()=>researchReady),{options:async()=>({request:{...researchInput,durationMinutes:90},options:[{id:'LL-R01',name:'A',durationMinutes:40}]}),edit:vi.fn()});
  render(<ResearchPlannerFlow locale="vi" planner={planner} actorRole="customer" actorId="customer-a"/>);
  fireEvent.click(await screen.findByRole('button',{name:'Điều chỉnh lịch trình'}));
  fireEvent.click(screen.getByRole('button',{name:'Chỉnh nâng cao'}));
  const duration=await screen.findByRole('spinbutton',{name:'Thời lượng tối đa (phút)'});
  expect((duration as HTMLInputElement).checkValidity()).toBe(true);
  fireEvent.change(duration,{target:{value:'660'}});
  expect((duration as HTMLInputElement).checkValidity()).toBe(true);
});
