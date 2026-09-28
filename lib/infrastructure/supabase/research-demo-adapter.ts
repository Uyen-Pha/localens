import type {CheckoutDetails} from './reviewed-bookings';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {ResearchInput, ResearchPlan} from '@/lib/application/planner/research-planner';

export type ResearchDemoQuote = {id:string; title:string; amount:number; currency:'VND'|'USD'; conditions:string; status:'active'|'expired'|'checkout_pending'|'accepted'; createdAt:string; expiresAt:string};
export type ResearchDemoRequest = {id:string;ownerId:string;status:'pending_review'|'changes_requested'|'approved'|'rejected';revisionId:string;request:ResearchInput;plan:ResearchPlan;createdAt:string;submittedAt?:string;processingDueAt?:string;processingCompletedAt?:string|null;notes:string|null;quotes:ResearchDemoQuote[];history:{status:string;note:string|null;at:string}[]};
export type ResearchBooking={id:string;quote_id:string;status:'pending_payment'|'confirmed'|'expired';payment_status:'pending'|'failed'|'paid';party_size:number;expires_at:string;amount:number;currency:string};
export type ResearchDemoPort = {
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
  booking:(quoteId,create)=>rpc('research_demo_booking',{p_quote:quoteId,p_create:create}),
  checkout:(quoteId,details)=>rpc('research_demo_checkout',{p_quote:quoteId,p_details:details}),
  beginRevision:(requestId,expectedRevision)=>rpc('research_demo_begin_revision',{p_request_id:requestId,p_expected_revision:expectedRevision}),
  resubmit:(requestId,expectedRevision,revisionId)=>rpc('research_demo_resubmit',{p_request_id:requestId,p_expected_revision:expectedRevision,p_revision_id:revisionId}),
  submit:revisionId=>rpc('research_demo_submit',{p_revision_id:revisionId}),
  listCustomer:()=>rpc('research_demo_list',{p_admin:false}),
  listAdmin:()=>rpc('research_demo_list',{p_admin:true}),
  decide:async(requestId,decision,note)=>{await rpc('research_demo_decide',{p_request_id:requestId,p_decision:decision,p_note:note});},
  createQuote:(requestId,input)=>rpc('research_demo_create_quote',{p_request_id:requestId,p_title:input.title,p_amount:input.amount,p_currency:input.currency,p_conditions:input.conditions}),
 };
}
