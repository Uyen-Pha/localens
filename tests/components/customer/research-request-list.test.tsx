import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ResearchRequestList } from '@/components/customer/research-request-list';
import { researchReady, researchInput, requestId, revisionId } from '../../fixtures/research-recovery';
afterEach(cleanup);
const row={id:requestId,ownerId:requestId,status:'pending_review' as const,revisionId,request:researchInput,plan:researchReady.plan,createdAt:'2026-09-28T00:00:00Z',submittedAt:null,notes:null,history:[]};
it('renders the reference table with separate detail and quote payment links',async()=>{
 const quote={id:revisionId,title:'Báo giá',amount:1000000,currency:'VND' as const,conditions:'Included',status:'checkout_pending' as const,createdAt:'2026-09-28T00:00:00Z',expiresAt:'2099-10-09T00:00:00Z'};
 render(<ResearchRequestList locale="vi" service={{cancelBooking:vi.fn(),submit:vi.fn(),listCustomer:async()=>[{...row,status:'approved',quotes:[quote]}]}}/>);
 expect(await screen.findByRole('link',{name:'Thanh toán'})).toHaveAttribute('href',`/vi/personalized-payment?request=${requestId}&quote=${revisionId}`);
 expect(screen.getByRole('table')).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'Xem chi tiết'})).toHaveAttribute('href',`/vi/personalized-request?request=${requestId}`);
});
it('shows actual request state and itinerary with five requests per page',async()=>{
  render(<ResearchRequestList locale="vi" service={{cancelBooking:vi.fn(),submit:vi.fn(),listCustomer:async()=>Array.from({length:6},(_,i)=>({...row,id:`request-${i}`}))}}/>);
  expect(await screen.findAllByText('Chờ duyệt',{selector:'span'})).toHaveLength(5);
  expect(screen.queryByText('request-5')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Trang sau'}));
  expect(screen.getByText('request-5')).toBeInTheDocument();
  expect(screen.getAllByText('Chờ duyệt',{selector:'span'})).toHaveLength(1);
});
it('shows a retryable failure rather than an empty request list',async()=>{
  const listCustomer=vi.fn().mockRejectedValueOnce(Error('UNAVAILABLE')).mockResolvedValue([row]);
  render(<ResearchRequestList locale="vi" service={{cancelBooking:vi.fn(),submit:vi.fn(),listCustomer}}/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được');
  fireEvent.click(screen.getByRole('button',{name:'Thử lại'}));
  expect(await screen.findByText('Chờ duyệt',{selector:'span'})).toBeInTheDocument();
});
it('searches requests, filters status and resets pagination', async()=>{
  const rows=Array.from({length:6},(_,i)=>({...row,id:`request-${i}`,status:i===5?'approved' as const:row.status}));
  render(<ResearchRequestList locale="vi" service={{cancelBooking:vi.fn(),submit:vi.fn(),listCustomer:async()=>rows}}/>);
  await screen.findByText('request-0');
  fireEvent.click(screen.getByRole('button',{name:'Trang sau'}));
  fireEvent.change(screen.getByRole('searchbox',{name:'Tìm yêu cầu'}),{target:{value:'request-0'}});
  expect(screen.getByText('request-0')).toBeInTheDocument();
  expect(screen.queryByText('request-5')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox',{name:'Tìm yêu cầu'}),{target:{value:''}});
  fireEvent.change(screen.getByRole('combobox',{name:'Trạng thái yêu cầu'}),{target:{value:'approved'}});
  expect(screen.getByText('request-5')).toBeInTheDocument();
  expect(screen.queryByText('request-0')).not.toBeInTheDocument();
});
it('refreshes and sorts requests without claiming an approved request is paid',async()=>{
  const listCustomer=vi.fn().mockResolvedValue([{...row,id:'older',status:'approved',createdAt:'2026-09-20T00:00:00Z'},{...row,id:'newer'}]);
  render(<ResearchRequestList locale="en" service={{cancelBooking:vi.fn(),submit:vi.fn(),listCustomer}}/>);
  await screen.findByText('older');
  expect(screen.getAllByRole('row')[1]).toHaveTextContent('newer');
  fireEvent.change(screen.getByRole('combobox',{name:'Sort requests'}),{target:{value:'oldest'}});
  expect(screen.getAllByRole('row')[1]).toHaveTextContent('older');
  expect(screen.queryByRole('link',{name:/pay/i})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Refresh requests'}));
  await screen.findByText('older');
  expect(listCustomer).toHaveBeenCalledTimes(2);
});
