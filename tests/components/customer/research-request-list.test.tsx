import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ResearchRequestList } from '@/components/customer/research-request-list';
import { researchReady, researchInput, requestId, revisionId } from '../../fixtures/research-recovery';
afterEach(cleanup);
const row={id:requestId,ownerId:requestId,status:'pending_review' as const,revisionId,request:researchInput,plan:researchReady.plan,createdAt:'2026-09-28T00:00:00Z',submittedAt:null,notes:null,history:[]};
it('shows actual request state and itinerary with five requests per page',async()=>{
  render(<ResearchRequestList locale="vi" service={{submit:vi.fn(),listCustomer:async()=>Array.from({length:6},(_,i)=>({...row,id:`request-${i}`}))}}/>);
  expect(await screen.findAllByText('Chờ duyệt')).toHaveLength(5);
  expect(screen.queryByText('request-5')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Trang sau'}));
  expect(screen.getByText('request-5')).toBeInTheDocument();
  expect(screen.getAllByText('Chờ duyệt')).toHaveLength(1);
});
it('shows a retryable failure rather than an empty request list',async()=>{
  const listCustomer=vi.fn().mockRejectedValueOnce(Error('UNAVAILABLE')).mockResolvedValue([row]);
  render(<ResearchRequestList locale="vi" service={{submit:vi.fn(),listCustomer}}/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được');
  fireEvent.click(screen.getByRole('button',{name:'Thử lại'}));
  expect(await screen.findByText('Chờ duyệt')).toBeInTheDocument();
});
