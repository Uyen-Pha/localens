import {expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createResearchDemoAdapter} from '@/lib/infrastructure/supabase/research-demo-adapter';
import {createResearchRequestAdapter} from '@/lib/infrastructure/supabase/research-request-adapter';
import {requestId,revisionId} from '../../fixtures/research-recovery';

const booking={id:requestId,quote_id:revisionId,status:'cancelled',payment_status:'paid',party_size:2,expires_at:'2027-10-01T00:00:00Z',amount:1000000,currency:'VND',cancelled_at:null,trip_start_at:'2027-10-20T00:00:00Z'};
for(const [name,create] of [['demo',createResearchDemoAdapter],['request',createResearchRequestAdapter]] as const){
 function setup(data:unknown=booking,error:unknown=null,session:unknown={user:{id:requestId}}){
  const rpc=vi.fn().mockResolvedValue({data,error});
  const client={rpc,auth:{getSession:vi.fn().mockResolvedValue({data:{session},error:null})}} as unknown as SupabaseClient;
  return {rpc,port:create(client)};
 }
 it(`${name}: reads cancelled and optional server fields`,async()=>{
  expect(await setup().port.booking!(revisionId,false)).toEqual(booking);
 });
 it(`${name}: cancels with the research ID/key and retains paid data`,async()=>{
  const {port,rpc}=setup();
  expect(await port.cancelBooking(requestId,'retry-key')).toEqual(booking);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('research_demo_cancel_booking',{p_booking:requestId,p_idempotency_key:'retry-key'});
 });
 it(`${name}: accepts old bookings without added fields`,async()=>{
  const old={id:requestId,quote_id:revisionId,status:'confirmed',payment_status:'paid',party_size:2,expires_at:'2027-10-01T00:00:00Z',amount:1000000,currency:'VND'};
  expect(await setup({...old,status:'confirmed'}).port.booking!(revisionId,false)).toEqual({...old,status:'confirmed'});
 });
 it.each([{code:'PGRST202',message:'function missing'},{code:'42883',message:'function missing'}])(`${name}: missing RPC is unavailable`,async(error)=>{
  await expect(setup(null,error).port.cancelBooking(requestId,'key')).rejects.toThrow('CANCELLATION_UNAVAILABLE');
 });
 it(`${name}: rejects RPC errors and malformed or non-cancelled responses`,async()=>{
  await expect(setup(null,{message:'permission denied'}).port.cancelBooking(requestId,'key')).rejects.toThrow();
  await expect(setup(null).port.cancelBooking(requestId,'key')).rejects.toThrow();
  await expect(setup({...booking,status:'confirmed'}).port.cancelBooking(requestId,'key')).rejects.toThrow();
 });
 it(`${name}: rejects invalid IDs, blank keys and unauthenticated calls`,async()=>{
  const {port,rpc}=setup();
  await expect(port.cancelBooking('bad','key')).rejects.toThrow();
  await expect(port.cancelBooking(requestId,' ')).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
  const signedOut=setup(booking,null,null);
  await expect(signedOut.port.cancelBooking(requestId,'key')).rejects.toThrow('AUTH_REQUIRED');
  expect(signedOut.rpc).not.toHaveBeenCalled();
 });
}
