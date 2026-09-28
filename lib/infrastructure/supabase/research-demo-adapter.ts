import type {CheckoutDetails} from './reviewed-bookings';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {ResearchInput, ResearchPlan} from '@/lib/application/planner/research-planner';
import {createResearchRequestAdapter,researchBookingSchema} from './research-request-adapter';
import type {ResearchBooking} from './research-request-adapter';
export type {ResearchBooking} from './research-request-adapter';

export type ResearchDemoQuote = {id:string; title:string; amount:number; currency:'VND'|'USD'; conditions:string; status:'active'|'expired'|'checkout_pending'|'accepted'; createdAt:string; expiresAt:string};
export type ResearchDemoRequest = {id:string;ownerId:string;status:'pending_review'|'changes_requested'|'approved'|'rejected';revisionId:string;request:ResearchInput;plan:ResearchPlan;createdAt:string;submittedAt?:string;processingDueAt?:string;processingCompletedAt?:string|null;notes:string|null;quotes:ResearchDemoQuote[];history:{status:string;note:string|null;at:string}[]};
export type ResearchDemoPort = {
 cancelBooking(bookingId:string,idempotencyKey:string):Promise<ResearchBooking>;
 booking?:(quoteId:string,create:boolean)=>Promise<ResearchBooking|null>;
 checkout?:(quoteId:string,details:CheckoutDetails)=>Promise<ResearchBooking>;
 beginRevision?:(requestId:string,expectedRevision:string)=>Promise<string>;
 resubmit?:(requestId:string,expectedRevision:string,revisionId:string)=>Promise<string>;
 submit(revisionId:string):Promise<string>;
 listCustomer():Promise<ResearchDemoRequest[]>;
 listAdmin():Promise<ResearchDemoRequest[]>;
 decide(requestId:string,decision:'approved'|'changes_requested'|'rejected',note:string):Promise<void>;
 createQuote(requestId:string,input:{title:string;amount:number;currency:'VND'|'USD';conditions:string}):Promise<string>;
};
export function createResearchDemoAdapter(client:SupabaseClient):ResearchDemoPort {
 async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
  const {data,error}=await client.rpc(name,args);
  if(error)throw new Error(error.message);
  return data as T;
 }
 return {
  cancelBooking:createResearchRequestAdapter(client).cancelBooking,
  booking:async(quoteId,create)=>researchBookingSchema.nullable().parse(await rpc('research_demo_booking',{p_quote:quoteId,p_create:create})),
  checkout:async(quoteId,details)=>researchBookingSchema.parse(await rpc('research_demo_checkout',{p_quote:quoteId,p_details:details})),
  beginRevision:(requestId,expectedRevision)=>rpc('research_demo_begin_revision',{p_request_id:requestId,p_expected_revision:expectedRevision}),
  resubmit:(requestId,expectedRevision,revisionId)=>rpc('research_demo_resubmit',{p_request_id:requestId,p_expected_revision:expectedRevision,p_revision_id:revisionId}),
  submit:revisionId=>rpc('research_demo_submit',{p_revision_id:revisionId}),
  listCustomer:()=>rpc('research_demo_list',{p_admin:false}),
  listAdmin:()=>rpc('research_demo_list',{p_admin:true}),
  decide:async(requestId,decision,note)=>{await rpc('research_demo_decide',{p_request_id:requestId,p_decision:decision,p_note:note});},
  createQuote:(requestId,input)=>rpc('research_demo_create_quote',{p_request_id:requestId,p_title:input.title,p_amount:input.amount,p_currency:input.currency,p_conditions:input.conditions}),
 };
}
