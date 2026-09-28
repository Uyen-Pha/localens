import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createResearchRequestAdapter } from '@/lib/infrastructure/supabase/research-request-adapter';
import { requestId, revisionId, researchInput, researchReady } from '../../fixtures/research-recovery';

function setup(data:unknown,error:unknown=null) {
  const rpc=vi.fn(async()=>({data,error}));
  const client={auth:{getSession:async()=>({data:{session:{user:{id:'a'}}},error:null})},rpc} as unknown as SupabaseClient;
  return {rpc,adapter:createResearchRequestAdapter(client)};
}
it('uses the deployed customer list RPC and returns validated requests',async()=>{
  const c=setup([{id:requestId,ownerId:requestId,status:'pending_review',revisionId,request:researchInput,plan:researchReady.plan,createdAt:'2026-09-28T00:00:00Z',submittedAt:null,notes:null,history:[]}]);
  expect((await c.adapter.listCustomer!())[0].status).toBe('pending_review');
  expect(c.rpc).toHaveBeenCalledExactlyOnceWith('research_demo_list',{p_admin:false});
});
it('submits only the server revision ID',async()=>{
  const c=setup(requestId);
  expect(await c.adapter.submit(revisionId)).toBe(requestId);
  expect(c.rpc).toHaveBeenCalledExactlyOnceWith('research_demo_submit',{p_revision_id:revisionId});
});
it('reports revision conflicts rather than success',async()=>{
  await expect(setup(null,{message:'Use latest itinerary'}).adapter.submit(revisionId)).rejects.toThrow('REVISION_CONFLICT');
});
it('rejects malformed list data rather than claiming there are no requests',async()=>{
  await expect(setup([{id:requestId}]).adapter.listCustomer!()).rejects.toThrow('INVALID_RESPONSE');
});
it('does not send invalid revision IDs to the database',async()=>{
  const c=setup(requestId);
  await expect(c.adapter.submit('not-an-id')).rejects.toThrow('INVALID_REVISION');
  expect(c.rpc).not.toHaveBeenCalled();
});
it('preserves quotes and processing deadlines returned by the existing list RPC',async()=>{
 const quote={id:revisionId,title:'Báo giá',amount:1000000,currency:'VND',conditions:'Included',status:'checkout_pending',createdAt:'2026-09-28T00:00:00Z',expiresAt:'2027-10-09T00:00:00Z'};
 const c=setup([{id:requestId,ownerId:requestId,status:'approved',revisionId,request:researchInput,plan:researchReady.plan,createdAt:'2026-09-28T00:00:00Z',submittedAt:null,processingDueAt:'2026-09-30T00:00:00Z',notes:null,history:[],quotes:[quote]}]);
 expect((await c.adapter.listCustomer!())[0]).toMatchObject({quotes:[quote],processingDueAt:'2026-09-30T00:00:00Z'});
});
it('reads a quote booking without creating one on navigation',async()=>{
 const c=setup(null);
 expect(await c.adapter.booking!(revisionId,false)).toBeNull();
 expect(c.rpc).toHaveBeenCalledExactlyOnceWith('research_demo_booking',{p_quote:revisionId,p_create:false});
});
